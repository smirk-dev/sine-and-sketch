'use strict';
/* ===================================================================
   4. Exporters: SVG, PDF (vector), PSD, ORA(zip), downloads
   =================================================================== */
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const enc = new TextEncoder();

const LAYER_NAMES = { grid: 'Grid & axes', ink: 'Raw sketch', curves: 'Equation curves', shapes: 'Shapes' };
const LAYER_ORDER = ['grid', 'ink', 'curves', 'shapes'];

function sceneToSVG(sc) {
  const n = v => +v.toFixed(2);
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${sc.w}" height="${sc.h}" viewBox="0 0 ${sc.w} ${sc.h}">\n`;
  if (sc.bg) s += `<g id="paper" inkscape:groupmode="layer" inkscape:label="Paper"><rect width="${sc.w}" height="${sc.h}" fill="${sc.bg}"/></g>\n`;
  for (const layer of LAYER_ORDER) {
    const its = sc.items.filter(i => i.layer === layer);
    if (!its.length) continue;
    s += `<g id="${layer}" inkscape:groupmode="layer" inkscape:label="${esc(LAYER_NAMES[layer])}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
    let clipOpen = false;
    for (const it of its) {
      if (it.type === 'text') {
        const anchor = it.align === 'right' ? 'end' : it.align === 'center' ? 'middle' : 'start';
        s += `<text x="${n(it.x)}" y="${n(it.y)}" font-family="monospace" font-size="${it.size}" text-anchor="${anchor}" fill="${it.color}" stroke="none">${esc(it.s)}</text>\n`;
        continue;
      }
      if (it.type === 'clip') { s += `<clipPath id="imgclip"><rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"/></clipPath><g clip-path="url(#imgclip)">
`; clipOpen = true; continue; }
      if (it.type === 'rect') { s += `<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" fill="${it.fill}" stroke="none"/>
`; continue; }
      if (it.type === 'ell') {
        const op = it.alpha !== undefined && it.alpha < 1 ? ` fill-opacity="${n(it.alpha)}" stroke-opacity="${n(it.alpha)}"` : '';
        s += `<ellipse cx="${n(it.cx)}" cy="${n(it.cy)}" rx="${n(it.rx)}" ry="${n(it.ry)}"` + (it.rot ? ` transform="rotate(${n(it.rot * 180 / Math.PI)} ${n(it.cx)} ${n(it.cy)})"` : '') +
          ` fill="${it.fill || 'none'}" stroke="${it.stroke || 'none'}"` + (it.stroke ? ` stroke-width="${n(it.width)}"` : '') + `${op}/>
`;
        continue;
      }
      const a = `stroke="${it.color}" stroke-width="${n(it.width)}"` + (it.alpha !== undefined && it.alpha < 1 ? ` stroke-opacity="${n(it.alpha)}"` : '') + (it.dash ? ` stroke-dasharray="${it.dash.map(n).join(' ')}"` : '');
      if (it.type === 'line') s += `<line x1="${n(it.x1)}" y1="${n(it.y1)}" x2="${n(it.x2)}" y2="${n(it.y2)}" ${a}/>\n`;
      else { const p = []; for (let i = 0; i < it.pts.length; i += 2) p.push(`${n(it.pts[i])},${n(it.pts[i + 1])}`); s += `<polyline points="${p.join(' ')}" ${a}/>\n`; }
    }
    s += '</g>\n';
  }
  return s + '</svg>\n';
}

function sceneToPDF(sc) {
  const k = 0.75, W = +(sc.w * k).toFixed(2), H = +(sc.h * k).toFixed(2);
  const n = v => (+v.toFixed(2)).toString();
  const rgb = c => hex2rgb(c).map(v => (v / 255).toFixed(3)).join(' ');
  const gstates = new Map();
  const gs = a => { const key = Math.round(a * 100); if (!gstates.has(key)) gstates.set(key, 'G' + key); return gstates.get(key); };
  let c = `${k} 0 0 -${k} 0 ${H} cm\n1 J 1 j\n`;
  if (sc.bg) c += `/${gs(1)} gs ${rgb(sc.bg)} rg 0 0 ${sc.w} ${sc.h} re f\n`;
  const pdfStr = s => s.replace(/[\\()]/g, '\\$&');
  let clips = 0;
  for (const it of sc.items) {
    c += `/${gs(it.alpha === undefined ? 1 : it.alpha)} gs\n`;
    if (it.type === 'text') {
      const wdt = 0.6 * it.size * it.s.length, x = it.align === 'right' ? it.x - wdt : it.align === 'center' ? it.x - wdt / 2 : it.x;
      c += `${rgb(it.color)} rg BT /F1 ${n(it.size)} Tf 1 0 0 -1 ${n(x)} ${n(it.y)} Tm (${pdfStr(it.s)}) Tj ET\n`;
      continue;
    }
    if (it.type === 'clip') { c += `q ${n(it.x)} ${n(it.y)} ${n(it.w)} ${n(it.h)} re W n
`; clips++; continue; }
    if (it.type === 'rect') { c += `${rgb(it.fill)} rg ${n(it.x)} ${n(it.y)} ${n(it.w)} ${n(it.h)} re f
`; continue; }
    if (it.type === 'ell') {
      const kk = 0.5522847498, cs = Math.cos(it.rot || 0), sn = Math.sin(it.rot || 0), rx = it.rx, ry = it.ry;
      c += `q ${n(cs)} ${n(sn)} ${n(-sn)} ${n(cs)} ${n(it.cx)} ${n(it.cy)} cm
`;
      if (it.fill) c += `${rgb(it.fill)} rg
`;
      if (it.stroke) c += `${rgb(it.stroke)} RG ${n(it.width)} w [] 0 d
`;
      c += `${n(rx)} 0 m ${n(rx)} ${n(kk * ry)} ${n(kk * rx)} ${n(ry)} 0 ${n(ry)} c ${n(-kk * rx)} ${n(ry)} ${n(-rx)} ${n(kk * ry)} ${n(-rx)} 0 c ` +
        `${n(-rx)} ${n(-kk * ry)} ${n(-kk * rx)} ${n(-ry)} 0 ${n(-ry)} c ${n(kk * rx)} ${n(-ry)} ${n(rx)} ${n(-kk * ry)} ${n(rx)} 0 c h ${it.fill && it.stroke ? 'B' : it.fill ? 'f' : 'S'}
Q
`;
      continue;
    }
    c += `${rgb(it.color)} RG ${n(it.width)} w ${it.dash ? `[${it.dash.map(n).join(' ')}] 0 d` : '[] 0 d'}\n`;
    if (it.type === 'line') c += `${n(it.x1)} ${n(it.y1)} m ${n(it.x2)} ${n(it.y2)} l S\n`;
    else { c += `${n(it.pts[0])} ${n(it.pts[1])} m `; for (let i = 2; i < it.pts.length; i += 2) c += `${n(it.pts[i])} ${n(it.pts[i + 1])} l `; c += 'S\n'; }
  }
  while (clips-- > 0) c += 'Q\n';
  const objs = [];
  const gsKeys = [...gstates.entries()];
  const gsRes = gsKeys.map(([a, name], i) => `/${name} ${6 + i} 0 R`).join(' ');
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /ExtGState << ${gsRes} >> >> >>`;
  objs[4] = `<< /Length ${c.length} >>\nstream\n${c}endstream`;
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';
  gsKeys.forEach(([a], i) => { objs[6 + i] = `<< /Type /ExtGState /CA ${a / 100} /ca ${a / 100} >>`; });
  let out = '%PDF-1.4\n'; const offs = [];
  for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xr = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF\n`;
  return new Blob([out], { type: 'application/pdf' });
}

function concat(chunks) {
  let len = 0; for (const c of chunks) len += c.length;
  const out = new Uint8Array(len); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
const be16 = v => new Uint8Array([(v >> 8) & 255, v & 255]);
const be32 = v => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const ascii = s => Uint8Array.from(s, ch => ch.charCodeAt(0));

function buildPSD(layers, W, H, merged) {
  const planes = (rgba, withAlpha) => {
    const n = W * H, a = new Uint8Array(n), r = new Uint8Array(n), g = new Uint8Array(n), b = new Uint8Array(n);
    for (let i = 0; i < n; i++) { r[i] = rgba[i * 4]; g[i] = rgba[i * 4 + 1]; b[i] = rgba[i * 4 + 2]; a[i] = rgba[i * 4 + 3]; }
    return withAlpha ? [a, r, g, b] : [r, g, b];
  };
  const records = [], data = [];
  for (const L of layers) {
    const ch = planes(L.rgba, true), ids = [-1, 0, 1, 2];
    const nameBytes = enc.encode(L.name.slice(0, 31));
    const pascal = concat([new Uint8Array([nameBytes.length]), nameBytes]);
    const pad = new Uint8Array((4 - (pascal.length % 4)) % 4);
    const extra = concat([be32(0), be32(0), pascal, pad]);
    records.push(concat([
      be32(0), be32(0), be32(H), be32(W), be16(4),
      ...ids.map(id => concat([be16(id & 0xffff), be32(2 + W * H)])),
      ascii('8BIM'), ascii('norm'), new Uint8Array([255, 0, L.visible === false ? 2 : 0, 0]),
      be32(extra.length), extra,
    ]));
    for (const p of ch) data.push(be16(0), p);
  }
  let info = concat([be16(layers.length), ...records, ...data]);
  if (info.length % 2) info = concat([info, new Uint8Array(1)]);
  const layerSec = concat([be32(info.length), info, be32(0)]);
  const m = planes(merged, false);
  return concat([
    ascii('8BPS'), be16(1), new Uint8Array(6), be16(3), be32(H), be32(W), be16(8), be16(3),
    be32(0), be32(0), be32(layerSec.length), layerSec,
    be16(0), ...m,
  ]);
}

const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function makeZip(files) {
  const le16 = v => new Uint8Array([v & 255, (v >> 8) & 255]);
  const le32 = v => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
  const locals = [], centrals = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data);
    const lh = concat([le32(0x04034b50), le16(20), le16(0), le16(0), le16(0), le16(0x21), le32(crc), le32(f.data.length), le32(f.data.length), le16(name.length), le16(0), name]);
    centrals.push(concat([le32(0x02014b50), le16(20), le16(20), le16(0), le16(0), le16(0), le16(0x21), le32(crc), le32(f.data.length), le32(f.data.length), le16(name.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(off), name]));
    locals.push(lh, f.data); off += lh.length + f.data.length;
  }
  const cd = concat(centrals);
  return concat([...locals, cd, concat([le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length), le32(cd.length), le32(off), le16(0)])]);
}

function download(blobOrBytes, name, type) {
  const blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const canvasBlob = (cv, type, q) => new Promise(res => cv.toBlob(res, type, q));

