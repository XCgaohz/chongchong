// 相机：平滑跟随 + 震屏 + 玩家横移 + 世界/屏幕坐标换算
import { clamp, lerp } from './mathutil.js';
import { ZOOM_MUL } from './constants.js';

export class Camera {
  constructor() {
    this.x = 640; this.y = 360;
    this.zoom = 1;
    this.panX = 0; // 玩家滑屏手动横移（世界偏移，向右看为正）
    this.shakeAmp = 0; this.shakeT = 0;
    this.ox = 0; this.oy = 0; // 震屏偏移
  }

  snapTo(x, y) { this.x = x; this.y = y; this.panX = 0; }

  follow(x, y, lerpK = 0.08) {
    this.x = lerp(this.x, x, lerpK);
    this.y = lerp(this.y, y, lerpK);
  }

  addShake(amp) { this.shakeAmp = Math.min(18, this.shakeAmp + amp); }

  // 镜头前冲（爆炸瞬间的 zoom punch）
  addPunch(k) { this.punch = Math.min(0.1, (this.punch || 0) + k); }

  update(dt, viewW, viewH, worldW, worldH) {
    // 基础缩放：世界适配视口再拉近 ZOOM_MUL，叠加爆炸前冲
    const fit = Math.min(viewW / worldW, viewH / worldH);
    if (this.punch > 0.001) {
      this.punch *= Math.pow(0.0015, dt);
      this.zoom = fit * ZOOM_MUL * (1 + this.punch);
    } else {
      this.punch = 0;
      this.zoom = fit * ZOOM_MUL;
    }
    if (this.shakeAmp > 0.1) {
      this.shakeT += dt * 40;
      this.ox = Math.cos(this.shakeT * 1.7) * this.shakeAmp;
      this.oy = Math.sin(this.shakeT * 2.3) * this.shakeAmp;
      this.shakeAmp *= Math.pow(0.02, dt);
    } else { this.ox = 0; this.oy = 0; this.shakeAmp = 0; }
    // 限制实际取景中心（含手动横移）在世界内，出界部分折回 panX
    const halfW = viewW / this.zoom / 2, halfH = viewH / this.zoom / 2;
    const cx = clamp(this.x + this.panX, Math.min(halfW, worldW / 2), Math.max(worldW - halfW, worldW / 2));
    this.panX = cx - this.x;
    this.y = clamp(this.y, Math.min(halfH, worldH / 2), Math.max(worldH - halfH, worldH / 2));
  }

  apply(ctx, viewW, viewH) {
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x - this.panX + this.ox, -this.y + this.oy);
  }

  screenToWorld(sx, sy, viewW, viewH) {
    return {
      x: (sx - viewW / 2) / this.zoom + this.x + this.panX - this.ox,
      y: (sy - viewH / 2) / this.zoom + this.y - this.oy
    };
  }
}
