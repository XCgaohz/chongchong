// 弹道实体：子步进积分防穿透，撞击行为由武器定义的 impact/def 参数决定
import { GRAV, WIND_ACC } from '../core/constants.js';

export class Projectile {
  constructor(def, x, y, vx, vy, owner) {
    this.def = def;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.owner = owner;
    this.teamIdx = owner ? owner.teamIdx : -1;
    this.r = def.r || 4;
    this.age = 0;
    this.dead = false;
    this.rot = 0;
    this.look = def.look || 'ball';
    this.fuseTotal = def.fuse || 0;
  }

  update(dt, b) {
    if (this.dead) return;
    this.age += dt;
    const def = this.def;

    if (def.windAffect) {
      const wf = (this.teamIdx === 0 && b.modifiers.windRes) ? b.modifiers.windRes : 1;
      this.vx += b.wind * WIND_ACC * def.windAffect * wf * dt;
    }
    this.vy += GRAV * (def.gravMul || 1) * dt;

    const speed = Math.hypot(this.vx, this.vy);
    const steps = Math.max(1, Math.min(12, Math.ceil(speed * dt / 3)));
    const sdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      if (this.dead) break;
      this.x += this.vx * sdt;
      this.y += this.vy * sdt;
      if (speed > 40) this.rot = Math.atan2(this.vy, this.vx);

      // 虫体碰撞
      for (const w of b.bugs) {
        if (w.dead) continue;
        if (w === this.owner && this.age < 0.25) continue;
        const dx = w.x - this.x, dy = w.y - this.y;
        const rr = w.r + this.r;
        if (dx * dx + dy * dy < rr * rr) { this.hitSomething(b); break; }
      }
      if (this.dead) break;

      // 地形
      if (def.drill && b.terrain.solid(this.x, this.y)) {
        b.terrain.destroyCircle(this.x, this.y, def.drillR || 13);
        if (b.particles && Math.random() < 0.5) b.particles.dust(this.x, this.y, 1);
        if (Math.random() < 0.2) b.emit({ type: 'sfx', name: 'drill' });
      } else if (b.terrain.solid(this.x, this.y)) {
        this.hitTerrain(b);
        if (this.dead) break;
      }

      // 毒水
      if (this.y > b.terrain.waterY + 10) {
        this.dead = true;
        b.emit({ type: 'splash', x: this.x, y: b.terrain.waterY });
        break;
      }
      // 出界
      if (this.x < -300 || this.x > b.worldW + 300 || this.y < -2500) {
        this.dead = true; break;
      }
      // 引信
      if (def.fuse && this.age >= def.fuse) {
        this.dead = true;
        if (def.impact) def.impact(b, this);
        break;
      }
    }
  }

  hitTerrain(b) {
    const def = this.def;
    if (def.bounce) {
      const n = b.terrain.surfaceNormal(this.x - this.vx * 0.008, this.y - this.vy * 0.008);
      const dot = this.vx * n.x + this.vy * n.y;
      this.vx = (this.vx - 2 * dot * n.x) * def.bounce;
      this.vy = (this.vy - 2 * dot * n.y) * def.bounce;
      let guard = 0;
      while (b.terrain.solid(this.x, this.y) && guard++ < 24) {
        this.x -= this.vx * 0.006;
        this.y -= this.vy * 0.006;
      }
      if (Math.abs(this.vx) < 24) this.vx *= 0.5;
      if (Math.abs(this.vy) < 24) this.vy = 0;
      b.emit({ type: 'sfx', name: 'click' });
    } else {
      this.dead = true;
      if (def.impact) def.impact(b, this);
    }
  }

  hitSomething(b) {
    this.dead = true;
    if (this.def.impact) this.def.impact(b, this);
  }
}
