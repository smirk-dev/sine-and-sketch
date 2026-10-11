'use strict';
/* ===================================================================
   engine.js — expression language shared by all four studios.
   Source text -> tokens -> AST -> JavaScript (swarm/curves) or GLSL (pixel).
   Only whitelisted names ever reach new Function(), so typed equations are safe.
   =================================================================== */
const PI = Math.PI, TAU = PI * 2;
const CONSTS0 = { pi: PI, tau: TAU, e: Math.E };

/* ---------- JS runtime ---------- */
const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123; return s - Math.floor(s); };
const h3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123; return s - Math.floor(s); };
const sm = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
  return lerp(lerp(h2(xi, yi), h2(xi + 1, yi), u), lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v);
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
  const L = (zz) => lerp(lerp(h3(xi, yi, zz), h3(xi + 1, yi, zz), u), lerp(h3(xi, yi + 1, zz), h3(xi + 1, yi + 1, zz), u), v);
  return lerp(L(zi), L(zi + 1), w);
}
function fbm2(x, y) {
  let s = 0, a = 0.5;
  for (let i = 0; i < 5; i++) { s += a * noise2(x, y); const nx = 1.6 * x - 1.2 * y + 3.1, ny = 1.2 * x + 1.6 * y + 1.7; x = nx; y = ny; a *= 0.5; }
  return s / 0.96875;
}
function fbm3(x, y, z) {
  let s = 0, a = 0.5;
  for (let i = 0; i < 5; i++) { s += a * noise3(x, y, z); x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; z = z * 2.03 + 3.1; a *= 0.5; }
  return s / 0.96875;
}
const M = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10, log2: Math.log2, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign, min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
  mod: (a, b) => ((a % b) + b) % b,
  saw: a => 2 * (a / TAU - Math.floor(a / TAU + 0.5)),
  fract: a => a - Math.floor(a),
  sec: a => 1 / Math.cos(a), csc: a => 1 / Math.sin(a), cot: a => 1 / Math.tan(a),
  clamp: (x, a, b) => Math.min(Math.max(x, a), b), mix: lerp,
  step: (e, x) => (x < e ? 0 : 1),
  smoothstep: (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); },
  gt: (a, b) => (a > b ? 1 : 0), lt: (a, b) => (a < b ? 1 : 0), sel: (c, a, b) => (c > 0 ? a : b),
  noise: noise2, noise3, fbm: fbm2, fbm3, hash: h2,
};
const ARITY = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, sinh: 1, cosh: 1, tanh: 1, sqrt: 1, abs: 1, exp: 1, ln: 1, log: 1, log2: 1,
  floor: 1, ceil: 1, round: 1, sign: 1, fract: 1, saw: 1, sec: 1, csc: 1, cot: 1,
  min: 2, max: 2, pow: 2, atan2: 2, hypot: 2, mod: 2, step: 2, gt: 2, lt: 2, noise: 2, fbm: 2, hash: 2,
  clamp: 3, mix: 3, smoothstep: 3, sel: 3, noise3: 3, fbm3: 3,
};
const LOOPS = new Set(['sum', 'prod', 'smax', 'smin']);
const RESERVED = new Set([...Object.keys(ARITY), ...LOOPS, ...Object.keys(CONSTS0),
  'x', 'y', 'r', 't', 'k', 'theta', 'seg', 'circle', 'ellipse', 'arc', 'bg', 'R', 'G', 'B', 'color', 'gray', 'fill', 'stroke', 'add']);

/* ---------- GLSL runtime ---------- */
const GLSL_PRELUDE = `
float h_saw(float a){ return 2.0*(a/6.28318530718 - floor(a/6.28318530718+0.5)); }
float h_pow(float a,float b){ return pow(abs(a),b); }
float h_ipow(float a,int n){ float r=1.0; for(int i=0;i<9;i++){ if(i>=n) break; r*=a; } return r; }
float h_hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float h_hash3(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123); }
float h_noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  float a=h_hash(i), b=h_hash(i+vec2(1.0,0.0)), c=h_hash(i+vec2(0.0,1.0)), d=h_hash(i+vec2(1.0,1.0));
  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y; }
float h_noise3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.0-2.0*f);
  float a=h_hash3(i), b=h_hash3(i+vec3(1,0,0)), c=h_hash3(i+vec3(0,1,0)), d=h_hash3(i+vec3(1,1,0));
  float e=h_hash3(i+vec3(0,0,1)), g=h_hash3(i+vec3(1,0,1)), h=h_hash3(i+vec3(0,1,1)), j=h_hash3(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y), mix(mix(e,g,u.x),mix(h,j,u.x),u.y), u.z); }
float h_fbm(vec2 p){ float s=0.0,a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<5;i++){ s+=a*h_noise(p); p=m*p+vec2(3.1,1.7); a*=0.5; } return s/0.96875; }
float h_fbm3(vec3 p){ float s=0.0,a=0.5;
  for(int i=0;i<5;i++){ s+=a*h_noise3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s/0.96875; }
float h_fin(float a){ return (isnan(a)||isinf(a)) ? 0.0 : a; }
`;
const GL_SPECIAL = {
  ln: a => `log(${a[0]})`, log: a => `(log(${a[0]})*0.4342944819)`, round: a => `floor(${a[0]}+0.5)`,
  pow: a => `h_pow(${a[0]},${a[1]})`, atan2: a => `atan(${a[0]},${a[1]})`, hypot: a => `length(vec2(${a[0]},${a[1]}))`,
  saw: a => `h_saw(${a[0]})`, sec: a => `(1.0/cos(${a[0]}))`, csc: a => `(1.0/sin(${a[0]}))`, cot: a => `(1.0/tan(${a[0]}))`,
  gt: a => `(${a[0]}>${a[1]}?1.0:0.0)`, lt: a => `(${a[0]}<${a[1]}?1.0:0.0)`, sel: a => `(${a[0]}>0.0?${a[1]}:${a[2]})`,
  noise: a => `h_noise(vec2(${a[0]},${a[1]}))`, noise3: a => `h_noise3(vec3(${a[0]},${a[1]},${a[2]}))`,
  fbm: a => `h_fbm(vec2(${a[0]},${a[1]}))`, fbm3: a => `h_fbm3(vec3(${a[0]},${a[1]},${a[2]}))`, hash: a => `h_hash(vec2(${a[0]},${a[1]}))`,
};

/* ---------- tokenizer + parser ---------- */
function normalize(s) {
  return s.replace(/π/g, 'pi').replace(/θ/g, 'theta').replace(/[×·]/g, '*').replace(/[−–]/g, '-')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/\*\*/g, '^').replace(/≤/g, '<=');
}
function tokenize(s) {
  s = s.trim();
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(.))/y;
  const out = [];
  while (re.lastIndex < s.length) {
    const m = re.exec(s);
    if (!m) break;
    if (m[1] !== undefined) out.push({ t: 'num', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
    else out.push({ t: 'op', v: m[3] });
  }
  return out;
}

/* ctx = { vars: Map(name -> code name), consts: Map, funcs: Map(name -> def) } */
function parseExpr(tokens, ctx) {
  let p = 0;
  const isOp = (v) => tokens[p] && tokens[p].t === 'op' && tokens[p].v === v;
  const known = (n) => ctx.vars.has(n) || ctx.consts.has(n) || n in CONSTS0;
  const lookup = (n) => ctx.vars.has(n) ? { n: 'var', code: ctx.vars.get(n) } : { n: 'num', v: ctx.consts.has(n) ? ctx.consts.get(n) : CONSTS0[n] };
  function split(name) {
    if (known(name)) return [name];
    for (let i = name.length - 1; i >= 1; i--) {
      if (known(name.slice(0, i))) { const rest = split(name.slice(i)); if (rest) return [name.slice(0, i), ...rest]; }
    }
    return null;
  }
  const startsFactor = () => { const t = tokens[p]; return t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '(')); };
  function expr() {
    let a = term();
    while (isOp('+') || isOp('-')) { const op = tokens[p++].v; a = { n: 'bin', op, a, b: term() }; }
    return a;
  }
  function term() {
    let a = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const op = tokens[p++].v; a = { n: 'bin', op, a, b: unary() }; }
      else if (startsFactor()) a = { n: 'bin', op: '*', a, b: unary() };
      else return a;
    }
  }
  function unary() {
    if (isOp('-')) { p++; return { n: 'neg', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power() {
    const a = atom();
    if (isOp('^')) { p++; return { n: 'bin', op: '^', a, b: unary() }; }
    return a;
  }
  function args() {
    const out = [];
    if (!isOp(')')) { for (;;) { out.push(expr()); if (isOp(',')) { p++; continue; } break; } }
    if (!isOp(')')) throw new Error('missing )');
    p++;
    return out;
  }
  function atom() {
    const t = tokens[p++];
    if (!t) throw new Error('expression ends too early');
    if (t.t === 'num') return { n: 'num', v: t.v };
    if (t.t === 'op' && t.v === '(') {
      const e = expr();
      if (!isOp(')')) throw new Error('missing )');
      p++; return e;
    }
    if (t.t === 'id') {
      const nameTok = t.v, nextIsParen = isOp('(');
      if (LOOPS.has(nameTok)) {
        if (!nextIsParen) throw new Error(`${nameTok} needs brackets: ${nameTok}(i, 1, 10, expression)`);
        p++;
        const v = tokens[p++];
        if (!v || v.t !== 'id' || !isOp(',')) throw new Error(`${nameTok}(i, from, to, expression) needs a loop variable first`);
        p++;
        const a = expr(); if (!isOp(',')) throw new Error('missing , after the start value'); p++;
        const b = expr(); if (!isOp(',')) throw new Error('missing , after the end value'); p++;
        const prev = ctx.vars.get(v.v); ctx.vars.set(v.v, 'v_' + v.v);
        const body = expr();
        if (prev === undefined) ctx.vars.delete(v.v); else ctx.vars.set(v.v, prev);
        if (!isOp(')')) throw new Error('missing )');
        p++;
        let lo, hi;
        try { lo = Math.round(evalConstAst(a)); hi = Math.round(evalConstAst(b)); } catch { throw new Error('loop bounds must be plain numbers'); }
        if (!(hi >= lo) || hi - lo > 4000) throw new Error('loop must run 1 to 4000 times');
        return { n: 'loop', op: nameTok, code: 'v_' + v.v, a: lo, b: hi, body };
      }
      if (nameTok in ARITY) {
        if (!nextIsParen) throw new Error(`${nameTok} needs brackets, like ${nameTok}(x)`);
        p++;
        const a = args();
        if (a.length !== ARITY[nameTok]) throw new Error(`${nameTok} takes ${ARITY[nameTok]} value${ARITY[nameTok] > 1 ? 's' : ''}`);
        return { n: 'call', f: nameTok, args: a };
      }
      if (ctx.funcs.has(nameTok)) {
        if (!nextIsParen) throw new Error(`${nameTok} needs brackets, like ${nameTok}(${ctx.funcs.get(nameTok).params.join(', ')})`);
        p++;
        const a = args(), def = ctx.funcs.get(nameTok);
        if (a.length !== def.params.length) throw new Error(`${nameTok} takes ${def.params.length} value${def.params.length === 1 ? '' : 's'}`);
        return { n: 'ucall', f: nameTok, args: a };
      }
      const parts = split(nameTok);
      if (!parts) throw new Error(`unknown name "${nameTok}"`);
      let node = lookup(parts[0]);
      for (let i = 1; i < parts.length; i++) node = { n: 'bin', op: '*', a: node, b: lookup(parts[i]) };
      return node;
    }
    throw new Error(`unexpected "${t.v}"`);
  }
  const ast = expr();
  if (p < tokens.length) throw new Error(`unexpected "${tokens[p].v}"`);
  return ast;
}

/* ---------- code generation ---------- */
const glNum = v => { const s = Number.isInteger(v) ? v.toFixed(1) : String(v); return v < 0 ? `(${s})` : s; };
function freeVars(n, set) {
  switch (n.n) {
    case 'var': set.add(n.code); break;
    case 'neg': freeVars(n.a, set); break;
    case 'bin': freeVars(n.a, set); freeVars(n.b, set); break;
    case 'call': case 'ucall': n.args.forEach(a => freeVars(a, set)); break;
    case 'loop': { const inner = new Set(); freeVars(n.body, inner); inner.delete(n.code); inner.forEach(c => set.add(c)); break; }
  }
}
function gen(n, T, G) {
  const gl = T === 'glsl';
  switch (n.n) {
    case 'num': return gl ? glNum(n.v) : (n.v < 0 ? `(${n.v})` : String(n.v));
    case 'var': return n.code;
    case 'neg': return `(-${gen(n.a, T, G)})`;
    case 'bin': {
      const a = gen(n.a, T, G);
      if (n.op === '^') {
        if (gl) {
          if (n.b.n === 'num' && Number.isInteger(n.b.v) && n.b.v >= 1 && n.b.v <= 9) return `h_ipow(${a},${n.b.v})`;
          return `h_pow(${a},${gen(n.b, T, G)})`;
        }
        return `Math.pow(${a},${gen(n.b, T, G)})`;
      }
      return `(${a}${n.op}${gen(n.b, T, G)})`;
    }
    case 'call': {
      const a = n.args.map(x => gen(x, T, G));
      if (gl) return GL_SPECIAL[n.f] ? GL_SPECIAL[n.f](a) : `${n.f}(${a.join(',')})`;
      return `M.${n.f}(${a.join(',')})`;
    }
    case 'ucall': return `U_${n.f}(${n.args.map(x => gen(x, T, G)).join(',')})`;
    case 'loop': {
      const body = gen(n.body, T, G);
      const init = n.op === 'sum' ? 0 : n.op === 'prod' ? 1 : n.op === 'smax' ? -1e30 : 1e30;
      const upd = n.op === 'sum' ? `acc+=${body};` : n.op === 'prod' ? `acc*=${body};`
        : n.op === 'smax' ? (gl ? `acc=max(acc,${body});` : `acc=Math.max(acc,${body});`) : (gl ? `acc=min(acc,${body});` : `acc=Math.min(acc,${body});`);
      if (!gl) return `(()=>{let acc=${init};for(let ${n.code}=${n.a};${n.code}<=${n.b};${n.code}++){${upd}}return acc;})()`;
      const fv = new Set(); freeVars(n.body, fv); fv.delete(n.code);
      const params = [...fv], id = 'h_loop' + (++G.n);
      G.helpers.push(`float ${id}(${params.map(p => 'float ' + p).join(',')}){ float acc=${glNum(init)}; for(int li=${n.a}; li<=${n.b}; li++){ float ${n.code}=float(li); ${upd} } return acc; }`);
      return `${id}(${params.join(',')})`;
    }
  }
  throw new Error('internal: bad node');
}
function evalConstAst(ast) { return new Function('M', `"use strict"; return ${gen(ast, 'js', {})};`)(M); }

/* ---------- scopes: constants + user functions ---------- */
function newScope() { return { consts: new Map(), funcs: new Map(), list: [] }; }
function parseAST(src, vars, scope) {
  const m = new Map(vars.map(v => [v, 'v_' + v]));
  return parseExpr(tokenize(normalize(src)), { vars: m, consts: scope.consts, funcs: scope.funcs });
}
const jsDefs = scope => scope.list.map(d => `const U_${d.name}=(${d.params.map(p => 'v_' + p).join(',')})=>${d.js};`).join('');
function compileJSMulti(srcs, vars, scope) {
  const codes = srcs.map(s => gen(parseAST(s, vars, scope), 'js', {}));
  return new Function('M', `"use strict";${jsDefs(scope)}return function(${vars.map(v => 'v_' + v).join(',')}){return [${codes.join(',')}];};`)(M);
}
function compileJS(src, vars, scope) {
  const code = gen(parseAST(src, vars, scope), 'js', {});
  return new Function('M', `"use strict";${jsDefs(scope)}return function(${vars.map(v => 'v_' + v).join(',')}){return ${code};};`)(M);
}
function constNum(src, scope) {
  const v = compileJS(src, [], scope)();
  if (!Number.isFinite(v)) throw new Error(`"${src.trim()}" is not a number`);
  return v;
}
function defineFunc(scope, name, params, bodySrc) {
  if (RESERVED.has(name) || name in CONSTS0) throw new Error(`"${name}" is a built-in name`);
  if (scope.consts.has(name)) throw new Error(`"${name}" is already a constant`);
  if (new Set(params).size !== params.length) throw new Error('repeated parameter name');
  const ast = parseAST(bodySrc, params, scope);
  const def = { name, params, ast, js: gen(ast, 'js', {}) };
  scope.funcs.set(name, def); scope.list.push(def);
  return def;
}

/* ---------- text helpers ---------- */
const RANGE_RE = /\b([A-Za-z_]\w*)\s*:\s*\[\s*([^,\]]+?)\s*,\s*([^\]]+?)\s*\]/g;
const FDEF_RE = /^([A-Za-z_]\w*)\s*\(\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)?\s*\)\s*=\s*(.+)$/;
const KEYWORD_RE = /^(seg|circle|ellipse|arc|bg)\b/i;
function matchParen(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '(') d++;
    else if (s[j] === ')') { d--; if (d === 0) return j; }
  }
  return -1;
}
function splitTop(s, sep) {
  const out = []; let d = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') d++; else if (s[i] === ')') d--;
    else if (s[i] === sep && d === 0) { out.push(s.slice(last, i)); last = i + 1; }
  }
  out.push(s.slice(last));
  return out;
}
/* name:(group)  name:token  or a bare flag word */
function parseClauses(str) {
  const out = {}; let i = 0;
  while (i < str.length) {
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;
    const m = /^[A-Za-z_]\w*/.exec(str.slice(i));
    if (!m) throw new Error(`unexpected "${str[i]}"`);
    const name = m[0]; i += name.length;
    while (i < str.length && /\s/.test(str[i]) && str[i + 1] === ':') i++;
    if (str[i] === ':') {
      i++;
      while (i < str.length && /\s/.test(str[i])) i++;
      if (str[i] === '(') {
        const e = matchParen(str, i); if (e < 0) throw new Error('missing )');
        out[name] = str.slice(i + 1, e); i = e + 1;
      } else { let j = i; while (j < str.length && !/\s/.test(str[j])) j++; out[name] = str.slice(i, j); i = j; }
    } else out[name] = true;
  }
  return out;
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s = Math.min(1, Math.max(0, s)); l = Math.min(1, Math.max(0, l));
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/* run a handler over every meaningful line; shared by the three document parsers */
function scanDoc(text, scope, errors, tags, handle) {
  text.split('\n').forEach((raw, li) => {
    let s = raw.trim();
    if (!s) return;
    if (s[0] === '#') { const m = /^#\s*ink:(\d+)/.exec(s); if (m && tags) tags.add(+m[1]); return; }
    s = normalize(s.replace(/#.*$/, '')).trim();
    if (!s) return;
    try {
      const ranges = {};
      s = s.replace(RANGE_RE, (m, name, a, b) => { ranges[name] = [constNum(a, scope), constNum(b, scope)]; return ' '; }).trim();
      handle(s, ranges, raw.trim(), li);
    } catch (err) { errors.push({ line: li, msg: err.message }); }
  });
}
/* shared: function definition or constant. returns true when the line was one of those */
function defineLine(s, scope, hintReserved) {
  let m;
  if (!KEYWORD_RE.test(s) && (m = FDEF_RE.exec(s))) {
    if (hintReserved && hintReserved.has(m[1])) throw new Error('write x(t) and y(t) together: (cos(t), sin(t)) t:[0, 2pi]');
    defineFunc(scope, m[1], m[2] ? m[2].split(',').map(x => x.trim()) : [], m[3]);
    return true;
  }
  if ((m = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(s)) && !/^(y|x|r|R|G|B|color|gray)$/.test(m[1])) {
    if (RESERVED.has(m[1])) throw new Error(`"${m[1]}" is reserved`);
    scope.consts.set(m[1], constNum(m[2], scope));
    return true;
  }
  return false;
}

/* ===================================================================
   Document parsers
   =================================================================== */

/* ---- curves: y=f(x), r=f(theta), (x(t),y(t)), seg ---- */
function parseCurves(text) {
  const items = [], errors = [], tags = new Set(), scope = newScope();
  scanDoc(text, scope, errors, tags, (s, ranges, raw, li) => {
    const family = ranges.k ? { k0: Math.ceil(Math.min(...ranges.k)), k1: Math.floor(Math.max(...ranges.k)) } : { k0: 0, k1: 0 };
    const base = { line: li, src: raw, ...family };
    let m;
    if (defineLine(s, scope, new Set(['x', 'y', 'r']))) return;
    if (/^seg\b/i.test(s)) {
      let rest = s.slice(3).trim();
      if (rest[0] !== '(') throw new Error('seg needs (x1, y1) - (x2, y2)');
      const e1 = matchParen(rest, 0); if (e1 < 0) throw new Error('missing )');
      const g1 = splitTop(rest.slice(1, e1), ',');
      rest = rest.slice(e1 + 1).trim().replace(/^(->|-)/, '').trim();
      if (rest[0] !== '(') throw new Error('seg needs (x1, y1) - (x2, y2)');
      const e2 = matchParen(rest, 0); if (e2 < 0 || e2 !== rest.length - 1) throw new Error('unexpected text after second point');
      const g2 = splitTop(rest.slice(1, e2), ',');
      if (g1.length !== 2 || g2.length !== 2) throw new Error('each point needs two numbers');
      const src4 = [...g1, ...g2];
      items.push({ ...base, type: 'seg', exprs: src4, fns: src4.map(e => compileJS(e, ['k'], scope)) });
    } else if (s[0] === '(') {
      const e = matchParen(s, 0);
      if (e !== s.length - 1) throw new Error('a lone (x(t), y(t)) pair expected');
      const g = splitTop(s.slice(1, e), ',');
      if (g.length !== 2) throw new Error('a parametric curve needs exactly two parts: (x(t), y(t))');
      const [t0, t1] = ranges.t || [0, TAU];
      items.push({ ...base, type: 'param', exprs: g, fx: compileJS(g[0], ['t', 'k'], scope), fy: compileJS(g[1], ['t', 'k'], scope), t0, t1 });
    } else if ((m = /^r\s*=\s*(.+)$/.exec(s))) {
      const [a, b] = ranges.theta || [0, TAU];
      items.push({ ...base, type: 'polar', exprs: [m[1]], f: compileJS(m[1], ['theta', 'k'], scope), a, b });
    } else if ((m = /^(y|x)\s*=\s*(.+)$/.exec(s))) {
      const axis = m[1], iv = axis === 'y' ? 'x' : 'y';
      items.push({ ...base, type: 'explicit', axis, iv, exprs: [m[2]], f: compileJS(m[2], [iv, 'k'], scope), range: ranges[iv] || null });
    } else throw new Error('not recognised. Try: y = sin(x)');
  });
  return { items, errors, tags, scope, consts: scope.consts };
}

/* ---- swarm: circle / ellipse / seg / arc families indexed by k ---- */
const SWARM_ARITY = { circle: [3, 3], ellipse: [4, 5], seg: [4, 4], arc: [5, 5] };
function parseSwarm(text) {
  const items = [], errors = [], scope = newScope();
  let bg = null;
  scanDoc(text, scope, errors, null, (s, ranges, raw, li) => {
    if (defineLine(s, scope)) return;
    const km = KEYWORD_RE.exec(s);
    if (!km) throw new Error('start with circle, ellipse, seg, arc or bg. See the syntax box');
    const kind = km[1].toLowerCase();
    let rest = s.slice(km[0].length).trim();
    const colorOf = (cl) => {
      if (cl.rgb) { const g = splitTop(cl.rgb, ','); if (g.length !== 3) throw new Error('rgb:(r, g, b) needs 3 values from 0 to 1'); return { kind: 'rgb', srcs: g }; }
      if (cl.hsl) { const g = splitTop(cl.hsl, ','); if (g.length !== 3) throw new Error('hsl:(h, s, l): hue in degrees, s and l from 0 to 1'); return { kind: 'hsl', srcs: g }; }
      if (cl.gray !== undefined) { const v = cl.gray === true ? null : cl.gray; if (v === null) throw new Error('gray:(v) needs a value'); return { kind: 'gray', srcs: [v, v, v] }; }
      return null;
    };
    const toRgb = (kind, c) => kind === 'hsl' ? hslToRgb(c[0], c[1], c[2]) : c;
    if (kind === 'bg') {
      const cs = colorOf(parseClauses(rest));
      if (!cs) throw new Error('bg needs a colour, like: bg rgb:(0.03, 0.04, 0.09)');
      bg = toRgb(cs.kind, compileJSMulti(cs.srcs, [], scope)()).map(v => Math.min(1, Math.max(0, v)));
      return;
    }
    if (rest[0] !== '(') throw new Error(`${kind} needs a bracket group, like ${kind} (x, y, r)`);
    const e = matchParen(rest, 0); if (e < 0) throw new Error('missing )');
    let parts = splitTop(rest.slice(1, e), ',');
    rest = rest.slice(e + 1).trim();
    if (kind === 'seg' && parts.length === 2 && /^(->|-)/.test(rest)) {         // old form: seg (x1,y1) - (x2,y2)
      rest = rest.replace(/^(->|-)/, '').trim();
      const e2 = matchParen(rest, 0); if (rest[0] !== '(' || e2 < 0) throw new Error('seg needs a second point');
      parts = [...parts, ...splitTop(rest.slice(1, e2), ',')]; rest = rest.slice(e2 + 1).trim();
    }
    const [lo, hi] = SWARM_ARITY[kind];
    if (parts.length < lo || parts.length > hi) throw new Error(`${kind} needs ${lo === hi ? lo : lo + ' or ' + hi} values in its bracket`);
    if (kind === 'ellipse' && parts.length === 4) parts.push('0');
    const cl = parseClauses(rest);
    const cs = colorOf(cl);
    const mode = cl.mode || (cl.fill === true ? 'fill' : cl.stroke === true ? 'stroke' : (cs && (kind === 'circle' || kind === 'ellipse') ? 'fill' : 'stroke'));
    if (!['fill', 'stroke', 'both'].includes(mode)) throw new Error('mode must be fill, stroke or both');
    const styleSrc = [...(cs ? cs.srcs : ['0', '0', '0']), cl.alpha !== undefined && cl.alpha !== true ? cl.alpha : (mode === 'fill' ? '0.85' : '0.9'), cl.width !== undefined && cl.width !== true ? cl.width : '1.2'];
    const k0 = ranges.k ? Math.ceil(Math.min(...ranges.k)) : 0, k1 = ranges.k ? Math.floor(Math.max(...ranges.k)) : 0;
    items.push({
      kind, line: li, src: raw, k0, k1, mode, add: cl.add === true || cl.blend === 'add',
      geom: compileJSMulti(parts, ['k'], scope), style: compileJSMulti(styleSrc, ['k'], scope),
      colorKind: cs ? cs.kind : null, exprs: parts,
    });
  });
  return { items, errors, bg, scope };
}

/* ---- pixel: helper functions + R, G, B (or color = (r,g,b)) of x, y, t ---- */
function parsePixel(text) {
  const errors = [], scope = newScope(), chan = [null, null, null], chanLine = [0, 0, 0];
  scanDoc(text, scope, errors, null, (s, ranges, raw, li) => {
    if (defineLine(s, scope)) return;
    let m;
    const setChan = (i, src) => { parseAST(src, ['x', 'y', 't'], scope); chan[i] = src; chanLine[i] = li; };
    if ((m = /^(R|G|B)\s*=\s*(.+)$/.exec(s))) setChan('RGB'.indexOf(m[1]), m[2]);
    else if ((m = /^color\s*=\s*\((.+)\)$/.exec(s))) {
      const g = splitTop(m[1], ',');
      if (g.length !== 3) throw new Error('color = (r, g, b) needs 3 values');
      g.forEach((src, i) => setChan(i, src));
    } else if ((m = /^gray\s*=\s*(.+)$/.exec(s))) { for (let i = 0; i < 3; i++) setChan(i, m[1]); }
    else throw new Error('write helper functions like f(x, y) = ..., then R = ..., G = ..., B = ...');
  });
  if (!errors.length && chan.every(c => c === null)) errors.push({ line: 0, msg: 'define the colour: R = ..., G = ..., B = ... (or color = (r, g, b))' });
  const final = chan.map(c => c === null ? '0' : c);
  let usesT = false;
  try { final.forEach(src => { const fv = new Set(); freeVars(parseAST(src, ['x', 'y', 't'], scope), fv); if (fv.has('v_t')) usesT = true; }); } catch { /* reported above */ }
  return { errors, scope, chan: final, usesT: usesT || /\bt\b/.test(text.replace(/#.*$/gm, '')), chanLine };
}
function buildGLSL(doc) {
  const G = { helpers: [], n: 0 };
  let defs = '';
  for (const d of doc.scope.list) {
    G.helpers = [];
    const body = gen(d.ast, 'glsl', G);
    defs += G.helpers.join('\n') + `\nfloat U_${d.name}(${d.params.map(p => 'float v_' + p).join(',')}){ return ${body}; }\n`;
  }
  G.helpers = [];
  const cs = doc.chan.map(src => gen(parseAST(src, ['x', 'y', 't'], doc.scope), 'glsl', G));
  return { prelude: GLSL_PRELUDE, defs: G.helpers.join('\n') + '\n' + defs, chan: cs };
}
