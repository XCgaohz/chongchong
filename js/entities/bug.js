// 虫子实体：物理 + 卡通渲染
import { GRAV } from '../core/constants.js';
import { clamp, TAU } from '../core/mathutil.js';
import { SPECIES } from '../meta/species.js';

export class Bug {
  constructor({ teamIdx, idx, name, color, dark, x, y, species }) {
    this.teamIdx = teamIdx;
    this.idx = idx;
    this.name = name;
    this.color = color;
    this.dark = dark;
    this.species = species || 'ant';
    const sp = SPECIES[this.species];
    this.r = 9;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.maxHp = sp.maxHp; this.hp = sp.maxHp;
    this.stats = { speed: sp.speed, jumpV: sp.jumpV, jumpH: sp.jumpH, maxJumps: sp.maxJumps };
    this.facing = 1;
    this.aim = -0.6;
    this.onGround = false;
    this.dead = false;
    this.deathX = 0; this.deathY = 0;
    this.wantMove = 0;
    this.jumpQueued = false;
    this.doubleJumpAvail = this.stats.maxJumps > 1;
    this.charging = false;
    this.charge = 0;
    this.shield = false;
    this.webbed = 0;      // 剩余被定身的回合数
    this.buffSpeed = 0;   // 振翅加速剩余秒数
    this.skillCd = 0;     // 技能剩余冷却回合
    this.flash = 0;
    this.trail = []; this.trailT = 0;
    this.walkPhase = 0;
    this.blink = 0;
    this.hat = 'none';
    this.tilt = 0;      // 身体随坡度倾斜
    this.landT = 0;     // 挤压拉伸计时（>0 落地压缩，<0 起跳拉长）
  }

  get alive() { return !this.dead; }

  update(dt, b) {
    if (this.dead) return;
    const T = b.terrain;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.blink -= dt;
    if (this.blink < -3) this.blink = 0.15;

    // 身体拖尾（卡通软体感）
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.045;
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 8) this.trail.shift();
    }

    const speed = this.stats.speed * (this.buffSpeed > 0 ? 1.9 : 1);
    if (this.buffSpeed > 0) this.buffSpeed -= dt;

    // 地面行走（带爬坡台阶）
    if (this.onGround && this.wantMove !== 0 && this.webbed <= 0) {
      this.facing = this.wantMove;
      const nx = this.x + this.wantMove * speed * dt;
      if (!T.circleHits(nx, this.y, this.r)) {
        this.x = nx;
      } else {
        for (const up of [3, 6, 9, 13]) {
          if (!T.circleHits(nx, this.y - up, this.r)) { this.x = nx; this.y -= up; break; }
        }
      }
      this.walkPhase += dt * 11;
      if (Math.random() < dt * 3 && b.particles) b.particles.dust(this.x - this.facing * 6, this.y + this.r - 2, 1);
    } else if (!this.onGround && Math.abs(this.vx) > 1) {
      const nx = this.x + this.vx * dt;
      if (!T.circleHits(nx, this.y, this.r)) this.x = nx;
      else this.vx *= -0.25;
    }
    this.vx *= Math.pow(0.4, dt); // 惯量衰减

    // 跳跃
    if (this.jumpQueued) {
      this.jumpQueued = false;
      if (this.webbed <= 0 && (this.onGround || this.doubleJumpAvail)) {
        if (!this.onGround) this.doubleJumpAvail = false;
        this.vy = -this.stats.jumpV * (this.buffSpeed > 0 ? 1.12 : 1);
        this.vx = this.facing * this.stats.jumpH * (this.wantMove === 0 ? 0.7 : 1);
        this.onGround = false;
        this.landT = -0.16; // 起跳拉长
        b.emit({ type: 'sfx', name: 'jump' });
      }
    }

    // 重力与落地
    this.vy += GRAV * dt;
    const ny = this.y + this.vy * dt;
    if (this.vy > 0 && T.circleHits(this.x, ny, this.r)) {
      const impactV = this.vy;
      let gy = ny, guard = 0;
      while (T.circleHits(this.x, gy, this.r) && guard++ < 60) gy -= 1;
      this.y = gy;
      if (impactV > 430) this.damage(Math.round((impactV - 430) / 7), 'fall', b);
      else if (impactV > 240) b.emit({ type: 'sfx', name: 'click' });
      if (impactV > 160) this.landT = Math.min(0.18, 0.06 + impactV / 4000); // 落地压缩
      this.vy = 0;
      this.onGround = true;
      this.doubleJumpAvail = this.stats.maxJumps > 1;
    } else {
      this.y = ny;
      if (this.vy > 60) this.onGround = false;
    }

    // 坡度倾斜（贴地时身体跟随地形，限幅防止陡坡滑倒感）
    const syL = T.surfaceY(this.x - 6), syR = T.surfaceY(this.x + 6);
    let targetTilt = 0;
    if (this.onGround && syL < b.worldH && syR < b.worldH && Math.abs(syR - syL) < 34) {
      targetTilt = Math.atan2(syR - syL, 12);
    }
    targetTilt = Math.max(-0.32, Math.min(0.32, targetTilt));
    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 12);
    this.landT *= Math.pow(0.002, dt);

    this.x = clamp(this.x, this.r + 2, b.worldW - this.r - 2);
    if (this.y > T.waterY + 4) b.drownBug(this);

    // 蓄力
    if (this.charging) this.charge = Math.min(1, this.charge + dt / 1.15);

    this.wantMove = 0;
  }

  drawHat(ctx, hx, hy, t) {
    switch (this.hat) {
      case 'cap': // 棒球帽
        ctx.fillStyle = '#d9483b';
        ctx.beginPath(); ctx.arc(hx, hy - 1, 7.5, Math.PI, 0); ctx.fill();
        ctx.fillRect(hx - 7.5, hy - 2.2, 15, 2);
        ctx.fillStyle = '#b93828';
        ctx.beginPath(); ctx.ellipse(hx + this.facing * 8, hy - 1.5, 4.5, 1.6, 0, 0, TAU); ctx.fill();
        break;
      case 'crown': // 小皇冠
        ctx.fillStyle = '#ffd23e';
        ctx.strokeStyle = '#c79418'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx - 6, hy);
        ctx.lineTo(hx - 6, hy - 5); ctx.lineTo(hx - 3, hy - 2);
        ctx.lineTo(hx, hy - 6); ctx.lineTo(hx + 3, hy - 2);
        ctx.lineTo(hx + 6, hy - 5); ctx.lineTo(hx + 6, hy);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      case 'beret': // 贝雷帽
        ctx.fillStyle = '#3d6ea5';
        ctx.beginPath(); ctx.ellipse(hx - this.facing * 1.5, hy - 3, 8, 3.6, -0.15, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(hx + this.facing * 2, hy - 6.5, 1.8, 0, TAU); ctx.fill();
        break;
      case 'bow': // 蝴蝶结
        ctx.fillStyle = '#ff7eb6';
        const bx2 = hx - this.facing * 7;
        ctx.beginPath();
        ctx.moveTo(bx2, hy - 2);
        ctx.lineTo(bx2 - 6, hy - 6); ctx.lineTo(bx2 - 6, hy + 2);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx2, hy - 2);
        ctx.lineTo(bx2 + 2, hy - 6); ctx.lineTo(bx2 + 2, hy + 2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e85a97';
        ctx.beginPath(); ctx.arc(bx2, hy - 2, 1.8, 0, TAU); ctx.fill();
        break;
      case 'halo': // 天使光环
        ctx.strokeStyle = '#ffe94d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(hx, hy - 8 + Math.sin(t * 3) * 1.2, 6.5, 2.2, 0, 0, TAU);
        ctx.stroke();
        break;
    }
  }

  damage(n, src, b) {
    if (this.dead || n <= 0) return 0;
    let dmg = Math.round(n);
    if (this.shield) dmg = Math.max(1, Math.ceil(dmg * 0.5));
    this.hp -= dmg;
    this.flash = 1;
    b.emit({ type: 'damage', bug: this, amount: dmg, src });
    if (this.hp <= 0) { this.hp = 0; this.die(b, src); }
    return dmg;
  }

  heal(n, b) {
    if (this.dead) return;
    const real = Math.min(this.maxHp - this.hp, n);
    this.hp += real;
    b.emit({ type: 'heal', bug: this, amount: real });
  }

  die(b, cause) {
    if (this.dead) return;
    this.dead = true;
    this.deathX = this.x; this.deathY = Math.min(this.y, b.terrain.waterY - 4);
    b.emit({ type: 'bugDie', bug: this, cause: cause || 'hp' });
  }

  // ---------- 渲染 ----------
  draw(ctx, b, opts = {}) {
    if (this.dead) return;
    const t = performance.now() / 1000;
    // 拖尾环节
    for (let i = 0; i < this.trail.length - 1; i++) {
      const p = this.trail[i];
      const k = i / this.trail.length;
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = this.dark;
      ctx.beginPath();
      ctx.arc(p.x, p.y + 2, 3 + k * 4.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const bob = this.onGround ? Math.sin(this.walkPhase * 2) * 1.2 : 0;
    const bx = this.x, by = this.y + bob;

    // 阴影（投在正下方地表）
    const sy = b.terrain.surfaceY(this.x);
    if (sy < b.worldH && sy - this.y < 400) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.x, sy - 2, 9, 3, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 小短腿（倾斜+挤压变换内绘制）
    let sqx = 1, sqy = 1;
    if (this.landT > 0.005) { const k = Math.min(1, this.landT / 0.15); sqy = 1 - 0.16 * k; sqx = 1 + 0.13 * k; }
    else if (this.landT < -0.005) { const k = Math.min(1, -this.landT / 0.16); sqy = 1 + 0.13 * k; sqx = 1 - 0.09 * k; }
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(this.tilt);
    ctx.scale(sqx, sqy);
    ctx.translate(-bx, -by);

    ctx.strokeStyle = this.dark;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const legSwing = Math.sin(this.walkPhase) * 3;
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + 5); ctx.lineTo(bx - 4 + legSwing, by + 10);
    ctx.moveTo(bx + 4, by + 5); ctx.lineTo(bx + 4 - legSwing, by + 10);
    ctx.stroke();

    // 身体
    const grad = ctx.createRadialGradient(bx - 3, by - 4, 2, bx, by, 12);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, this.color);
    grad.addColorStop(1, this.dark);
    ctx.fillStyle = grad;
    ctx.strokeStyle = this.dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, TAU);
    ctx.fill(); ctx.stroke();

    // 触角
    const wig = Math.sin(t * 5 + this.idx) * 2;
    ctx.strokeStyle = this.dark;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(bx - 4, by - 8); ctx.quadraticCurveTo(bx - 7, by - 15, bx - 5 + wig, by - 17);
    ctx.moveTo(bx + 4, by - 8); ctx.quadraticCurveTo(bx + 7, by - 15, bx + 5 + wig, by - 17);
    ctx.stroke();
    ctx.fillStyle = this.dark;
    ctx.beginPath();
    ctx.arc(bx - 5 + wig, by - 17, 1.8, 0, TAU);
    ctx.arc(bx + 5 + wig, by - 17, 1.8, 0, TAU);
    ctx.fill();

    // 眼睛
    const ex = bx + this.facing * 3.5;
    const hurt = this.flash > 0.3 || this.hp < this.maxHp * 0.3;
    const blinking = this.blink > 0;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = this.dark;
    ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(ex + side * 3.4, by - 4, 3.4, 0, TAU);
      ctx.fill(); ctx.stroke();
    }
    if (blinking) {
      ctx.strokeStyle = this.dark; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ex - 6, by - 4); ctx.lineTo(ex - 1, by - 4);
      ctx.moveTo(ex + 1, by - 4); ctx.lineTo(ex + 6, by - 4);
      ctx.stroke();
    } else if (hurt) {
      // >< 眼
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const cxx = ex + side * 3.4;
        ctx.moveTo(cxx - 2, by - 6); ctx.lineTo(cxx + 2, by - 2);
        ctx.moveTo(cxx + 2, by - 6); ctx.lineTo(cxx - 2, by - 2);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#222';
      const px = clamp(Math.cos(this.aim), -1, 1) * 1.5;
      const py = clamp(Math.sin(this.aim), -1, 1) * 1.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex + side * 3.4 + px, by - 4 + py, 1.6, 0, TAU);
        ctx.fill();
      }
    }

    // 嘴（蓄力咬牙 / 受击哭 / 平时微笑）
    ctx.strokeStyle = '#5b2d1e';
    ctx.lineWidth = 1.4;
    if (this.charging) {
      ctx.beginPath();
      ctx.moveTo(ex - 2.6, by + 3.6); ctx.lineTo(ex + 2.6, by + 3.6);
      ctx.moveTo(ex - 1, by + 2.4); ctx.lineTo(ex - 1, by + 4.8);
      ctx.moveTo(ex + 1, by + 2.4); ctx.lineTo(ex + 1, by + 4.8);
      ctx.stroke();
      // 皱眉
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(ex - 6, by - 9.5); ctx.lineTo(ex - 1, by - 8);
      ctx.moveTo(ex + 7, by - 9.5); ctx.lineTo(ex + 2, by - 8);
      ctx.stroke();
    } else {
      ctx.beginPath();
      if (hurt) ctx.arc(ex, by + 4.5, 2.6, Math.PI * 1.15, Math.PI * 1.85);
      else ctx.arc(ex, by + 2.5, 2.6, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }

    // 蜘蛛额外小腿装饰
    if (this.species === 'spider') {
      ctx.strokeStyle = this.dark; ctx.lineWidth = 1.6;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx + side * 8, by - 2);
        ctx.quadraticCurveTo(bx + side * 14, by - 6, bx + side * 12, by + 8);
        ctx.stroke();
      }
    }
    // 甲虫背壳纹
    if (this.species === 'beetle') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx - 7, by + 1); ctx.lineTo(bx + 7, by + 1); ctx.stroke();
    }
    // 蜜蜂翅膀
    if (this.species === 'bee') {
      const flap = Math.sin(t * 40) * 0.5 + 0.8;
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#dff3ff';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(bx + side * 6, by - 10, 6, 3.5 * flap, side * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 帽饰皮肤
    this.drawHat(ctx, bx, by - 10, t);

    // 护盾泡
    if (this.shield) {
      ctx.strokeStyle = 'rgba(90,200,255,0.9)';
      ctx.fillStyle = 'rgba(120,215,255,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, 16 + Math.sin(t * 6) * 1.2, 0, TAU);
      ctx.fill(); ctx.stroke();
    }
    // 蛛丝缠绕
    if (this.webbed > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(bx, by, 11 - i * 2, 12 - i * 2, i * 1.1 + t, 0, TAU);
        ctx.stroke();
      }
    }

    // 受击闪白
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.7;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(bx, by, 11, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore(); // 倾斜/挤压变换结束（HP条与箭头不参与）

    // HP 条 + 名字
    const pct = this.hp / this.maxHp;
    const barW = 36, barY = by - 27;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(bx - barW / 2 - 1, barY - 1, barW + 2, 7);
    ctx.fillStyle = pct > 0.55 ? '#5ad35a' : pct > 0.25 ? '#ffc94d' : '#ff5a5a';
    ctx.fillRect(bx - barW / 2, barY, barW * pct, 5);
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.name, bx, barY - 5);
    ctx.fillText(this.name, bx, barY - 5);

    // 行动标记
    if (opts.active) {
      const yy = by - 38 + Math.sin(t * 6) * 3;
      ctx.fillStyle = '#ffe94d';
      ctx.strokeStyle = '#b98d00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, yy + 8); ctx.lineTo(bx - 6, yy); ctx.lineTo(bx + 6, yy);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // 瞄准箭头 + 蓄力
    if (opts.active && opts.showAim) {
      const len = 26 + this.charge * 34;
      const ax = bx + Math.cos(this.aim) * len;
      const ay = by + Math.sin(this.aim) * len;
      ctx.strokeStyle = this.charging ? '#ff5050' : 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(this.aim) * 13, by + Math.sin(this.aim) * 13);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      // 箭头尖
      const a = this.aim;
      ctx.fillStyle = this.charging ? '#ff5050' : '#fff';
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(a) * 8, ay + Math.sin(a) * 8);
      ctx.lineTo(ax + Math.cos(a + 2.5) * 7, ay + Math.sin(a + 2.5) * 7);
      ctx.lineTo(ax + Math.cos(a - 2.5) * 7, ay + Math.sin(a - 2.5) * 7);
      ctx.closePath(); ctx.fill();
      if (this.charging) {
        // 蓄力环
        ctx.strokeStyle = '#ffe94d';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(bx, by, 20, -Math.PI / 2, -Math.PI / 2 + this.charge * TAU);
        ctx.stroke();
      }
    }
  }
}
