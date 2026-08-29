// AI 控制器：行为状态机 + 弹道模拟选优（与人类共用同一套指令接口）
import { WEAPONS } from '../weapons/weapons.js';
import { GRAV, WIND_ACC } from '../core/constants.js';
import { mulberry32, clamp } from '../core/mathutil.js';

// 各武器近似爆炸参数（供模拟评分用）
const EXP = {
  bazooka: [55, 45], grenade: [50, 40], banana: [55, 55], drill: [34, 22],
  airstrike: [45, 55], holy: [92, 72], shotgun: [12, 24], bomblet: [38, 24]
};

export class AIController {
  constructor(battle, teamIdx, opts = {}) {
    this.b = battle;
    this.teamIdx = teamIdx;
    this.diff = opts.difficulty ?? 0.8;         // 0~1，影响瞄准精度与搜索密度
    this.personality = opts.personality || 'balanced'; // aggressive | balanced | coward
    this.rnd = mulberry32(opts.seed ?? (5613 + teamIdx * 777));
    this.lastTeamSeen = -1;
    this.reset();
  }

  reset() { this.state = 'idle'; this.t = 0; this.plan = null; this.shot = null; this.moveT = 0; }

  update(dt) {
    const b = this.b;
    if (b.over) return;
    if (b.turnTeam !== this.lastTeamSeen) {
      this.lastTeamSeen = b.turnTeam;
      if (b.turnTeam === this.teamIdx) { this.state = 'idle'; this.t = 0; this.plan = null; this.shot = null; }
    }
    if (!b.canControl(this.teamIdx)) return;
    const bug = b.activeBug;
    this.t += dt;

    switch (this.state) {
      case 'idle':
        if (this.t > 0.75) {
          this.plan = this.planTurn(bug);
          this.state = 'move';
          this.moveT = 0;
          this.t = 0;
        }
        break;
      case 'move': this.doMove(bug, dt); break;
      case 'shoot': this.doShoot(bug, dt); break;
    }
  }

  nearestEnemy(bug) {
    let best = null, bd = 1e9;
    for (const w of this.b.bugs) {
      if (w.dead || w.teamIdx === bug.teamIdx) continue;
      const d = Math.hypot(w.x - bug.x, w.y - bug.y);
      if (d < bd) { bd = d; best = w; }
    }
    return best ? { w: best, d: bd } : null;
  }

  planTurn(bug) {
    const b = this.b;
    const near = this.nearestEnemy(bug);
    if (!near) return { goal: null };

    // 保守型 / 残血：后撤
    if (this.personality === 'coward' || bug.hp < bug.maxHp * 0.28) {
      if (this.personality === 'coward' || this.rnd() < 0.7) {
        const dir = bug.x > near.w.x ? 1 : -1;
        return { goal: clamp(bug.x + dir * 200, 50, b.worldW - 50) };
      }
    }
    // 顺手捡箱子
    for (const c of b.crates) {
      if (c.landed && Math.abs(c.x - bug.x) < 280 && c.y < b.terrain.waterY - 30) {
        return { goal: c.x };
      }
    }
    // 保持理想交战距离
    const ideal = this.personality === 'aggressive' ? 260 : 430;
    if (near.d > ideal + 130) {
      return { goal: clamp(near.w.x + (bug.x < near.w.x ? -ideal : ideal), 50, b.worldW - 50) };
    }
    if (near.d < ideal - 160 && this.personality !== 'aggressive') {
      return { goal: clamp(bug.x + (bug.x < near.w.x ? -100 : 100), 50, b.worldW - 50) };
    }
    return { goal: null };
  }

  doMove(bug, dt) {
    const b = this.b;
    const p = this.plan;
    this.moveT += dt;
    if (!p || p.goal == null || this.moveT > 2.6 || Math.abs(bug.x - p.goal) < 16) {
      bug.wantMove = 0;
      this.shot = this.chooseShot(bug);
      this.state = 'shoot';
      this.t = 0;
      return;
    }
    const dir = p.goal > bug.x ? 1 : -1;
    bug.wantMove = dir;
    bug.facing = dir;
    // 前方有坎就跳
    if (bug.onGround) {
      const ahead = bug.x + dir * 18;
      if (b.terrain.solid(ahead, bug.y - 8) || b.terrain.solid(bug.x, bug.y - 16)) {
        bug.jumpQueued = true;
      }
    }
  }

  chooseShot(bug) {
    const b = this.b;
    const near = this.nearestEnemy(bug);
    if (!near) return null;
    const slot = b.arsenal[this.teamIdx];
    const prefs = this.personality === 'aggressive'
      ? ['banana', 'bazooka', 'airstrike', 'holy', 'grenade', 'shotgun', 'drill']
      : ['bazooka', 'grenade', 'banana', 'airstrike', 'holy', 'shotgun', 'drill'];
    const cands = prefs.filter(k => WEAPONS[k] && (WEAPONS[k].ammoInf || slot[k] > 0)).slice(0, 3);

    const baseAng = Math.atan2(near.w.y - bug.y, near.w.x - bug.x);
    let best = null;
    const aStep = this.diff > 0.7 ? 0.09 : 0.17;
    for (const key of cands) {
      const def = WEAPONS[key];
      const [er, ed] = EXP[key] || [50, 40];
      const windK = def.windAffect ? 1 : 0;
      for (let da = -1.2; da <= 1.21; da += aStep) {
        for (let pw = 0.35; pw <= 1.001; pw += 0.16) {
          const ang = baseAng + da;
          const res = this.simShot(bug, ang, pw, windK, er, ed);
          if (res != null && (best == null || res > best.score)) {
            best = { key, ang, pw, score: res };
          }
        }
      }
    }
    // 霰弹枪直射兜底：距离近时直接瞄准
    const directOk = near.d < 420 && slot.shotgun > 0;
    if (!best || best.score < 8) {
      if (directOk) {
        return { key: 'shotgun', ang: baseAng, pw: 1, score: 20 };
      }
    }
    if (!best || best.score < 8) {
      // 迭代弹道补偿：从直射角出发，按落点偏差逐步修正角度/力度
      const cand = this.compensatedShot(bug, near.w);
      if (cand && (!best || best.score < cand.score)) best = cand;
    }
    if (!best) {
      // 实在没有：朝敌人方向来发无限弹药的 bazooka
      return { key: 'bazooka', ang: baseAng - 0.35, pw: 0.7, score: 0 };
    }
    // 难度越低噪声越大
    const noise = (1 - this.diff) * 0.22;
    best.ang += (this.rnd() - 0.5) * 2 * noise;
    return best;
  }

  // 仅追踪落点（不评分）
  traceImpact(bug, ang, pw, windK) {
    const b = this.b;
    const sp = 380 + pw * 560;
    let x = bug.x + Math.cos(ang) * 15;
    let y = bug.y + Math.sin(ang) * 15 - 2;
    let vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
    const dt = 1 / 40;
    for (let i = 0; i < 170; i++) {
      vx += b.wind * WIND_ACC * windK * dt;
      vy += GRAV * dt;
      x += vx * dt; y += vy * dt;
      if (y > b.terrain.waterY || x < -40 || x > b.worldW + 40) return null;
      for (const w of b.bugs) {
        if (w.dead || w === bug) continue;
        if (Math.hypot(w.x - x, w.y - y) < w.r + 6) return { x, y };
      }
      if (b.terrain.solid(x, y)) return { x, y };
    }
    return null;
  }

  // 迭代补偿：不断修正使落点逼近目标
  compensatedShot(bug, target) {
    let ang = Math.atan2(target.y - bug.y, target.x - bug.x);
    let pw = clamp(Math.hypot(target.x - bug.x, target.y - bug.y) / 750 + 0.35, 0.4, 0.95);
    for (let it = 0; it < 7; it++) {
      const hit = this.traceImpact(bug, ang, pw, 1);
      if (!hit) return null;
      const miss = Math.hypot(hit.x - target.x, hit.y - target.y);
      if (miss < 26) break;
      ang += (hit.x < target.x ? -0.05 : 0.05) + (hit.y < target.y ? -0.04 : 0.04);
      pw += hit.x < target.x ? 0.04 : -0.04;
      pw = clamp(pw, 0.3, 1);
    }
    const hit = this.traceImpact(bug, ang, pw, 1);
    if (!hit) return null;
    // 用真实评分确认这一发
    const score = this.scoreImpact(hit.x, hit.y, 55, 45, bug);
    return { key: 'bazooka', ang, pw, score };
  }

  simShot(bug, ang, pw, windK, expR, expD) {
    const b = this.b;
    const sp = 380 + pw * 560;
    let x = bug.x + Math.cos(ang) * 15;
    let y = bug.y + Math.sin(ang) * 15 - 2;
    let vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
    const dt = 1 / 40;
    for (let i = 0; i < 170; i++) {
      vx += b.wind * WIND_ACC * windK * dt;
      vy += GRAV * dt;
      x += vx * dt; y += vy * dt;
      if (y > b.terrain.waterY || x < -40 || x > b.worldW + 40) return null;
      if (y < -800 && vy < 0) continue;
      for (const w of b.bugs) {
        if (w.dead || w === bug) continue;
        if (Math.hypot(w.x - x, w.y - y) < w.r + 6) return this.scoreImpact(x, y, expR, expD, bug);
      }
      if (b.terrain.solid(x, y)) return this.scoreImpact(x, y, expR, expD, bug);
    }
    return null;
  }

  scoreImpact(x, y, r, dmg, shooter) {
    let total = 0;
    for (const w of this.b.bugs) {
      if (w.dead) continue;
      const d = Math.hypot(w.x - x, w.y - y);
      const rr = r + w.r;
      if (d < rr) {
        const t = 1 - d / rr;
        const dm = dmg * t;
        const friendly = w.teamIdx === shooter.teamIdx;
        if (friendly) total -= dm * (w === shooter ? 1.7 : 1.2);
        else {
          total += dm;
          if (w.hp <= dm * 1.15) total += 26; // 击杀奖励
        }
      }
    }
    return total;
  }

  doShoot(bug, dt) {
    const b = this.b;
    if (!this.shot) {
      // 没有任何可选目标/方案：跳过回合
      b.endTurnNow();
      this.state = 'idle';
      return;
    }
    bug.aim = this.shot.ang;
    bug.facing = Math.cos(this.shot.ang) >= 0 ? 1 : -1;
    if (this.t > 0.55) bug.charging = true;
    // 蓄力由 bug.update 推进，达到目标力度即开火
    if (bug.charge >= this.shot.pw && this.t > 0.9) {
      bug.charging = false;
      b.fire(this.shot.key, this.shot.ang, this.shot.pw);
      this.state = 'idle';
      this.shot = null;
    }
  }
}
