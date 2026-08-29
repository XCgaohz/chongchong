// 可破坏位图地形：Uint8Array 网格为真相源，离屏 canvas 做镜像渲染
import { createOffscreenCanvas } from '../platform.js';
import { mulberry32 } from './mathutil.js';

export const CELL = 2;   // 每格对应世界坐标 2px
const S = 2;             // 地形画布超采样：每格 2 画布像素，轮廓圆滑的关键

export class Terrain {
  constructor(seed, worldW, worldH) {
    this.seed = seed;
    this.worldW = worldW;
    this.worldH = worldH;
    this.cw = Math.ceil(worldW / CELL);
    this.ch = Math.ceil(worldH / CELL);
    this.data = new Uint8Array(this.cw * this.ch);
    this.canvas = createOffscreenCanvas(this.cw * S, this.ch * S);
    this.ctx = this.canvas.getContext('2d');
    this.waterY = worldH - 44; // 毒水水面（世界坐标）
    this.generate(seed);
  }

  generate(seed) {
    const rnd = mulberry32(seed);
    const oct = (wl, amp) => {
      const n = Math.ceil(this.cw / wl) + 2;
      const pts = []; for (let i = 0; i < n; i++) pts.push(rnd());
      return cx => {
        const p = cx / wl, i = Math.floor(p), f = p - i, s = f * f * (3 - 2 * f);
        return (pts[i] * (1 - s) + pts[Math.min(i + 1, n - 1)] * s) * amp;
      };
    };
    const o1 = oct(110, 95), o2 = oct(41, 42), o3 = oct(15, 12);
    const base = this.ch * 0.42;
    const hmap = new Array(this.cw);
    for (let cx = 0; cx < this.cw; cx++) {
      let h = base + o1(cx) + o2(cx) + o3(cx);
      // 边缘稍微抬高山体，防止直接走出地图
      const edge = Math.min(cx, this.cw - 1 - cx);
      if (edge < 40) h -= (40 - edge) * 0.9;
      hmap[cx] = Math.round(Math.max(24, Math.min(this.ch - 10, h)));
    }
    // 随机 1~2 段平顶高地（方便架炮的对峙点）
    const flats = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < flats; i++) {
      const w = Math.floor(this.cw * (0.1 + rnd() * 0.12));
      const x0 = Math.floor(this.cw * (0.15 + rnd() * 0.6));
      let sum = 0; for (let x = x0; x < x0 + w; x++) sum += hmap[Math.min(x, this.cw - 1)];
      const avg = Math.round(sum / w) - 10;
      for (let x = x0; x < Math.min(x0 + w, this.cw); x++) hmap[x] = Math.min(hmap[x], avg);
    }
    for (let cx = 0; cx < this.cw; cx++) {
      for (let cy = hmap[cx]; cy < this.ch; cy++) this.data[cy * this.cw + cx] = 1;
    }
    // 2~3 个浮空岛，制造立体战场
    const islands = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < islands; i++) {
      const rx = 28 + Math.floor(rnd() * 34);
      const ry = 8 + Math.floor(rnd() * 7);
      const cx0 = Math.floor(60 + rnd() * (this.cw - 120));
      const cy0 = Math.floor(this.ch * (0.16 + rnd() * 0.18));
      for (let dx = -rx; dx <= rx; dx++) {
        for (let dy = -ry; dy <= ry; dy++) {
          if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
            const cx = cx0 + dx, cy = cy0 + dy;
            if (cx >= 0 && cx < this.cw && cy >= 0 && cy < this.ch) this.data[cy * this.cw + cx] = 1;
          }
        }
      }
    }
    this.hmap = hmap;
    this.paintAll();
  }

  // ---- 绘制（超采样画布：列行程铺泥土 → 边缘圆头平滑 → 草皮与草丛） ----
  cellHash(cx, cy) { return ((cx * 73856093) ^ (cy * 19349663)) >>> 0; }

  solidCell(cx, cy) {
    if (cx < 0 || cx >= this.cw || cy < 0 || cy >= this.ch) return false;
    return this.data[cy * this.cw + cx] === 1;
  }

  paintAll() {
    this.ctx.clearRect(0, 0, this.cw * S, this.ch * S);
    this.paintRegion(0, 0, this.cw, this.ch);
  }

  paintRegion(x0, y0, w, h) {
    const ctx = this.ctx, D = this.data, cw = this.cw;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    const x1 = Math.min(this.cw, x0 + w), y1 = Math.min(this.ch, y0 + h);
    if (x1 <= x0 || y1 <= y0) return;

    // 第一遍：泥土主体（列行程方块 + 确定性斑点）
    for (let cx = x0; cx < x1; cx++) {
      let cy = y0;
      while (cy < y1) {
        if (D[cy * cw + cx]) {
          let run = 0;
          while (cy + run < y1 && D[(cy + run) * cw + cx]) run++;
          const t = cy / this.ch;
          ctx.fillStyle = `hsl(${22 + t * 6}, ${38 + t * 8}%, ${30 - t * 9}%)`;
          ctx.fillRect(cx * S, cy * S, S, run * S);
          // 哈希斑点/小石子（确定性，保证局部重绘前后一致）
          for (let k = 0; k < run; k += 3) {
            const hs = this.cellHash(cx, cy + k);
            const gy = (cy + k) * S;
            if (hs % 5 === 0) {
              ctx.fillStyle = 'rgba(0,0,0,0.18)';
              ctx.fillRect(cx * S + (hs >> 3) % S, gy + (hs >> 5) % S, S - 1, S - 1);
            } else if (hs % 13 === 0) {
              ctx.fillStyle = 'rgba(255,214,140,0.16)';
              ctx.beginPath();
              ctx.arc(cx * S + S / 2, gy + S / 2, S * 0.32, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          cy += run;
        } else cy++;
      }
    }

    // 第二遍：边缘圆头（把格子锯齿融成连续圆弧）
    for (let cy = y0; cy < y1; cy++) {
      for (let cx = x0; cx < x1; cx++) {
        if (!D[cy * cw + cx]) continue;
        const edge = !this.solidCell(cx - 1, cy) || !this.solidCell(cx + 1, cy) ||
                     !this.solidCell(cx, cy - 1) || !this.solidCell(cx, cy + 1);
        if (!edge) continue;
        const t = cy / this.ch;
        ctx.fillStyle = `hsl(${22 + t * 6}, ${38 + t * 8}%, ${31 - t * 9}%)`;
        ctx.beginPath();
        ctx.arc(cx * S + S / 2, cy * S + S / 2, S * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 第三遍：草皮圆帽 + 草丛叶
    for (let cy = y0; cy < y1; cy++) {
      for (let cx = x0; cx < x1; cx++) {
        if (!D[cy * cw + cx]) continue;
        if (this.solidCell(cx, cy - 1)) continue;
        const hs = this.cellHash(cx, cy);
        const px = cx * S + S / 2, py = cy * S + S / 2;
        // 草帽圆（略大于泥圆，形成包边）
        ctx.fillStyle = `hsl(${96 + hs % 22}, 55%, ${35 + (hs >> 6) % 8}%)`;
        ctx.beginPath();
        ctx.arc(px, py, S * 0.74, 0, Math.PI * 2);
        ctx.fill();
        // 深绿底边
        if (this.solidCell(cx, cy + 1)) {
          ctx.fillStyle = `hsl(${100 + hs % 18}, 48%, ${27 + (hs >> 8) % 5}%)`;
          ctx.beginPath();
          ctx.arc(px, py + S * 0.55, S * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        // 草叶（1~2 根，位置由哈希决定）
        const blades = hs % 3 === 0 ? 2 : 1;
        ctx.strokeStyle = `hsl(${92 + hs % 26}, 52%, ${40 + (hs >> 4) % 10}%)`;
        ctx.lineWidth = Math.max(1, S * 0.28);
        ctx.lineCap = 'round';
        for (let b = 0; b < blades; b++) {
          const bx = px + (((hs >> (b * 4)) % 7) - 3) * S * 0.28;
          const bh = S * (0.7 + ((hs >> (b * 5)) % 5) * 0.18);
          const lean = (((hs >> (b * 3)) % 5) - 2) * S * 0.2;
          ctx.beginPath();
          ctx.moveTo(bx, py - S * 0.3);
          ctx.quadraticCurveTo(bx + lean, py - S * 0.3 - bh * 0.6, bx + lean * 1.6, py - S * 0.3 - bh);
          ctx.stroke();
        }
      }
    }
  }

  // ---- 查询 ----
  solid(wx, wy) {
    const cx = (wx / CELL) | 0, cy = (wy / CELL) | 0;
    if (cx < 0 || cx >= this.cw || cy < 0 || cy >= this.ch) return false;
    return this.data[cy * this.cw + cx] === 1;
  }

  circleHits(wx, wy, r) {
    if (this.solid(wx, wy)) return true;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (this.solid(wx + Math.cos(a) * r, wy + Math.sin(a) * r)) return true;
    }
    if (this.solid(wx + r * 0.55, wy + r * 0.55) || this.solid(wx - r * 0.55, wy + r * 0.55) ||
        this.solid(wx + r * 0.55, wy - r * 0.55) || this.solid(wx - r * 0.55, wy - r * 0.55)) return true;
    return false;
  }

  // 估算表面法线（用于手雷弹跳反射）
  surfaceNormal(wx, wy) {
    let nx = 0, ny = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
      if (this.solid(wx + dx * CELL, wy + dy * CELL)) { nx -= dx; ny -= dy; }
    }
    const len = Math.sqrt(nx * nx + ny * ny);
    return len > 0.01 ? { x: nx / len, y: ny / len } : { x: 0, y: -1 };
  }

  surfaceY(wx) {
    const cx = Math.max(0, Math.min(this.cw - 1, (wx / CELL) | 0));
    for (let cy = 0; cy < this.ch; cy++) if (this.data[cy * this.cw + cx]) return cy * CELL;
    return this.worldH;
  }

  // ---- 破坏 ----
  destroyCircle(wx, wy, rWorld) {
    const r = rWorld / CELL;
    const ccx = wx / CELL, ccy = wy / CELL;
    const x0 = Math.max(0, Math.floor(ccx - r)), x1 = Math.min(this.cw - 1, Math.ceil(ccx + r));
    const y0 = Math.max(0, Math.floor(ccy - r)), y1 = Math.min(this.ch - 1, Math.ceil(ccy + r));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = cx + 0.5 - ccx, dy = cy + 0.5 - ccy;
        if (dx * dx + dy * dy <= r2) this.data[cy * this.cw + cx] = 0;
      }
    }
    this.ctx.clearRect(x0 * S, y0 * S, (x1 - x0 + 1) * S, (y1 - y0 + 1) * S);
    this.paintRegion(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  // 沿路径钻洞（钻头武器）
  carve(x0, y0, x1, y1, r) {
    const steps = Math.ceil(Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) / (CELL * 0.8)) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.destroyCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r);
    }
  }

  draw(ctx) {
    // 超采样画布 1:1 贴到世界坐标，平滑采样让轮廓圆润
    ctx.drawImage(this.canvas, 0, 0, this.cw * CELL, this.ch * CELL);
  }
}
