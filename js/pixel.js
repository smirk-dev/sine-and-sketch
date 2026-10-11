'use strict';
/* ===================================================================
   pixel.js — Hamid's "network of functions": every pixel's colour is a
   composition of user functions of (x, y, t), evaluated on the GPU.
   =================================================================== */
const Pixel = {
  canvas: null, gl: null, prog: null, uni: null, ok: false, error: '', maxSize: 4096, compiledFor: null,

  init(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false });
    if (!gl) { this.error = 'WebGL2 is not available in this browser, so the pixel studio cannot run.'; return false; }
    this.gl = gl;
    this.maxSize = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, 8192);
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, `#version 300 es
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`);
    gl.compileShader(vs);
    this.vs = vs; this.ok = true;
    return true;
  },

  /* returns an error string, or null on success. Keeps the old program if the new one fails. */
  compile(doc) {
    if (!this.ok) return this.error;
    const gl = this.gl;
    let g;
    try { g = buildGLSL(doc); } catch (e) { return e.message; }
    const c = g.chan.map(s => `clamp(h_fin(${s}),0.0,1.0)`);
    const src = `#version 300 es
precision highp float;
uniform vec2 u_res; uniform vec3 u_view; uniform float u_t;
out vec4 o_col;
${g.prelude}
${g.defs}
void main(){
  float v_x=(gl_FragCoord.x-0.5*u_res.x)/u_view.z+u_view.x;
  float v_y=(gl_FragCoord.y-0.5*u_res.y)/u_view.z+u_view.y;
  float v_t=u_t;
  o_col=vec4(${c[0]},${c[1]},${c[2]},1.0);
}`;
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, src); gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fs) || 'shader failed to compile';
      gl.deleteShader(fs);
      return 'GPU compile error: ' + log.split('\n').filter(Boolean)[0];
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, this.vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { const log = gl.getProgramInfoLog(prog); gl.deleteProgram(prog); return 'GPU link error: ' + log; }
    if (this.prog) gl.deleteProgram(this.prog);
    this.prog = prog;
    this.uni = { res: gl.getUniformLocation(prog, 'u_res'), view: gl.getUniformLocation(prog, 'u_view'), t: gl.getUniformLocation(prog, 'u_t') };
    this.source = src;
    return null;
  },

  /* draw into the GL canvas at W x H. cssW is the on-screen width the view scale refers to. */
  render(W, H, view, cssW, time, strips) {
    if (!this.ok || !this.prog) return false;
    const gl = this.gl;
    W = Math.min(W, this.maxSize); H = Math.min(H, this.maxSize);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uni.res, W, H);
    gl.uniform3f(this.uni.view, view.cx, view.cy, view.scale * W / cssW);
    gl.uniform1f(this.uni.t, time);
    if (strips) {
      gl.enable(gl.SCISSOR_TEST);
      const hs = Math.max(8, Math.floor(1.5e6 / W));
      for (let y = 0; y < H; y += hs) { gl.scissor(0, y, W, Math.min(hs, H - y)); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish(); }
      gl.disable(gl.SCISSOR_TEST);
    } else gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  },
};
