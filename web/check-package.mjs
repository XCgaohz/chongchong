// 小游戏包静态完整性校验（模拟微信开发者工具的关键检查）
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let ok = true;
const err = (m) => { ok = false; console.log('❌ ' + m); };
const good = (m) => console.log('✅ ' + m);

// 1. 配置文件
try {
  const gj = JSON.parse(fs.readFileSync('game.json', 'utf8'));
  ['landscape', 'portrait'].includes(gj.deviceOrientation)
    ? good('game.json 合法 deviceOrientation=' + gj.deviceOrientation)
    : err('game.json deviceOrientation 非法');
} catch (e) { err('game.json 解析失败: ' + e.message); }
try {
  const pc = JSON.parse(fs.readFileSync('project.config.json', 'utf8'));
  pc.compileType === 'game' ? good('project.config.json compileType=game') : err('compileType 不是 game');
  pc.appid ? good('appid=' + pc.appid) : err('缺少 appid');
} catch (e) { err('project.config.json 解析失败: ' + e.message); }
fs.existsSync('game.js') ? good('game.js 入口存在') : err('缺少 game.js');

// 2. 所有 import 路径可解析
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(p);
  }
})('js');
files.push('game.js');
let importCount = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
    importCount++;
    const target = path.resolve(path.dirname(f), m[1]);
    if (!fs.existsSync(target)) err(f + ' → import 不存在: ' + m[1]);
  }
}
good(`共检查 ${files.length} 个 JS 文件、${importCount} 条 import 全部可解析`);

// 3. platform.js/netlayer.js 之外不应直接使用平台专属 API（typeof 守卫内的引用放行）
const banned = /\b(window\.|document\.|localStorage|BroadcastChannel|require\()/;
for (const f of files) {
  const norm = f.split(path.sep).join('/');
  if (norm.includes('platform.js') || norm.includes('netlayer.js')) continue;
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    if (banned.test(ln) && !ln.trim().startsWith('//')) {
      // 前后 3 行内存在 typeof 守卫则视为已保护
      const ctx = lines.slice(Math.max(0, i - 3), i + 2).join('\n');
      if (/typeof\s+window\s*!==?\s*'undefined'|typeof\s+wx\s*!==?\s*'undefined'/.test(ctx)) return;
      err(`${f}:${i + 1} 疑似未受守卫的平台专属调用: ${ln.trim().slice(0, 60)}`);
    }
  });
}

console.log(ok ? '=== 全部通过 ===' : '=== 存在问题 ===');
process.exit(ok ? 0 : 1);
