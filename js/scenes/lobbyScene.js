// 好友对战大厅：创建房间 / 输入房号加入 / 等待对手
import { RoomApi, genRoomId, createNet } from '../net/netlayer.js';
import { talentModifiers } from '../meta/progress.js';

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sideOf(p) {
  const species = p.squad.slice(0, 3);
  while (species.length < 3) species.push('ant');
  return { species, skins: p.skins };
}

function buildTeams(hostSide, guestSide) {
  return [
    Object.assign({ name: '红队', color: '#ff5a5a', dark: '#a33636', controller: 'human' }, hostSide),
    Object.assign({ name: '蓝队', color: '#4da3ff', dark: '#2d5f9e', controller: 'human' }, guestSide)
  ];
}

export class LobbyScene {
  constructor(app, opts = {}) {
    this.app = app;
    this.state = opts.state || 'menu'; // menu | creating | joining | waiting
    this.input = opts.input || '';
    this.net = null;
    this.roomId = opts.roomId || '';
    this.err = '';
    this.btns = {};
    this.dot = 0;
    // 启动参数直接进房（好友点分享卡片进入）
    if (opts.autoJoin) {
      this.input = String(opts.autoJoin);
      this.confirmJoin();
    }
  }

  update(dt) { this.dot += dt; }

  onExit() { if (this.net && this.state !== 'battle') { this.net.close(); this.net = null; } }

  draw(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6fc8f7'); g.addColorStop(1, '#d9f2d0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    this.btns = {};

    if (this.state === 'menu') {
      ctx.fillStyle = '#5b4632';
      ctx.font = `bold ${Math.min(46, H * 0.1)}px sans-serif`;
      ctx.fillText('好友对战', W / 2, H * 0.26);
      const bw = Math.min(280, W * 0.4), bh = Math.min(64, H * 0.12);
      ctx.fillStyle = '#ff9f43';
      rr(ctx, W / 2 - bw / 2, H * 0.42, bw, bh, 14); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${bh * 0.36}px sans-serif`;
      ctx.fillText('创建房间', W / 2, H * 0.42 + bh * 0.63);
      this.btns.create = { x: W / 2 - bw / 2, y: H * 0.42, w: bw, h: bh };
      ctx.fillStyle = '#5aa9ff';
      rr(ctx, W / 2 - bw / 2, H * 0.42 + bh + 18, bw, bh, 14); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('加入房间', W / 2, H * 0.42 + bh + 18 + bh * 0.63);
      this.btns.join = { x: W / 2 - bw / 2, y: H * 0.42 + bh + 18, w: bw, h: bh };
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('返回主页', W / 2, H * 0.42 + bh * 2 + 70);
      this.btns.back = { x: W / 2 - 70, y: H * 0.42 + bh * 2 + 44, w: 140, h: 36 };
    } else if (this.state === 'waiting') {
      // 房主等待页
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('房间已创建', W / 2, H * 0.22);
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('把房间号告诉好友', W / 2, H * 0.32);
      const rw = Math.min(320, W * 0.5), rh = Math.min(110, H * 0.24);
      ctx.fillStyle = '#fff8ec';
      rr(ctx, W / 2 - rw / 2, H * 0.4, rw, rh, 16); ctx.fill();
      ctx.strokeStyle = '#e2c893'; ctx.lineWidth = 3;
      rr(ctx, W / 2 - rw / 2, H * 0.4, rw, rh, 16); ctx.stroke();
      ctx.fillStyle = '#ff7a3c';
      ctx.font = `bold ${rh * 0.55}px sans-serif`;
      ctx.fillText(this.roomId, W / 2, H * 0.4 + rh * 0.68);
      const dots = '.'.repeat(1 + (Math.floor(this.dot * 2) % 3));
      ctx.fillStyle = '#6b6b6b';
      ctx.font = '17px sans-serif';
      ctx.fillText('等待好友加入' + dots, W / 2, H * 0.72);
      if (typeof wx !== 'undefined' && wx.shareAppMessage) {
        ctx.fillStyle = '#5aa9ff';
        rr(ctx, W / 2 - 90, H * 0.78, 180, 40, 10); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('分享给好友', W / 2, H * 0.78 + 27);
        this.btns.share = { x: W / 2 - 90, y: H * 0.78, w: 180, h: 40 };
      }
      ctx.fillStyle = '#8fa3bd';
      rr(ctx, W / 2 - 70, H * 0.88, 140, 36, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('取消', W / 2, H * 0.88 + 25);
      this.btns.cancel = { x: W / 2 - 70, y: H * 0.88, w: 140, h: 36 };
    } else if (this.state === 'joining') {
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('输入房间号', W / 2, H * 0.2);
      // 输入框
      const iw = Math.min(300, W * 0.42), ih = Math.min(80, H * 0.17);
      ctx.fillStyle = '#fff8ec';
      rr(ctx, W / 2 - iw / 2, H * 0.26, iw, ih, 14); ctx.fill();
      ctx.strokeStyle = '#e2c893'; ctx.lineWidth = 3;
      rr(ctx, W / 2 - iw / 2, H * 0.26, iw, ih, 14); ctx.stroke();
      ctx.fillStyle = '#ff7a3c';
      ctx.font = `bold ${ih * 0.5}px sans-serif`;
      ctx.fillText((this.input + '_').slice(0, 4), W / 2, H * 0.26 + ih * 0.66);
      this.drawKeypad(ctx, W, H);
      if (this.err) {
        ctx.fillStyle = '#d9483b';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(this.err, W / 2, H * 0.94);
      }
    }
  }

  drawKeypad(ctx, W, H) {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
    const kw = Math.min(78, W * 0.09), kh = Math.min(56, H * 0.11);
    const gap = 10;
    const kwTotal = kw * 3 + gap * 2, khTotal = kh * 4 + gap * 3;
    const ox = W / 2 - kwTotal / 2;
    const oy = Math.min(H * 0.42, H - khTotal - 40);
    keys.forEach((k, i) => {
      const col = i % 3, row = (i / 3) | 0;
      const kx = ox + col * (kw + gap), ky = oy + row * (kh + gap);
      const accent = k === 'OK' ? '#5ad35a' : k === 'C' ? '#e88a8a' : '#fff8ec';
      ctx.fillStyle = accent;
      rr(ctx, kx, ky, kw, kh, 10); ctx.fill();
      ctx.strokeStyle = '#d8cbb4'; ctx.lineWidth = 2;
      rr(ctx, kx, ky, kw, kh, 10); ctx.stroke();
      ctx.fillStyle = k === 'OK' || k === 'C' ? '#fff' : '#4a3b28';
      ctx.font = `bold ${kh * 0.42}px sans-serif`;
      ctx.fillText(k, kx + kw / 2, ky + kh * 0.64);
      this.btns['key_' + k] = { x: kx, y: ky, w: kw, h: kh };
    });
  }

  async startHost() {
    this.roomId = genRoomId();
    await RoomApi.create(this.roomId);
    this.net = await createNet(this.roomId, true);
    this.state = 'waiting';
    if (typeof wx !== 'undefined' && wx.shareAppMessage) {
      wx.shareAppMessage({ title: '来虫虫大战跟我 SOLO！房间号 ' + this.roomId, query: 'roomId=' + this.roomId });
    }
    this.net.onMessage(m => {
      if (m.t === 'hello') {
        // 组队并发起对局
        const teams = buildTeams(sideOf(this.app.progress), m.side);
        const cfg = {
          mode: 'online', myTeam: 0, net: this.net,
          seed: (Math.random() * 1e9) | 0, stage: 1, bugsPerTeam: 3, turnTime: 30,
          teams, modifiers: {}, taken: {}
        };
        this.state = 'battle';
        this.net.send({ t: 'welcome', seed: cfg.seed, teams });
        this.app.switchScene('battle', cfg);
      }
    });
  }

  async confirmJoin() {
    const id = this.input;
    this.err = '';
    const jr = await RoomApi.join(id);
    if (!jr || !jr.ok) { this.err = (jr && jr.err) || '加入失败'; return; }
    this.net = await createNet(id, false);
    this.roomId = id;
    this.net.onMessage(m => {
      if (m.t === 'welcome') {
        const cfg = {
          mode: 'online', myTeam: 1, net: this.net,
          seed: m.seed, stage: 1, bugsPerTeam: 3, turnTime: 30,
          teams: m.teams, modifiers: {}, taken: {}
        };
        this.state = 'battle';
        this.app.switchScene('battle', cfg);
      }
    });
    this.net.send({ t: 'hello', side: sideOf(this.app.progress) });
    this.err = '已发送加入请求，等待房主确认…';
  }

  onPoint(type, x, y) {
    this.app.sfx.unlock();
    if (type !== 'start') return;
    const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (this.state === 'menu') {
      if (hit(this.btns.create)) { this.app.sfx.play('click'); this.startHost().catch(e => { this.err = String(e.message || e); }); }
      else if (hit(this.btns.join)) { this.app.sfx.play('click'); this.state = 'joining'; this.input = ''; }
      else if (hit(this.btns.back)) { this.app.sfx.play('click'); this.app.switchScene('home'); }
    } else if (this.state === 'waiting') {
      if (hit(this.btns.share) && typeof wx !== 'undefined' && wx.shareAppMessage) {
        wx.shareAppMessage({ title: '来虫虫大战跟我 SOLO！房间号 ' + this.roomId, query: 'roomId=' + this.roomId });
      }
      if (hit(this.btns.cancel)) { this.app.sfx.play('click'); if (this.net) this.net.close(); this.net = null; this.state = 'menu'; }
    } else if (this.state === 'joining') {
      for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
        if (hit(this.btns['key_' + k])) {
          this.app.sfx.play('click');
          if (this.input.length < 4) this.input += k;
          return;
        }
      }
      if (hit(this.btns['key_C'])) { this.app.sfx.play('click'); this.input = this.input.slice(0, -1); return; }
      if (hit(this.btns['key_OK'])) {
        this.app.sfx.play('click');
        if (this.input.length === 4) this.confirmJoin();
        else this.err = '请输入 4 位房间号';
      }
    }
  }
}
