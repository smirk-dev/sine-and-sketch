'use strict';
/* ===================================================================
   app.js — UI: modes, canvas interaction, parsing/status, export.
   =================================================================== */
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), glcv = $('glcv'), stage = $('stage'), ta = $('eq');
const EMPTY_DOC = { items: [], errors: [], tags: new Set() };

const state = {
  mode: 'pixel', ready: false, view: null, ink: [], nextInk: 1, tool: 'pen', grid: true, showInk: true, smart: true, K: 14,
  docs: { pixel: null, swarm: null, curves: null }, w: 0, h: 0, dpr: 1, live: null, space: false,
  playing: false, t: 0, fast: false, pxErr: null, hintGone: false,
};
const views = {}, halfs = { pixel: 9, swarm: 6, curves: 11, photo: 11 };
const texts = { pixel: PRESETS.pixel['Marble'].text, swarm: PRESETS.swarm['Circle ring'].text, curves: PRESETS.curves['Blank'].text };
const hist = { pixel: { list: [], idx: -1 }, swarm: { list: [], idx: -1 }, curves: { list: [], idx: -1 }, photo: { list: [], idx: -1 } };

const currentThemeName = () => document.documentElement.dataset.theme === 'dark' ? 'dark'
  : document.documentElement.dataset.theme === 'light' ? 'light'
  : (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
const theme = () => THEMES[currentThemeName()];
const round3 = pts => pts.map(p => [r3(p[0]), r3(p[1])]);

function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); }

/* ---------------- history ---------------- */
function snapshot() { return { text: ta.value, ink: state.ink.map(s => ({ id: s.id, pts: s.pts })), next: state.nextInk }; }
function pushHistory() {
  const h = hist[state.mode], s = snapshot();
  if (h.idx >= 0 && h.list[h.idx].text === s.text && h.list[h.idx].ink.length === s.ink.length) return;
  h.list = h.list.slice(0, h.idx + 1); h.list.push(s); if (h.list.length > 100) h.list.shift();
  h.idx = h.list.length - 1; updateHistBtns();
}
function applySnapshot(s) { ta.value = s.text; if (state.mode === 'curves') { state.ink = s.ink.map(x => ({ ...x })); state.nextInk = s.next; } reparse(); updateHistBtns(); }
function undo() { const h = hist[state.mode]; if (h.idx > 0) { h.idx--; applySnapshot(h.list[h.idx]); } }
function redo() { const h = hist[state.mode]; if (h.idx < h.list.length - 1) { h.idx++; applySnapshot(h.list[h.idx]); } }
function updateHistBtns() { const h = hist[state.mode]; $('undoBtn').disabled = h.idx <= 0; $('redoBtn').disabled = h.idx >= h.list.length - 1; }

/* ---------------- parse + status ---------------- */
function statusHTML(parts, errors) {
  return parts + errors.map(e => `<span class="bad" data-line="${e.line}">line ${e.line + 1}: ${esc(e.msg)}</span>`).join('');
}
function reparse() {
  const m = state.mode;
  if (m === 'photo') return;
  texts[m] = ta.value;
  const T = theme(), st = $('status'), chips = $('chips');
  chips.textContent = '';
  const addChips = (items, palette) => items.forEach((it, i) => {
    const b = document.createElement('button'); b.className = 'cc'; b.dataset.line = it.line;
    const label = it.src.length > 60 ? it.src.slice(0, 58) + '…' : it.src;
    b.innerHTML = `<i style="background:${palette[i % palette.length]}"></i><span>${esc(label)}</span>`; b.title = it.src; chips.appendChild(b);
  });
  if (m === 'curves') {
    const d = state.docs.curves = parseCurves(ta.value), n = d.items.length;
    st.innerHTML = statusHTML(`<span class="${d.errors.length ? '' : 'good'}">${n} curve${n === 1 ? '' : 's'}${d.errors.length ? '' : ' · all equations valid'}</span>`, d.errors);
    addChips(d.items, T.palette);
  } else if (m === 'swarm') {
    const d = state.docs.swarm = parseSwarm(ta.value);
    let total = 0; d.items.forEach(it => total += it.k1 - it.k0 + 1);
    st.innerHTML = statusHTML(`<span class="${d.errors.length ? '' : 'good'}">${d.items.length} swarm${d.items.length === 1 ? '' : 's'} · ${total.toLocaleString()} shapes${d.errors.length ? '' : ' · all valid'}${total > SWARM_LIMIT ? ` · only the first ${SWARM_LIMIT.toLocaleString()} are drawn` : ''}</span>`, d.errors);
    addChips(d.items, T.palette);
  } else {
    const d = state.docs.pixel = parsePixel(ta.value);
    let extra = '';
    if (!d.errors.length) {
      state.pxErr = Pixel.compile(d);
      extra = state.pxErr ? '' : ' · compiled for the GPU';
    }
    const errs = d.errors.slice();
    if (state.pxErr && !d.errors.length) errs.push({ line: Math.max(...d.chanLine), msg: state.pxErr });
    const n = d.scope.list.length;
    st.innerHTML = statusHTML(`<span class="${errs.length ? '' : 'good'}">${n} helper function${n === 1 ? '' : 's'}${extra}</span>`, errs);
    if (!Pixel.ok && Pixel.error) st.innerHTML += `<span class="bad">${esc(Pixel.error)}</span>`;
  }
  updateFunctionBar();
  requestRender();
}

/* the function bar: the picture, always shown as its mathematical function */
let fbarCopy = () => '';
function updateFunctionBar() {
  const m = state.mode, body = $('fbarBody'), top = body.scrollTop;
  const d = Formula.describe(m, m === 'photo' ? '' : ta.value, Photo, state.docs[m]);
  $('fbarTag').textContent = d.tag; $('fbarTitle').textContent = d.title; body.innerHTML = d.html; fbarCopy = d.copy;
  body.scrollTop = top;
}
$('fbarCopy').onclick = () => { const s = fbarCopy(); if (s) copyText(s, 'Function copied'); else toast('Nothing to copy yet'); };
function selectLine(li) {
  const lines = ta.value.split('\n'); let start = 0;
  for (let i = 0; i < li; i++) start += lines[i].length + 1;
  ta.focus(); ta.setSelectionRange(start, start + (lines[li] || '').length);
}
$('status').addEventListener('click', e => { const l = e.target.dataset && e.target.dataset.line; if (l !== undefined) selectLine(+l); });
$('chips').addEventListener('click', e => { const b = e.target.closest('.cc'); if (b) selectLine(+b.dataset.line); });

/* ---------------- rendering ---------------- */
let rafPending = false;
function requestRender() { if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; render(); }); } }
function sceneOpts(extra) { return { w: state.w, h: state.h, view: state.view, theme: theme(), S: 1, grid: state.grid, ...extra }; }
function homeView(m, half) {
  if (m === 'photo' && Photo.W) {
    const ar = Photo.W / Photo.H;
    return { cx: 0, cy: 0, scale: Math.min(state.h / (PHOTO_UNITS * 1.1), state.w / (PHOTO_UNITS * ar * 1.1)) };
  }
  return { cx: 0, cy: 0, scale: Math.max(10, Math.min(state.w, state.h) / (2 * (half || 11))) };
}

function renderPixel() {
  if (Pixel.ok && Pixel.prog) {
    const q = +$('pxScale').value;
    Pixel.render(Math.round(state.w * state.dpr * q), Math.round(state.h * state.dpr * q), state.view, state.w, state.t, false);
  }
  const sc = buildCurvesScene(sceneOpts({ bg: null }), EMPTY_DOC, []);
  drawScene(ctx, sc);
}
let prevCv = null, prevCtx = null, prevN = -1;
function updatePreview() {
  const P = Photo;
  if (!P.W) return;
  if (!prevCv || prevCv.width !== P.W || prevCv.height !== P.H) { prevCv = document.createElement('canvas'); prevCv.width = P.W; prevCv.height = P.H; prevCtx = prevCv.getContext('2d'); prevN = -1; }
  if (prevN === P.shapes.n) return;
  prevN = P.shapes.n;
  const img = prevCtx.createImageData(P.W, P.H), d = img.data, c = P.cur, n = P.W * P.H;
  for (let i = 0; i < n; i++) { d[i * 4] = c[i * 3]; d[i * 4 + 1] = c[i * 3 + 1]; d[i * 4 + 2] = c[i * 3 + 2]; d[i * 4 + 3] = 255; }
  prevCtx.putImageData(img, 0, 0);
}
function renderPhoto() {
  const useBitmap = Photo.W && (phRunning || (state.fast && Photo.shapes.n > 12000));
  if (useBitmap) {
    updatePreview();
    drawScene(ctx, buildPhotoScene(sceneOpts({}), null));
    const v = state.view, hw = Photo.W / 2 * PHOTO_UNITS / Photo.H;
    const x = state.w / 2 + (-hw - v.cx) * v.scale, y = state.h / 2 - (PHOTO_UNITS / 2 - v.cy) * v.scale;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(prevCv, x, y, 2 * hw * v.scale, PHOTO_UNITS * v.scale);
  } else drawScene(ctx, buildPhotoScene(sceneOpts({}), Photo));
}
function render() {
  if (!state.w) return;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.clearRect(0, 0, state.w, state.h);
  const m = state.mode;
  if (m === 'pixel') renderPixel();
  else if (m === 'photo') renderPhoto();
  else if (m === 'swarm') {
    const d = state.docs.swarm || { items: [], bg: null };
    drawScene(ctx, buildSwarmScene(sceneOpts({ theme: themeForBg(d.bg, theme()) }), d));
  } else {
    const T = theme();
    drawScene(ctx, buildCurvesScene(sceneOpts({}), state.docs.curves || EMPTY_DOC, activeInk()));
    if (state.live && state.live.length > 1) {
      const v = state.view; ctx.strokeStyle = T.ink; ctx.lineWidth = 2.5; ctx.lineJoin = ctx.lineCap = 'round'; ctx.beginPath();
      state.live.forEach((p, i) => { const x = state.w / 2 + (p[0] - v.cx) * v.scale, y = state.h / 2 - (p[1] - v.cy) * v.scale; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
  }
}
function activeInk() { const d = state.docs.curves; return state.showInk && d ? state.ink.filter(s => d.tags.has(s.id)) : []; }
function resize() {
  const r = stage.getBoundingClientRect();
  state.w = Math.max(1, Math.round(r.width)); state.h = Math.max(1, Math.round(r.height)); state.dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(state.w * state.dpr); cv.height = Math.round(state.h * state.dpr);
  requestRender();
}
new ResizeObserver(resize).observe(stage);

/* pixel animation (runs only while visible) */
let stageVisible = true, loopOn = false, lastTs = 0;
function loopTick(ts) {
  if (!state.playing || state.mode !== 'pixel' || document.hidden || !stageVisible) { loopOn = false; return; }
  state.t += Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
  render(); requestAnimationFrame(loopTick);
}
function startLoop() { if (loopOn) return; loopOn = true; lastTs = performance.now(); requestAnimationFrame(loopTick); }
function setPlaying(on) {
  state.playing = on; $('playBtn').setAttribute('aria-pressed', on);
  if (on) startLoop();
}
$('playBtn').onclick = () => {
  const d = state.docs.pixel;
  if (!state.playing && d && !d.usesT) toast('This picture does not use t. Add t to a function to animate it.');
  setPlaying(!state.playing);
};
new IntersectionObserver(es => { stageVisible = es[0].isIntersecting; if (stageVisible && state.playing) startLoop(); }).observe(stage);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.playing) startLoop(); });
$('pxScale').onchange = requestRender;

/* ---------------- mode switching ---------------- */
function applyModeUI() {
  const m = state.mode, info = MODE_INFO[m];
  document.querySelectorAll('.modes button').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === m));
  document.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(m); });
  $('photoPanel').hidden = m !== 'photo'; ta.hidden = m === 'photo';
  glcv.hidden = m !== 'pixel';
  $('panelTitle').textContent = info.title; $('blurb').textContent = info.blurb;
  $('syntaxBox').hidden = !info.syntax; $('syntaxPre').textContent = info.syntax;
  $('txtSmall').textContent = info.txt; $('expNote').textContent = info.note;
  $('expGrid').checked = m === 'curves';
  $('presetSel').hidden = m === 'photo';
  const sel = $('presetSel'); sel.textContent = '';
  const first = document.createElement('option'); first.value = ''; first.textContent = 'Examples…'; sel.appendChild(first);
  Object.keys(PRESETS[m] || {}).forEach(n => { const o = document.createElement('option'); o.value = o.textContent = n; sel.appendChild(o); });
  document.querySelector('.fmt[data-fmt="svg"]').disabled = m === 'pixel';
  document.querySelector('.fmt[data-fmt="pdf"]').disabled = m === 'pixel';
  document.querySelector('.fmt[data-fmt="json"]').disabled = m === 'photo';
  $('copyBtn').hidden = m === 'photo';
  $('sweep').hidden = true;
  stage.classList.toggle('hand', m !== 'curves' || state.tool === 'hand');
  updateHint();
  if (m !== 'curves') $('status').textContent = '';
  if (m === 'photo') { $('chips').textContent = ''; $('status').textContent = ''; }
}
function updateHint() {
  const h = $('hint'), m = state.mode;
  if (m === 'curves') { h.textContent = 'Draw anywhere on the plane'; h.hidden = state.hintGone || state.ink.length > 0; }
  else if (m === 'photo') { h.textContent = 'Choose a photo, or rebuild what the Pixel studio shows'; h.hidden = !!Photo.W; }
  else h.hidden = true;
}
function setMode(m) {
  if (m === state.mode && state.ready) return;
  if (state.ready && state.mode !== 'photo') texts[state.mode] = ta.value;
  state.mode = m; state.ready = true;
  state.view = views[m] || (views[m] = homeView(m, halfs[m]));
  applyModeUI();
  if (m !== 'photo') { ta.value = texts[m]; reparse(); if (!hist[m].list.length) pushHistory(); }
  else updatePhotoUI();
  updateHistBtns(); requestRender();
  if (m === 'pixel' && state.playing) startLoop();
}
document.querySelector('.modes').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) setMode(b.dataset.mode); });

/* ---------------- pointer interaction ---------------- */
const toWorld = e => {
  const r = cv.getBoundingClientRect(), v = state.view;
  return [v.cx + (e.clientX - r.left - state.w / 2) / v.scale, v.cy - (e.clientY - r.top - state.h / 2) / v.scale];
};
let drag = null, fastTimer = 0;
function setFast() { state.fast = true; clearTimeout(fastTimer); fastTimer = setTimeout(() => { state.fast = false; requestRender(); }, 180); }
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  const pan = e.button === 1 || e.button === 2 || state.mode !== 'curves' || state.tool === 'hand' || state.space;
  if (pan) { drag = { mode: 'pan', x: e.clientX, y: e.clientY, cx: state.view.cx, cy: state.view.cy }; stage.classList.add('panning'); return; }
  if (e.button !== 0) return;
  state.live = [toWorld(e)]; drag = { mode: 'draw' }; state.hintGone = true; updateHint();
});
cv.addEventListener('pointermove', e => {
  const w = toWorld(e); $('readout').textContent = `x ${w[0].toFixed(2)} · y ${w[1].toFixed(2)}`;
  if (!drag) return;
  if (drag.mode === 'pan') {
    state.view.cx = drag.cx - (e.clientX - drag.x) / state.view.scale; state.view.cy = drag.cy + (e.clientY - drag.y) / state.view.scale; setFast(); requestRender();
  } else {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const p = toWorld(ev), l = state.live[state.live.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) * state.view.scale > 1.5) state.live.push(p);
    }
    requestRender();
  }
});
function endDrag() {
  if (!drag) return;
  const d = drag; drag = null; stage.classList.remove('panning');
  if (d.mode === 'draw') {
    const pts = state.live; state.live = null;
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (pts.length >= 3 && len * state.view.scale > 12) addInk(pts); else requestRender();
  }
}
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const v = state.view, r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const wx = v.cx + (mx - state.w / 2) / v.scale, wy = v.cy - (my - state.h / 2) / v.scale;
  v.scale = clamp(v.scale * Math.exp(-e.deltaY * 0.0015), 2, 20000);
  v.cx = wx - (mx - state.w / 2) / v.scale; v.cy = wy + (my - state.h / 2) / v.scale;
  setFast(); requestRender();
}, { passive: false });

/* curves: ink -> equation */
function addInk(pts) {
  const st = { id: state.nextInk++, pts: round3(pts) };
  state.ink.push(st);
  const f = fitStroke(st.pts, state.K, state.smart, st.id);
  ta.value = ta.value.replace(/\s*$/, '\n') + `${f.header}\n${f.line}\n`;
  ta.scrollTop = ta.scrollHeight;
  reparse(); pushHistory();
}
function refitAll() {
  const lines = ta.value.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*#\s*ink:(\d+)/.exec(lines[i]); if (!m) continue;
    const st = state.ink.find(s => s.id === +m[1]); if (!st) continue;
    const f = fitStroke(st.pts, state.K, state.smart, st.id);
    lines[i] = f.header;
    const nx = lines[i + 1];
    if (nx !== undefined && nx.trim() && !nx.trim().startsWith('#')) lines[i + 1] = f.line; else lines.splice(i + 1, 0, f.line);
  }
  ta.value = lines.join('\n'); reparse();
}

/* ---------------- toolbar ---------------- */
function setTool(t) {
  state.tool = t; $('toolPen').setAttribute('aria-pressed', t === 'pen'); $('toolHand').setAttribute('aria-pressed', t === 'hand');
  stage.classList.toggle('hand', t === 'hand' || state.mode !== 'curves');
}
$('toolPen').onclick = () => setTool('pen'); $('toolHand').onclick = () => setTool('hand');
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
$('clearBtn').onclick = () => {
  if (state.mode === 'curves') { state.ink = []; ta.value = ''; reparse(); pushHistory(); state.hintGone = false; updateHint(); }
  else loadPreset(state.mode, 'Blank');
};
$('gridBtn').onclick = () => { state.grid = !state.grid; $('gridBtn').setAttribute('aria-pressed', state.grid); requestRender(); };
$('inkBtn').onclick = () => { state.showInk = !state.showInk; $('inkBtn').setAttribute('aria-pressed', state.showInk); requestRender(); };
$('smartBtn').onclick = () => { state.smart = !state.smart; $('smartBtn').setAttribute('aria-pressed', state.smart); };
$('homeBtn').onclick = () => { state.view = views[state.mode] = homeView(state.mode, halfs[state.mode]); requestRender(); };
let kTimer = 0;
$('kRange').addEventListener('input', e => {
  state.K = +e.target.value; $('kVal').textContent = state.K; clearTimeout(kTimer);
  kTimer = setTimeout(() => { refitAll(); pushHistory(); }, 120);
});
$('themeBtn').onclick = () => {
  document.documentElement.dataset.theme = currentThemeName() === 'dark' ? 'light' : 'dark';
  reparse(); drawHero(); requestRender();
};
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => { reparse(); drawHero(); });

let inTimer = 0, histTimer = 0;
ta.addEventListener('input', () => {
  clearTimeout(inTimer); inTimer = setTimeout(reparse, state.mode === 'pixel' ? 220 : 90);
  clearTimeout(histTimer); histTimer = setTimeout(pushHistory, 700);
});

document.addEventListener('keydown', e => {
  const typing = e.target === ta || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
  if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (typing) return;
  if (e.code === 'Space') { state.space = true; stage.classList.add('hand'); if (e.target === document.body) e.preventDefault(); }
  else if (e.key === 'p' || e.key === 'P') setTool('pen');
  else if (e.key === 'h' || e.key === 'H') setTool('hand');
});
document.addEventListener('keyup', e => { if (e.code === 'Space') { state.space = false; stage.classList.toggle('hand', state.tool === 'hand' || state.mode !== 'curves'); } });

/* ---------------- presets + copy ---------------- */
function loadPreset(mode, name, scroll) {
  const p = PRESETS[mode][name]; if (!p) return;
  setMode(mode);
  if (mode === 'curves') { state.ink = []; state.hintGone = true; updateHint(); }
  ta.value = p.text; halfs[mode] = p.half;
  state.view = views[mode] = homeView(mode, p.half);
  state.t = 0;
  reparse(); pushHistory();
  if (mode === 'pixel') setPlaying(!!(state.docs.pixel && state.docs.pixel.usesT && /animated/i.test(name)));
  if (scroll) $('studio').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
}
$('presetSel').onchange = e => { const v = e.target.value; if (v) loadPreset(state.mode, v); e.target.value = ''; };
HERO_CHIPS.forEach(([m, n]) => {
  const b = document.createElement('button'); b.className = 'chip'; b.textContent = n; b.onclick = () => loadPreset(m, n, true); $('heroChips').appendChild(b);
});
async function copyText(s, msg) { try { await navigator.clipboard.writeText(s); toast(msg); } catch { ta.select(); toast('Select and copy manually'); } }
$('copyBtn').onclick = () => copyText(ta.value, 'Copied');
$('desmosBtn').onclick = () => {
  const d = state.docs.curves; if (!d) return;
  const out = [];
  for (const [k, v] of d.consts) out.push(`${k}=${v}`);
  for (const it of d.items) {
    if (it.k1 > it.k0) out.push(`k=[${it.k0}...${it.k1}]`);
    if (it.type === 'param') out.push(`(${it.exprs[0].trim()},${it.exprs[1].trim()}) {${f3(it.t0)}<=t<=${f3(it.t1)}}`);
    else if (it.type === 'polar') out.push(`r=${it.exprs[0].trim()} {${f3(it.a)}<=\\theta<=${f3(it.b)}}`);
    else if (it.type === 'explicit') out.push(`${it.axis}=${it.exprs[0].trim()}` + (it.range ? ` {${f3(Math.min(...it.range))}<=${it.iv}<=${f3(Math.max(...it.range))}}` : ''));
    else out.push(`polygon((${it.exprs[0].trim()},${it.exprs[1].trim()}),(${it.exprs[2].trim()},${it.exprs[3].trim()}))`);
  }
  copyText(out.join('\n'), 'Copied. Paste each line into Desmos');
};

/* ---------------- swarm variations (Hamid's sweep, then curate by eye) ---------------- */
const KNOB_RE = /^(\s*)([A-Za-z_]\w*)(\s*=\s*)(-?\d+(?:\.\d+)?)(\s*(?:#.*)?)$/;
function varyText(text) {
  return text.split('\n').map(line => {
    const m = KNOB_RE.exec(line);
    if (!m || m[2] === 'n' || /^(R|G|B|x|y|t|k)$/.test(m[2])) return line;
    const v = parseFloat(m[4]); let nv;
    if (Number.isInteger(v) && Math.abs(v) <= 12) { nv = 1 + Math.floor(Math.random() * (2 * Math.abs(v) + 1)); if (v < 0) nv = -nv; }
    else if (v === 0) nv = 0;
    else nv = +(v * (0.4 + Math.random() * 1.5)).toPrecision(4);
    return m[1] + m[2] + m[3] + nv + m[5];
  }).join('\n');
}
let sweepToken = 0;
function rollSweep() {
  const box = $('sweepGrid'), tok = ++sweepToken, base = ta.value;
  if (!text_has_knobs(base)) { toast('Add a constant line like  a = 3  and use it in the formulas. Vary re-rolls those.'); return; }
  $('sweep').hidden = false; box.textContent = '';
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('button'); b.className = 'vcell'; const c = document.createElement('canvas'); c.width = 220; c.height = 150;
    b.appendChild(c); box.appendChild(b); cells.push({ b, c, text: i === 0 ? base : varyText(base) });
  }
  cells[0].b.title = 'Your current version';
  let i = 0;
  (function next() {
    if (tok !== sweepToken || i >= cells.length) return;
    const { b, c, text } = cells[i++], d = parseSwarm(text), g = c.getContext('2d');
    if (!d.errors.length) {
      const k = c.width / state.w, v = { cx: state.view.cx, cy: state.view.cy, scale: state.view.scale * k };
      const sc = buildSwarmScene({ w: c.width, h: c.height, view: { cx: v.cx, cy: v.cy + 0, scale: v.scale }, theme: themeForBg(d.bg, theme()), S: 0.6, grid: false }, d);
      drawScene(g, sc);
    }
    b.onclick = () => { ta.value = text; reparse(); pushHistory(); };
    setTimeout(next, 0);
  })();
}
const text_has_knobs = t => t.split('\n').some(l => { const m = KNOB_RE.exec(l); return m && m[2] !== 'n'; });
$('varyBtn').onclick = rollSweep;
$('sweepRoll').onclick = rollSweep;
$('sweepClose').onclick = () => { $('sweep').hidden = true; sweepToken++; };

/* ---------------- splitter ---------------- */
(() => {
  const sp = $('splitter'), studio = $('studio');
  let dragging = false;
  const set = px => { const r = studio.getBoundingClientRect(); studio.style.setProperty('--left', clamp(px, r.width * 0.3, r.width * 0.75) + 'px'); };
  sp.addEventListener('pointerdown', e => { dragging = true; sp.setPointerCapture(e.pointerId); });
  sp.addEventListener('pointermove', e => { if (dragging) set(e.clientX - studio.getBoundingClientRect().left); });
  sp.addEventListener('pointerup', () => dragging = false);
  sp.addEventListener('keydown', e => {
    const cur = stage.getBoundingClientRect().width;
    if (e.key === 'ArrowLeft') { set(cur - 40); e.preventDefault(); } else if (e.key === 'ArrowRight') { set(cur + 40); e.preventDefault(); }
  });
})();

/* ---------------- photo studio ---------------- */
let phRunning = false, photoSrc = null;
function updatePhotoUI() {
  const P = Photo;
  $('phNv').textContent = P.N.toLocaleString(); $('phRv').textContent = P.rMaxPct + '%';
  $('phBar').style.width = (P.W ? Math.min(100, 100 * P.shapes.n / P.N) : 0) + '%';
  $('phStat').textContent = P.W ? `${P.shapes.n.toLocaleString()} / ${P.N.toLocaleString()} shapes · ${P.fidelity().toFixed(1)}% match${P.name ? ' · ' + P.name : ''}` : 'No picture yet';
  $('phGo').textContent = phRunning ? 'Pause' : (P.shapes.n > 0 && P.shapes.n < P.N ? 'Resume' : 'Start');
  updateHint(); updateFunctionBar();
}
function stopPhoto() { phRunning = false; updatePhotoUI(); requestRender(); }
let lastStat = 0;
function photoTick() {
  if (!phRunning) return;
  const more = Photo.step(26);
  const now = performance.now();
  if (now - lastStat > 120 || !more) { lastStat = now; updatePhotoUI(); }
  render();
  if (!more) { phRunning = false; updatePhotoUI(); toast(Photo.shapes.n >= Photo.N ? 'Done. Every circle is now a vector.' : 'No more shapes improve the match.'); requestRender(); return; }
  requestAnimationFrame(photoTick);
}
function startPhoto() {
  if (!Photo.W) { toast('Choose a photo first'); return; }
  if (Photo.shapes.n >= Photo.N) { toast('Raise "Shapes" or press Restart'); return; }
  phRunning = true; updatePhotoUI(); requestAnimationFrame(photoTick);
}
function loadPhotoSource(src, name) {
  phRunning = false;
  photoSrc = src;
  Photo.load(src, +$('phRes').value, name);
  prevN = -1;
  state.view = views.photo = homeView('photo');
  updatePhotoUI(); requestRender();
}
function loadPhotoFile(f) {
  if (!f || !/^image\//.test(f.type)) { toast('That is not an image file'); return; }
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => { URL.revokeObjectURL(url); loadPhotoSource(img, f.name.replace(/\.[^.]+$/, '')); };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read that image'); };
  img.src = url;
}
$('photoFile').addEventListener('change', e => { loadPhotoFile(e.target.files[0]); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => [$('drop'), stage].forEach(el => el.addEventListener(ev, e => { if (state.mode !== 'photo') return; e.preventDefault(); $('drop').classList.add('over'); })));
['dragleave', 'drop'].forEach(ev => [$('drop'), stage].forEach(el => el.addEventListener(ev, e => { $('drop').classList.remove('over'); if (ev === 'drop' && state.mode === 'photo') { e.preventDefault(); loadPhotoFile(e.dataTransfer.files[0]); } })));
$('photoFromPixel').onclick = () => {
  if (!Pixel.ok || !Pixel.prog) { toast('The Pixel studio has no picture to use'); return; }
  const W = 640, H = Math.max(8, Math.round(640 * state.h / state.w));
  Pixel.render(W, H, texts.pixel && views.pixel ? views.pixel : homeView('pixel', halfs.pixel), state.w, state.t, false);
  loadPhotoSource(Pixel.canvas, 'pixel-studio');
};
$('phGo').onclick = () => { if (phRunning) stopPhoto(); else startPhoto(); };
$('phReset').onclick = () => { phRunning = false; Photo.reset(); prevN = -1; updatePhotoUI(); requestRender(); };
$('phN').oninput = e => { Photo.N = +e.target.value; updatePhotoUI(); };
$('phR').oninput = e => { Photo.rMaxPct = +e.target.value; updatePhotoUI(); };
$('phStyle').onchange = e => { Photo.style = e.target.value; };
$('phQ').onchange = e => { Photo.cands = +e.target.value; };
$('phRes').onchange = e => { if (photoSrc) loadPhotoSource(photoSrc, Photo.name); };

/* ---------------- export ---------------- */
function exportOptions() {
  const paper = $('expPaper').value, m = state.mode;
  let T = THEMES[paper === 'dark' ? 'dark' : 'light'];
  if (m === 'swarm' && state.docs.swarm && state.docs.swarm.bg) T = themeForBg(state.docs.swarm.bg, T);
  let S = +$('expScale').value;
  while (state.w * S * state.h * S > 40e6 && S > 1) S--;
  if (m === 'pixel') while (S > 1 && Math.max(state.w, state.h) * S > Pixel.maxSize) S--;
  return { S, theme: T, bg: paper === 'clear' ? null : T.paper, grid: $('expGrid').checked, ink: $('expInk').checked };
}
function scaledView(S) { return { cx: state.view.cx, cy: state.view.cy, scale: state.view.scale * S }; }
function exportScene(o, bgOverride) {
  const S = o.S, base = { w: state.w * S, h: state.h * S, view: scaledView(S), theme: o.theme, S, grid: o.grid, bg: bgOverride === undefined ? o.bg : bgOverride };
  if (state.mode === 'swarm') return buildSwarmScene(base, state.docs.swarm);
  if (state.mode === 'photo') return buildPhotoScene(base, Photo);
  return buildCurvesScene(base, state.docs.curves, o.ink ? activeInk() : []);
}
function renderCanvas(sc, only) {
  const c = document.createElement('canvas'); c.width = sc.w; c.height = sc.h;
  drawScene(c.getContext('2d'), sc, only); return c;
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const canvasPixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;

/* the pixel studio has no vector scene: layers are the GPU picture and the plane */
function pixelLayers(o) {
  const S = o.S, W = Math.round(state.w * S), H = Math.round(state.h * S);
  Pixel.render(W, H, state.view, state.w, state.t, W * H > 2e6);
  const pic = document.createElement('canvas'); pic.width = W; pic.height = H;
  pic.getContext('2d').drawImage(Pixel.canvas, 0, 0);
  const layers = [{ key: 'picture', name: 'Picture', canvas: pic }];
  if (o.grid) {
    const sc = buildCurvesScene({ w: W, h: H, view: scaledView(S), theme: o.theme, S, grid: true, bg: null }, EMPTY_DOC, []);
    layers.push({ key: 'grid', name: LAYER_NAMES.grid, canvas: renderCanvas(sc, 'grid') });
  }
  const flat = document.createElement('canvas'); flat.width = W; flat.height = H;
  const fg = flat.getContext('2d'); layers.forEach(l => fg.drawImage(l.canvas, 0, 0));
  return { w: W, h: H, layers, flat };
}

async function doExport(fmt) {
  const o = exportOptions(), m = state.mode, base = `sine-and-sketch-${m}-${stamp()}`;
  if (o.S < +$('expScale').value) toast(`Scale reduced to ${o.S}× to stay within size limits`);
  if (fmt === 'txt') return download(new Blob([m === 'photo' ? Photo.table() : ta.value], { type: 'text/plain' }), base + '.txt');
  if (fmt === 'json') {
    texts[m] = ta.value;
    const proj = { app: 'sine-and-sketch', version: 2, mode: m, texts, ink: state.ink, nextInk: state.nextInk, views, halfs, K: state.K };
    return download(new Blob([JSON.stringify(proj)], { type: 'application/json' }), base + '.json');
  }
  let layers, W, H, flatCanvas;
  if (m === 'pixel') {
    if (!Pixel.prog) throw new Error('nothing to export yet');
    try {
      const p = pixelLayers(o); layers = p.layers; W = p.w; H = p.h; flatCanvas = p.flat;
    } finally { requestRender(); }
    if (fmt === 'png') return download(await canvasBlob(flatCanvas, 'image/png'), base + '.png');
    if (fmt === 'jpg') return download(await canvasBlob(flatCanvas, 'image/jpeg', 0.95), base + '.jpg');
  } else {
    if (fmt === 'svg') return download(new Blob([sceneToSVG(exportScene(o))], { type: 'image/svg+xml' }), base + '.svg');
    if (fmt === 'pdf') return download(sceneToPDF(exportScene(o, o.bg || '#ffffff')), base + '.pdf');
    if (fmt === 'png') return download(await canvasBlob(renderCanvas(exportScene(o)), 'image/png'), base + '.png');
    if (fmt === 'jpg') return download(await canvasBlob(renderCanvas(exportScene(o, o.bg || '#ffffff')), 'image/jpeg', 0.95), base + '.jpg');
    const sc = exportScene(o);
    const defs = [];
    if (o.bg) defs.push({ key: 'paper', name: 'Paper' });
    if (o.grid) defs.push({ key: 'grid', name: LAYER_NAMES.grid });
    if (m === 'curves' && o.ink && sc.items.some(i => i.layer === 'ink')) defs.push({ key: 'ink', name: LAYER_NAMES.ink });
    const mainKey = m === 'curves' ? 'curves' : 'shapes';
    defs.push({ key: mainKey, name: m === 'photo' ? 'Photo shapes' : LAYER_NAMES[mainKey] });
    layers = defs.map(d => ({ ...d, canvas: renderCanvas(sc, d.key) })); W = sc.w; H = sc.h;
    flatCanvas = renderCanvas(exportScene(o, o.bg || '#ffffff'));
    if (sc.truncated) toast(`Only the first ${SWARM_LIMIT.toLocaleString()} shapes were drawn`);
  }
  if (fmt === 'psd') {
    if (W > 30000 || H > 30000) return toast('Too large for PSD');
    return download(buildPSD(layers.map(l => ({ name: l.name, rgba: canvasPixels(l.canvas) })), W, H, canvasPixels(flatCanvas)), base + '.psd', 'image/vnd.adobe.photoshop');
  }
  if (fmt === 'ora') {
    const files = [{ name: 'mimetype', data: enc.encode('image/openraster') }], stack = [];
    for (const l of layers) {
      files.push({ name: `data/${l.key}.png`, data: new Uint8Array(await (await canvasBlob(l.canvas, 'image/png')).arrayBuffer()) });
      stack.unshift(`    <layer name="${esc(l.name)}" src="data/${l.key}.png" x="0" y="0" opacity="1.0" visibility="visible" composite-op="svg:src-over"/>`);
    }
    files.push({ name: 'mergedimage.png', data: new Uint8Array(await (await canvasBlob(flatCanvas, 'image/png')).arrayBuffer()) });
    files.splice(1, 0, { name: 'stack.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.3" w="${W}" h="${H}">\n  <stack>\n${stack.join('\n')}\n  </stack>\n</image>\n`) });
    return download(makeZip(files), base + '.ora', 'image/openraster');
  }
}
$('exportBox').addEventListener('click', async e => {
  const b = e.target.closest('.fmt'); if (!b || b.disabled) return;
  b.disabled = true;
  try { await doExport(b.dataset.fmt); toast(`Exported .${b.dataset.fmt}`); } catch (err) { console.error(err); toast('Export failed: ' + err.message); }
  b.disabled = false; applyExportEnable();
});
function applyExportEnable() {
  document.querySelector('.fmt[data-fmt="svg"]').disabled = state.mode === 'pixel';
  document.querySelector('.fmt[data-fmt="pdf"]').disabled = state.mode === 'pixel';
  document.querySelector('.fmt[data-fmt="json"]').disabled = state.mode === 'photo';
}
$('openFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (p.app !== 'sine-and-sketch') throw new Error('not a Sine & Sketch project');
    if (p.version === 1) { texts.curves = p.text || ''; p.mode = 'curves'; }
    else Object.assign(texts, p.texts || {});
    state.ink = p.ink || []; state.nextInk = p.nextInk || 1;
    if (p.K) { state.K = p.K; $('kRange').value = p.K; $('kVal').textContent = p.K; }
    if (p.halfs) Object.assign(halfs, p.halfs);
    if (p.views) Object.assign(views, p.views); else if (p.view) views.curves = p.view;
    const m = ['pixel', 'swarm', 'curves'].includes(p.mode) ? p.mode : 'curves';
    state.ready = false; state.hintGone = true; setMode(m); pushHistory(); toast('Project loaded');
  } catch (err) { toast('Could not open: ' + err.message); }
  e.target.value = '';
});

/* ---------------- hero animation ---------------- */
const heroCv = $('heroCv'), hctx = heroCv.getContext('2d');
let heroT = 0;
function drawHero() {
  const r = heroCv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (heroCv.width !== w * dpr) { heroCv.width = w * dpr; heroCv.height = h * dpr; }
  const T = theme(), v = { cx: 0, cy: 0, scale: Math.min(w, h) / 18 };
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0); hctx.clearRect(0, 0, w, h);
  drawScene(hctx, buildCurvesScene({ w, h, view: v, theme: T, S: 1, grid: true, bg: null }, EMPTY_DOC, []));
  const k = 2 + 3 * (0.5 - 0.5 * Math.cos(heroT * 0.35));
  const rose = (amp, kk, style, alpha, lw) => {
    hctx.lineWidth = lw; hctx.lineJoin = 'round'; hctx.strokeStyle = style; hctx.globalAlpha = alpha; hctx.beginPath();
    for (let i = 0; i <= 1400; i++) {
      const th = i / 1400 * TAU * 6, rr = amp * Math.cos(kk * th / 6), x = w / 2 + rr * Math.cos(th) * v.scale, y = h / 2 - rr * Math.sin(th) * v.scale;
      i ? hctx.lineTo(x, y) : hctx.moveTo(x, y);
    }
    hctx.stroke(); hctx.globalAlpha = 1;
  };
  rose(6.4, k, T.palette[0], 1, 2.4); rose(4, k + 1, T.palette[1], 0.5, 1.2);
  heroCv.parentElement.querySelector('figcaption').textContent = `r = 6.4 cos(${(k / 6).toFixed(2)}·θ)`;
}
const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
let heroVisible = true, heroRunning = false;
function heroLoop() {
  if (!heroVisible || document.hidden) { heroRunning = false; return; }
  heroRunning = true; heroT += 0.016; drawHero();
  if (!reduceMotion) requestAnimationFrame(heroLoop); else heroRunning = false;
}
new IntersectionObserver(es => { heroVisible = es[0].isIntersecting; if (heroVisible && !heroRunning) heroLoop(); }).observe(heroCv);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !heroRunning) heroLoop(); });
new ResizeObserver(drawHero).observe(heroCv);

/* ---------------- boot ---------------- */
Pixel.init(glcv);
resize();
setMode('pixel');
heroLoop();
window.SS = { state, views, texts, Photo, Pixel, setMode, loadPreset, doExport, parseCurves, parseSwarm, parsePixel, buildGLSL, buildSwarmScene, buildCurvesScene, buildPhotoScene,
  sceneToSVG, sceneToPDF, buildPSD, makeZip, fitStroke, addInk, varyText, loadPhotoSource, startPhoto, render };
