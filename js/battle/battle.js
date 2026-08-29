// 战斗核心：确定性指令驱动状态机（渲染层与逻辑层分离，联机同步只加壳）
import { Terrain } from '../core/terrain.js';
import { mulberry32, dist, clamp } from '../core/mathutil.js';
import { Bug } from '../entities/bug.js';
import { Projectile } from '../entities/projectile.js';
import { WEAPONS, DEFAULT_ARSENAL, PROJ_DEFS } from '../weapons/weapons.js';
import { SKILLS, SPECIES } from '../meta/species.js';

export class Battle {
  constructor(cfg) {
    this.worldW = cfg.worldW || 1280;
    this.worldH = cfg.worldH || 720;
    this.mode = cfg.mode || 'campaign';
    this.stage = cfg.stage || 1;
    this.turnTime = cfg.turnTime || 30;
    this.teams = cfg.teams;
    this.modifiers = cfg.modifiers || {};
    this.taken = cfg.taken || {}; // Roguelike 已拿强化计数
    this.playerDamage = 0;        // 金币结算用
    this.onEvent = cfg.onEvent || (() => {});
    this.bugsPerTeam = cfg.bugsPerTeam || 3;

    this.seed = cfg.seed ?? ((Math.random() * 1e9) | 0);
    this.rnd = mulberry32(this.seed);
    this.terrain = new Terrain(this.seed, this.worldW, this.worldH);

    this.bugs = [];
    this.projectiles = [];
    this.crates = [];
    this.crashes = 0;
    this.particles = null; // 由场景注入（粒子系统）
    this.pendingAirstrike = null;

    this.wind = 0;
    this.turnCount = 0;
    this.over = false;
    this.winner = -1;

    this.phase = 'banner';
    this.phaseT = 1.2;
    this.timeLeft = this.turnTime;
    this.settleT = 0;
    this.turnTeam = this.teams.length - 1; // beginTurn 后从 0 队开始
    this.activeBug = null;
    this.teamBugs = [];
    this.teamBugIdx = this.teams.map(() => -1);

    this.arsenal = this.teams.map((t, ti) => {
      const a = Object.assign({}, DEFAULT_ARSENAL);
      const bonus = (this.modifiers.ammoBonus && ti === 0) ? this.modifiers.ammoBonus : 0;
      if (bonus) for (const k in a) if (a[k] !== Infinity) a[k] += bonus;
      return a;
    });

    this.spawnBugs();
    this.beginTurn();
  }

  // ---------- 事件 ----------
  emit(e) { this.onEvent(e); }

  // ---------- 初始化 ----------
  spawnBugs() {
    const nT = this.teams.length;
    for (let t = 0; t < nT; t++) {
      const arr = [];
      const zoneC = ((t + 0.5) / nT) * this.worldW;
      for (let i = 0; i < this.bugsPerTeam; i++) {
        const x = clamp(zoneC + (this.rnd() - 0.5) * this.worldW * 0.14, 40, this.worldW - 40);
        const y = this.terrain.surfaceY(x) - 12;
        const species = (this.teams[t].species && this.teams[t].species[i]) || 'ant';
        const bug = new Bug({
          teamIdx: t, idx: i,
          name: `${this.teams[t].name}${i + 1}号`,
          color: this.teams[t].color, dark: this.teams[t].dark,
          x, y, species
        });
        bug.hat = (this.teams[t].skins && this.teams[t].skins[species]) || 'none';
        // 敌方 AI 随关卡成长
        if (this.teams[t].isAI && this.stage > 1) {
          const hpMul = 1 + (this.stage - 1) * 0.09;
          bug.maxHp = Math.round(bug.maxHp * hpMul);
          bug.hp = bug.maxHp;
        }
        // 我方天赋/强化生命加成
        if (t === 0 && this.modifiers.hpBonus) {
          bug.maxHp = Math.round(bug.maxHp * this.modifiers.hpBonus);
          bug.hp = bug.maxHp;
        }
        arr.push(bug);
        this.bugs.push(bug);
      }
      this.teamBugs.push(arr);
    }
    // 简单分离重叠出生点
    for (let pass = 0; pass < 30; pass++) {
      let moved = false;
      for (let i = 0; i < this.bugs.length; i++) for (let j = i + 1; j < this.bugs.length; j++) {
        const a = this.bugs[i], b2 = this.bugs[j];
        const d = Math.hypot(a.x - b2.x, a.y - b2.y);
        if (d < 26 && Math.abs(a.y - b2.y) < 20) {
          const dir = a.x <= b2.x ? -1 : 1;
          a.x = clamp(a.x + dir * 14, 30, this.worldW - 30);
          b2.x = clamp(b2.x - dir * 14, 30, this.worldW - 30);
          a.y = this.terrain.surfaceY(a.x) - 12;
          b2.y = this.terrain.surfaceY(b2.x) - 12;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // ---------- 回合流转 ----------
  livingOf(tc) { return this.teamBugs[tc].filter(w => !w.dead); }
  canControl(tc) { return !this.over && this.phase === 'play' && this.turnTeam === tc && !!this.activeBug && !this.activeBug.dead; }

  rerollWind() {
    const range = Math.min(1, 0.55 + this.stage * 0.05);
    this.wind = (this.rnd() * 2 - 1) * range;
    this.emit({ type: 'wind', wind: this.wind });
    return this.wind;
  }

  beginTurn() {
    this.turnCount++;
    const n = this.teams.length;
    let chosen = null, chosenTeam = -1;
    for (let i = 1; i <= n && !chosen; i++) {
      const tc = (this.turnTeam + i) % n;
      const arr = this.teamBugs[tc];
      if (!arr.some(w => !w.dead)) continue;
      const len = arr.length;
      for (let k = 1; k <= len; k++) {
        const ci = (this.teamBugIdx[tc] + k) % len;
        if (!arr[ci].dead) {
          chosen = arr[ci];
          this.teamBugIdx[tc] = ci;
          chosenTeam = tc;
          break;
        }
      }
    }
    if (!chosen) { this.checkVictory(); return; }

    this.turnTeam = chosenTeam;
    this.activeBug = chosen;
    if (chosen.shield) chosen.shield = false; // 护盾保护一整轮
    this.rerollWind();
    this.phase = 'banner';
    this.phaseT = 1.15;
    this.timeLeft = this.turnTime;

    if (chosen.webbed > 0) {
      chosen.webbed--;
      this.emit({ type: 'toast', text: `${chosen.name} 被蛛网缠住，无法移动！` });
    }
    if (chosen.skillCd > 0) chosen.skillCd--;
    if (this.modifiers.regen && chosenTeam === 0) chosen.heal(this.modifiers.regen, this);
    const crateEvery = this.modifiers.dropBonus ? 2 : 3;
    const crateChance = this.modifiers.dropBonus ? 0.85 : 0.62;
    if (this.turnCount % crateEvery === 0 && this.rnd() < crateChance) this.spawnCrate();

    this.emit({ type: 'turnStart', team: chosenTeam, bug: chosen });
  }

  endTurnNow() {
    if (this.phase !== 'play' || this.over) return;
    if (this.activeBug) { this.activeBug.charging = false; this.activeBug.wantMove = 0; }
    this.phase = 'turnend';
    this.phaseT = 0.75;
    this.emit({ type: 'turnEnd' });
  }

  update(dt) {
    if (this.over) return;
    // 任意时刻全灭立即结算（溺水/坠落实效不依赖回合边界）
    if (this.aliveTeamCount() <= 1) { this.checkVictory(); return; }
    for (const w of this.bugs) w.update(dt, this);
    this.updateProjectiles(dt);
    this.updateCrates(dt);
    this.updateAirstrike(dt);

    switch (this.phase) {
      case 'banner':
        this.phaseT -= dt;
        if (this.phaseT <= 0) {
          this.phase = 'play';
          this.emit({ type: 'phase', phase: 'play' });
        }
        break;
      case 'play':
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) this.endTurnNow();
        break;
      case 'settle':
        this.settleT += dt;
        if (this.projectiles.length === 0 && !this.pendingAirstrike && this.settleT > 0.45) {
          this.phase = 'turnend';
          this.phaseT = 0.8;
          this.emit({ type: 'turnEnd' });
        }
        break;
      case 'turnend':
        this.phaseT -= dt;
        if (this.phaseT <= 0) {
          this.checkVictory();
          if (!this.over) this.beginTurn();
        }
        break;
    }
  }

  // ---------- 玩家指令 ----------
  fire(weaponKey, angle, power) {
    if (!this.canControl(this.turnTeam)) return false;
    const def = WEAPONS[weaponKey];
    if (!def) return false;
    const bug = this.activeBug;
    const slot = this.arsenal[this.turnTeam];
    if (!def.ammoInf && !(slot[weaponKey] > 0)) {
      this.emit({ type: 'toast', text: '弹药不足' });
      return false;
    }
    bug.aim = angle;
    bug.facing = Math.cos(angle) >= 0 ? 1 : -1;
    def.fire(this, bug, angle, power);
    if (!def.ammoInf) slot[weaponKey]--;
    bug.charging = false; bug.charge = 0;
    this.phase = 'settle';
    this.settleT = 0;
    this.emit({ type: 'fired', weapon: weaponKey, angle, power });
    return true;
  }

  useSkill() {
    if (!this.canControl(this.turnTeam)) return false;
    const bug = this.activeBug;
    const def = SKILLS[SPECIES[bug.species].skill];
    if (!def) return false;
    if (bug.skillCd > 0) { this.emit({ type: 'toast', text: '技能冷却中' }); return false; }
    const ok = def.use(this, bug);
    if (ok) bug.skillCd = def.cd;
    return ok;
  }

  // ---------- 爆炸与伤害 ----------
  explode(x, y, r, dmg, knock, ownerTeam, opts = {}) {
    // 玩家系强化：高爆装药放大半径（含地形破坏）
    if (ownerTeam === 0 && this.modifiers.blastMul) r = Math.round(r * this.modifiers.blastMul);
    this.terrain.destroyCircle(x, y, r);
    this.emit({ type: 'explosion', x, y, r, boom: opts.boom, silent: opts.silent });
    const rr = r + 10;
    for (const w of this.bugs) {
      if (w.dead) continue;
      const d = dist(x, y, w.x, w.y);
      if (d < rr + w.r) {
        const t = 1 - d / (rr + w.r);
        let dm = dmg * t;
        let crit = false;
        if (ownerTeam === 0 && this.modifiers.crit && this.rnd() < this.modifiers.crit) { dm *= 1.6; crit = true; }
        if (ownerTeam === 0 && this.modifiers.attack) dm *= this.modifiers.attack;
        if (w.teamIdx === 0 && this.modifiers.armor) dm *= (1 - this.modifiers.armor);
        const nx = (w.x - x) / (d || 1), ny = (w.y - y) / (d || 1);
        w.vx += nx * knock * t;
        w.vy += ny * knock * t - 110 * t;
        w.onGround = false;
        const dealt = w.damage(Math.max(1, Math.round(dm)), 'blast', this);
        if (ownerTeam === 0 && w.teamIdx !== 0) this.playerDamage += dealt;
        if (crit) this.emit({ type: 'crit', bug: w });
        if (ownerTeam === 0 && this.modifiers.lifeSteal && w.teamIdx !== 0 && this.activeBug && !this.activeBug.dead) {
          this.activeBug.heal(dealt * this.modifiers.lifeSteal, this);
        }
      }
    }
    for (let i = this.crates.length - 1; i >= 0; i--) {
      if (dist(x, y, this.crates[i].x, this.crates[i].y) < r + 12) {
        this.crates.splice(i, 1);
        this.emit({ type: 'explosion', x: this.crates[i] ? this.crates[i].x : x, y, r: 16, silent: true });
      }
    }
  }

  drownBug(w) {
    if (w.dead) return;
    w.dead = true;
    w.deathX = w.x; w.deathY = this.terrain.waterY + 6;
    this.emit({ type: 'splash', x: w.x, y: this.terrain.waterY });
    this.emit({ type: 'bugDie', bug: w, cause: 'drown' });
  }

  checkVictory() {
    const alive = [];
    for (let t = 0; t < this.teams.length; t++) if (this.livingOf(t).length > 0) alive.push(t);
    if (alive.length <= 1) {
      this.over = true;
      this.winner = alive.length === 1 ? alive[0] : -1;
      this.emit({ type: 'victory', winner: this.winner });
    }
  }

  aliveTeamCount() {
    let n = 0;
    for (let t = 0; t < this.teams.length; t++) if (this.livingOf(t).length > 0) n++;
    return n;
  }

  // ---------- 投射物 / 补给箱 / 空袭 ----------
  updateProjectiles(dt) {
    const P = this.projectiles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.update(dt, this);
      if (!p.dead && p.look === 'rocket' && this.particles && Math.random() < 0.7) {
        this.particles.trail(p.x, p.y, '#ffd28a', 2.5);
      }
      if (p.dead) { P[i] = P[P.length - 1]; P.pop(); }
    }
  }

  spawnCrate() {
    const r = this.rnd;
    let kind, weapon = null, n = 0;
    if (r() < 0.25) { kind = 'heal'; n = 40; }
    else {
      kind = 'weapon';
      const pool = ['grenade', 'shotgun', 'banana', 'drill', 'airstrike', 'medkit', 'holy'];
      weapon = pool[(r() * pool.length) | 0];
      n = weapon === 'holy' ? 1 : 2;
    }
    const x = 60 + r() * (this.worldW - 120);
    this.crates.push({ x, y: 26, vy: 0, landed: false, kind, weapon, n });
    this.emit({ type: 'crateSpawn', x });
  }

  updateCrates(dt) {
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      if (!c.landed) {
        c.vy = Math.min(c.vy + 150 * dt, 85);
        c.y += c.vy * dt;
        if (c.y > this.terrain.waterY + 4) {
          this.emit({ type: 'splash', x: c.x, y: this.terrain.waterY });
          this.crates.splice(i, 1); continue;
        }
        if (this.terrain.solid(c.x, c.y + 10)) {
          while (this.terrain.solid(c.x, c.y + 10)) c.y -= 1;
          c.landed = true;
        }
      }
      let taken = false;
      for (const w of this.bugs) {
        if (w.dead) continue;
        if (Math.hypot(w.x - c.x, w.y - c.y) < w.r + 13) {
          if (c.kind === 'heal') w.heal(c.n, this);
          else {
            const slot = this.arsenal[w.teamIdx];
            slot[c.weapon] = (slot[c.weapon] || 0) + c.n;
          }
          this.emit({ type: 'pickup', worm: w, crate: c });
          this.emit({ type: 'sfx', name: 'pickup' });
          this.crates.splice(i, 1);
          taken = true;
          break;
        }
      }
      if (taken) continue;
    }
  }

  updateAirstrike(dt) {
    const a = this.pendingAirstrike;
    if (!a) return;
    a.t += dt;
    a.planeX += a.dir * 540 * dt;
    const dropAt = a.targetX - a.dir * (2 - a.dropped) * 46;
    if (((a.dir > 0 && a.planeX >= dropAt) || (a.dir < 0 && a.planeX <= dropAt)) && a.dropped < 5) {
      this.projectiles.push(new Projectile(PROJ_DEFS.bomb, a.planeX, a.planeY, a.dir * 170, 30, null));
      a.dropped++;
    }
    if (a.dropped >= 5 && Math.abs(a.planeX - a.targetX) > 640) this.pendingAirstrike = null;
  }
}
