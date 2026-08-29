// Roguelike 强化卡池：三选一，本局生效（叠加受次数上限约束）
import { clamp } from '../core/mathutil.js';

export const UPGRADES = [
  { key: 'attack', name: '利颚强化', desc: '全队弹药伤害 +25%', max: 3, icon: 'atk' },
  { key: 'hp', name: '厚壳基因', desc: '全队生命上限 +30% 并回复等量', max: 3, icon: 'hp' },
  { key: 'speed', name: '疾风步', desc: '全队移动速度 +25%', max: 2, icon: 'spd' },
  { key: 'jump', name: '弹簧腿', desc: '全队获得二段跳', max: 1, icon: 'jmp' },
  { key: 'lifeSteal', name: '吸血口器', desc: '造成伤害的 25% 转化为治疗', max: 2, icon: 'suck' },
  { key: 'crit', name: '弱点感知', desc: '15% 概率造成 1.6 倍暴击', max: 2, icon: 'crit' },
  { key: 'blast', name: '高爆装药', desc: '爆炸半径 +25%', max: 2, icon: 'boom' },
  { key: 'armor', name: '几丁质甲', desc: '受到的伤害 -20%', max: 2, icon: 'arm' },
  { key: 'windRes', name: '气流感知', desc: '风力对己方弹道影响 -60%', max: 1, icon: 'wind' },
  { key: 'regen', name: '蜕皮再生', desc: '每次行动回复 6 点生命', max: 2, icon: 'reg' },
  { key: 'ammo', name: '后勤补给', desc: '所有有限弹药 +2', max: 2, icon: 'ammo' },
  { key: 'drop', name: '空投雷达', desc: '补给箱更频繁地降落', max: 1, icon: 'drop' }
];

// battle.taken = { key: count }
export function drawThree(battle) {
  const rnd = battle.rnd;
  const pool = UPGRADES.filter(u => (battle.taken[u.key] || 0) < u.max);
  const picks = [];
  while (picks.length < 3 && pool.length > 0) {
    const i = Math.floor(rnd() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks;
}

// 应用强化：修改 modifiers + 即时修改场上我方虫子
export function applyUpgrade(battle, key) {
  const m = battle.modifiers;
  const team0 = battle.teamBugs[0].filter(w => !w.dead);
  battle.taken[key] = (battle.taken[key] || 0) + 1;
  switch (key) {
    case 'attack': m.attack = (m.attack || 1) + 0.25; break;
    case 'hp':
      m.hpBonus = (m.hpBonus || 1) + 0.3;
      for (const w of team0) {
        const add = Math.round(w.maxHp * 0.3);
        w.maxHp += add; w.hp = Math.min(w.maxHp, w.hp + add);
      }
      break;
    case 'speed':
      m.speedMul = (m.speedMul || 1) + 0.25;
      for (const w of team0) w.stats.speed = Math.round(w.stats.speed * 1.25);
      break;
    case 'jump':
      m.doubleJump = true;
      for (const w of team0) { w.stats.maxJumps = 2; w.doubleJumpAvail = true; }
      break;
    case 'lifeSteal': m.lifeSteal = (m.lifeSteal || 0) + 0.25; break;
    case 'crit': m.crit = (m.crit || 0) + 0.15; break;
    case 'blast': m.blastMul = (m.blastMul || 1) + 0.25; break;
    case 'armor': m.armor = clamp((m.armor || 0) + 0.2, 0, 0.6); break;
    case 'windRes': m.windRes = 0.4; break;
    case 'regen': m.regen = (m.regen || 0) + 6; break;
    case 'ammo':
      m.ammoBonus = (m.ammoBonus || 0) + 2;
      for (const k in battle.arsenal[0]) {
        if (battle.arsenal[0][k] !== Infinity) battle.arsenal[0][k] += 2;
      }
      break;
    case 'drop': m.dropBonus = true; break;
  }
}
