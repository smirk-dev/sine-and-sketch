'use strict';
/* ===================================================================
   2. Sketch -> equation fitting (Fourier / cosine series)
   =================================================================== */
const r3 = v => { v = Math.round(v * 1000) / 1000; return Object.is(v, -0) ? 0 : v; };
const f3 = v => String(r3(v));

function poly(c0, terms) {
  let out = '';
  const push = (c, s) => {
    const a = Math.abs(c);
    if (a < 0.0005) return;
    const body = s ? ((r3(a) === 1 ? '' : f3(a)) + s) : f3(a);
    out += out ? (c < 0 ? ' - ' : ' + ') + body : (c < 0 ? '-' : '') + body;
  };
  push(c0, '');
  for (const t of terms) push(t.c, t.s);
  return out || '0';
}

function resample(pts, n, closed) {
  const P = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  const out = []; let seg = 1;
  for (let j = 0; j < n; j++) {
    const s = closed ? L * j / n : L * (j + 0.5) / n;
    while (seg < P.length - 1 && cum[seg] < s) seg++;
    const d = cum[seg] - cum[seg - 1] || 1, u = (s - cum[seg - 1]) / d;
    out.push([P[seg - 1][0] + (P[seg][0] - P[seg - 1][0]) * u, P[seg - 1][1] + (P[seg][1] - P[seg - 1][1]) * u]);
  }
  return { pts: out, L };
}

function fitStroke(pts, K, smart, id) {
  const N = 256;
  const first = pts[0], last = pts[pts.length - 1];
  let L0 = 0;
  for (let i = 1; i < pts.length; i++) L0 += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const chord = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const closed = chord < 0.12 * L0;
  const tag = `# ink:${id}`;

  if (smart && !closed) {
    const dx = last[0] - first[0], dy = last[1] - first[1];
    let dev = 0;
    for (const p of pts) dev = Math.max(dev, Math.abs((p[0] - first[0]) * dy - (p[1] - first[1]) * dx) / chord);
    if (dev < 0.03 * chord) {
      if (Math.abs(dx) < 0.02 * Math.abs(dy)) {
        const xc = (first[0] + last[0]) / 2, lo = Math.min(first[1], last[1]), hi = Math.max(first[1], last[1]);
        return { header: `${tag} · vertical line`, line: `x = ${f3(xc)}  y:[${f3(lo)}, ${f3(hi)}]` };
      }
      const m = dy / dx, c = first[1] - m * first[0], lo = Math.min(first[0], last[0]), hi = Math.max(first[0], last[0]);
      return { header: `${tag} · straight line`, line: `y = ${poly(0, [{ c: m, s: 'x' }, { c, s: '' }])}  x:[${f3(lo)}, ${f3(hi)}]`.replace(/ x \+/, ' +') };
    }
  }
  const rs = resample(pts, N, closed);
  const S = rs.pts;
  if (smart && closed) {
    const cx = S.reduce((a, p) => a + p[0], 0) / N, cy = S.reduce((a, p) => a + p[1], 0) / N;
    const rad = S.map(p => Math.hypot(p[0] - cx, p[1] - cy));
    const r = rad.reduce((a, b) => a + b, 0) / N;
    if (Math.max(...rad.map(v => Math.abs(v - r))) < 0.08 * r) {
      return { header: `${tag} · circle`, line: `(${poly(cx, [{ c: r, s: 'cos(t)' }])}, ${poly(cy, [{ c: r, s: 'sin(t)' }])}) t:[0, 2pi]` };
    }
  }
  const k = Math.max(1, Math.min(K, N / 2 - 1));
  const ser = (vals) => {
    const c0 = vals.reduce((a, b) => a + b, 0) / N, terms = [];
    for (let h = 1; h <= k; h++) {
      let a = 0, b = 0;
      for (let j = 0; j < N; j++) {
        if (closed) { const ang = h * TAU * j / N; a += vals[j] * Math.cos(ang); b += vals[j] * Math.sin(ang); }
        else a += vals[j] * Math.cos(h * PI * (j + 0.5) / N);
      }
      const arg = h === 1 ? 't' : `${h}t`;
      terms.push({ c: 2 * a / N, s: `cos(${arg})` });
      if (closed) terms.push({ c: 2 * b / N, s: `sin(${arg})` });
    }
    return poly(c0, terms);
  };
  const ex = ser(S.map(p => p[0])), ey = ser(S.map(p => p[1]));
  return {
    header: `${tag} · ${closed ? 'closed' : 'open'} stroke · ${k} harmonics · ${closed ? 'Fourier series' : 'cosine series'}`,
    line: `(${ex}, ${ey}) t:[0, ${closed ? '2pi' : 'pi'}]`,
  };
}

