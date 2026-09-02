// 平台适配层：微信小游戏 / 浏览器 双端分流
// 所有平台差异集中在这里，其余代码只面向本模块 API
const wxApi = typeof wx !== 'undefined' ? wx : null;
export const IS_WX = !!wxApi;

// 竖屏模拟横屏：仅手机类设备（触屏 + 短边≤520px）竖持时旋转画面（H5 端）
// 平板/桌面端不受影响；URL 加 ?sim=1 可强制开启、?sim=0 强制关闭（调试用）
let simLandscape = false;
export function isSimLandscape() { return simLandscape; }

let coarsePointer = null;
function phoneLike() {
  if (coarsePointer === null) {
    coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    try {
      const q = new URLSearchParams(location.search).get('sim');
      if (q === '1') coarsePointer = true;
      else if (q === '0') coarsePointer = false;
    } catch (_) {}
  }
  return coarsePointer && Math.min(window.innerWidth, window.innerHeight) <= 520;
}

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
      const w = window.innerWidth, h = window.innerHeight;
      cachedInfo = {
        // 模拟横屏时逻辑尺寸对调
        width: simLandscape ? h : w,
        height: simLandscape ? w : h,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        safeArea: { top: 0, bottom: simLandscape ? w : h, left: 0, right: simLandscape ? h : w },
        platform: 'browser'
      };
    }
  }
  return cachedInfo;
}

export function invalidateSystemInfo() { cachedInfo = null; }

// 竖屏时旋转画布铺满视口（rotate 90° around top-left，画布放右缘外翻进来）
export function refreshLayout(canvas) {
  if (wxApi || !canvas) return;
  const w = window.innerWidth, h = window.innerHeight;
  const portrait = phoneLike() && h > w;
  if (portrait !== simLandscape) {
    simLandscape = portrait;
    invalidateSystemInfo();
  }
  const st = canvas.style;
  if (simLandscape) {
    st.position = 'absolute';
    st.left = w + 'px';
    st.top = '0';
    st.width = h + 'px';
    st.height = w + 'px';
    st.transform = 'rotate(90deg)';
    st.transformOrigin = 'left top';
  } else {
    st.position = 'fixed';
    st.left = '0';
    st.top = '0';
    st.width = '100%';
    st.height = '100%';
    st.transform = 'none';
  }
}

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
const wheelCbs = [];

function normalizeWxPoints(e, type) {
  const raw = type === 'end' ? (e.changedTouches || e.touches || []) : (e.touches || e.changedTouches || []);
  return Array.from(raw).map(t => ({ id: t.identifier ?? 0, x: t.clientX ?? 0, y: t.clientY ?? 0 }));
}

function dispatchTouch(type, pts) {
  for (const cb of touchCbs[type]) cb(pts);
}

export function onTouch(type, cb) { touchCbs[type].push(cb); }
export function onWheel(cb) { wheelCbs.push(cb); }

export function initTouch(canvas) {
  if (wxApi) {
    wxApi.onTouchStart(e => dispatchTouch('start', normalizeWxPoints(e, 'start')));
    wxApi.onTouchMove(e => dispatchTouch('move', normalizeWxPoints(e, 'move')));
    wxApi.onTouchEnd(e => dispatchTouch('end', normalizeWxPoints(e, 'end')));
    wxApi.onTouchCancel(e => dispatchTouch('end', normalizeWxPoints(e, 'end')));
  } else {
    // 微信/浏览器内核会把 canvas 当图片弹长按菜单（搜一搜/翻译），document 级拦死
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('selectstart', e => e.preventDefault());
    try { window.oncontextmenu = () => false; } catch (_) {}
    // 模拟横屏时坐标换算：画布坐标 x=clientY, y=innerWidth-clientX
    const pt = e => {
      if (simLandscape) return [{ id: e.pointerId ?? 0, x: e.clientY, y: window.innerWidth - e.clientX }];
      return [{ id: e.pointerId ?? 0, x: e.clientX, y: e.clientY }];
    };
    canvas.addEventListener('pointerdown', e => {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      dispatchTouch('start', pt(e));
    });
    canvas.addEventListener('pointermove', e => dispatchTouch('move', pt(e)));
    canvas.addEventListener('pointerup', e => dispatchTouch('end', pt(e)));
    canvas.addEventListener('pointercancel', e => dispatchTouch('end', pt(e)));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('wheel', e => { for (const cb of wheelCbs) cb(e.deltaY); }, { passive: true });
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

// 文本输入：微信用原生 modal（editable），浏览器用 DOM 浮层
export function promptText(title, defaultValue) {
  return new Promise(resolve => {
    if (wxApi) {
      try {
        wxApi.showModal({
          title,
          editable: true,
          placeholderText: defaultValue || '',
          success: r => resolve(r.confirm ? ((r.content || '').trim() || defaultValue) : null),
          fail: () => resolve(null)
        });
      } catch (_) { resolve(null); }
      return;
    }
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
      background: 'rgba(8,14,26,0.6)', zIndex: '9999',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    });
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#fff8ec', borderRadius: '14px', padding: '22px 26px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.35)', textAlign: 'center', minWidth: '260px'
    });
    const label = document.createElement('div');
    label.textContent = title;
    Object.assign(label.style, { fontSize: '17px', fontWeight: 'bold', color: '#4a3b28', marginBottom: '12px' });
    const input = document.createElement('input');
    input.value = defaultValue || '';
    input.maxLength = 8;
    Object.assign(input.style, {
      width: '220px', fontSize: '18px', padding: '8px 10px', borderRadius: '8px',
      border: '2px solid #e2c893', outline: 'none', textAlign: 'center', display: 'block'
    });
    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '14px';
    const mkBtn = (text, bg) => {
      const b = document.createElement('button');
      b.textContent = text;
      Object.assign(b.style, {
        fontSize: '16px', fontWeight: 'bold', color: '#fff', background: bg,
        border: 'none', borderRadius: '8px', padding: '9px 22px', margin: '0 6px', cursor: 'pointer'
      });
      return b;
    };
    const done = val => { overlay.remove(); resolve(val); };
    const okBtn = mkBtn('确定', '#ff9f43');
    const cancelBtn = mkBtn('取消', '#8fa3bd');
    okBtn.onclick = () => done((input.value.trim() || defaultValue || '').slice(0, 8));
    cancelBtn.onclick = () => done(null);
    input.onkeydown = e => { if (e.key === 'Enter') okBtn.click(); };
    btnRow.appendChild(cancelBtn); btnRow.appendChild(okBtn);
    card.appendChild(label); card.appendChild(input); card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    input.focus();
  });
}

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
