// 网络抽象层：统一消息接口，双实现可切换
//  - BroadcastNet: 浏览器 BroadcastChannel（本机双标签调试联机）
//  - WxCloudNet:   微信云开发数据库 watch 实时推送（真实好友对战）
// 消息均为可 JSON 序列化的普通对象，带 seq 去重。
import { IS_WX, storage } from '../platform.js';

export class BroadcastNet {
  constructor(roomId, isHost) {
    this.kind = 'broadcast';
    this.roomId = roomId;
    this.isHost = isHost;
    this.ch = new BroadcastChannel('cc_room_' + roomId);
    this.cbs = [];
    this.seq = 0;
    this.ch.onmessage = e => { for (const cb of this.cbs) cb(e.data); };
  }
  send(msg) {
    msg.seq = ++this.seq + '_' + (this.isHost ? 'h' : 'g');
    this.ch.postMessage(msg);
  }
  onMessage(cb) { this.cbs.push(cb); }
  close() { try { this.ch.close(); } catch (_) {} }
}

export class WxCloudNet {
  constructor(roomId, isHost, db) {
    this.kind = 'cloud';
    this.roomId = roomId;
    this.isHost = isHost;
    this.db = db;
    this.cbs = [];
    this.seq = 0;
    this.seen = new Set();
    this.docId = null;
  }
  async init() {
    const db = this.db;
    // 找到房间文档并订阅
    const res = await db.collection('cc_rooms').where({ roomId: this.roomId }).get();
    if (res.data.length === 0) throw new Error('房间不存在');
    this.docId = res.data[0]._id;
    this.watch = db.collection('cc_rooms').where({ roomId: this.roomId }).watch({
      onChange: snap => {
        const doc = snap.docs && snap.docs[0];
        if (!doc || !Array.isArray(doc.msgs)) return;
        for (const m of doc.msgs) {
          if (this.seen.has(m.seq)) continue;
          this.seen.add(m.seq);
          // 自己写的消息也会回流，跳过（seq 前缀区分身份）
          if (String(m.seq).endsWith(this.isHost ? 'h' : 'g') && m.from === (this.isHost ? 'host' : 'guest')) continue;
          for (const cb of this.cbs) cb(m);
        }
      },
      onError: () => {}
    });
  }
  send(msg) {
    msg.seq = (++this.seq) + '_' + (this.isHost ? 'h' : 'g');
    msg.from = this.isHost ? 'host' : 'guest';
    msg.ts = Date.now();
    // 云函数原子追加（避免客户端写权限/并发问题）
    if (typeof wx !== 'undefined' && wx.cloud) {
      wx.cloud.callFunction({ name: 'room-sync', data: { roomId: this.roomId, msg } }).catch(() => {});
    }
  }
  onMessage(cb) { this.cbs.push(cb); }
  close() { try { this.watch && this.watch.close(); } catch (_) {} }
}

// 云能力初始化（wx.cloud.init 全局只需一次）
let cloudInited = false;
function ensureCloudInit() {
  if (!cloudInited && typeof wx !== 'undefined' && wx.cloud) {
    try { wx.cloud.init({ traceUser: true }); cloudInited = true; } catch (_) {}
  }
  return cloudInited;
}

// 云端房间操作（走云函数，浏览器 mock 下用 localStorage 模拟）
export const RoomApi = {
  async create(roomId) {
    if (IS_WX && wx.cloud && ensureCloudInit()) {
      return wx.cloud.callFunction({ name: 'room-create', data: { roomId } });
    }
    // 浏览器 mock
    const rooms = storage.get('cc_mock_rooms', {});
    rooms[roomId] = { roomId, msgs: [], created: Date.now() };
    storage.set('cc_mock_rooms', rooms);
    return { ok: true };
  },
  async join(roomId) {
    if (IS_WX && wx.cloud && ensureCloudInit()) {
      return wx.cloud.callFunction({ name: 'room-join', data: { roomId } });
    }
    // H5：无中央房间表，房号有效性由 P2P 层决定（无房主时停留等待）
    return { ok: true };
  }
};

// WebRTC P2P（Trystero mqtt 策略）：两台手机跨网络直连，公共信令牵线
export class TrystNet {
  constructor(roomId, isHost, room) {
    this.kind = 'trystero';
    this.roomId = roomId;
    this.isHost = isHost;
    this.room = room;
    this.cbs = [];
    this.peerCount = 0;
    const action = room.makeAction('cc');
    this._send = data => action.send(data);
    this._outbox = []; // 通道就绪前的消息暂存，对端接入后补发
    action.onMessage = data => { for (const cb of this.cbs) cb(data); };
    room.onPeerJoin = () => {
      this.peerCount++;
      this.connectedAt = Date.now();
      const box = this._outbox; this._outbox = [];
      for (const m of box) { try { this._send(m); } catch (_) {} }
    };
    room.onPeerLeave = () => { this.peerCount = Math.max(0, this.peerCount - 1); };
  }
  send(msg) {
    if (this.peerCount > 0) { try { this._send(msg); } catch (_) {} }
    else this._outbox.push(msg);
  }
  onMessage(cb) { this.cbs.push(cb); }
  close() { try { this.room.leave(); } catch (_) {} }
}

export function genRoomId() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

// 国内可达的 STUN（小米/腾讯）+ Google STUN 兜底
const ICE_SERVERS = {
  iceServers: [{
    urls: [
      'stun:stun.miwifi.com:3478',
      'stun:stun.qq.com:3478',
      'stun:stun.l.google.com:19302'
    ]
  }]
};

// 创建网络层优先级：微信云开发（好友体验版）→ WebRTC P2P（H5 跨设备）→ BroadcastChannel（同机调试）
// URL 参数：?net=local 强制同机通道（双标签页调试用）
export async function createNet(roomId, isHost) {
  if (IS_WX && wx.cloud && ensureCloudInit()) {
    const net = new WxCloudNet(roomId, isHost, wx.cloud.database());
    await net.init();
    return net;
  }
  let forceLocal = false;
  let isHttp = false;
  try {
    forceLocal = new URLSearchParams(location.search).get('net') === 'local';
    isHttp = /^https?:/.test(location.protocol);
  } catch (_) {}
  if (!forceLocal && isHttp) {
    try {
      const mod = await import('./vendor/trystero-mqtt.js');
      const room = mod.joinRoom({
        appId: 'chongchong-battle-v1',
        rtcConfig: ICE_SERVERS
      }, 'cc-room-' + roomId);
      return new TrystNet(roomId, isHost, room);
    } catch (e) {
      console.warn('[联机] WebRTC 通道不可用，回退本地通道', e);
    }
  }
  return new BroadcastNet(roomId, isHost);
}
