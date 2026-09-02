// 战斗 HUD：队伍面板/计时/风向/武器栏/操作按钮/横幅
import { WEAPONS, WEAPON_ORDER } from '../weapons/weapons.js';
import { SPECIES, SKILLS } from '../meta/species.js';

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

export class HUD {
  constructor(battle, opts = {}) {
    this.b = battle;
    this.selected = {};   // teamIdx -> weaponKey
    this.moveHeld = 0;    // -1/0/1
    this.moveTouchId = null;
    this.chargeTouchId = null;
    this.aimHeld = 0;     // -1=抬 / 1=压
    this.aimTouchId = null;
    this.rects = {};
    this.bannerT = 0;
    this.toast = null; this.toastT = 0;
    this.preview = opts.preview !== false;
  }

  showToast(text) { this.toast = text; this.toastT = 2.2; }

  update(dt) {
    this.bannerT += dt;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast = null; }
  }

  getSelWeapon(tc) {
    if (!this.selected[tc]) {
      const slot = this.b.arsenal[tc];
      const first = WEAPON_ORDER.find(k => WEAPONS[k].ammoInf || slot[k] > 0);
      this.selected[tc] = first || 'bazooka';
    }
    return this.selected[tc];
  }

  // 命中检测：返回 {act:'weapon'|'skill'|'end'|'fireDown'...} 或 null
  handlePoint(type, x, y) {
    const R = this.rects;
    if (!R.fire) return null;
    const inside = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (type === 'start') {
      for (const key of WEAPON_ORDER) {
        if (inside(R.weapons[key])) {
          this.selected[this.b.turnTeam] = key;
          return { act: 'click' };
        }
      }
      if (inside(R.skill)) return { act: 'skill' };
      if (inside(R.end)) return { act: 'end' };
      if (inside(R.jump)) { return { act: 'jump' }; }
      if (inside(R.aimUp)) { this.aimHeld = -1; this.aimTouchId = 'U'; return { act: 'hold' }; }
      if (inside(R.aimDn)) { this.aimHeld = 1; this.aimTouchId = 'D'; return { act: 'hold' }; }
      if (inside(R.moveL)) { this.moveHeld = -1; this.moveTouchId = 'L'; return { act: 'hold' }; }
      if (inside(R.moveR)) { this.moveHeld = 1; this.moveTouchId = 'R'; return { act: 'hold' }; }
      if (inside(R.fire)) { this.chargeTouchId = 'F'; return { act: 'fireDown' }; }
    } else if (type === 'end') {
      let ret = null;
      if (this.aimTouchId) { this.aimHeld = 0; this.aimTouchId = null; ret = { act: 'hold' }; }
      if (this.moveTouchId) { this.moveHeld = 0; this.moveTouchId = null; ret = { act: 'hold' }; }
      if (this.chargeTouchId) { this.chargeTouchId = null; ret = { act: 'fireUp' }; }
      return ret;
    }
    return null;
  }

  draw(ctx, W, H, opts = {}) {
    const b = this.b;
    const R = this.rects;
    const active = b.activeBug;
    const humanCtrl = opts.humanControl === true;
    const t = performance.now() / 1000;

    // ---- 顶部队伍面板 ----
    let px = 10;
    for (let ti = 0; ti < b.teams.length; ti++) {
      const team = b.teams[ti];
      const bugs = b.teamBugs[ti];
      const pw = 40 + bugs.length * 46;
      ctx.fillStyle = 'rgba(10,20,35,0.55)';
      rr(ctx, px, 8, pw, 44, 10); ctx.fill();
      if (ti === b.turnTeam && !b.over) {
        ctx.strokeStyle = team.color; ctx.lineWidth = 2.5;
        rr(ctx, px, 8, pw, 44, 10); ctx.stroke();
      }
      let wx = px + 10;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(team.name, wx, 23);
      wx += 4;
      for (const w of bugs) {
        const bx = wx + 15, by = 35;
        ctx.globalAlpha = w.dead ? 0.25 : 1;
        ctx.fillStyle = w.dead ? '#555' : w.color;
        ctx.beginPath(); ctx.arc(bx, by, 8.5, 0, Math.PI * 2); ctx.fill();
        if (w === active && !w.dead) {
          ctx.strokeStyle = '#ffe94d'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(bx, by, 10 + Math.sin(t * 6) * 0.8, 0, Math.PI * 2); ctx.stroke();
        }
        if (!w.dead) {
          const pct = w.hp / w.maxHp;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(bx - 11, by + 11, 22, 4);
          ctx.fillStyle = pct > 0.55 ? '#5ad35a' : pct > 0.25 ? '#ffc94d' : '#ff5a5a';
          ctx.fillRect(bx - 11, by + 11, 22 * pct, 4);
        }
        ctx.globalAlpha = 1;
        wx += 46;
      }
      px += pw + 8;
    }

    // ---- 顶部中央：计时 + 风向 ----
    const cx = W / 2;
    if (!b.over) {
      const tt = Math.max(0, b.timeLeft);
      ctx.fillStyle = 'rgba(10,20,35,0.55)';
      rr(ctx, cx - 120, 8, 240, 44, 10); ctx.fill();
      // 计时条
      const frac = Math.max(0, tt / b.turnTime);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      rr(ctx, cx - 108, 26, 130, 12, 6); ctx.fill();
      ctx.fillStyle = tt < 6 ? '#ff5a5a' : '#5ad35a';
      rr(ctx, cx - 108, 26, 130 * frac, 12, 6); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(tt) + 's', cx - 108 + 65, 36);
      // 风向
      const wind = b.wind;
      const wx0 = cx + 50, wy = 31;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('风', wx0 - 16, wy + 5);
      const wl = wind * 42;
      ctx.strokeStyle = '#9fd8ff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(wx0, wy); ctx.lineTo(wx0 + wl, wy);
      ctx.stroke();
      if (Math.abs(wind) > 0.05) {
        const d = Math.sign(wl);
        ctx.fillStyle = '#9fd8ff';
        ctx.beginPath();
        ctx.moveTo(wx0 + wl + d * 9, wy);
        ctx.lineTo(wx0 + wl, wy - 5);
        ctx.lineTo(wx0 + wl, wy + 5);
        ctx.fill();
      }
    }

    // ---- 横幅（回合开始） ----
    if (b.phase === 'banner' && !b.over) {
      const team = b.teams[b.turnTeam];
      const k = Math.min(1, this.bannerT * 5);
      ctx.save();
      ctx.translate(cx, H * 0.32);
      ctx.scale(0.6 + k * 0.4, 0.6 + k * 0.4);
      ctx.globalAlpha = Math.min(1, (1.15 - b.phaseT) * 3);
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 8;
      ctx.strokeText(`${team.name} 行动`, 0, 0);
      ctx.fillStyle = team.color;
      ctx.fillText(`${team.name} 行动`, 0, 0);
      ctx.restore();
      this.bannerT += 0; // 相位由 battle.phaseT 驱动
    }

    // ---- Toast ----
    if (this.toast) {
      const a = Math.min(1, this.toastT);
      ctx.globalAlpha = a;
      ctx.font = 'bold 19px sans-serif';
      const tw = ctx.measureText(this.toast).width + 36;
      ctx.fillStyle = 'rgba(10,20,35,0.75)';
      rr(ctx, cx - tw / 2, H * 0.24 - 18, tw, 34, 17); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(this.toast, cx, H * 0.24 + 5);
      ctx.globalAlpha = 1;
    }

    // ---- 底部操作 ----
    const bs = Math.min(58, H * 0.11);
    const margin = 14;
    const by = H - bs - margin;
    // 左移/右移/跳
    R.moveL = { x: margin, y: by, w: bs, h: bs };
    R.moveR = { x: margin + bs + 8, y: by, w: bs, h: bs };
    R.jump = { x: margin + bs * 2 + 16, y: by, w: bs * 0.82, h: bs * 0.82 };
    // 抬/压枪口（瞄准角度），放移动键上方一行
    const as = bs * 0.72;
    R.aimUp = { x: margin, y: by - as - 8, w: as, h: as };
    R.aimDn = { x: margin + as + 6, y: by - as - 8, w: as, h: as };
    const chargingAim = humanCtrl && active && active.charging; // 蓄力中：左右按钮=调角度
    this.drawBtn(ctx, R.aimUp, '抬', this.aimHeld === -1, 0.72);
    this.drawBtn(ctx, R.aimDn, '压', this.aimHeld === 1, 0.72);
    this.drawBtn(ctx, R.moveL, '◀', this.moveHeld === -1, 1, chargingAim ? '#ffe94d' : null);
    this.drawBtn(ctx, R.moveR, '▶', this.moveHeld === 1, 1, chargingAim ? '#ffe94d' : null);
    this.drawBtn(ctx, R.jump, '↑', false, 0.8);

    // 右侧：开火 + 技能 + 跳过
    R.fire = { x: W - margin - bs * 1.15, y: by - bs * 0.12, w: bs * 1.15, h: bs * 1.15 };
    R.skill = { x: W - margin - bs * 1.15 - bs * 0.95 - 8, y: by + bs * 0.3, w: bs * 0.95, h: bs * 0.95 };
    R.end = { x: W - margin - bs * 1.15 - bs * 0.95 - 8, y: by - bs * 0.15 - bs * 0.55, w: bs * 0.95, h: bs * 0.55 };

    if (humanCtrl && active && !b.over) {
      // 技能按钮
      const sp = SPECIES[active.species];
      const sk = SKILLS[sp.skill];
      const cd = active.skillCd;
      ctx.fillStyle = cd > 0 ? 'rgba(60,70,90,0.75)' : 'rgba(160,90,220,0.85)';
      rr(ctx, R.skill.x, R.skill.y, R.skill.w, R.skill.h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
      rr(ctx, R.skill.x, R.skill.y, R.skill.w, R.skill.h, 10); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${R.skill.h * 0.34}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(cd > 0 ? `${cd}` : sk.name, R.skill.x + R.skill.w / 2, R.skill.y + R.skill.h / 2 + R.skill.h * 0.12);

      // 跳过
      ctx.fillStyle = 'rgba(10,20,35,0.55)';
      rr(ctx, R.end.x, R.end.y, R.end.w, R.end.h, 8); ctx.fill();
      ctx.fillStyle = '#cfd8e3';
      ctx.font = `${R.end.h * 0.5}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('跳过', R.end.x + R.end.w / 2, R.end.y + R.end.h * 0.68);

      // 开火按钮（含蓄力环）
      const charging = active.charging;
      const g = ctx.createRadialGradient(R.fire.x + R.fire.w / 2, R.fire.y + R.fire.h * 0.4, 4, R.fire.x + R.fire.w / 2, R.fire.y + R.fire.h / 2, R.fire.w / 2);
      g.addColorStop(0, charging ? '#ff7a5c' : '#ff5a5a');
      g.addColorStop(1, charging ? '#c8331f' : '#c22f2f');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(R.fire.x + R.fire.w / 2, R.fire.y + R.fire.h / 2, R.fire.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(R.fire.x + R.fire.w / 2, R.fire.y + R.fire.h / 2, R.fire.w / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${R.fire.h * 0.26}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(charging ? `${Math.round(active.charge * 100)}%` : '开火', R.fire.x + R.fire.w / 2, R.fire.y + R.fire.h / 2 + R.fire.h * 0.09);
      if (charging) {
        ctx.strokeStyle = '#ffe94d';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(R.fire.x + R.fire.w / 2, R.fire.y + R.fire.h / 2, R.fire.w / 2 - 4, -Math.PI / 2, -Math.PI / 2 + active.charge * Math.PI * 2);
        ctx.stroke();
      }
    }

    // ---- 武器栏 ----
    const slot = b.arsenal[b.turnTeam];
    const iconS = Math.min(50, H * 0.093);
    const gap = 6;
    const totalW = WEAPON_ORDER.length * (iconS + gap) - gap;
    let ix = cx - totalW / 2;
    const iy = H - iconS - margin;
    R.weapons = {};
    const sel = this.getSelWeapon(b.turnTeam);
    for (const key of WEAPON_ORDER) {
      const def = WEAPONS[key];
      const ammo = def.ammoInf ? Infinity : (slot[key] || 0);
      const usable = def.ammoInf || ammo > 0;
      R.weapons[key] = { x: ix, y: iy, w: iconS, h: iconS };
      ctx.fillStyle = key === sel ? 'rgba(255,225,90,0.28)' : 'rgba(10,20,35,0.55)';
      rr(ctx, ix, iy, iconS, iconS, 10); ctx.fill();
      if (key === sel) {
        ctx.strokeStyle = '#ffe94d'; ctx.lineWidth = 2.5;
        rr(ctx, ix, iy, iconS, iconS, 10); ctx.stroke();
      }
      ctx.save();
      ctx.translate(ix, iy);
      ctx.globalAlpha = usable ? 1 : 0.32;
      def.icon(ctx, iconS);
      ctx.restore();
      if (!def.ammoInf) {
        ctx.fillStyle = usable ? '#fff' : '#999';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(String(ammo), ix + iconS - 4, iy + iconS - 4);
      }
      ix += iconS + gap;
    }
  }

  drawBtn(ctx, r, label, held, scale = 1, stroke = null) {
    ctx.fillStyle = held ? 'rgba(255,225,90,0.4)' : 'rgba(10,20,35,0.55)';
    rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    ctx.strokeStyle = stroke || 'rgba(255,255,255,0.35)'; ctx.lineWidth = stroke ? 2.5 : 1.5;
    rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${r.h * 0.55 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h * 0.68);
  }
}
