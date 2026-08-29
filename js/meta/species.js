// 虫种定义：属性 + 专属技能（商店解锁/战斗通用）
export const SPECIES = {
  ant: {
    key: 'ant', name: '蚂蚁', price: 0,
    color: '#e8734a', dark: '#a34a26',
    maxHp: 100, speed: 72, jumpV: 330, jumpH: 115, maxJumps: 1,
    skill: 'dash',
    desc: '均衡的全能选手'
  },
  bee: {
    key: 'bee', name: '蜜蜂', price: 600,
    color: '#ffc94d', dark: '#c78f1b',
    maxHp: 85, speed: 88, jumpV: 355, jumpH: 132, maxJumps: 2,
    skill: 'flutter',
    desc: '轻盈高机动，可二段跳'
  },
  beetle: {
    key: 'beetle', name: '甲虫', price: 800,
    color: '#8fa3bd', dark: '#55677f',
    maxHp: 130, speed: 56, jumpV: 300, jumpH: 95, maxJumps: 1,
    skill: 'shell',
    desc: '厚甲高血量，抗打耐摔'
  },
  spider: {
    key: 'spider', name: '蜘蛛', price: 1000,
    color: '#9b6bd4', dark: '#6a3fa0',
    maxHp: 92, speed: 70, jumpV: 335, jumpH: 118, maxJumps: 1,
    skill: 'web',
    desc: '吐丝定身，控场专家'
  }
};

// 皮肤（帽饰）：每种虫可单独装配
export const SKINS = [
  { id: 'none', name: '素体', price: 0 },
  { id: 'cap', name: '棒球帽', price: 150 },
  { id: 'bow', name: '蝴蝶结', price: 200 },
  { id: 'beret', name: '贝雷帽', price: 300 },
  { id: 'crown', name: '小皇冠', price: 500 },
  { id: 'halo', name: '天使光环', price: 800 }
];

// 技能定义（主动技，冷却按"自己行动回合数"计）
export const SKILLS = {
  dash: {
    key: 'dash', name: '冲锋', cd: 3,
    desc: '向前猛冲一段距离',
    use(b, bug) {
      const dir = bug.facing;
      let moved = 0;
      for (let s = 0; s < 140; s += 4) {
        const nx = bug.x + dir * 4;
        if (b.terrain.circleHits(nx, bug.y, bug.r)) break;
        bug.x = nx; moved += 4;
      }
      b.emit({ type: 'sfx', name: 'skill' });
      b.emit({ type: 'skillUse', bug, skill: 'dash' });
      return moved > 0;
    }
  },
  flutter: {
    key: 'flutter', name: '振翅', cd: 3,
    desc: '移速翻倍并可再次跳跃',
    use(b, bug) {
      bug.buffSpeed = 3.5;
      bug.doubleJumpAvail = true;
      bug.onGround = false; bug.vy = Math.min(bug.vy, -160);
      b.emit({ type: 'sfx', name: 'skill' });
      b.emit({ type: 'skillUse', bug, skill: 'flutter' });
      return true;
    }
  },
  shell: {
    key: 'shell', name: '虫壳', cd: 4,
    desc: '护盾减伤50%，持续到下次行动',
    use(b, bug) {
      bug.shield = true;
      b.emit({ type: 'sfx', name: 'skill' });
      b.emit({ type: 'skillUse', bug, skill: 'shell' });
      return true;
    }
  },
  web: {
    key: 'web', name: '吐丝', cd: 4,
    desc: '定身最近敌人（其下回合无法移动）',
    use(b, bug) {
      let best = null, bd = 1e9;
      for (const w of b.bugs) {
        if (w.dead || w.teamIdx === bug.teamIdx) continue;
        const d = Math.hypot(w.x - bug.x, w.y - bug.y);
        if (d < bd) { bd = d; best = w; }
      }
      if (best && bd < 460) {
        best.webbed = 2;
        b.emit({ type: 'sfx', name: 'skill' });
        b.emit({ type: 'skillUse', bug, skill: 'web', target: best });
        return true;
      }
      b.emit({ type: 'toast', text: '附近没有目标' });
      return false;
    }
  }
};
