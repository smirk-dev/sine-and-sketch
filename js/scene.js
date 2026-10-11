'use strict';
/* ===================================================================
   scene.js — themes, the Cartesian frame, and scene builders.
   A "scene" is a flat list of drawable items in output pixels. The same scene
   feeds the canvas, SVG, PDF and the PSD/ORA layer renders.
   =================================================================== */
const THEMES = {
  light: { paper: '#fffdf8', gridMinor: '#ebe6d8', gridMajor: '#d3ccb8', axis: '#4b5163', label: '#7a7f8e', ink: '#1c4e80',
    palette: ['#d9480f', '#1c4e80', '#2b8a3e', '#a61e4d', '#6741d9', '#e67700', '#0b7285', '#5c940d'] },
  dark: { paper: '#141821', gridMinor: '#1d222d', gridMajor: '#2b3242', axis: '#9aa1b3', label: '#7d8497', ink: '#6cb0ff',
    palette: ['#ff8a5c', '#6cb0ff', '#69db7c', '#f783ac', '#b197fc', '#ffc078', '#66d9e8', '#c0eb75'] },
};
const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
const fmtNum = v => { const s = String(parseFloat(v.toPrecision(6))); return s === '-0' ? '0' : s; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hex2 = v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
const rgbHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);

/* a document background (0..1 rgb) picks the grid/palette set that stays readable on it */
function themeForBg(bg, fallback) {
  if (!bg) return fallback;
  const lum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
  return { ...(lum < 0.45 ? THEMES.dark : THEMES.light), paper: rgbHex(bg[0], bg[1], bg[2]) };
}

function makeFrame(o) {
  const { w, h, view } = o;
  return {
    w, h, view, S: o.S,
    sx: X => w / 2 + (X - view.cx) * view.scale, sy: Y => h / 2 - (Y - view.cy) * view.scale,
    xmin: view.cx - w / 2 / view.scale, xmax: view.cx + w / 2 / view.scale,
    ymin: view.cy - h / 2 / view.scale, ymax: view.cy + h / 2 / view.scale,
  };
}

function addGrid(sc, f, T) {
  const { w, h, view, S, sx, sy, xmin, xmax, ymin, ymax } = f;
  const major = niceStep(90 * S / view.scale), minor = major / 5;
  for (let i = Math.ceil(xmin / minor); i <= Math.floor(xmax / minor); i++) {
    if (i === 0) continue;
    const mj = i % 5 === 0, X = sx(i * minor);
    sc.items.push({ layer: 'grid', type: 'line', x1: X, y1: 0, x2: X, y2: h, color: mj ? T.gridMajor : T.gridMinor, width: (mj ? 1 : 0.75) * S });
  }
  for (let i = Math.ceil(ymin / minor); i <= Math.floor(ymax / minor); i++) {
    if (i === 0) continue;
    const mj = i % 5 === 0, Y = sy(i * minor);
    sc.items.push({ layer: 'grid', type: 'line', x1: 0, y1: Y, x2: w, y2: Y, color: mj ? T.gridMajor : T.gridMinor, width: (mj ? 1 : 0.75) * S });
  }
  const ax0 = sx(0), ay0 = sy(0);
  if (ymin <= 0 && ymax >= 0) sc.items.push({ layer: 'grid', type: 'line', x1: 0, y1: ay0, x2: w, y2: ay0, color: T.axis, width: 1.5 * S });
  if (xmin <= 0 && xmax >= 0) sc.items.push({ layer: 'grid', type: 'line', x1: ax0, y1: 0, x2: ax0, y2: h, color: T.axis, width: 1.5 * S });
  const fs = 11 * S, lab = (x, y, s, align) => sc.items.push({ layer: 'grid', type: 'text', x, y, s, align, size: fs, color: T.label });
  const xl = clamp(ay0 + 14 * S, 14 * S, h - 6 * S), yl = clamp(ax0 - 6 * S, 34 * S, w - 4 * S);
  for (let i = Math.ceil(xmin / major); i <= Math.floor(xmax / major); i++) if (i !== 0) lab(sx(i * major), xl, fmtNum(i * major), 'center');
  for (let i = Math.ceil(ymin / major); i <= Math.floor(ymax / major); i++) if (i !== 0) lab(yl, sy(i * major) + 4 * S, fmtNum(i * major), 'right');
  if (ymin <= 0 && ymax >= 0 && xmin <= 0 && xmax >= 0) lab(ax0 - 6 * S, ay0 + 14 * S, '0', 'right');
  if (ymin <= 0 && ymax >= 0) lab(w - 10 * S, ay0 - 8 * S, 'x', 'right');
  if (xmin <= 0 && xmax >= 0) lab(ax0 + 8 * S, 14 * S, 'y', 'left');
}

function newScene(o, T, bgDefault) {
  return { w: o.w, h: o.h, bg: o.bg === undefined ? bgDefault : o.bg, items: [] };
}

/* ---------- curves ---------- */
function buildCurvesScene(o, doc, inkStrokes) {
  const T = o.theme, f = makeFrame(o), { w, h, sx, sy, xmin, xmax, ymin, ymax, S } = f;
  const sc = newScene(o, T, T.paper);
  if (o.grid) addGrid(sc, f, T);
  for (const st of inkStrokes || []) {
    const pts = []; for (const p of st.pts) pts.push(sx(p[0]), sy(p[1]));
    sc.items.push({ layer: 'ink', type: 'poly', pts, color: T.ink, width: 1.6 * S, alpha: 0.5, dash: [5 * S, 4 * S] });
  }
  doc.items.forEach((it, idx) => {
    const color = T.palette[idx % T.palette.length];
    const count = it.k1 - it.k0 + 1, fam = count > 1;
    if (count > 6000) return;
    const alpha = fam ? clamp(2.4 / Math.sqrt(count), 0.25, 0.8) : 1, width = (fam ? 1 : 2.25) * S;
    const push = (pts) => { if (pts.length >= 4) sc.items.push({ layer: 'curves', type: 'poly', pts, color, width, alpha }); };
    const budget = Math.max(60, Math.floor(400000 / count));
    for (let k = it.k0; k <= it.k1; k++) {
      let pts = [];
      const brk = () => { push(pts); pts = []; };
      if (it.type === 'seg') {
        const v = it.fns.map(fn => fn(k));
        if (v.every(Number.isFinite)) push([sx(v[0]), sy(v[1]), sx(v[2]), sy(v[3])]);
      } else if (it.type === 'param' || it.type === 'polar') {
        const steps = Math.min(budget, 1600), a = it.type === 'param' ? it.t0 : it.a, b = it.type === 'param' ? it.t1 : it.b;
        for (let j = 0; j <= steps; j++) {
          const t = a + (b - a) * j / steps;
          let X, Y;
          if (it.type === 'param') { X = it.fx(t, k); Y = it.fy(t, k); }
          else { const r = it.f(t, k); X = r * Math.cos(t); Y = r * Math.sin(t); }
          if (Number.isFinite(X) && Number.isFinite(Y)) pts.push(clamp(sx(X), -1e5, 1e5), clamp(sy(Y), -1e5, 1e5)); else brk();
        }
        brk();
      } else if (it.type === 'explicit') {
        const horiz = it.axis === 'y';
        const lo = horiz ? xmin : ymin, hi = horiz ? xmax : ymax;
        const [a, b] = it.range ? [Math.min(...it.range), Math.max(...it.range)] : [lo, hi];
        const steps = Math.max(2, Math.ceil((horiz ? w : h) / (1.5 * S)));
        let prev = null;
        for (let j = 0; j <= steps; j++) {
          const v = a + (b - a) * j / steps, fv = it.f(v, k);
          if (!Number.isFinite(fv)) { brk(); prev = null; continue; }
          const X = horiz ? sx(v) : sx(fv), Y = horiz ? sy(fv) : sy(v), cmp = horiz ? Y : X, lim = (horiz ? h : w) * 4;
          if (prev !== null && Math.abs(cmp - prev) > lim) brk();
          pts.push(clamp(X, -1e5, 1e5), clamp(Y, -1e5, 1e5)); prev = cmp;
        }
        brk();
      }
    }
  });
  return sc;
}

/* ---------- swarm: circles / ellipses / segments / arcs indexed by k ---------- */
const SWARM_LIMIT = 160000;
function buildSwarmScene(o, doc) {
  const T = o.theme, f = makeFrame(o), { w, h, sx, sy, view, S } = f;
  const bgCss = doc.bg ? rgbHex(doc.bg[0], doc.bg[1], doc.bg[2]) : T.paper;
  const sc = newScene(o, T, bgCss);
  sc.truncated = false;
  if (o.grid) addGrid(sc, f, T);
  let budget = SWARM_LIMIT;
  const margin = 4 * S;
  doc.items.forEach((it, idx) => {
    const base = T.palette[idx % T.palette.length];
    for (let k = it.k0; k <= it.k1; k++) {
      if (--budget < 0) { sc.truncated = true; return; }
      const g = it.geom(k), st = it.style(k);
      let color = base;
      if (it.colorKind) {
        const c = it.colorKind === 'hsl' ? hslToRgb(st[0], st[1], st[2]) : st.slice(0, 3);
        color = rgbHex(c[0], c[1], c[2]);
      }
      const alpha = clamp(st[3], 0, 1), width = Math.max(0.2, st[4]) * S;
      if (!Number.isFinite(alpha) || !Number.isFinite(width) || !g.every(Number.isFinite)) continue;
      const comp = it.add ? 'lighter' : undefined;
      if (it.kind === 'circle' || it.kind === 'ellipse') {
        const rx = Math.abs(g[2]) * view.scale, ry = (it.kind === 'circle' ? Math.abs(g[2]) : Math.abs(g[3])) * view.scale;
        const cx = sx(g[0]), cy = sy(g[1]);
        if (cx + rx < -margin || cx - rx > w + margin || cy + Math.max(rx, ry) < -margin || cy - Math.max(rx, ry) > h + margin) continue;
        if (rx < 0.05 && ry < 0.05) continue;
        sc.items.push({ layer: 'shapes', type: 'ell', cx, cy, rx, ry, rot: it.kind === 'circle' ? 0 : -g[4],
          fill: it.mode !== 'stroke' ? color : null, stroke: it.mode !== 'fill' ? color : null, width, alpha, comp });
      } else if (it.kind === 'seg') {
        const x1 = sx(g[0]), y1 = sy(g[1]), x2 = sx(g[2]), y2 = sy(g[3]);
        if (Math.max(x1, x2) < -margin || Math.min(x1, x2) > w + margin || Math.max(y1, y2) < -margin || Math.min(y1, y2) > h + margin) continue;
        sc.items.push({ layer: 'shapes', type: 'poly', pts: [x1, y1, x2, y2], color, width, alpha, comp });
      } else {
        const r = Math.abs(g[2]), n = clamp(Math.ceil(Math.abs(g[4] - g[3]) * r * view.scale / 6), 6, 240), pts = [];
        for (let j = 0; j <= n; j++) { const a = g[3] + (g[4] - g[3]) * j / n; pts.push(sx(g[0] + r * Math.cos(a)), sy(g[1] + r * Math.sin(a))); }
        sc.items.push({ layer: 'shapes', type: 'poly', pts, color, width, alpha, comp });
      }
    }
  });
  return sc;
}

/* ---------- photo fit: shapes are stored in image pixels; the image is 10 units tall ---------- */
const PHOTO_UNITS = 10;
function buildPhotoScene(o, P) {
  const T = o.theme, f = makeFrame(o), { w, h, sx, sy, view } = f;
  const sc = newScene(o, T, T.paper);
  if (o.grid) addGrid(sc, f, T);
  if (!P || !P.W) return sc;
  const u = PHOTO_UNITS / P.H, d = P.shapes.data;
  const hw = P.W / 2 * u, hh = PHOTO_UNITS / 2;
  sc.items.push({ layer: 'shapes', type: 'rect', x: sx(-hw), y: sy(hh), w: 2 * hw * view.scale, h: PHOTO_UNITS * view.scale, fill: rgbHex(P.mean[0] / 255, P.mean[1] / 255, P.mean[2] / 255) });
  sc.items.push({ layer: 'shapes', type: 'clip', x: sx(-hw), y: sy(hh), w: 2 * hw * view.scale, h: PHOTO_UNITS * view.scale });
  for (let i = 0; i < P.shapes.n; i++) {
    const b = i * 8, X = (d[b] - P.W / 2) * u, Y = -(d[b + 1] - P.H / 2) * u;
    const cx = sx(X), cy = sy(Y), rx = d[b + 2] * u * view.scale, ry = d[b + 3] * u * view.scale, m = Math.max(rx, ry);
    if (cx + m < 0 || cx - m > w || cy + m < 0 || cy - m > h) continue;
    sc.items.push({ layer: 'shapes', type: 'ell', cx, cy, rx, ry, rot: d[b + 4], fill: P.shapes.hex[i], stroke: null, width: 0, alpha: 1 });
  }
  return sc;
}

/* ---------- canvas drawing ---------- */
function drawScene(ctx, sc, only) {
  if (sc.bg && (!only || only === 'paper')) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = sc.bg; ctx.fillRect(0, 0, sc.w, sc.h); }
  if (only === 'paper') return;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  let comp = 'source-over', dashed = false, clipped = 0;
  for (const it of sc.items) {
    if (only && only !== it.layer) continue;
    const c = it.comp || 'source-over';
    if (c !== comp) { ctx.globalCompositeOperation = c; comp = c; }
    ctx.globalAlpha = it.alpha === undefined ? 1 : it.alpha;
    if (it.type === 'text') {
      ctx.font = `${it.size}px ${MONO}`; ctx.textAlign = it.align; ctx.fillStyle = it.color; ctx.fillText(it.s, it.x, it.y); continue;
    }
    if (it.type === 'clip') { ctx.save(); ctx.beginPath(); ctx.rect(it.x, it.y, it.w, it.h); ctx.clip(); clipped++; continue; }
    if (it.type === 'rect') { ctx.fillStyle = it.fill; ctx.fillRect(it.x, it.y, it.w, it.h); continue; }
    if (it.type === 'ell') {
      ctx.beginPath(); ctx.ellipse(it.cx, it.cy, it.rx, it.ry, it.rot || 0, 0, TAU);
      if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(); }
      if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.lineWidth = it.width; ctx.stroke(); }
      continue;
    }
    ctx.strokeStyle = it.color; ctx.lineWidth = it.width;
    if (it.dash || dashed) { ctx.setLineDash(it.dash || []); dashed = !!it.dash; }
    ctx.beginPath();
    if (it.type === 'line') { ctx.moveTo(it.x1, it.y1); ctx.lineTo(it.x2, it.y2); }
    else { ctx.moveTo(it.pts[0], it.pts[1]); for (let i = 2; i < it.pts.length; i += 2) ctx.lineTo(it.pts[i], it.pts[i + 1]); }
    ctx.stroke();
  }
  while (clipped-- > 0) ctx.restore();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]);
}
