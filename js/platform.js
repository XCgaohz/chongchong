// 平台适配层：微信小游戏 / 浏览器 双端分流
// 所有平台差异集中在这里，其余代码只面向本模块 API
const wxApi = typeof wx !== 'undefined' ? wx : null;
export const IS_WX = !!wxApi;

let cachedInfo = null;

export function getSystemInfo() {
  if (!cachedInfo) {
    if (wxApi) {
      const si = wxApi.getSystemInfoSync();
      cachedInfo = {
        width: si.windowWidth,
        height: si.windowHeight,
        pixelRatio: Math.min(si.pixelRatio || 2, 2),
        safeArea: si.safeArea || { top: 0, bottom: si.windowHeight, left: 0, right: si.windowWidth },
        platform: si.platform || 'wechat'
      };
    } else {
      cachedInfo = {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        safeArea: { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth },
        platform: 'browser'
      };
    }
  }
  return cachedInfo;
}

export function invalidateSystemInfo() { cachedInfo = null; }

// 注意：微信小游戏里第一次 createCanvas() 返回的是上屏 canvas
let screenCanvasCreated = false;
export function createScreenCanvas() {
  screenCanvasCreated = true;
  if (wxApi) return wxApi.createCanvas();
  const c = document.createElement('canvas');
  Object.assign(c.style, {
    position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
    margin: '0', padding: '0', background: '#0a1420', touchAction: 'none'
  });
  document.body.appendChild(c);
  return c;
}

export function createOffscreenCanvas(w, h) {
  if (wxApi) {
    const c = wxApi.createCanvas();
    c.width = w; c.height = h;
    return c;
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ---------- 触摸输入 ----------
const touchCbs = { start: [], move: [], end: [] };

function normalizeWxPoints(e, type) {
  const raw = type === 'end' ? (e.changedTouches || e.touches || []) : (e.touches || e.changedTouches || []);
  return Array.from(raw).map(t => ({ id: t.identifier ?? 0, x: t.clientX ?? 0, y: t.clientY ?? 0 }));
}

function dispatchTouch(type, pts) {
  for (const cb of touchCbs[type]) cb(pts);
}

export function onTouch(type, cb) { touchCbs[type].push(cb); }

export function initTouch(canvas) {
  if (wxApi) {
    wxApi.onTouchStart(e => dispatchTouch('start', normalizeWxPoints(e, 'start')));
    wxApi.onTouchMove(e => dispatchTouch('move', normalizeWxPoints(e, 'move')));
    wxApi.onTouchEnd(e => dispatchTouch('end', normalizeWxPoints(e, 'end')));
    wxApi.onTouchCancel(e => dispatchTouch('end', normalizeWxPoints(e, 'end')));
  } else {
    const pt = e => [{ id: e.pointerId ?? 0, x: e.clientX, y: e.clientY }];
    canvas.addEventListener('pointerdown', e => {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      dispatchTouch('start', pt(e));
    });
    canvas.addEventListener('pointermove', e => dispatchTouch('move', pt(e)));
    canvas.addEventListener('pointerup', e => dispatchTouch('end', pt(e)));
    canvas.addEventListener('pointercancel', e => dispatchTouch('end', pt(e)));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
}

// ---------- 键盘（仅浏览器调试用） ----------
export const keys = new Set();
const keyCbs = [];
export function onKey(cb) { keyCbs.push(cb); }

if (!wxApi) {
  window.addEventListener('keydown', e => {
    if (!keys.has(e.key)) { keys.add(e.key); for (const cb of keyCbs) cb(e.key, true); }
    if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    keys.delete(e.key);
    for (const cb of keyCbs) cb(e.key, false);
  });
}
export function isKey(k) { return keys.has(k); }

// ---------- 存储 ----------
export const storage = {
  get(k, d) {
    try {
      const v = wxApi ? wxApi.getStorageSync(k) : localStorage.getItem(k);
      if (v === null || v === undefined || v === '') return d;
      return JSON.parse(v);
    } catch (_) { return d; }
  },
  set(k, v) {
    try {
      const s = JSON.stringify(v);
      if (wxApi) wxApi.setStorageSync(k, s); else localStorage.setItem(k, s);
    } catch (_) {}
  }
};

// ---------- 音频 ----------
export function createAudioContext() {
  try {
    if (wxApi && wxApi.createWebAudioContext) return wxApi.createWebAudioContext();
    if (!wxApi && window.AudioContext) return new AudioContext();
  } catch (_) {}
  return null;
}

// ---------- 其他 ----------
export function vibrate(short) {
  try {
    if (wxApi) wxApi.vibrateShort({ type: short ? 'light' : 'medium' });
    else if (navigator.vibrate) navigator.vibrate(short ? 15 : 40);
  } catch (_) {}
}

export function onShow(cb) {
  if (wxApi) wxApi.onShow(cb);
  else document.addEventListener('visibilitychange', () => { if (!document.hidden) cb(); });
}

export function onHide(cb) {
  if (wxApi) wxApi.onHide(cb);
  else document.addEventListener('visibilitychange', () => { if (document.hidden) cb(); });
}

export function requestAnimationFrame(fn) {
  if (wxApi) return wxApi.requestAnimationFrame ? wxApi.requestAnimationFrame(fn) : globalThis.requestAnimationFrame(fn);
  return window.requestAnimationFrame(fn);
}
