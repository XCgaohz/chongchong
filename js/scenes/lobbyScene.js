// 好友对战大厅：创建房间 / 输入房号加入 / 成员等待 / 房主开局
// 支持多人房间：组队对抗（真人平分两队，空位补AI）或合作打电脑（真人同队）
import { RoomApi, genRoomId, createNet } from '../net/netlayer.js';
import { talentModifiers } from '../meta/progress.js';
import { promptText } from '../platform.js';

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
  return { species, skins: p.skins, name: p.name || '' };
}

const TEAM_LOOKS = [
  { name: '红队', color: '#ff5a5a', dark: '#a33636' },
  { name: '蓝队', color: '#4da3ff', dark: '#2d5f9e' }
];

// 按房间配置把真人 + AI 补位合成对战队伍
// members: [{token, name, side, teamIdx}]，host 是 members[0]
export function buildOnlineTeams(mode, perTeam, members) {
  return TEAM_LOOKS.map((look, t) => {
    const humans = members.filter(m => m.teamIdx === t);
    if (humans.length) {
      const first = humans[0];
      return Object.assign(
        { name: first.name ? first.name + '的虫队' : look.name, controller: 'human' },
        look, first.side
      );
    }
    return Object.assign({
      name: (t ? '蓝方' : '红方') + '电脑队',
      controller: 'ai', isAI: true,
      difficulty: 0.7, personality: 'balanced',
      species: ['ant', 'ant', 'ant']
    }, look);
  });
}

// 给新成员分配队伍：合作全进队0；对抗选人少且未满的队（交替填充）
export function assignSeat(mode, perTeam, members) {
  if (mode === 'coop') return 0;
  const used = [0, 0];
  for (const m of members) if (m.teamIdx === 0 || m.teamIdx === 1) used[m.teamIdx]++;
  for (let t = 0; t < 2; t++) {
    if (used[t] < perTeam && (used[t] < used[t ^ 1] || used[t ^ 1] >= perTeam)) return t;
  }
  return used[0] <= used[1] ? 0 : 1;
}

export class LobbyScene {
  constructor(app, opts = {}) {
    this.app = app;
    this.state = opts.state || 'menu'; // menu | config | joining | waiting | joined
    this.input = opts.input || '';
    this.net = null;
    this.roomId = opts.roomId || '';
    this.err = '';
    this.btns = {};
    this.dot = 0;
    // 房间配置与成员（host 持有权威，joiner 收广播同步显示）
    this.cfgMode = 'pvp';   // pvp=组队对抗 coop=合作打电脑
    this.cfgPer = 2;        // 每队人数上限 1~3
    this.members = [];      // [{token, name, side, teamIdx}]，host 是第一个
    this.myToken = '';
    this.myTeam = 1;
    this.multiOK = true;    // 微信云通道协议只支持 1V1，创建后按通道类型锁定
    // 启动参数直接进房（好友点分享卡片进入）
    if (opts.autoJoin) {
      this.input = String(opts.autoJoin);
      this.confirmJoin();
    }
  }

  update(dt) { this.dot += dt; }

  onExit() { if (this.net && this.state !== 'battle') { this.net.close(); this.net = null; } }

  // host：广播房间快照（成员与配置），joiner 借此同步显示
  broadcastRoom() {
    if (!this.net) return;
    this.net.send({
      t: 'room', mode: this.cfgMode, perTeam: this.cfgPer,
      members: this.members.map(m => ({ token: m.token, name: m.name, teamIdx: m.teamIdx }))
    });
  }

  // host：处理加入者，分配座位
  handleHello(m) {
    if (!m || m.t !== 'hello' || !m.token) return;
    if (this.members.some(x => x.token === m.token)) return;
    if (this.members.length >= this.cfgPer * 2) { this.broadcastRoom(); return; } // 满员，忽略
    const teamIdx = assignSeat(this.cfgMode, this.cfgPer, this.members);
    this.members.push({ token: m.token, name: m.name || '', side: m.side, teamIdx });
    this.app.sfx.play('pickup');
    this.broadcastRoom();
  }

  // 双端共用：进入战斗
  enterBattle(seed, teams, myTeam, mode, perTeam) {
    this.state = 'battle';
    const cfg = {
      mode: 'online', myTeam, net: this.net,
      isHost: this.isHostFlag !== false,
      mySeat: this.myToken,
      seed, stage: 1, bugsPerTeam: 3, turnTime: 30,
      teams, modifiers: {}, taken: {}
    };
    void mode; void perTeam;
    this.app.switchScene('battle', cfg);
  }

  // host：开始对局
  startBattle() {
    const seed = (Math.random() * 1e9) | 0;
    const teams = buildOnlineTeams(this.cfgMode, this.cfgPer, this.members);
    this.net.send({
      t: 'start', seed, teams,
      mode: this.cfgMode, perTeam: this.cfgPer,
      seats: this.members.map(m => ({ token: m.token, teamIdx: m.teamIdx }))
    });
    this.enterBattle(seed, teams, 0);
  }

  async startHost() {
    this.roomId = genRoomId();
    await RoomApi.create(this.roomId);
    this.net = await createNet(this.roomId, true);
    this.isHostFlag = true;
    if (this.net.kind === 'cloud') { this.cfgMode = 'pvp'; this.cfgPer = 1; this.multiOK = false; }
    this.members = [{ token: 'host', name: this.app.progress.name || '', side: sideOf(this.app.progress), teamIdx: 0 }];
    this.myToken = 'host';
    this.myTeam = 0;
    this.state = 'waiting';
    if (typeof wx !== 'undefined' && wx.onShareAppMessage) {
      wx.onShareAppMessage(() => ({ title: '来虫虫大战跟我 SOLO！房间号 ' + this.roomId, query: 'roomId=' + this.roomId }));
      if (wx.showShareMenu) wx.showShareMenu({});
    }
    if (typeof wx !== 'undefined' && wx.shareAppMessage) {
      wx.shareAppMessage({ title: '来虫虫大战跟我 SOLO！房间号 ' + this.roomId, query: 'roomId=' + this.roomId });
    }
    this.net.onMessage(m => this.handleHello(m));
  }

  async confirmJoin() {
    const id = this.input;
    this.err = '';
    const jr = await RoomApi.join(id);
    if (!jr || !jr.ok) { this.err = (jr && jr.err) || '加入失败'; return; }
    try {
      this.net = await createNet(id, false);
    } catch (e) { this.err = '联机通道创建失败'; return; }
    this.roomId = id;
    this.isHostFlag = false;
    this.myToken = 'g' + ((Math.random() * 1e9) | 0);
    this.state = 'joined';
    this.net.onMessage(m => {
      if (m.t === 'room') {
        this.cfgMode = m.mode; this.cfgPer = m.perTeam;
        const me = (m.members || []).find(x => x.token === this.myToken);
        if (me) this.myTeam = me.teamIdx;
        this.members = m.members || [];
      } else if (m.t === 'start') {
        const seats = m.seats || [];
        const me = seats.find(x => x.token === this.myToken);
        this.myTeam = me ? me.teamIdx : 1;
        this.enterBattle(m.seed, m.teams, this.myTeam, m.mode, m.perTeam);
      }
    });
    this.net.send({ t: 'hello', token: this.myToken, name: this.app.progress.name || '', side: sideOf(this.app.progress) });
    this.err = '已加入，等待房主开始…';
  }

  drawRoomInfo(ctx, W, H, isHost) {
    // 房间号卡片
    const rw = Math.min(320, W * 0.5), rh = Math.min(100, H * 0.2);
    ctx.fillStyle = '#fff8ec';
    rr(ctx, W / 2 - rw / 2, H * 0.06, rw, rh, 16); ctx.fill();
    ctx.strokeStyle = '#e2c893'; ctx.lineWidth = 3;
    rr(ctx, W / 2 - rw / 2, H * 0.06, rw, rh, 16); ctx.stroke();
    ctx.fillStyle = '#ff7a3c';
    ctx.font = `bold ${rh * 0.42}px sans-serif`;
    ctx.fillText(this.roomId, W / 2, H * 0.06 + rh * 0.62);
    // 模式说明
    const modeText = this.cfgMode === 'coop'
      ? `合作打电脑 · 真人一队 vs 电脑 x${this.cfgPer}`
      : `组队对抗 · ${this.cfgPer}v${this.cfgPer}（空位电脑补齐）`;
    ctx.fillStyle = '#5b4632';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(modeText, W / 2, H * 0.06 + rh + 26);
    // 成员列表
    const listY = H * 0.06 + rh + 52;
    const names = this.members.length
      ? this.members.map(m => `${m.name || '玩家'}（${m.teamIdx === 0 ? '红队' : '蓝队'}）`)
      : ['（成员同步中…）'];
    ctx.font = '16px sans-serif';
    names.slice(0, 6).forEach((line, i) => {
      ctx.fillStyle = '#3d6ea5';
      ctx.fillText(line, W / 2, listY + i * 24);
    });
    return listY + Math.min(names.length, 6) * 24;
  }

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
      ctx.fillText('好友对战', W / 2, H * 0.22);
      const nm = this.app.progress.name || '未命名虫友';
      ctx.fillStyle = '#3d6ea5';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText(`你的名字：${nm}`, W / 2, H * 0.315);
      this.btns.name = { x: W / 2 - 130, y: H * 0.315 - 24, w: 260, h: 30 };
      const bw = Math.min(280, W * 0.4), bh = Math.min(60, H * 0.115);
      ctx.fillStyle = '#ff9f43';
      rr(ctx, W / 2 - bw / 2, H * 0.40, bw, bh, 14); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${bh * 0.36}px sans-serif`;
      ctx.fillText('创建房间', W / 2, H * 0.40 + bh * 0.63);
      this.btns.create = { x: W / 2 - bw / 2, y: H * 0.40, w: bw, h: bh };
      ctx.fillStyle = '#5aa9ff';
      rr(ctx, W / 2 - bw / 2, H * 0.40 + bh + 16, bw, bh, 14); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('加入房间', W / 2, H * 0.40 + bh + 16 + bh * 0.63);
      this.btns.join = { x: W / 2 - bw / 2, y: H * 0.40 + bh + 16, w: bw, h: bh };
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText('返回主页', W / 2, H * 0.40 + bh * 2 + 66);
      this.btns.back = { x: W / 2 - 70, y: H * 0.40 + bh * 2 + 40, w: 140, h: 36 };
    } else if (this.state === 'config') {
      // 建房配置：模式 + 每队人数
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('创建房间', W / 2, H * 0.14);
      const bw = Math.min(300, W * 0.44), bh = Math.min(56, H * 0.1);
      // 模式
      ctx.font = 'bold 19px sans-serif';
      ctx.fillStyle = '#5b4632';
      ctx.fillText('模式', W / 2, H * 0.235);
      const modes = [['pvp', '组队对抗（空位电脑补）'], ['coop', '合作打电脑']];
      modes.forEach(([k, label], i) => {
        const y = H * 0.26 + i * (bh + 10);
        const on = this.cfgMode === k;
        ctx.fillStyle = on ? '#ff9f43' : 'rgba(255,248,236,0.85)';
        rr(ctx, W / 2 - bw / 2, y, bw, bh, 12); ctx.fill();
        ctx.strokeStyle = on ? '#e2c893' : '#c9d6e2'; ctx.lineWidth = 2;
        rr(ctx, W / 2 - bw / 2, y, bw, bh, 12); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${bh * 0.32}px sans-serif`;
        ctx.fillText(label, W / 2, y + bh * 0.62);
        this.btns['mode_' + k] = { x: W / 2 - bw / 2, y, w: bw, h: bh };
      });
      // 每队人数
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText('每队人数（真人不满补电脑）', W / 2, H * 0.55);
      const cb = Math.min(70, W * 0.12);
      for (let n = 1; n <= 3; n++) {
        const x = W / 2 + (n - 2) * (cb + 14) - cb / 2;
        const on = this.cfgPer === n;
        ctx.fillStyle = on ? '#5ad35a' : 'rgba(255,248,236,0.85)';
        rr(ctx, x, H * 0.58, cb, cb, 12); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${cb * 0.42}px sans-serif`;
        ctx.fillText(n + 'v' + n, x + cb / 2, H * 0.58 + cb * 0.63);
        this.btns['per_' + n] = { x, y: H * 0.58, w: cb, h: cb };
      }
      // 创建按钮
      const by = H * 0.78;
      ctx.fillStyle = '#ff7a3c';
      rr(ctx, W / 2 - bw / 2, by, bw, bh, 14); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${bh * 0.36}px sans-serif`;
      ctx.fillText('创建房间', W / 2, by + bh * 0.63);
      this.btns.doCreate = { x: W / 2 - bw / 2, y: by, w: bw, h: bh };
      ctx.fillStyle = '#8fa3bd';
      rr(ctx, W / 2 - 70, by + bh + 14, 140, 36, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('返回', W / 2, by + bh + 39);
      this.btns.cfgBack = { x: W / 2 - 70, y: by + bh + 14, w: 140, h: 36 };
    } else if (this.state === 'waiting' || this.state === 'joined') {
      const isHost = this.state === 'waiting';
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(isHost ? '房间已创建' : '已加入房间', W / 2, H * 0.02 + 30);
      const afterList = this.drawRoomInfo(ctx, W, H, isHost);
      if (isHost) {
        // 开始按钮（真人不满由电脑补齐）
        const bw = Math.min(300, W * 0.44), bh = Math.min(60, H * 0.11);
        const by = Math.max(afterList + 20, H * 0.62);
        ctx.fillStyle = '#5ad35a';
        rr(ctx, W / 2 - bw / 2, by, bw, bh, 14); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${bh * 0.36}px sans-serif`;
        const humans = this.members.length;
        ctx.fillText(`开始对局（${humans}人）`, W / 2, by + bh * 0.63);
        this.btns.start = { x: W / 2 - bw / 2, y: by, w: bw, h: bh };
        const dots = '.'.repeat(1 + (Math.floor(this.dot * 2) % 3));
        ctx.fillStyle = '#6b6b6b';
        ctx.font = '16px sans-serif';
        ctx.fillText('好友可继续加入' + dots, W / 2, by + bh + 28);
      } else {
        const dots = '.'.repeat(1 + (Math.floor(this.dot * 2) % 3));
        ctx.fillStyle = '#6b6b6b';
        ctx.font = '17px sans-serif';
        ctx.fillText('等待房主开始' + dots, W / 2, Math.max(afterList + 30, H * 0.68));
      }
      if (typeof wx !== 'undefined' && wx.shareAppMessage) {
        ctx.fillStyle = '#5aa9ff';
        rr(ctx, W / 2 - 90, H * 0.88, 180, 40, 10); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('分享给好友', W / 2, H * 0.88 + 27);
        this.btns.share = { x: W / 2 - 90, y: H * 0.88, w: 180, h: 40 };
      }
      ctx.fillStyle = '#8fa3bd';
      rr(ctx, W / 2 - 70, H * 0.88 + 52, 140, 36, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('退出房间', W / 2, H * 0.88 + 77);
      this.btns.cancel = { x: W / 2 - 70, y: H * 0.88 + 52, w: 140, h: 36 };
      if (this.err) {
        ctx.fillStyle = '#d9483b';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(this.err, W / 2, H * 0.98);
      }
    } else if (this.state === 'joining') {
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('输入房间号', W / 2, H * 0.2);
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

  async onPoint(type, x, y) {
    this.app.sfx.unlock();
    if (type !== 'start') return;
    const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (this.state === 'menu') {
      if (hit(this.btns.name)) {
        this.app.sfx.play('click');
        const cur = this.app.progress.name || '';
        const val = await promptText('输入你的名字（8字内）', cur);
        if (val != null) {
          this.app.progress.name = val;
          this.app.saveProgress();
          this.app.sfx.play('pickup');
        }
      }
      else if (hit(this.btns.create)) { this.app.sfx.play('click'); this.state = 'config'; }
      else if (hit(this.btns.join)) { this.app.sfx.play('click'); this.state = 'joining'; this.input = ''; }
      else if (hit(this.btns.back)) { this.app.sfx.play('click'); this.app.switchScene('home'); }
    } else if (this.state === 'config') {
      for (const k of ['pvp', 'coop']) {
        if (hit(this.btns['mode_' + k])) { this.app.sfx.play('click'); this.cfgMode = k; return; }
      }
      for (const n of [1, 2, 3]) {
        if (hit(this.btns['per_' + n])) { this.app.sfx.play('click'); this.cfgPer = n; return; }
      }
      if (hit(this.btns.doCreate)) {
        this.app.sfx.play('click');
        this.startHost().catch(e => { this.err = String(e.message || e); });
      }
      else if (hit(this.btns.cfgBack)) { this.app.sfx.play('click'); this.state = 'menu'; }
    } else if (this.state === 'waiting') {
      if (hit(this.btns.share) && typeof wx !== 'undefined' && wx.shareAppMessage) {
        wx.shareAppMessage({ title: '来虫虫大战跟我 SOLO！房间号 ' + this.roomId, query: 'roomId=' + this.roomId });
      }
      if (hit(this.btns.start)) {
        this.app.sfx.play('click');
        if (this.net && this.members.length) this.startBattle();
      }
      if (hit(this.btns.cancel)) { this.app.sfx.play('click'); if (this.net) this.net.close(); this.net = null; this.state = 'menu'; }
    } else if (this.state === 'joined') {
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
