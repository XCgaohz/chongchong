// 局外养成：存档结构、天赋、金币结算
import { SPECIES, SKINS } from './species.js';

export const DEFAULT_PROGRESS = {
  coins: 0,
  bestStage: 1,
  unlocked: ['ant'],
  squad: ['ant', 'ant', 'ant'],
  skins: {},                        // speciesKey -> skinId
  talents: { hp: 0, dmg: 0, coin: 0, ammo: 0 }
};

// 天赋 → 战斗初始 modifiers
export function talentModifiers(talents) {
  const m = {};
  if (talents.hp > 0) m.hpBonus = 1 + talents.hp * 0.1;
  if (talents.dmg > 0) m.attack = 1 + talents.dmg * 0.05;
  if (talents.ammo > 0) m.ammoBonus = talents.ammo;
  return m;
}

export function coinBonusMul(talents) { return 1 + talents.coin * 0.1; }

// 单场战斗金币结算
export function battleCoins(battle, won) {
  const kills = battle.bugs.filter(w => w.teamIdx === 1 && w.dead).length;
  return won
    ? Math.round(battle.stage * 50 + battle.playerDamage / 10 + kills * 20)
    : Math.round(battle.stage * 10 + battle.playerDamage / 20);
}

export const TALENTS = [
  { key: 'hp', name: '坚实体质', desc: '生命上限 +10%/级', max: 5, cost: l => 120 + l * 80 },
  { key: 'dmg', name: '锋利口器', desc: '弹药伤害 +5%/级', max: 5, cost: l => 150 + l * 100 },
  { key: 'coin', name: '聚财触角', desc: '金币获取 +10%/级', max: 5, cost: l => 100 + l * 60 },
  { key: 'ammo', name: '弹药背囊', desc: '初始弹药 +1/级', max: 3, cost: l => 200 + l * 150 }
];

export { SPECIES, SKINS };
