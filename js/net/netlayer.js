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

// 云端房间操作（走云函数，浏览器 mock 下用 localStorage 模拟）
export const RoomApi = {
  async create(roomId) {
    if (IS_WX && wx.cloud) {
      return wx.cloud.callFunction({ name: 'room-create', data: { roomId } });
    }
    // 浏览器 mock
    const rooms = storage.get('cc_mock_rooms', {});
    rooms[roomId] = { roomId, msgs: [], created: Date.now() };
    storage.set('cc_mock_rooms', rooms);
    return { ok: true };
  },
  async join(roomId) {
    if (IS_WX && wx.cloud) {
      return wx.cloud.callFunction({ name: 'room-join', data: { roomId } });
    }
    const rooms = storage.get('cc_mock_rooms', {});
    if (!rooms[roomId]) return { ok: false, err: '房间不存在' };
    return { ok: true };
  }
};

export function genRoomId() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

// 创建网络层：真实环境用云开发（需 appid 已开通云），否则浏览器广播
export async function createNet(roomId, isHost) {
  if (IS_WX && wx.cloud && wx.cloud.database) {
    const net = new WxCloudNet(roomId, isHost, wx.cloud.database());
    await net.init();
    return net;
  }
  return new BroadcastNet(roomId, isHost);
}
