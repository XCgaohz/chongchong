// 武器系统：定义、开火逻辑、弹种参数、图标与弹体绘制
import { Projectile } from '../entities/projectile.js';
import { TAU } from '../core/mathutil.js';

export function muzzle(bug, angle) {
  return { x: bug.x + Math.cos(angle) * 15, y: bug.y + Math.sin(angle) * 15 - 2 };
}

// ---------- 弹种参数 ----------
export const PROJ_DEFS = {
  bazooka: {
    look: 'rocket', r: 4, windAffect: 1,
    impact(b, p) { b.explode(p.x, p.y, 55, 45, 250, p.teamIdx, { boom: 'boom' }); }
  },
  grenade: {
    look: 'grenade', r: 4.5, windAffect: 0.25, bounce: 0.45, fuse: 2.2,
    impact(b, p) { b.explode(p.x, p.y, 50, 40, 210, p.teamIdx, { boom: 'boom' }); }
  },
  banana: {
    look: 'banana', r: 5, windAffect: 0.7,
    impact(b, p) {
      b.explode(p.x, p.y, 24, 10, 140, p.teamIdx, { boom: 'boom' });
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.45 + (Math.random() - 0.5) * 0.3;
        const sp = 300 + Math.random() * 160;
        b.projectiles.push(new Projectile(PROJ_DEFS.bomblet, p.x, p.y - 8, Math.cos(a) * sp, Math.sin(a) * sp, p.owner));
      }
    }
  },
  bomblet: {
    look: 'ball', r: 3.5, windAffect: 0.6,
    impact(b, p) { b.explode(p.x, p.y, 38, 24, 170, p.teamIdx, { boom: 'boom' }); }
  },
  drill: {
    look: 'drill', r: 5, windAffect: 0, gravMul: 0.22, drill: true, drillR: 13, fuse: 2.4,
    impact(b, p) { b.explode(p.x, p.y, 34, 22, 170, p.teamIdx, { boom: 'boom' }); }
  },
  bomb: {
    look: 'bomb', r: 4, windAffect: 0.3,
    impact(b, p) { b.explode(p.x, p.y, 40, 26, 190, p.teamIdx, { boom: 'boom' }); }
  },
  holy: {
    look: 'holy', r: 5.5, windAffect: 0.2, bounce: 0.4, fuse: 1.8,
    impact(b, p) {
      b.emit({ type: 'flash' });
      b.explode(p.x, p.y, 92, 72, 340, p.teamIdx, { boom: 'bigboom' });
    }
  }
};

function launch(defKey, baseSpeed, powerRange) {
  return function (b, bug, angle, power) {
    const sp = baseSpeed + power * powerRange;
    const m = muzzle(bug, angle);
    b.projectiles.push(new Projectile(PROJ_DEFS[defKey], m.x, m.y, Math.cos(angle) * sp, Math.sin(angle) * sp, bug));
    b.emit({ type: 'sfx', name: 'fire' });
  };
}

// ---------- 武器定义 ----------
export const WEAPONS = {
  bazooka: {
    key: 'bazooka', name: '火箭筒', ammoInf: true, order: 1,
    desc: '基础弹头，受风影响大',
    fire: launch('bazooka', 380, 560),
    icon(ctx, s) {
      ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(-0.65);
      ctx.fillStyle = '#d9483b';
      rr(ctx, -s * 0.34, -s * 0.08, s * 0.58, s * 0.16, s * 0.07); ctx.fill();
      ctx.fillStyle = '#f2f2f2';
      ctx.beginPath();
      ctx.moveTo(s * 0.22, -s * 0.08); ctx.lineTo(s * 0.36, 0); ctx.lineTo(s * 0.22, s * 0.08);
      ctx.fill();
      ctx.fillStyle = '#ff9040';
      ctx.beginPath();
      ctx.moveTo(-s * 0.34, 0); ctx.lineTo(-s * 0.5, -s * 0.09); ctx.lineTo(-s * 0.44, 0); ctx.lineTo(-s * 0.5, s * 0.09);
      ctx.fill();
      ctx.restore();
    }
  },
  grenade: {
    key: 'grenade', name: '手雷', ammo: 3, order: 2,
    desc: '会弹跳，2.2秒后爆炸',
    fire: launch('grenade', 330, 480),
    icon(ctx, s) {
      ctx.fillStyle = '#3e7d3a';
      ctx.beginPath(); ctx.arc(s / 2, s * 0.56, s * 0.22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2c5a29';
      ctx.beginPath(); ctx.arc(s / 2, s * 0.56, s * 0.22, 0.6, 2.4); ctx.fill();
      ctx.strokeStyle = '#8899a5'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(s / 2, s * 0.36); ctx.lineTo(s / 2, s * 0.26); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.62, s * 0.24, s * 0.07, 0, TAU); ctx.stroke();
    }
  },
  shotgun: {
    key: 'shotgun', name: '霰弹枪', ammo: 3, order: 3,
    desc: '直线瞬发，无视风力',
    fire(b, bug, angle) {
      const m = muzzle(bug, angle);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let hit = null;
      for (let t = 6; t < 800; t += 5) {
        const x = m.x + dx * t, y = m.y + dy * t;
        if (b.terrain.solid(x, y)) { hit = { x, y, kind: 'terrain' }; break; }
        let bugHit = false;
        for (const w of b.bugs) {
          if (w.dead || w === bug) continue;
          const d = Math.hypot(w.x - x, w.y - y);
          if (d < w.r + 4) { hit = { x, y, kind: 'bug', w }; bugHit = true; break; }
        }
        if (bugHit) break;
        if (y > b.terrain.waterY || x < 0 || x > b.worldW) break;
      }
      b.emit({ type: 'gunshot', x: m.x, y: m.y, angle });
      b.emit({ type: 'sfx', name: 'shootgun' });
      if (hit) {
        b.terrain.destroyCircle(hit.x, hit.y, 9);
        if (hit.kind === 'bug') hit.w.damage(24, 'shot', b);
        b.emit({ type: 'explosion', x: hit.x, y: hit.y, r: 13, silent: true });
      }
    },
    icon(ctx, s) {
      ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(-0.7);
      ctx.fillStyle = '#6b4a2b';
      rr(ctx, -s * 0.1, -s * 0.07, s * 0.26, s * 0.14, 2); ctx.fill();
      ctx.fillStyle = '#565f6b';
      rr(ctx, s * 0.1, -s * 0.055, s * 0.4, s * 0.11, 2); ctx.fill();
      ctx.restore();
    }
  },
  banana: {
    key: 'banana', name: '香蕉炸弹', ammo: 1, order: 4,
    desc: '撞击后裂成 5 枚子炸弹',
    fire: launch('banana', 320, 470),
    icon(ctx, s) {
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = s * 0.16; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(s / 2, s * 0.42, s * 0.24, 0.35, Math.PI - 0.35); ctx.stroke();
      ctx.strokeStyle = '#c79418'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s / 2, s * 0.42, s * 0.31, 0.6, Math.PI - 0.6); ctx.stroke();
    }
  },
  drill: {
    key: 'drill', name: '钻头', ammo: 1, order: 5,
    desc: '低空钻地开隧道',
    fire: launch('drill', 300, 380),
    icon(ctx, s) {
      ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(0.7);
      ctx.fillStyle = '#8b6f47';
      rr(ctx, -s * 0.05, -s * 0.32, s * 0.1, s * 0.3, 2); ctx.fill();
      ctx.fillStyle = '#c0c8d4';
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, 0); ctx.lineTo(s * 0.1, 0); ctx.lineTo(0, s * 0.36);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  },
  airstrike: {
    key: 'airstrike', name: '空袭', ammo: 1, order: 6,
    desc: '战机沿瞄准方向投下 5 弹',
    fire(b, bug, angle) {
      const tx = bug.x + Math.cos(angle) * 540;
      const dir = Math.cos(angle) >= 0 ? 1 : -1;
      b.pendingAirstrike = {
        targetX: tx, dir, t: 0, dropped: 0,
        planeX: tx - dir * 620, planeY: 46
      };
      b.emit({ type: 'sfx', name: 'skill' });
    },
    icon(ctx, s) {
      ctx.fillStyle = '#9aa7b5';
      ctx.beginPath();
      ctx.ellipse(s / 2, s / 2, s * 0.3, s * 0.08, -0.1, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.44, s * 0.4); ctx.lineTo(s * 0.6, s * 0.24); ctx.lineTo(s * 0.62, s * 0.42);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7c8a99';
      rr(ctx, s * 0.2, s * 0.44, s * 0.16, s * 0.05, 2); ctx.fill();
    }
  },
  medkit: {
    key: 'medkit', name: '医疗包', ammo: 1, order: 7,
    desc: '立刻回复 50 点生命',
    fire(b, bug) {
      bug.heal(50, b);
      b.emit({ type: 'sfx', name: 'pickup' });
      b.particles && b.particles.confetti(bug.x, bug.y - 20);
    },
    icon(ctx, s) {
      ctx.fillStyle = '#f3f5f7';
      rr(ctx, s * 0.2, s * 0.28, s * 0.6, s * 0.46, 4); ctx.fill();
      ctx.fillStyle = '#e8493f';
      rr(ctx, s * 0.44, s * 0.36, s * 0.12, s * 0.3, 2); ctx.fill();
      rr(ctx, s * 0.35, s * 0.45, s * 0.3, s * 0.12, 2); ctx.fill();
    }
  },
  holy: {
    key: 'holy', name: '神圣手雷', ammo: 0, order: 8,
    desc: '传说中的超级大爆炸',
    fire: launch('holy', 340, 500),
    icon(ctx, s) {
      ctx.fillStyle = '#f5f0dc';
      ctx.beginPath(); ctx.arc(s / 2, s * 0.55, s * 0.24, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#d8b23a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s / 2, s * 0.55, s * 0.24, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s / 2, s * 0.42); ctx.lineTo(s / 2, s * 0.68);
      ctx.moveTo(s * 0.38, s * 0.55); ctx.lineTo(s * 0.62, s * 0.55);
      ctx.stroke();
    }
  }
};

export const WEAPON_ORDER = ['bazooka', 'grenade', 'shotgun', 'banana', 'drill', 'airstrike', 'medkit', 'holy'];
export const DEFAULT_ARSENAL = { bazooka: Infinity, grenade: 3, shotgun: 3, banana: 1, drill: 1, airstrike: 1, medkit: 1, holy: 0 };

// ---------- 弹体绘制 ----------
export function drawProjectile(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  switch (p.look) {
    case 'rocket': {
      ctx.rotate(p.rot);
      ctx.fillStyle = '#d9483b';
      rr(ctx, -8, -3, 13, 6, 3); ctx.fill();
      ctx.fillStyle = '#eee';
      ctx.beginPath();
      ctx.moveTo(5, -3); ctx.lineTo(10, 0); ctx.lineTo(5, 3);
      ctx.fill();
      ctx.fillStyle = '#ff9040';
      const fl = 6 + Math.random() * 6;
      ctx.beginPath();
      ctx.moveTo(-8, -2.5); ctx.lineTo(-8 - fl, 0); ctx.lineTo(-8, 2.5);
      ctx.fill();
      break;
    }
    case 'grenade': {
      ctx.rotate(p.age * 8);
      ctx.fillStyle = '#3e7d3a';
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8899a5'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -7); ctx.stroke();
      // 引信火花
      ctx.fillStyle = Math.random() < 0.5 ? '#ffd23e' : '#ff6b3d';
      ctx.beginPath(); ctx.arc(0, -8, 1.6 + Math.random(), 0, TAU); ctx.fill();
      break;
    }
    case 'banana': {
      ctx.rotate(p.rot);
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -2, 5, 0.4, Math.PI - 0.4); ctx.stroke();
      break;
    }
    case 'drill': {
      ctx.rotate(p.rot);
      ctx.fillStyle = '#8b6f47';
      rr(ctx, -9, -3, 9, 6, 2); ctx.fill();
      ctx.fillStyle = '#c0c8d4';
      ctx.beginPath();
      ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.lineTo(9, 0);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'bomb': {
      ctx.rotate(p.rot);
      ctx.fillStyle = '#565f6b';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 3.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#38404a';
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-9, -2); ctx.lineTo(-9, 2); ctx.fill();
      break;
    }
    case 'holy': {
      ctx.rotate(p.age * 6);
      ctx.fillStyle = '#f5f0dc';
      ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#d8b23a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -3.4); ctx.lineTo(0, 3.4);
      ctx.moveTo(-3.4, 0); ctx.lineTo(3.4, 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,160,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 8 + Math.random() * 3, 0, TAU); ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = '#444';
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

// 圆角矩形工具（本地复用，避免额外依赖）
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
