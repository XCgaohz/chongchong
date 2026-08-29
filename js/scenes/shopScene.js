// 虫虫基地：虫种解锁与小队配置 / 皮肤帽饰 / 天赋树
import { SPECIES, SKINS } from '../meta/species.js';
import { TALENTS } from '../meta/progress.js';
import { TAU } from '../core/mathutil.js';

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

export class ShopScene {
  constructor(app) {
    this.app = app;
    this.tab = 0;
    this.btns = {};
    this.skinSpecies = app.progress.unlocked[0] || 'ant';
    this.toast = null; this.toastT = 0;
  }

  showToast(text) { this.toast = text; this.toastT = 1.8; }

  update(dt) { if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast = null; } }

  save() { this.app.saveProgress(); }

  draw(ctx, W, H) {
    const p = this.app.progress;
    ctx.fillStyle = '#f0e7d4';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e5d8bc';
    ctx.fillRect(0, 0, W, 64);

    // 顶栏
    this.btns = {};
    ctx.fillStyle = '#8fa3bd';
    rr(ctx, 14, 14, 96, 36, 9); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('← 返回', 62, 38);
    this.btns.back = { x: 14, y: 14, w: 96, h: 36 };

    ctx.fillStyle = '#5b4632';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('虫虫基地', W / 2, 40);

    ctx.fillStyle = '#ffc94d';
    rr(ctx, W - 130, 14, 116, 36, 9); ctx.fill();
    ctx.fillStyle = '#7a5a10';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`🪙 ${p.coins}`, W - 72, 38);

    // 页签
    const tabs = ['虫种小队', '皮肤帽饰', '天赋'];
    const tw = Math.min(140, W * 0.14);
    let tx = W / 2 - (tabs.length * (tw + 10) - 10) / 2;
    tabs.forEach((t, i) => {
      ctx.fillStyle = this.tab === i ? '#ff9f43' : '#d8cbb4';
      rr(ctx, tx, 78, tw, 38, 9); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(t, tx + tw / 2, 103);
      this.btns['tab' + i] = { x: tx, y: 78, w: tw, h: 38 };
      tx += tw + 10;
    });

    if (this.tab === 0) this.drawSpeciesTab(ctx, W, H);
    else if (this.tab === 1) this.drawSkinTab(ctx, W, H);
    else this.drawTalentTab(ctx, W, H);

    if (this.toast) {
      ctx.globalAlpha = Math.min(1, this.toastT);
      ctx.font = 'bold 15px sans-serif';
      const tw2 = ctx.measureText(this.toast).width + 34;
      ctx.fillStyle = 'rgba(10,20,35,0.78)';
      rr(ctx, W / 2 - tw2 / 2, H - 60, tw2, 32, 16); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(this.toast, W / 2, H - 38);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- 虫种小队 ----------
  drawSpeciesTab(ctx, W, H) {
    const p = this.app.progress;
    // 小队展示
    ctx.fillStyle = '#5b4632';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('出战小队（点击虫种卡片加入/移出，最多 3 只）', 24, 142);
    for (let i = 0; i < 3; i++) {
      const sx = 24 + i * 92;
      ctx.fillStyle = '#fffaf0';
      rr(ctx, sx, 152, 82, 62, 10); ctx.fill();
      ctx.strokeStyle = '#d8cbb4'; ctx.lineWidth = 2;
      rr(ctx, sx, 152, 82, 62, 10); ctx.stroke();
      const sp = p.squad[i];
      if (sp) {
        this.drawMiniBug(ctx, sx + 41, 184, SPECIES[sp].color, SPECIES[sp].dark, p.skins[sp] || 'none');
        ctx.fillStyle = '#4a3b28';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(SPECIES[sp].name, sx + 41, 210);
      } else {
        ctx.fillStyle = '#c9c2b4';
        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('+', sx + 41, 190);
      }
    }

    // 虫种卡片
    const keys = Object.keys(SPECIES);
    const rowH = 86;
    let cy = 236;
    const cw = Math.min(560, W - 48);
    for (const k of keys) {
      const s = SPECIES[k];
      const unlocked = p.unlocked.includes(k);
      const inSquad = p.squad.includes(k);
      ctx.fillStyle = '#fffaf0';
      rr(ctx, 24, cy, cw, rowH - 10, 12); ctx.fill();
      ctx.strokeStyle = inSquad ? '#5ad35a' : '#d8cbb4';
      ctx.lineWidth = inSquad ? 3 : 2;
      rr(ctx, 24, cy, cw, rowH - 10, 12); ctx.stroke();
      this.drawMiniBug(ctx, 70, cy + (rowH - 10) / 2, s.color, s.dark, p.skins[k] || 'none');
      ctx.textAlign = 'left';
      ctx.fillStyle = '#4a3b28';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(s.name, 118, cy + 26);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#8a7a62';
      ctx.fillText(s.desc, 118, cy + 46);
      ctx.fillText(`❤${s.maxHp}  ⚡${s.speed}  ${s.maxJumps > 1 ? '二段跳' : '单跳'}`, 118, cy + 64);
      // 右侧按钮
      const bwx = 24 + cw - 118;
      if (!unlocked) {
        ctx.fillStyle = '#ffc94d';
        rr(ctx, bwx, cy + 14, 100, 36, 9); ctx.fill();
        ctx.fillStyle = '#7a5a10';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🪙 ${s.price} 解锁`, bwx + 50, cy + 37);
        this.btns['buy_' + k] = { x: bwx, y: cy + 14, w: 100, h: 36 };
      } else {
        ctx.fillStyle = inSquad ? '#5ad35a' : '#a3d0ff';
        rr(ctx, bwx, cy + 14, 100, 36, 9); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(inSquad ? '出战中 ✓' : '加入小队', bwx + 50, cy + 37);
        this.btns['toggle_' + k] = { x: bwx, y: cy + 14, w: 100, h: 36 };
      }
      cy += rowH;
    }
  }

  drawMiniBug(ctx, x, y, color, dark, hat) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(x, y + 12, 13, 3.5, 0, 0, TAU); ctx.fill();
    for (let i = 2; i >= 1; i--) {
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(x - i * 9, y + i, 6 - i, 0, TAU); ctx.fill();
    }
    const g = ctx.createRadialGradient(x - 3, y - 4, 2, x, y, 14);
    g.addColorStop(0, '#fff'); g.addColorStop(0.25, color); g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 10); ctx.lineTo(x - 7, y - 18);
    ctx.moveTo(x + 5, y - 10); ctx.lineTo(x + 7, y - 18);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 4, y - 4, 4.4, 0, TAU); ctx.arc(x + 4.5, y - 4, 4.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(x - 3.2, y - 3.6, 2, 0, TAU); ctx.arc(x + 5.2, y - 3.6, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5b2d1e'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y + 4, 3.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    // 帽子
    if (hat === 'cap') {
      ctx.fillStyle = '#d9483b';
      ctx.beginPath(); ctx.arc(x, y - 9, 10, Math.PI, 0); ctx.fill();
    } else if (hat === 'crown') {
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 13); ctx.lineTo(x - 8, y - 20); ctx.lineTo(x - 4, y - 15);
      ctx.lineTo(x, y - 21); ctx.lineTo(x + 4, y - 15); ctx.lineTo(x + 8, y - 20); ctx.lineTo(x + 8, y - 13);
      ctx.closePath(); ctx.fill();
    } else if (hat === 'beret') {
      ctx.fillStyle = '#3d6ea5';
      ctx.beginPath(); ctx.ellipse(x - 2, y - 15, 11, 4.5, -0.15, 0, TAU); ctx.fill();
    } else if (hat === 'bow') {
      ctx.fillStyle = '#ff7eb6';
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 12); ctx.lineTo(x - 18, y - 17); ctx.lineTo(x - 18, y - 7);
      ctx.closePath(); ctx.fill();
    } else if (hat === 'halo') {
      ctx.strokeStyle = '#ffe94d'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(x, y - 22, 8.5, 3, 0, 0, TAU); ctx.stroke();
    }
  }

  // ---------- 皮肤 ----------
  drawSkinTab(ctx, W, H) {
    const p = this.app.progress;
    const species = p.unlocked.filter(k => k !== undefined);
    ctx.fillStyle = '#5b4632';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('选择虫种', 24, 148);
    let sx = 110;
    for (const k of species) {
      const sel = this.skinSpecies === k;
      ctx.fillStyle = sel ? '#ffe9b8' : '#fffaf0';
      rr(ctx, sx, 128, 92, 34, 8); ctx.fill();
      ctx.strokeStyle = sel ? '#ff9f43' : '#d8cbb4'; ctx.lineWidth = 2;
      rr(ctx, sx, 128, 92, 34, 8); ctx.stroke();
      this.drawMiniBug(ctx, sx + 22, 145, SPECIES[k].color, SPECIES[k].dark, p.skins[k] || 'none');
      ctx.fillStyle = '#4a3b28';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(SPECIES[k].name, sx + 62, 149);
      this.btns['pick_' + k] = { x: sx, y: 128, w: 92, h: 34 };
      sx += 102;
    }

    // 皮肤网格
    const cur = p.skins[this.skinSpecies] || 'none';
    const gw = Math.min(120, (W - 60) / 3 - 12), gh = gw * 0.94;
    SKINS.forEach((sk, i) => {
      const col = i % 3, row = (i / 3) | 0;
      const gx = 24 + col * (gw + 12), gy = 180 + row * (gh + 12);
      const owned = sk.price === 0 || p.skins[this.skinSpecies] === sk.id;
      const active = cur === sk.id;
      ctx.fillStyle = active ? '#eaffea' : '#fffaf0';
      rr(ctx, gx, gy, gw, gh, 10); ctx.fill();
      ctx.strokeStyle = active ? '#5ad35a' : '#d8cbb4'; ctx.lineWidth = active ? 3 : 2;
      rr(ctx, gx, gy, gw, gh, 10); ctx.stroke();
      this.drawMiniBug(ctx, gx + gw / 2, gy + gh * 0.42, SPECIES[this.skinSpecies].color, SPECIES[this.skinSpecies].dark, sk.id);
      ctx.fillStyle = '#4a3b28';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sk.name, gx + gw / 2, gy + gh * 0.74);
      ctx.font = '11px sans-serif';
      if (active) ctx.fillStyle = '#3aa53a';
      else if (owned) ctx.fillStyle = '#5aa9ff';
      else ctx.fillStyle = '#b0812a';
      ctx.fillText(active ? '使用中 ✓' : owned ? '点击使用' : `🪙 ${sk.price}`, gx + gw / 2, gy + gh * 0.9);
      this.btns['skin_' + sk.id] = { x: gx, y: gy, w: gw, h: gh, price: sk.price, id: sk.id, owned };
    });
  }

  // ---------- 天赋 ----------
  drawTalentTab(ctx, W, H) {
    const p = this.app.progress;
    ctx.fillStyle = '#5b4632';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('永久天赋（闯关金币可升级，所有模式生效）', 24, 148);
    let cy = 168;
    const cw = Math.min(560, W - 48);
    for (const t of TALENTS) {
      const lvl = p.talents[t.key];
      const maxed = lvl >= t.max;
      const cost = t.cost(lvl);
      ctx.fillStyle = '#fffaf0';
      rr(ctx, 24, cy, cw, 66, 12); ctx.fill();
      ctx.strokeStyle = '#d8cbb4'; ctx.lineWidth = 2;
      rr(ctx, 24, cy, cw, 66, 12); ctx.stroke();
      ctx.fillStyle = '#4a3b28';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(t.name, 44, cy + 27);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#8a7a62';
      ctx.fillText(t.desc, 44, cy + 49);
      // 等级点
      for (let i = 0; i < t.max; i++) {
        ctx.fillStyle = i < lvl ? '#ff9f43' : '#e5dcc8';
        ctx.beginPath(); ctx.arc(250 + i * 18, cy + 33, 6, 0, TAU); ctx.fill();
      }
      const bwx = 24 + cw - 128;
      if (maxed) {
        ctx.fillStyle = '#5ad35a';
        rr(ctx, bwx, cy + 15, 108, 36, 9); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('已满级', bwx + 54, cy + 38);
      } else {
        ctx.fillStyle = p.coins >= cost ? '#ffc94d' : '#d8cbb4';
        rr(ctx, bwx, cy + 15, 108, 36, 9); ctx.fill();
        ctx.fillStyle = p.coins >= cost ? '#7a5a10' : '#999';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🪙 ${cost} 升级`, bwx + 54, cy + 38);
        this.btns['talent_' + t.key] = { x: bwx, y: cy + 15, w: 108, h: 36, cost, key: t.key };
      }
      cy += 76;
    }
  }

  // ---------- 交互 ----------
  onPoint(type, x, y) {
    this.app.sfx.unlock();
    if (type !== 'start') return;
    const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const p = this.app.progress;

    if (hit(this.btns.back)) { this.app.sfx.play('click'); this.app.switchScene('home'); return; }
    for (let i = 0; i < 3; i++) if (hit(this.btns['tab' + i])) { this.tab = i; this.app.sfx.play('click'); return; }

    // 虫种
    for (const k of Object.keys(SPECIES)) {
      if (hit(this.btns['buy_' + k])) {
        const s = SPECIES[k];
        if (p.coins >= s.price) {
          p.coins -= s.price;
          p.unlocked.push(k);
          this.save();
          this.app.sfx.play('pickup');
          this.showToast(`已解锁 ${s.name}！`);
        } else this.showToast('金币不足');
        return;
      }
      if (hit(this.btns['toggle_' + k])) {
        const idx = p.squad.indexOf(k);
        if (idx >= 0) {
          if (p.squad.length > 1) { p.squad.splice(idx, 1); this.app.sfx.play('click'); }
          else this.showToast('至少要有一只虫出战');
        } else if (p.squad.length < 3) { p.squad.push(k); this.app.sfx.play('pickup'); }
        else {
          // 满员时顶替队尾
          p.squad[2] = k;
          this.app.sfx.play('pickup');
          this.showToast(`${SPECIES[k].name} 顶替出战`);
        }
        this.save();
        return;
      }
    }
    // 皮肤
    for (const k of p.unlocked) {
      if (hit(this.btns['pick_' + k])) { this.skinSpecies = k; this.app.sfx.play('click'); return; }
    }
    for (const sk of SKINS) {
      const r = this.btns['skin_' + sk.id];
      if (r && hit(r)) {
        if (r.owned) { p.skins[this.skinSpecies] = sk.id; this.save(); this.app.sfx.play('click'); }
        else if (p.coins >= r.price) {
          p.coins -= r.price;
          p.skins[this.skinSpecies] = sk.id;
          this.save();
          this.app.sfx.play('pickup');
          this.showToast(`获得 ${sk.name}！`);
        } else this.showToast('金币不足');
        return;
      }
    }
    // 天赋
    for (const t of TALENTS) {
      const r = this.btns['talent_' + t.key];
      if (r && hit(r)) {
        if (p.coins >= r.cost) {
          p.coins -= r.cost;
          p.talents[t.key]++;
          this.save();
          this.app.sfx.play('pickup');
          this.showToast(`${t.name} 升到 ${p.talents[t.key]} 级！`);
        } else this.showToast('金币不足');
        return;
      }
    }
  }
}
