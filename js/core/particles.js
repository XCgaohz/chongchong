// 粒子系统：爆炸/碎屑/烟尘/水花/彩带（世界坐标绘制）
import { TAU } from './mathutil.js';

export class Particles {
  constructor() { this.list = []; }

  spawn(p) {
    if (this.list.length > 600) this.list.splice(0, 60);
    this.list.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 1,
      life: 0.6, maxLife: 0.6, size: 4, kind: 'circle',
      color: '#fff', spin: 0, rot: 0, grow: 0
    }, p, { maxLife: p.life || 0.6 }));
  }

  // 爆炸冲击波光环
  shockwave(x, y, r, color = 'rgba(255,255,255,0.9)') {
    this.spawn({ x, y, kind: 'ring', size: r * 0.3, grow: r * 3.2, life: 0.3, color });
  }

  explosion(x, y, r) {
    const n = Math.min(26, 8 + (r / 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 60 + Math.random() * r * 3.2;
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        g: 260, drag: 0.9, life: 0.3 + Math.random() * 0.4,
        size: 3 + Math.random() * 5, kind: 'fire',
        color: Math.random() < 0.5 ? '#ffb347' : '#ff6b3d'
      });
    }
    for (let i = 0; i < n / 2; i++) {
      const a = Math.random() * TAU, sp = 30 + Math.random() * r * 2;
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        g: 120, drag: 0.94, life: 0.5 + Math.random() * 0.5,
        size: 6 + Math.random() * 8, kind: 'smoke', color: '#666'
      });
    }
  }

  debris(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 90 + Math.random() * 220;
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: 700, drag: 0.99, life: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 4, kind: 'debris', color,
        spin: (Math.random() - 0.5) * 12
      });
    }
  }

  splash(x, y, n = 14) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x, y, vx: (Math.random() - 0.5) * 200, vy: -120 - Math.random() * 220,
        g: 640, drag: 0.995, life: 0.5 + Math.random() * 0.4,
        size: 2.5 + Math.random() * 3.5, kind: 'circle',
        color: Math.random() < 0.5 ? '#5fd07a' : '#8fe8a5'
      });
    }
  }

  dust(x, y, n = 4) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x, y, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40,
        g: 60, drag: 0.92, life: 0.35 + Math.random() * 0.25,
        size: 3 + Math.random() * 3, kind: 'smoke', color: '#b09a72'
      });
    }
  }

  confetti(x, y) {
    const colors = ['#ff5a5a', '#ffc94d', '#58c95e', '#4da3ff', '#c86bff'];
    for (let i = 0; i < 40; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 80, y: y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 320, vy: -150 - Math.random() * 250,
        g: 500, drag: 0.985, life: 1.2 + Math.random() * 0.8,
        size: 3 + Math.random() * 3, kind: 'rect',
        color: colors[(Math.random() * colors.length) | 0], spin: (Math.random() - 0.5) * 14
      });
    }
  }

  trail(x, y, color, size = 3) {
    this.spawn({
      x, y, vx: (Math.random() - 0.5) * 20, vy: -10,
      g: 0, drag: 0.9, life: 0.25 + Math.random() * 0.2,
      size, kind: 'smoke', color
    });
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      if (p.grow) p.size += p.grow * dt;
      p.vy += p.g * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'rect') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.5, 4.5 * a);
        ctx.globalAlpha = a * 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else if (p.kind === 'fire') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU); ctx.fill();
      } else if (p.kind === 'smoke') {
        ctx.globalAlpha = a * 0.45;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU); ctx.fill();
      } else if (p.kind === 'debris') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
