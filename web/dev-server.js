// 开发用静态服务器：禁用缓存（python http.server 会启发式缓存 ESM 模块）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8'
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(8124, '0.0.0.0', () => {
  console.log('dev server: http://localhost:8124/web/index.html');
  console.log('局域网试玩: http://<本机IP>:8124/web/index.html  （手机需与电脑同一 WiFi）');
});
