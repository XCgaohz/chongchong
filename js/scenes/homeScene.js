// 主页场景：标题 + 菜单 + 设置/热座弹窗
import { campaignCfg, hotseatCfg } from '../meta/modes.js';
import { talentModifiers } from '../meta/progress.js';
import { TAU, clamp } from '../core/mathutil.js';

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

export class HomeScene {
  constructor(app) {
    this.app = app;
    this.t = 0;
    this.btns = {};
    this.modal = null; // 'settings' | 'hotseat'
    this.modalBtns = {};
    this.dragVol = null;
    this.toast = null; this.toastT = 0;
  }

  showToast(text) { this.toast = text; this.toastT = 1.8; }

  update(dt) {
    this.t += dt;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast = null; }
  }

  draw(ctx, W, H) {
    // 天空
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6fc8f7'); g.addColorStop(0.65, '#b8e7fb'); g.addColorStop(1, '#d9f2d0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 太阳与云
    ctx.fillStyle = 'rgba(255,238,160,0.3)';
    ctx.beginPath(); ctx.arc(80, 74, 56, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,238,160,0.95)';
    ctx.beginPath(); ctx.arc(80, 74, 34, 0, TAU); ctx.fill();
    const clouds = [[0.3, 0.14, 1], [0.62, 0.1, 0.8], [0.85, 0.2, 1.15]];
    for (const [cx, cy, s] of clouds) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(cx * W + Math.sin(this.t * 0.2 + cx * 9) * 14, cy * H, 20 * s, 0, TAU);
      ctx.arc(cx * W + 22 * s + Math.sin(this.t * 0.2 + cx * 9) * 14, cy * H - 8 * s, 15 * s, 0, TAU);
      ctx.arc(cx * W + 42 * s + Math.sin(this.t * 0.2 + cx * 9) * 14, cy * H, 17 * s, 0, TAU);
      ctx.fill();
    }
    // 地面草丘
    ctx.fillStyle = '#9ed489';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 30) ctx.lineTo(x, H - 60 - Math.sin(x * 0.008) * 26);
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.fillStyle = '#7cc95e';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 30) ctx.lineTo(x, H - 34 - Math.sin(x * 0.011 + 2) * 18);
    ctx.lineTo(W, H);
    ctx.fill();

    // 标题
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.min(74, H * 0.16)}px sans-serif`;
    const ty = H * 0.24 + Math.sin(this.t * 1.6) * 5;
    ctx.strokeStyle = 'rgba(60,35,10,0.85)';
    ctx.lineWidth = 10;
    ctx.strokeText('虫虫大战', W / 2, ty);
    const tg = ctx.createLinearGradient(0, ty - 60, 0, ty);
    tg.addColorStop(0, '#ffe94d'); tg.addColorStop(1, '#ff9f43');
    ctx.fillStyle = tg;
    ctx.fillText('虫虫大战', W / 2, ty);
    ctx.font = `bold ${Math.min(20, H * 0.045)}px sans-serif`;
    ctx.fillStyle = 'rgba(60,35,10,0.75)';
    ctx.fillText('· 重 制 版 ·', W / 2, ty + 32);

    // 吉祥物大虫子
    this.drawMascot(ctx, W * 0.2, H * 0.66, Math.min(5.4, H / 150));

    // 菜单按钮
    const bw = Math.min(250, W * 0.3), bh = Math.min(52, H * 0.1);
    const bx = W * 0.62 - bw / 2;
    const items = [
      ['campaign', '闯关模式', '#ff9f43'],
      ['hotseat', '热座对战', '#5aa9ff'],
      ['online', '好友对战', '#5ad35a'],
      ['shop', '虫虫基地', '#b08fd4'],
      ['settings', '设置', '#8fa3bd']
    ];
    let by = H * 0.42;
    this.btns = {};
    for (const [k, label, color, locked] of items) {
      ctx.fillStyle = color;
      rr(ctx, bx, by, bw, bh, 13); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
      rr(ctx, bx, by, bw, bh, 13); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${bh * 0.42}px sans-serif`;
      ctx.fillText(locked ? label + ' 🔒' : label, bx + bw / 2, by + bh * 0.64);
      this.btns[k] = { x: bx, y: by, w: bw, h: bh };
      by += bh + Math.min(14, H * 0.024);
    }

    // 弹窗
    if (this.modal) this.drawModal(ctx, W, H);
    // Toast
    if (this.toast) {
      ctx.globalAlpha = Math.min(1, this.toastT);
      ctx.font = 'bold 15px sans-serif';
      const tw = ctx.measureText(this.toast).width + 34;
      ctx.fillStyle = 'rgba(10,20,35,0.78)';
      rr(ctx, W / 2 - tw / 2, H * 0.86 - 16, tw, 32, 16); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(this.toast, W / 2, H * 0.86 + 5);
      ctx.globalAlpha = 1;
    }
    // 版本
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(60,35,10,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText(`v0.3 · 金币 ${this.app.progress.coins} · 最远第 ${this.app.progress.bestStage} 关`, 10, H - 10);
  }

  drawMascot(ctx, x, y, s) {
    const t = this.t;
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 2) * 4);
    ctx.scale(s, s);
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 12, 11, 3, 0, 0, TAU); ctx.fill();
    // 拖尾
    for (let i = 3; i >= 1; i--) {
      ctx.fillStyle = '#a34a26';
      ctx.beginPath(); ctx.arc(-i * 7, i * 1.2 + 2, 8 - i * 0.8, 0, TAU); ctx.fill();
    }
    // 身体
    const grad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 12);
    grad.addColorStop(0, '#ffd9c4'); grad.addColorStop(0.3, '#e8734a'); grad.addColorStop(1, '#a34a26');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#a34a26'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); ctx.stroke();
    // 触角
    const wig = Math.sin(t * 4) * 2;
    ctx.strokeStyle = '#a34a26'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4, -8); ctx.quadraticCurveTo(-7, -15, -5 + wig, -17);
    ctx.moveTo(4, -8); ctx.quadraticCurveTo(7, -15, 5 + wig, -17);
    ctx.stroke();
    ctx.fillStyle = '#a34a26';
    ctx.beginPath();
    ctx.arc(-5 + wig, -17, 1.8, 0, TAU);
    ctx.arc(5 + wig, -17, 1.8, 0, TAU);
    ctx.fill();
    // 眼睛（会眨）
    const blink = (t % 3.4) > 3.25;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#a34a26'; ctx.lineWidth = 1.1;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.arc(side * 3.4 + 2, -4, 3.6, 0, TAU); ctx.fill(); ctx.stroke();
    }
    if (blink) {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-1, -4); ctx.lineTo(3, -4);
      ctx.moveTo(5, -4); ctx.lineTo(9, -4);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(3.6, -4, 1.7, 0, TAU);
      ctx.arc(7.4, -4, 1.7, 0, TAU);
      ctx.fill();
    }
    // 嘴
    ctx.strokeStyle = '#5b2d1e'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(5, 2, 2.8, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  drawModal(ctx, W, H) {
    ctx.fillStyle = 'rgba(8,14,26,0.6)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(400, W * 0.66), ph = this.modal === 'settings' ? 250 : 230;
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
    ctx.fillStyle = '#fff8ec';
    rr(ctx, px, py, pw, ph, 16); ctx.fill();
    ctx.strokeStyle = '#e2c893'; ctx.lineWidth = 3;
    rr(ctx, px, py, pw, ph, 16); ctx.stroke();
    ctx.textAlign = 'center';
    this.modalBtns = {};

    if (this.modal === 'settings') {
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('设置', W / 2, py + 40);
      // 音量滑条
      ctx.fillStyle = '#6b6b6b';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('音量', px + 36, py + 88);
      const sx = px + 96, sw = pw - 140, sy = py + 82;
      ctx.fillStyle = '#d8cbb4';
      rr(ctx, sx, sy - 5, sw, 10, 5); ctx.fill();
      const kx = sx + sw * this.app.settings.volume;
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath(); ctx.arc(kx, sy, 11, 0, TAU); ctx.fill();
      this.modalBtns.volTrack = { x: sx, y: sy - 12, w: sw, h: 24 };
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6b6b6b';
      ctx.fillText(Math.round(this.app.settings.volume * 100) + '%', px + pw - 36, py + 88);
      // 弹道预览开关
      ctx.textAlign = 'left';
      ctx.fillStyle = '#6b6b6b';
      ctx.fillText('弹道预览', px + 36, py + 136);
      const on = this.app.settings.preview;
      ctx.fillStyle = on ? '#5ad35a' : '#c9c2b4';
      rr(ctx, px + pw - 104, py + 120, 56, 26, 13); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px + pw - 104 + (on ? 43 : 13), py + 133, 10, 0, TAU);
      ctx.fill();
      this.modalBtns.preview = { x: px + pw - 110, y: py + 114, w: 68, h: 38 };
      // 返回
      ctx.textAlign = 'center';
      ctx.fillStyle = '#5aa9ff';
      rr(ctx, W / 2 - 60, py + ph - 58, 120, 40, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('返 回', W / 2, py + ph - 32);
      this.modalBtns.close = { x: W / 2 - 60, y: py + ph - 58, w: 120, h: 40 };
    } else if (this.modal === 'hotseat') {
      ctx.fillStyle = '#5b4632';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('热座对战 · 几支队伍？', W / 2, py + 44);
      const colors = [['2 队', '#ff5a5a'], ['3 队', '#58c95e'], ['4 队', '#ffc94d']];
      const bw = 92;
      let bx = W / 2 - (colors.length * (bw + 14) - 14) / 2;
      for (const [label, color] of colors) {
        ctx.fillStyle = color;
        rr(ctx, bx, py + 78, bw, 54, 12); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(label, bx + bw / 2, py + 112);
        this.modalBtns['teams' + label[0]] = { x: bx, y: py + 78, w: bw, h: 54 };
        bx += bw + 14;
      }
      ctx.fillStyle = '#999';
      ctx.font = '15px sans-serif';
      ctx.fillText('同一台手机轮流行动，同屏轮流对战玩法', W / 2, py + 158);
      ctx.fillStyle = '#8fa3bd';
      rr(ctx, W / 2 - 60, py + ph - 54, 120, 38, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('取 消', W / 2, py + ph - 29);
      this.modalBtns.close = { x: W / 2 - 60, y: py + ph - 54, w: 120, h: 38 };
    }
  }

  onPoint(type, x, y) {
    this.app.sfx.unlock();
    const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (this.modal) {
      if (type === 'start' || type === 'move') {
        const tr = this.modalBtns.volTrack;
        if (tr && this.modal === 'settings' && (this.dragVol || (type === 'start' && hit(tr)))) {
          this.dragVol = true;
          this.app.settings.volume = clamp((x - tr.x) / tr.w, 0, 1);
          this.app.saveSettings();
          return;
        }
      }
      if (type === 'end') this.dragVol = null;
      if (type !== 'start') return;
      if (this.modal === 'settings') {
        if (hit(this.modalBtns.preview)) {
          this.app.settings.preview = !this.app.settings.preview;
          this.app.saveSettings();
          this.app.sfx.play('click');
          return;
        }
        if (hit(this.modalBtns.close)) { this.modal = null; this.app.sfx.play('click'); }
        return;
      }
      if (this.modal === 'hotseat') {
        for (const n of ['2', '3', '4']) {
          if (hit(this.modalBtns['teams' + n])) {
            this.app.sfx.play('click');
            this.app.switchScene('battle', hotseatCfg(+n));
            return;
          }
        }
        if (hit(this.modalBtns.close)) { this.modal = null; this.app.sfx.play('click'); }
        return;
      }
    }

    if (type !== 'start') return;
    if (hit(this.btns.campaign)) {
      this.app.sfx.play('click');
      const p = this.app.progress;
      const cfg = campaignCfg(1);
      cfg.teams[0].species = p.squad.slice(0, 3);
      while (cfg.teams[0].species.length < 3) cfg.teams[0].species.push('ant');
      cfg.teams[0].skins = p.skins;
      cfg.modifiers = talentModifiers(p.talents);
      cfg.taken = {};
      this.app.switchScene('battle', cfg);
    } else if (hit(this.btns.hotseat)) {
      this.app.sfx.play('click');
      this.modal = 'hotseat';
    } else if (hit(this.btns.online)) {
      this.app.sfx.play('click');
      this.app.switchScene('lobby');
    } else if (hit(this.btns.shop)) {
      this.app.sfx.play('click');
      this.app.switchScene('shop');
    } else if (hit(this.btns.settings)) {
      this.app.sfx.play('click');
      this.modal = 'settings';
    }
  }
}
