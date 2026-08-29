// 对战模式配置工厂：闯关 / 热座
export const TEAM_PRESETS = [
  { name: '红队', color: '#ff5a5a', dark: '#a33636' },
  { name: '蓝队', color: '#4da3ff', dark: '#2d5f9e' },
  { name: '绿队', color: '#58c95e', dark: '#2f7a33' },
  { name: '黄队', color: '#ffc94d', dark: '#b98d00' }
];

const PERSONALITIES = ['balanced', 'aggressive', 'coward'];

export function campaignCfg(stage, extra = {}) {
  return Object.assign({
    mode: 'campaign',
    stage,
    bugsPerTeam: 3,
    turnTime: 30,
    teams: [
      Object.assign({ controller: 'human', species: ['ant', 'ant', 'ant'] }, TEAM_PRESETS[0]),
      Object.assign({
        controller: 'ai', isAI: true,
        personality: PERSONALITIES[stage % PERSONALITIES.length],
        difficulty: Math.min(1, 0.5 + stage * 0.08)
      }, TEAM_PRESETS[1])
    ]
  }, extra);
}

export function hotseatCfg(teamCount) {
  const teams = [];
  for (let i = 0; i < teamCount; i++) {
    teams.push(Object.assign({ controller: 'human', species: ['ant', 'ant', 'ant'] }, TEAM_PRESETS[i]));
  }
  return {
    mode: 'hotseat', stage: 1,
    bugsPerTeam: teamCount > 2 ? 2 : 3,
    turnTime: 25,
    teams
  };
}
