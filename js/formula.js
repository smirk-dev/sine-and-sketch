'use strict';
/* ===================================================================
   formula.js — every picture shown as its mathematical function.
   Pixel / Swarm / Curves: the equations as written, typeset.
   Photo: the exact painter's-algorithm function over the ellipse table.
   =================================================================== */
const Formula = {
  /* typeset one source line: drop comments, use real symbols */
  pretty(s) {
    return s.replace(/#.*$/, '').trim()
      .replace(/(?<![A-Za-z_])pi(?![A-Za-z_\d])/g, 'π').replace(/(?<![A-Za-z_])theta(?![A-Za-z_\d])/g, 'θ')
      .replace(/<=/g, '≤').replace(/>=/g, '≥')
      .replace(/(?<=[\w)\]π.])\s*\*\s*(?=[\w(π.])/g, '·')
      .replace(/\bsqrt\(/g, '√(');
  },

  lines(text) { return text.split('\n').map(l => Formula.pretty(l)).filter(Boolean); },

  /* HTML for a list of typeset lines: the left side of "name(args) = " is picked out */
  linesHTML(lines) {
    return lines.map(l => {
      const m = /^([A-Za-z_][\w]*(?:\([^)]*\))?\s*=)(?!=)(.*)$/.exec(l);
      return `<div class="fl">${m ? `<b>${esc(m[1])}</b>${esc(m[2])}` : esc(l)}</div>`;
    }).join('');
  },

  /* the Photo function: I(x, y) = colour of the last ellipse that contains (x, y) */
  photoHeader(P) {
    const hw = PHOTO_UNITS * P.W / P.H / 2, f = v => (Math.round(v * 100) / 100).toString();
    return [
      'I(x, y) = c[K(x, y)]        c[0] = (' + P.mean.join(', ') + ')',
      'K(x, y) = max { k ≤ N : E_k(x, y) ≤ 1 }        K = 0 if no ellipse contains (x, y)',
      'E_k(x, y) = [(x−X_k)cosθ_k + (y−Y_k)sinθ_k]² / RX_k²  +  [(x−X_k)sinθ_k − (y−Y_k)cosθ_k]² / RY_k²',
      `N = ${P.shapes.n.toLocaleString('en-US')}        −${f(hw)} ≤ x ≤ ${f(hw)},  −${PHOTO_UNITS / 2} ≤ y ≤ ${PHOTO_UNITS / 2}`,
    ];
  },
  photoRow(P, i) {
    const u = PHOTO_UNITS / P.H, d = P.shapes.data, b = i * 8, f = v => (Math.round(v * 1000) / 1000).toFixed(3).padStart(8);
    return String(i + 1).padStart(6) + f((d[b] - P.W / 2) * u) + f(-(d[b + 1] - P.H / 2) * u) + f(d[b + 2] * u) + f(d[b + 3] * u) + f(-d[b + 4])
      + '   (' + d[b + 5] + ', ' + d[b + 6] + ', ' + d[b + 7] + ')';
  },

  /* what the function bar shows: { tag, title, html, copy } */
  describe(mode, text, P, doc) {
    if (mode === 'photo') {
      if (!P.W) return { tag: 'I(x, y)', title: 'Load a photo and its function appears here.', html: '<div class="fl dim">A photo becomes one function: the colour of the last ellipse that covers each point.</div>', copy: () => '' };
      const n = P.shapes.n, head = Formula.photoHeader(P);
      const rows = ['     k       X_k     Y_k    RX_k    RY_k     θ_k   c_k = (R, G, B)'];
      const show = n <= 9 ? [...Array(n).keys()] : [0, 1, 2, 3, 4, 5, -1, n - 2, n - 1];
      for (const i of show) rows.push(i < 0 ? `   … ${(n - 8).toLocaleString('en-US')} more rows …` : Formula.photoRow(P, i));
      return {
        tag: 'I(x, y)', title: `a photo as one function over ${n.toLocaleString('en-US')} ellipses`,
        html: Formula.linesHTML(head.slice(0, 3)) + `<div class="fl dim">${esc(head[3])}</div><div class="ft">${esc(n ? rows.join('\n') : 'No ellipses yet. Press Start.')}</div>`,
        copy: () => head.join('\n') + '\n\n' + P.table(),
      };
    }
    const lines = Formula.lines(text);
    if (mode === 'pixel') {
      const t = doc && doc.usesT;
      return { tag: t ? 'I(x, y, t)' : 'I(x, y)', title: 'every pixel (x, y) gets the colour (R, G, B) from this network of functions', html: Formula.linesHTML(lines), copy: () => lines.join('\n') };
    }
    if (mode === 'swarm') {
      return { tag: 'P = ⋃ shape(k)', title: 'the picture is the union of every k-th shape below', html: Formula.linesHTML(lines) || '<div class="fl dim">Write a swarm and its formula appears here.</div>', copy: () => lines.join('\n') };
    }
    return { tag: 'C = {(x, y)}', title: 'the drawing is every point that satisfies these equations', html: lines.length ? Formula.linesHTML(lines) : '<div class="fl dim">Draw on the plane and its equations appear here.</div>', copy: () => lines.join('\n') };
  },
};
