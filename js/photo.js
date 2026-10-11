'use strict';
/* ===================================================================
   photo.js — turn a picture into thousands of coloured circles/ellipses.
   This is the automatic route to realism (Hamid's face images use 12,000
   circles, each given by trigonometric formulas). Here the same kind of
   object is found by error-guided painting instead of by hand-written formulas.
   =================================================================== */
const BLK = 16;
const Photo = {
  W: 0, H: 0, tgt: null, cur: null, pe: null, blk: null, bw: 0, bh: 0, ang: null, str: null, name: '',
  shapes: { n: 0, cap: 0, data: new Float32Array(0), hex: [] },
  mean: [128, 128, 128], N: 20000, style: 'ellipse', res: 480, cands: 8, rMaxPct: 22, totalErr: 0, srcCanvas: null,

  load(src, res, name) {
    const iw = src.naturalWidth || src.videoWidth || src.width, ih = src.naturalHeight || src.videoHeight || src.height;
    const sc = res / Math.max(iw, ih);
    this.W = Math.max(8, Math.round(iw * sc)); this.H = Math.max(8, Math.round(ih * sc)); this.name = name || '';
    const c = document.createElement('canvas'); c.width = this.W; c.height = this.H;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingQuality = 'high'; cx.drawImage(src, 0, 0, this.W, this.H);
    this.srcCanvas = c;
    this.tgt = cx.getImageData(0, 0, this.W, this.H).data;
    this._gradients();
    this.reset();
  },

  _gradients() {
    const { W, H, tgt } = this, n = W * H;
    let a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = 0.299 * tgt[i * 4] + 0.587 * tgt[i * 4 + 1] + 0.114 * tgt[i * 4 + 2];
    for (let pass = 0; pass < 2; pass++) {                       // two 5-tap box blurs, horizontal then vertical
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let d = -2; d <= 2; d++) s += a[y * W + Math.min(W - 1, Math.max(0, x + d))]; b[y * W + x] = s / 5; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let d = -2; d <= 2; d++) s += b[Math.min(H - 1, Math.max(0, y + d)) * W + x]; a[y * W + x] = s / 5; }
    }
    this.ang = new Float32Array(n); this.str = new Float32Array(n);
    const at = (x, y) => a[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const i = y * W + x;
      this.ang[i] = Math.atan2(gy, gx) + Math.PI / 2;               // direction ALONG the edge
      this.str[i] = Math.min(1, Math.hypot(gx, gy) / 160);
    }
  },

  reset() {
    if (!this.tgt) return;
    const { W, H, tgt } = this, n = W * H;
    let mr = 0, mg = 0, mb = 0;
    for (let i = 0; i < n; i++) { mr += tgt[i * 4]; mg += tgt[i * 4 + 1]; mb += tgt[i * 4 + 2]; }
    mr = Math.round(mr / n); mg = Math.round(mg / n); mb = Math.round(mb / n);
    this.mean = [mr, mg, mb];
    this.cur = new Uint8ClampedArray(n * 3); this.pe = new Float32Array(n);
    this.bw = Math.ceil(W / BLK); this.bh = Math.ceil(H / BLK); this.blk = new Float64Array(this.bw * this.bh);
    this.totalErr = 0;
    for (let i = 0; i < n; i++) {
      this.cur[i * 3] = mr; this.cur[i * 3 + 1] = mg; this.cur[i * 3 + 2] = mb;
      const e = (mr - tgt[i * 4]) ** 2 + (mg - tgt[i * 4 + 1]) ** 2 + (mb - tgt[i * 4 + 2]) ** 2;
      this.pe[i] = e; this.totalErr += e;
      this.blk[((i / W | 0) >> 4) * this.bw + ((i % W) >> 4)] += e;
    }
    this.shapes = { n: 0, cap: 0, data: new Float32Array(0), hex: [] };
  },

  _push(x, y, rx, ry, th, r, g, b) {
    const s = this.shapes;
    if (s.n >= s.cap) { const nc = Math.max(4096, s.cap * 2), d = new Float32Array(nc * 8); d.set(s.data); s.data = d; s.cap = nc; }
    const o = s.n * 8; s.data[o] = x; s.data[o + 1] = y; s.data[o + 2] = rx; s.data[o + 3] = ry; s.data[o + 4] = th; s.data[o + 5] = r; s.data[o + 6] = g; s.data[o + 7] = b;
    s.hex[s.n] = '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    s.n++;
  },

  /* walk the pixels inside an ellipse: evaluates (apply=false) the gain of painting it with its mean colour, or paints it */
  _scan(cx, cy, rx, ry, th, apply, col) {
    const { W, H, tgt, cur, pe, blk, bw } = this;
    const c = Math.cos(th), s = Math.sin(th), ix = 1 / (rx * rx), iy = 1 / (ry * ry);
    const ex = Math.hypot(rx * c, ry * s) + 1, ey = Math.hypot(rx * s, ry * c) + 1;
    const x0 = Math.max(0, Math.floor(cx - ex)), x1 = Math.min(W - 1, Math.ceil(cx + ex));
    const y0 = Math.max(0, Math.floor(cy - ey)), y1 = Math.min(H - 1, Math.ceil(cy + ey));
    let sr = 0, sg = 0, sb = 0, stt = 0, sold = 0, n = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, u = dx * c + dy * s, v = -dx * s + dy * c;
        if (u * u * ix + v * v * iy > 1) continue;
        const i = y * W + x;
        if (apply) {
          const e = (col[0] - tgt[i * 4]) ** 2 + (col[1] - tgt[i * 4 + 1]) ** 2 + (col[2] - tgt[i * 4 + 2]) ** 2;
          blk[(y >> 4) * bw + (x >> 4)] += e - pe[i]; this.totalErr += e - pe[i]; pe[i] = e;
          cur[i * 3] = col[0]; cur[i * 3 + 1] = col[1]; cur[i * 3 + 2] = col[2];
        } else {
          const r = tgt[i * 4], g = tgt[i * 4 + 1], b = tgt[i * 4 + 2];
          sr += r; sg += g; sb += b; stt += r * r + g * g + b * b; sold += pe[i]; n++;
        }
      }
    }
    if (apply) return null;
    if (n < 2) return null;
    return { gain: sold - (stt - (sr * sr + sg * sg + sb * sb) / n), col: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)] };
  },

  _addShape() {
    const { W, H, blk, bw, bh } = this;
    const i = this.shapes.n, p = i / this.N;
    const rMax = this.rMaxPct / 100 * Math.min(W, H), rMin = 1.15;
    const rBase = rMax * Math.pow(rMin / rMax, Math.pow(p, 0.3));
    let total = 0; for (let b = 0; b < blk.length; b++) total += Math.max(0, blk[b]);
    if (total <= 0) return false;
    let best = null;
    for (let attempt = 0, shrink = 1; attempt < 7 && !best; attempt++, shrink *= 0.62)
    for (let c = 0; c < this.cands; c++) {
      let r = Math.random() * total, b = 0;
      for (; b < blk.length - 1; b++) { r -= Math.max(0, blk[b]); if (r <= 0) break; }
      const px = Math.min(W - 0.01, ((b % bw) + Math.random()) * BLK), py = Math.min(H - 0.01, (((b / bw) | 0) + Math.random()) * BLK);
      const rr = Math.max(rMin, rBase * shrink) * (0.75 + 0.5 * Math.random());
      let rx = rr, ry = rr, th = 0;
      if (this.style === 'ellipse') {
        const pi = (py | 0) * W + (px | 0), el = 1 + 1.6 * Math.pow(this.str[pi], 0.8);
        rx = rr * el; ry = rr / Math.sqrt(el); th = this.ang[pi];
      }
      const res = this._scan(px, py, rx, ry, th, false);
      if (res && res.gain > 0 && (!best || res.gain > best.gain)) best = { gain: res.gain, col: res.col, px, py, rx, ry, th };
    }
    if (!best) return true;
    this._scan(best.px, best.py, best.rx, best.ry, best.th, true, best.col);
    this._push(best.px, best.py, best.rx, best.ry, best.th, best.col[0], best.col[1], best.col[2]);
    return true;
  },

  /* run for about ms milliseconds; returns true while there is more to do */
  step(ms) {
    if (!this.tgt) return false;
    const t0 = performance.now(); let fails = 0;
    while (this.shapes.n < this.N && performance.now() - t0 < ms) {
      const before = this.shapes.n;
      if (!this._addShape()) return false;
      if (this.shapes.n !== before) fails = 0;
      else if (++fails > 400) return false;
    }
    return this.shapes.n < this.N;
  },

  /* similarity to the source, 0..100 */
  fidelity() {
    if (!this.tgt) return 0;
    const rmse = Math.sqrt(this.totalErr / (3 * this.W * this.H));
    return Math.max(0, 100 * (1 - rmse / 255));
  },

  /* the shapes as a data table in plane units (the image is 10 units tall) */
  table() {
    const u = PHOTO_UNITS / this.H, d = this.shapes.data, rows = ['k, X, Y, RX, RY, ANGLE, R, G, B'];
    const f = v => (Math.round(v * 1000) / 1000).toString();
    for (let i = 0; i < this.shapes.n; i++) {
      const b = i * 8;
      rows.push([i + 1, f((d[b] - this.W / 2) * u), f(-(d[b + 1] - this.H / 2) * u), f(d[b + 2] * u), f(d[b + 3] * u), f(-d[b + 4]), d[b + 5], d[b + 6], d[b + 7]].join(', '));
    }
    return rows.join('\n');
  },
};
