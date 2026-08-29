// 战斗场景：粘合 战斗核心 + 相机 + 粒子 + HUD + 控制器 + 特效结算
import { Battle } from '../battle/battle.js';
import { Camera } from '../core/camera.js';
import { Particles } from '../core/particles.js';
import { STEP, GRAV, WIND_ACC } from '../core/constants.js';
import { HUD } from '../ui/hud.js';
import { AIController } from '../ai/controller.js';
import { WEAPONS, WEAPON_ORDER, PROJ_DEFS, drawProjectile } from '../weapons/weapons.js';
import { isKey } from '../platform.js';
import { clamp, TAU } from '../core/mathutil.js';
import { drawThree, applyUpgrade, UPGRADES } from '../meta/upgrades.js';
import { battleCoins, coinBonusMul, talentModifiers } from '../meta/progress.js';

const PREVIEW_SPEED = { bazooka: [380, 560], grenade: [330, 480], banana: [320, 470], drill: [300, 380], holy: [340, 500] };
const CARD_EMOJI = { atk: '⚔️', hp: '❤️', spd: '💨', jmp: '⏫', suck: '🩸', crit: '✨', boom: '💥', arm: '🛡️', wind: '🌪️', reg: '🍀', ammo: '📦', drop: '🪂' };

function wrapText(ctx, text, maxW) {
  const lines = []; let cur = '';
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

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

export class BattleScene {
  constructor(app, cfg) {
    this.app = app;
    this.baseCfg = Object.assign({}, cfg, { teams: cfg.teams.map(t => Object.assign({}, t)) });
    this.freshModifiers = Object.assign({}, cfg.modifiers || {}); // 战败重开时还原初始（天赋）加成
    this.mode = cfg.mode;
    this.stage = cfg.stage || 1;
    this.fx = new Particles();
    this.battle = null;
    this.battle = new Battle(Object.assign({}, cfg, { onEvent: e => this.onEvent(e) }));
    this.battle.particles = this.fx;

    this.cam = new Camera();
    if (this.battle.activeBug) this.cam.snapTo(this.battle.activeBug.x, this.battle.activeBug.y - 70);
    this.hud = new HUD(this.battle, { preview: app.settings.preview });
    this.controllers = this.battle.teams.map((t, i) =>
      t.controller === 'ai'
        ? new AIController(this.battle, i, {
            difficulty: t.difficulty ?? 0.8,
            personality: t.personality || 'balanced'
          })
        : null
    );
    this.acc = 0;
    this.floaters = [];
    this.graves = [];
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push({ x: Math.random() * 1.2, y: 0.08 + Math.random() * 0.22, s: 0.6 + Math.random() * 0.9, v: 0.008 + Math.random() * 0.014 });
    }
    // 前景装饰草簇（视差虚化层）
    this.foreGrass = [];
    for (let i = 0; i < 5; i++) {
      this.foreGrass.push({
        x: 60 + Math.random() * (this.battle.worldW - 120),
        s: 0.7 + Math.random() * 0.8,
        hue: 95 + Math.random() * 22
      });
    }
    this.flashT = 0;
    this.hitStop = 0;
    this.endOverlay = null;
    this.passOverlay = null;
    this.upgradeOverlay = null;
    this.upgradeBtns = {};
    this.endBtns = {};
    this.vw = app.vw; this.vh = app.vh;
    this.time = 0;
    // 玩家队皮肤帽子
    this.battle.teamBugs[0].forEach(w => {
      const sk = cfg.teams[0].skins && cfg.teams[0].skins[w.species];
      if (sk) w.hat = sk;
    });
    // 构造期 Battle 内部已触发首个 turnStart，此时 onEvent 拿不到 battle，这里补判热座传递
    if (this.mode === 'hotseat' && this.battle.teams[this.battle.turnTeam].controller === 'human') {
      this.passOverlay = { team: this.battle.turnTeam };
    }
    // 联机模式
    if (cfg.mode === 'online') {
      this.net = cfg.net;
      this.myTeam = cfg.myTeam;
      this.net.onMessage(m => this.onNetMsg(m));
    }
  }

  onExit() {
    if (this.net) {
      if (this.battle && !this.battle.over) this.net.send({ t: 'quit' });
      this.net.close();
      this.net = null;
    }
  }

  // ---------- 联机同步 ----------
  onNetMsg(m) {
    const b = this.battle;
    if (!b || this.mode !== 'online') return;
    switch (m.t) {
      case 'fire':
        // 远端开火：本地模拟重放同一发
        if (b.phase === 'play' && b.turnTeam !== this.myTeam && !b.over) {
          b.fire(m.weapon, m.angle, m.power);
        }
        break;
      case 'state':
        // 回合末快照校正（防浮点/时序漂移累积）
        if (m.turn === b.turnCount) {
          for (const s of m.bugs) {
            const w = b.bugs.find(x => x.teamIdx === s.team && x.idx === s.idx);
            if (!w) continue;
            if (s.dead && !w.dead) { w.x = s.x; w.y = s.y; w.die(b, 'net'); }
            else if (!s.dead && !w.dead) { w.x = s.x; w.y = s.y; w.hp = s.hp; }
          }
        }
        break;
      case 'quit':
        if (!b.over) {
          b.over = true;
          this.endOverlay = { winner: this.myTeam, quit: true };
          this.hud.showToast('对方退出了对局');
        }
        break;
    }
  }

  humanTurn() {
    const b = this.battle;
    if (!b.teams[b.turnTeam]) return false;
    if (this.mode === 'online') return b.turnTeam === this.myTeam;
    return b.teams[b.turnTeam].controller === 'human';
  }

  // ---------- 战斗事件 → 表现层 ----------
  onEvent(e) {
    const b = this.battle; // 注意：Battle 构造期间为 null，构造期事件不得解引用
    switch (e.type) {
      case 'turnStart':
        if (this.hud) this.hud.bannerT = 0;
        if (this.cam && e.bug) this.cam.snapTo(e.bug.x, e.bug.y - 70);
        if (this.mode === 'hotseat' && b && b.teams[e.team] && b.teams[e.team].controller === 'human' && !b.over) {
          this.passOverlay = { team: e.team };
        }
        break;
      case 'sfx': this.app.sfx.play(e.name); break;
      case 'explosion':
        this.fx.explosion(e.x, e.y, e.r);
        if (e.r > 20) this.fx.debris(e.x, e.y, Math.min(14, (e.r / 4) | 0), '#7a5a3a');
        this.fx.shockwave(e.x, e.y, e.r);
        if (this.cam) {
          this.cam.addShake(Math.min(16, e.r / 4.5));
          if (!e.silent) this.cam.addPunch(Math.min(0.07, e.r / 1100));
        }
        if (!e.silent && e.r >= 42) this.hitStop = 0.05; // 大爆炸瞬间时间冻结
        if (!e.silent) this.app.sfx.play(e.boom === 'bigboom' ? 'bigboom' : 'boom');
        break;
      case 'damage':
        this.floaters.push({ x: e.bug.x, y: e.bug.y - 20, text: '-' + e.amount, color: '#ff5a5a', t: 1, size: 15 });
        this.app.sfx.play('hurt');
        this.app.vibrate(true);
        break;
      case 'crit':
        this.floaters.push({ x: e.bug.x, y: e.bug.y - 40, text: '暴击!', color: '#ff9f43', t: 1, size: 17 });
        break;
      case 'heal':
        if (e.amount > 0) this.floaters.push({ x: e.bug.x, y: e.bug.y - 20, text: '+' + e.amount, color: '#5ad35a', t: 1, size: 14 });
        break;
      case 'bugDie':
        if (e.cause !== 'drown') this.graves.push({ x: e.bug.deathX, y: e.bug.deathY });
        this.app.sfx.play('die');
        this.fx.dust(e.bug.deathX, e.bug.deathY, 8);
        break;
      case 'splash': this.fx.splash(e.x, e.y); break;
      case 'pickup':
        this.floaters.push({
          x: e.worm.x, y: e.worm.y - 26,
          text: e.crate.kind === 'heal' ? '医疗包 +40' : `${WEAPONS[e.crate.weapon].name} +${e.crate.n}`,
          color: '#ffe94d', t: 1.2, size: 13
        });
        break;
      case 'crateSpawn': this.hud.showToast('补给箱空降！'); break;
      case 'toast': this.hud.showToast(e.text); break;
      case 'gunshot': this.fx.explosion(e.x, e.y, 9); break;
      case 'fired':
        // 联机：本地队开火 → 广播指令给对手重放
        if (this.mode === 'online' && b.turnTeam === this.myTeam && this.net) {
          this.net.send({ t: 'fire', team: b.turnTeam, weapon: e.weapon, angle: +Number(e.angle).toFixed(4), power: +Number(e.power).toFixed(3) });
        }
        break;
      case 'turnEnd':
        // 联机：行动方回合结束 → 广播虫子状态快照
        if (this.mode === 'online' && b.turnTeam === this.myTeam && this.net) {
          this.net.send({
            t: 'state', turn: b.turnCount,
            bugs: b.bugs.map(w => ({ team: w.teamIdx, idx: w.idx, x: +w.x.toFixed(1), y: +w.y.toFixed(1), hp: w.hp, dead: w.dead }))
          });
        }
        break;
      case 'skillUse':
        this.floaters.push({ x: e.bug.x, y: e.bug.y - 32, text: '技能·' + e.skill, color: '#c86bff', t: 1, size: 14 });
        break;
      case 'flash': this.flashT = 0.5; break;
      case 'victory': {
        if (this.mode === 'online') {
          const won = e.winner === this.myTeam;
          const gain = won ? 40 : 15;
          this.app.progress.coins += gain;
          this.app.saveProgress();
          this.endOverlay = { winner: e.winner, coins: gain, online: true };
          this.app.sfx.play(won ? 'win' : 'lose');
          if (won) this.fx.confetti(b.worldW / 2, 180);
        } else if (this.mode === 'hotseat') {
          this.endOverlay = { winner: e.winner };
          this.app.sfx.play('win');
          this.fx.confetti(b.worldW / 2, 180);
        } else if (e.winner === 0) {
          // 闯关胜利：金币结算 + Roguelike 三选一
          const gain = Math.round(battleCoins(this.battle, true) * coinBonusMul(this.app.progress.talents));
          this.app.progress.coins += gain;
          this.app.progress.bestStage = Math.max(this.app.progress.bestStage, this.stage + 1);
          this.app.saveProgress();
          this.upgradeOverlay = { picks: drawThree(this.battle), chosen: null, coins: gain };
          this.app.sfx.play('win');
          this.fx.confetti(b.activeBug ? b.activeBug.x : b.worldW / 2, 180);
        } else {
          // 战败：部分金币，Roguelike 归零重开
          const gain = Math.round(battleCoins(this.battle, false) * coinBonusMul(this.app.progress.talents));
          this.app.progress.coins += gain;
          this.app.saveProgress();
          this.endOverlay = { winner: e.winner, coins: gain };
          this.app.sfx.play('lose');
        }
        break;
      }
    }
  }

  // ---------- 输入 ----------
  onPoint(type, x, y) {
    this.app.sfx.unlock();
    const b = this.battle;
    if (this.upgradeOverlay) { if (type === 'start') this.handleUpgradeClick(x, y); return; }
    if (this.endOverlay) { if (type === 'start') this.handleEndOverlayClick(x, y); return; }
    if (this.passOverlay) { if (type === 'start') { this.passOverlay = null; this.app.sfx.play('click'); } return; }

    const act = this.hud.handlePoint(type, x, y);
    if (act) {
      const can = this.humanTurn() && b.phase === 'play';
      if (act.act === 'click') this.app.sfx.play('click');
      else if (act.act === 'jump' && can) b.activeBug.jumpQueued = true;
      else if (act.act === 'skill' && can) b.useSkill();
      else if (act.act === 'end' && can) b.endTurnNow();
      else if (act.act === 'fireDown' && can) b.activeBug.charging = true;
      else if (act.act === 'fireUp') this.releaseFire();
      return;
    }
    // 拖动/点击空白处瞄准
    if (type !== 'end' && this.humanTurn() && b.phase === 'play') {
      const w = this.cam.screenToWorld(x, y, this.vw, this.vh);
      const bug = b.activeBug;
      const dx = w.x - bug.x, dy = w.y - bug.y;
      if (dx * dx + dy * dy > 150) bug.aim = Math.atan2(dy, dx);
    }
  }

  releaseFire() {
    const b = this.battle;
    const bug = b.activeBug;
    if (!bug) return;
    if (this.humanTurn() && b.phase === 'play' && bug.charging) {
      bug.charging = false;
      b.fire(this.hud.getSelWeapon(b.turnTeam), bug.aim, Math.max(0.12, bug.charge));
    } else {
      bug.charging = false;
      bug.charge = 0;
    }
  }

  onKey(key, down) {
    const b = this.battle;
    if (!down) { if (key === ' ') this.releaseFire(); return; }
    if (!this.humanTurn() || b.phase !== 'play') {
      if (key === 'Enter' && this.endOverlay) this.handleEndOverlayClick(-1, -1);
      return;
    }
    const bug = b.activeBug;
    if (key === 'w' || key === 'W') bug.jumpQueued = true;
    else if (key === ' ') bug.charging = true;
    else if (key === 'e' || key === 'E') b.useSkill();
    else if (key === 'Enter') b.endTurnNow();
    else if (key >= '1' && key <= '8') {
      const k = WEAPON_ORDER[+key - 1];
      if (k) { this.hud.selected[b.turnTeam] = k; this.app.sfx.play('click'); }
    }
  }

  handleHumanFrameInput(dt) {
    const b = this.battle;
    if (!this.humanTurn() || b.phase !== 'play') return;
    const bug = b.activeBug;
    let dir = 0;
    if (isKey('a') || isKey('ArrowLeft')) dir -= 1;
    if (isKey('d') || isKey('ArrowRight')) dir += 1;
    if (dir === 0) dir = this.hud.moveHeld;
    bug.wantMove = dir;
    if (isKey('ArrowUp')) bug.aim -= dt * 1.8;
    if (isKey('ArrowDown')) bug.aim += dt * 1.8;
  }

  // ---------- 更新 ----------
  update(dt) {
    const b = this.battle;
    // 命中停顿：除了 HUD 一切冻结，放大打击感
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.hud.update(dt);
      return;
    }
    this.time += dt;
    this.cam.update(dt, this.vw, this.vh, b.worldW, b.worldH);
    this.flashT = Math.max(0, this.flashT - dt * 1.7);
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > 1.25) c.x = -0.25; }

    if (this.endOverlay || this.passOverlay || this.upgradeOverlay) {
      this.fx.update(dt);
      this.hud.update(dt);
      return;
    }

    this.handleHumanFrameInput(dt);
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 5) {
      for (let i = 0; i < this.controllers.length; i++) {
        if (this.controllers[i] && b.turnTeam === i) this.controllers[i].update(STEP);
      }
      b.update(STEP);
      this.acc -= STEP;
      n++;
    }

    // 相机跟随
    let tx = null, ty = null;
    if (b.pendingAirstrike) { tx = b.pendingAirstrike.planeX; ty = b.pendingAirstrike.planeY + 150; }
    else if (b.projectiles.length) { const p = b.projectiles[b.projectiles.length - 1]; tx = p.x; ty = p.y; }
    else if (b.activeBug && !b.activeBug.dead) { tx = b.activeBug.x; ty = b.activeBug.y - 60; }
    if (tx != null) this.cam.follow(tx, ty, 0.07);

    this.fx.update(dt);
    this.hud.update(dt);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t -= dt; f.y -= 30 * dt;
      if (f.t <= 0) this.floaters.splice(i, 1);
    }
  }

  // ---------- 绘制 ----------
  draw(ctx, W, H) {
    this.vw = W; this.vh = H;
    const b = this.battle;
    // 天空
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6fc8f7');
    g.addColorStop(0.7, '#b8e7fb');
    g.addColorStop(1, '#e8f7ee');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 太阳 + 斜射光带
    ctx.fillStyle = 'rgba(255,238,160,0.28)';
    ctx.beginPath(); ctx.arc(W - 90, 78, 52, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,238,160,0.95)';
    ctx.beginPath(); ctx.arc(W - 90, 78, 32, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(W - 90, 78);
    ctx.rotate(0.55);
    ctx.fillStyle = 'rgba(255,246,205,0.09)';
    ctx.fillRect(-160, -H * 1.6, 52, H * 3.2);
    ctx.fillRect(-40, -H * 1.6, 96, H * 3.2);
    ctx.restore();
    // 云
    for (const c of this.clouds) {
      const cx = c.x * W, cy = c.y * H, s = c.s * (Math.min(W, H) / 500);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath();
      ctx.arc(cx, cy, 22 * s, 0, TAU);
      ctx.arc(cx + 20 * s, cy - 8 * s, 17 * s, 0, TAU);
      ctx.arc(cx + 40 * s, cy, 19 * s, 0, TAU);
      ctx.fill();
    }

    // 世界
    ctx.save();
    this.cam.apply(ctx, W, H);
    this.drawHills(ctx);
    b.terrain.draw(ctx);
    this.drawWater(ctx);
    for (const gv of this.graves) this.drawGrave(ctx, gv);
    for (const c of b.crates) this.drawCrate(ctx, c);
    if (b.pendingAirstrike) this.drawPlane(ctx, b.pendingAirstrike);
    for (const p of b.projectiles) drawProjectile(ctx, p);

    const humanActive = this.humanTurn() && b.phase === 'play' && !b.over;
    for (const w of b.bugs) {
      w.draw(ctx, b, { active: w === b.activeBug && !b.over, showAim: w === b.activeBug && humanActive });
    }
    if (this.app.settings.preview && humanActive) this.drawPreview(ctx);
    this.fx.draw(ctx);
    // 前景装饰草簇（虚化视差层，画在最后压住画面边缘）
    ctx.globalAlpha = 0.42;
    ctx.lineCap = 'round';
    for (const g of this.foreGrass) {
      const gy = b.terrain.surfaceY(g.x);
      if (gy >= b.worldH) continue;
      ctx.strokeStyle = `hsl(${g.hue}, 45%, 24%)`;
      ctx.lineWidth = 2.6 * g.s;
      for (let bl = -2; bl <= 2; bl++) {
        const bx0 = g.x + bl * 5 * g.s;
        ctx.beginPath();
        ctx.moveTo(bx0, gy + 6);
        ctx.quadraticCurveTo(bx0 + bl * 2.5, gy - 10 * g.s, bx0 + bl * 5.5 * g.s, gy - 16 * g.s);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // 飘字（世界坐标）
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.t * 2);
      ctx.font = `bold ${f.size}px sans-serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // HUD 与覆盖层
    this.hud.draw(ctx, W, H, { humanControl: humanActive });
    if (this.passOverlay) this.drawPassOverlay(ctx, W, H);
    if (this.endOverlay) this.drawEndOverlay(ctx, W, H);
    if (this.upgradeOverlay) this.drawUpgradeOverlay(ctx, W, H);
    if (this.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,240,${Math.min(1, this.flashT)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawHills(ctx) {
    const b = this.battle;
    // 大气透视：越远越淡、越接近平线
    const layers = [
      { f: 0.18, y: b.worldH * 0.56, amp: 42, color: 'rgba(196,230,196,0.5)' },
      { f: 0.35, y: b.worldH * 0.66, amp: 60, color: '#c8e6b0' },
      { f: 0.62, y: b.worldH * 0.78, amp: 85, color: '#a3d88d' }
    ];
    for (const L of layers) {
      ctx.save();
      ctx.translate(this.cam.x * (1 - L.f), 0);
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(-b.worldW * 0.6, b.worldH + 60);
      for (let x = -b.worldW * 0.6; x <= b.worldW * 1.6; x += 40) {
        const y = L.y - Math.abs(Math.sin(x * 0.004 + L.f * 9)) * L.amp - Math.sin(x * 0.0013 + L.f * 3) * L.amp * 0.5;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(b.worldW * 1.6, b.worldH + 60);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawWater(ctx) {
    const b = this.battle;
    const y = b.terrain.waterY;
    ctx.fillStyle = 'rgba(72,196,120,0.8)';
    ctx.beginPath();
    ctx.moveTo(-60, y + 8);
    for (let x = -60; x <= b.worldW + 60; x += 26) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + this.time * 2.2) * 5);
    }
    ctx.lineTo(b.worldW + 60, b.worldH + 40);
    ctx.lineTo(-60, b.worldH + 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(40,150,84,0.85)';
    ctx.fillRect(-60, y + 26, b.worldW + 120, b.worldH);
  }

  drawGrave(ctx, gv) {
    ctx.fillStyle = '#aeb6c2';
    rr(ctx, gv.x - 8, gv.y - 16, 16, 19, 6); ctx.fill();
    ctx.strokeStyle = '#7c8492'; ctx.lineWidth = 1.5;
    rr(ctx, gv.x - 8, gv.y - 16, 16, 19, 6); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gv.x, gv.y - 12); ctx.lineTo(gv.x, gv.y - 4);
    ctx.moveTo(gv.x - 3.5, gv.y - 9); ctx.lineTo(gv.x + 3.5, gv.y - 9);
    ctx.stroke();
    ctx.fillStyle = '#ff8f5e';
    ctx.beginPath(); ctx.arc(gv.x + 10, gv.y - 2, 2.2, 0, TAU); ctx.fill();
  }

  drawCrate(ctx, c) {
    if (!c.landed) {
      ctx.fillStyle = '#ff8f5e';
      ctx.beginPath(); ctx.arc(c.x, c.y - 27, 16, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(90,60,40,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x - 14, c.y - 25); ctx.lineTo(c.x - 6, c.y - 9);
      ctx.moveTo(c.x + 14, c.y - 25); ctx.lineTo(c.x + 6, c.y - 9);
      ctx.stroke();
    }
    ctx.fillStyle = '#b9803f';
    rr(ctx, c.x - 11, c.y - 9, 22, 18, 3); ctx.fill();
    ctx.strokeStyle = '#8a5a26'; ctx.lineWidth = 2;
    rr(ctx, c.x - 11, c.y - 9, 22, 18, 3); ctx.stroke();
    if (c.kind === 'heal') {
      ctx.fillStyle = '#e8493f';
      ctx.fillRect(c.x - 2.5, c.y - 6, 5, 12);
      ctx.fillRect(c.x - 6, c.y - 2.5, 12, 5);
    } else {
      ctx.fillStyle = '#ffe94d';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', c.x, c.y + 4.5);
    }
  }

  drawPlane(ctx, a) {
    ctx.save();
    ctx.translate(a.planeX, a.planeY);
    ctx.scale(a.dir, 1);
    ctx.fillStyle = '#e8edf2';
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c6d2dd';
    ctx.beginPath();
    ctx.moveTo(-4, -2); ctx.lineTo(-18, -14); ctx.lineTo(-10, -2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-24, -2); ctx.lineTo(-31, -10); ctx.lineTo(-24, -4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7fc3f0';
    ctx.beginPath(); ctx.ellipse(17, -1.5, 5, 3, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawPreview(ctx) {
    const b = this.battle;
    const bug = b.activeBug;
    const key = this.hud.getSelWeapon(b.turnTeam);
    if (key === 'medkit' || key === 'airstrike') return;
    const def = WEAPONS[key];
    const spd = PREVIEW_SPEED[key] || [380, 560];
    const pw = bug.charging ? Math.max(0.15, bug.charge) : 0.7;
    const sp = spd[0] + spd[1] * pw;
    const proj = PROJ_DEFS[key] || {};
    let x = bug.x + Math.cos(bug.aim) * 15;
    let y = bug.y + Math.sin(bug.aim) * 15 - 2;
    let vx = Math.cos(bug.aim) * sp, vy = Math.sin(bug.aim) * sp;
    const dt = 1 / 60;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 30; i++) {
      for (let k = 0; k < 2; k++) {
        vx += b.wind * WIND_ACC * (def.windAffect || 0) * dt;
        vy += GRAV * (proj.gravMul || 1) * dt;
        x += vx * dt; y += vy * dt;
      }
      if (b.terrain.solid(x, y) || y > b.terrain.waterY || x < 0 || x > b.worldW) break;
      if (i % 2 === 0) {
        ctx.globalAlpha = Math.max(0.1, 0.6 - i * 0.018);
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPassOverlay(ctx, W, H) {
    ctx.fillStyle = 'rgba(8,14,26,0.74)';
    ctx.fillRect(0, 0, W, H);
    const team = this.battle.teams[this.passOverlay.team];
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('请交给 ' + team.name, W / 2, H / 2 - 18);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#bcd0e8';
    ctx.fillText('点击任意处开始行动', W / 2, H / 2 + 26);
  }

  drawEndOverlay(ctx, W, H) {
    const b = this.battle;
    const winner = this.endOverlay.winner;
    ctx.fillStyle = 'rgba(8,14,26,0.66)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(430, W * 0.72), ph = Math.min(240, H * 0.62);
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
    ctx.fillStyle = '#fff8ec';
    rr(ctx, px, py, pw, ph, 18); ctx.fill();
    ctx.strokeStyle = '#e2c893'; ctx.lineWidth = 3;
    rr(ctx, px, py, pw, ph, 18); ctx.stroke();

    let title, color;
    if (this.mode === 'hotseat') {
      title = winner >= 0 ? `${b.teams[winner].name}获胜！` : '平局！';
      color = winner >= 0 ? b.teams[winner].color : '#8fa3bd';
    } else if (winner === 0) { title = '胜利！'; color = '#ff9f43'; }
    else if (winner < 0) { title = '平局'; color = '#8fa3bd'; }
    else { title = '战败…'; color = '#7f8fa6'; }

    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(title, W / 2, py + 58);

    const surv = b.bugs.filter(w => !w.dead).length;
    ctx.fillStyle = '#6b6b6b';
    ctx.font = '14px sans-serif';
    const lines = this.mode === 'campaign'
      ? (winner === 0 ? [`第 ${this.stage} 关通关！`]
                      : ['虫虫们全军覆没了…', this.endOverlay.coins ? `获得 ${this.endOverlay.coins} 金币（闯关进度从头开始）` : '再接再厉！'])
      : this.mode === 'online'
        ? [this.endOverlay.coins ? `获得 ${this.endOverlay.coins} 金币` : (this.endOverlay.quit ? '对方退出了对局' : '')]
        : [`场上还剩 ${surv} 只虫子`];
    lines.forEach((s, i) => ctx.fillText(s, W / 2, py + 88 + i * 22));

    const btns = [];
    if (this.mode === 'campaign' && winner === 0) btns.push(['next', '下一关', '#ff9f43']);
    if (this.mode !== 'online') btns.push(['retry', this.mode === 'campaign' ? '重新挑战' : '再来一局', '#5aa9ff']);
    btns.push(['home', '返回主页', '#8fa3bd']);
    const bw = Math.min(150, (pw - 40) / btns.length - 10), bh = 44;
    let bx = W / 2 - (btns.length * (bw + 12) - 12) / 2;
    const byy = py + ph - 68;
    this.endBtns = {};
    for (const [k, label, color] of btns) {
      ctx.fillStyle = color;
      rr(ctx, bx, byy, bw, bh, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(label, bx + bw / 2, byy + 28);
      this.endBtns[k] = { x: bx, y: byy, w: bw, h: bh };
      bx += bw + 12;
    }
  }

  drawUpgradeOverlay(ctx, W, H) {
    const ov = this.upgradeOverlay;
    ctx.fillStyle = 'rgba(8,14,26,0.78)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(520, W * 0.86), ph = Math.min(340, H * 0.82);
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
    ctx.fillStyle = '#fff8ec';
    rr(ctx, px, py, pw, ph, 18); ctx.fill();
    ctx.strokeStyle = '#e2c893'; ctx.lineWidth = 3;
    rr(ctx, px, py, pw, ph, 18); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9f43';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`第 ${this.stage} 关完成！`, W / 2, py + 42);
    ctx.fillStyle = '#6b6b6b';
    ctx.font = '14px sans-serif';
    ctx.fillText(`+${ov.coins} 金币 · 选择一项强化（本局持续）`, W / 2, py + 66);

    // 三张卡
    const cw = Math.min(140, (pw - 60) / 3 - 10), chh = cw * 1.28;
    const gap = (pw - 40 - cw * 3) / 2;
    this.upgradeBtns = {};
    ov.picks.forEach((u, i) => {
      const cx = px + 20 + i * (cw + gap), cy = py + 84;
      const chosen = ov.chosen === i;
      ctx.fillStyle = chosen ? '#ffe9b8' : '#ffffff';
      rr(ctx, cx, cy, cw, chh, 12); ctx.fill();
      ctx.strokeStyle = chosen ? '#ff9f43' : '#d8cbb4';
      ctx.lineWidth = chosen ? 3 : 2;
      rr(ctx, cx, cy, cw, chh, 12); ctx.stroke();
      ctx.font = `${cw * 0.3}px sans-serif`;
      ctx.fillText(CARD_EMOJI[u.icon] || '⭐', cx + cw / 2, cy + chh * 0.38);
      ctx.fillStyle = '#4a3b28';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(u.name, cx + cw / 2, cy + chh * 0.58);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#8a7a62';
      wrapText(ctx, u.desc, cw - 14).forEach((ln, li) => {
        ctx.fillText(ln, cx + cw / 2, cy + chh * 0.72 + li * 14);
      });
      const taken = this.battle.taken[u.key] || 0;
      if (taken > 0) {
        ctx.fillStyle = '#5aa9ff';
        ctx.font = '10px sans-serif';
        ctx.fillText(`已持有 ×${taken}`, cx + cw / 2, cy + chh - 8);
      }
      this.upgradeBtns['card' + i] = { x: cx, y: cy, w: cw, h: chh };
    });

    // 选择后出现按钮
    if (ov.chosen != null) {
      const bw = 170, bh = 42;
      const bx = W / 2 - bw - 8, by = py + ph - 52;
      ctx.fillStyle = '#ff9f43';
      rr(ctx, bx, by, bw, bh, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`进入第 ${this.stage + 1} 关`, bx + bw / 2, by + 28);
      this.upgradeBtns.next = { x: bx, y: by, w: bw, h: bh };
      ctx.fillStyle = '#8fa3bd';
      rr(ctx, W / 2 + 8, by, bw, bh, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('返回主页', W / 2 + 8 + bw / 2, by + 28);
      this.upgradeBtns.home = { x: W / 2 + 8, y: by, w: bw, h: bh };
    } else {
      ctx.fillStyle = '#b0a48e';
      ctx.font = '13px sans-serif';
      ctx.fillText('点击卡片选择', W / 2, py + ph - 28);
    }
  }

  handleUpgradeClick(x, y) {
    const ov = this.upgradeOverlay;
    const hit = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (ov.chosen == null) {
      for (let i = 0; i < ov.picks.length; i++) {
        if (hit(this.upgradeBtns['card' + i])) {
          const u = ov.picks[i];
          applyUpgrade(this.battle, u.key);
          ov.chosen = i;
          this.app.sfx.play('pickup');
          this.hud.showToast(`获得强化：${u.name}`);
          return;
        }
      }
    } else {
      if (hit(this.upgradeBtns.next)) {
        this.app.sfx.play('click');
        this.app.switchScene('battle', Object.assign({}, this.baseCfg, { stage: this.stage + 1 }));
      } else if (hit(this.upgradeBtns.home)) {
        this.app.sfx.play('click');
        this.app.switchScene('home');
      }
    }
  }

  handleEndOverlayClick(x, y) {
    for (const k in this.endBtns) {
      const r = this.endBtns[k];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.app.sfx.play('click');
        if (k === 'home') this.app.switchScene('home');
        else if (k === 'retry') {
          // Roguelike：闯关战败从第 1 关重来（天赋保留）；热座原样再来
          if (this.mode === 'campaign') {
            this.app.switchScene('battle', Object.assign({}, this.baseCfg, {
              stage: 1,
              modifiers: Object.assign({}, this.freshModifiers),
              taken: {}
            }));
          } else {
            this.app.switchScene('battle', Object.assign({}, this.baseCfg));
          }
        }
        else if (k === 'next') this.app.switchScene('battle', Object.assign({}, this.baseCfg, { stage: this.stage + 1 }));
        return;
      }
    }
  }
}
