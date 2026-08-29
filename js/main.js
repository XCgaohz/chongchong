// 主循环与场景管理
import {
  createScreenCanvas, initTouch, onTouch, onKey,
  getSystemInfo, invalidateSystemInfo, refreshLayout, requestAnimationFrame, storage, vibrate, IS_WX
} from './platform.js';
import { Sfx } from './core/audio.js';
import { HomeScene } from './scenes/homeScene.js';
import { BattleScene } from './scenes/battleScene.js';
import { ShopScene } from './scenes/shopScene.js';
import { LobbyScene } from './scenes/lobbyScene.js';

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = Object.assign({ volume: 0.8, preview: true }, storage.get('cc_settings', {}));
    // 养成存档（虫虫基地）
    this.progress = Object.assign(
      {
        coins: 0, bestStage: 1,
        unlocked: ['ant'],
        squad: ['ant', 'ant', 'ant'],
        skins: {},
        talents: { hp: 0, dmg: 0, coin: 0, ammo: 0 }
      },
      storage.get('cc_progress', {})
    );
    this.sfx = new Sfx();
    this.sfx.setVolume(this.settings.volume);
    this.sceneTable = { home: HomeScene, battle: BattleScene, shop: ShopScene, lobby: LobbyScene };
    this.resize();
    this.current = new HomeScene(this);
  }

  resize() {
    invalidateSystemInfo();
    const si = getSystemInfo();
    this.dpr = si.pixelRatio;
    this.vw = si.width;
    this.vh = si.height;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
  }

  switchScene(name, params) {
    if (this.current && this.current.onExit) this.current.onExit();
    this.current = new this.sceneTable[name](this, params || {});
  }

  saveSettings() {
    storage.set('cc_settings', this.settings);
    this.sfx.setVolume(this.settings.volume);
  }

  saveProgress() { storage.set('cc_progress', this.progress); }

  vibrate(short) { vibrate(short); }

  update(dt) { this.current.update(dt); }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.current.draw(ctx, this.vw, this.vh);
  }

  onPoint(type, pts) {
    if (type === 'start') this.sfx.unlock();
    for (const p of pts) this.current.onPoint(type, p.x, p.y);
  }

  onKey(k, down) {
    if (this.current.onKey) this.current.onKey(k, down);
  }
}

export function boot() {
  const canvas = createScreenCanvas();
  const app = new App(canvas);
  if (typeof window !== 'undefined') {
    window.__app = app;
    window.__canvas = canvas;
  }  initTouch(canvas);
  onTouch('start', pts => app.onPoint('start', pts));
  onTouch('move', pts => app.onPoint('move', pts));
  onTouch('end', pts => app.onPoint('end', pts));
  onKey((k, down) => app.onKey(k, down));
  if (!IS_WX && typeof window !== 'undefined') {
    const onReflow = () => { refreshLayout(app.canvas); app.resize(); };
    window.addEventListener('resize', onReflow);
    window.addEventListener('orientationchange', onReflow);
    refreshLayout(canvas);
    app.resize();
  }
  // 微信：分享卡片携带 roomId 时直接进大厅加房
  if (IS_WX) {
    const openRoom = (q) => {
      if (!q || !q.roomId) return;
      if (app.current && app.current.constructor === BattleScene) return; // 对局中不打断
      if (app.lastRoomQuery === q.roomId && app.current && app.current.constructor === LobbyScene) return;
      app.lastRoomQuery = String(q.roomId);
      app.switchScene('lobby', { autoJoin: String(q.roomId) });
    };
    try { openRoom((wx.getLaunchOptionsSync() || {}).query); } catch (_) {}
    try { wx.onShow(res => openRoom(res && res.query)); } catch (_) {}
  }
  let last = 0;
  function frame(t) {
    const dt = Math.min(((t - last) || 16) / 1000, 0.05);
    last = t;
    app.update(dt);
    app.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
