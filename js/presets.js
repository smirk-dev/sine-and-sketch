'use strict';
/* Examples. `half` = how many plane units to show from the centre to the nearer edge. */
const PRESETS = {
  pixel: {
    'Marble': { half: 9, text:
`# Hamid's recent method: small functions composed into one picture.
# 1. a warped noise field
warp(x, y) = fbm(0.5x + 2fbm(0.3x, 0.3y), 0.5y + 2fbm(0.3y + 5, 0.3x + 9))
# 2. veins where that field crosses certain values
vein(x, y) = 1 - abs(sin(5warp(x, y) + 0.4x))
# 3. the picture: three channels, each a function of the veins
R = 0.12 + 0.88vein(x, y)^4
G = 0.14 + 0.78vein(x, y)^4
B = 0.22 + 0.7vein(x, y)^3
` },
    'Eye': { half: 6.4, text:
`# An eye from small helper functions, composed.
rad(x, y) = hypot(x, y)
ang(x, y) = atan2(y, x)
# iris fibres radiate from the pupil, disturbed by noise
fibre(x, y) = 0.5 + 0.5sin(70ang(x, y) + 5fbm(1.5x, 1.5y))
iris(x, y) = smoothstep(2.9, 2.8, rad(x, y))
pupil(x, y) = smoothstep(0.85, 1.05, rad(x, y) + 0.12fbm(4x, 4y))
# the iris is darker toward its outer rim
tone(x, y) = (0.25 + 0.75fibre(x, y)) * (1 - 0.65smoothstep(1.9, 2.8, rad(x, y)))
shine(x, y) = smoothstep(0.55, 0.3, hypot(x - 1, y - 1.1))
# the lids: an ellipse that hides the rest of the iris
edge(x, y) = (x / 5)^2 + (y / 2.5)^2
inside(x, y) = smoothstep(1, 0.93, edge(x, y))
occl(x, y) = 1 - 0.55smoothstep(0.45, 1, edge(x, y))
# s = sclera colour, c = iris colour (one call per channel)
eyeball(x, y, s, c) = clamp(mix(s, c * tone(x, y), iris(x, y)) * pupil(x, y) + 0.9shine(x, y), 0, 1) * occl(x, y)
R = mix(0.86, eyeball(x, y, 0.93, 0.72), inside(x, y))
G = mix(0.64, eyeball(x, y, 0.9, 0.52), inside(x, y))
B = mix(0.52, eyeball(x, y, 0.88, 0.22), inside(x, y))
` },
    'Lit sphere': { half: 6, text:
`# Shading as functions: depth -> light -> texture -> colour.
r2(x, y) = hypot(x, y) / 4.2
depth(x, y) = sqrt(max(0, 1 - r2(x, y)^2))
light(x, y) = clamp(0.1 + 0.9(0.4x / 4.2 + 0.5y / 4.2 + 0.77depth(x, y)), 0, 1)
tex(x, y) = 0.5 + 0.5sin(9fbm3(0.8x, 0.8y, 3depth(x, y)) * 3 + y)
spec(x, y) = light(x, y)^22
inside(x, y) = smoothstep(1, 0.99, r2(x, y))
bgc(x, y) = 0.08 + 0.06smoothstep(-5, 5, y)
shade(x, y, a) = a * light(x, y) * (0.3 + 0.7tex(x, y)) + 0.5spec(x, y)
R = mix(bgc(x, y), shade(x, y, 1), inside(x, y))
G = mix(bgc(x, y), shade(x, y, 0.75), inside(x, y))
B = mix(bgc(x, y), shade(x, y, 0.55), inside(x, y))
` },
    'Plasma (animated)': { half: 9, text:
`# t is time in seconds. Press Animate.
wave(x, y, t) = sin(1.3x + t) + sin(1.7y - 1.2t) + sin(0.9(x + y) + 0.7t) + sin(hypot(x - 3sin(0.3t), y - 3cos(0.4t)))
R = 0.5 + 0.5sin(wave(x, y, t))
G = 0.5 + 0.5sin(wave(x, y, t) + 2.1)
B = 0.5 + 0.5sin(wave(x, y, t) + 4.2)
` },
    'Blank': { half: 9, text:
`# helper functions first, then the three colour channels (0 to 1)
f(x, y) = 0.5 + 0.5sin(x) * sin(y)
R = f(x, y)
G = f(x * 0.5, y * 0.5)
B = 0.6
` },
  },

  swarm: {
    'Circle ring': { half: 6, text:
`# A swarm: 720 circles. Each one's centre, size and colour is a formula in k.
bg rgb:(0.04, 0.05, 0.09)
n = 720
a = 3
b = 2
spread = 3.2
circle (spread cos(a 2pi k / n), spread sin(b 2pi k / n), 0.1 + 0.9sin(pi k / n)^2) k:[0, n] hsl:(360k / n, 0.85, 0.6) alpha:(0.2) mode:both width:(0.5)
` },
    'Sunflower': { half: 8, text:
`# The golden angle (2.39996 rad) between neighbours packs circles without gaps.
bg rgb:(0.06, 0.05, 0.04)
n = 1400
angle = 2.39996
gap = 0.19
circle (gap sqrt(k)cos(angle k), gap sqrt(k)sin(angle k), 0.06 + 0.1sqrt(k / n)) k:[1, n] hsl:(18 + 50k / n, 0.92, 0.42 + 0.22k / n) alpha:(0.92)
` },
    'String art': { half: 7, text:
`# Join point k to point m*k on a circle. m = 2 is a cardioid. Try "Vary".
bg rgb:(0.03, 0.04, 0.08)
n = 240
m = 2
seg (6cos(2pi k / n), 6sin(2pi k / n), 6cos(2pi m k / n), 6sin(2pi m k / n)) k:[0, n] hsl:(300k / n + 180, 0.8, 0.6) alpha:(0.45) width:(0.9)
` },
    'Turning ellipses': { half: 7, text:
`# 90 ellipses, each turned a little further than the last.
bg rgb:(0.97, 0.95, 0.9)
n = 90
wide = 6.5
thick = 2.4
turn = 3
ellipse (0, 0, wide, 0.6 + thick sin(pi k / n)^2, turn pi k / n) k:[0, n] rgb:(0.1, 0.2 + 0.5k / n, 0.5) alpha:(0.5) mode:stroke width:(1)
` },
    'Blank': { half: 8, text:
`# Shapes: circle (x, y, r)  ellipse (x, y, rx, ry, angle)  seg (x1, y1, x2, y2)  arc (x, y, r, a0, a1)
# Each takes k:[from, to] and may use k in any value. Edit the numbers; use "Vary" to explore.
bg rgb:(0.05, 0.06, 0.1)
n = 200
a = 3
b = 2
circle (5cos(a 2pi k / n), 5sin(b 2pi k / n), 0.5) k:[0, n] hsl:(360k / n, 0.8, 0.6) alpha:(0.35)
` },
  },

  curves: {
    'Heart': { half: 11, text: '# Heart curve: a sum of four cosines\n(16 sin(t)^3 / 3, (13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)) / 3) t:[0, 2pi]\n' },
    'Rose': { half: 11, text: '# A five-thirds rose, traced over three turns\nr = 7 cos(5 theta / 3)  theta:[0, 6pi]\n' },
    'Lissajous': { half: 11, text: '# Two sines at 3:2\n(7 sin(3t + pi/2), 6 sin(2t)) t:[0, 2pi]\n' },
    'Ellipse bloom': { half: 11, text: '# 63 ellipses, each turned a little further than the last\n(5cos(t)cos(k/20) - 2sin(t)sin(k/20), 5cos(t)sin(k/20) + 2sin(t)cos(k/20)) t:[0, 2pi] k:[0, 62]\n' },
    'String cardioid': { half: 11, text: '# Join point k to point 2k on a circle: a cardioid appears\nn = 200\nseg k:[0, n] (6cos(2pi k/n), 6sin(2pi k/n)) - (6cos(4pi k/n), 6sin(4pi k/n))\n' },
    'Square wave': { half: 11, text: '# Five odd harmonics already look like a square wave\ny = 4/pi (sin(x) + sin(3x)/3 + sin(5x)/5 + sin(7x)/7 + sin(9x)/9)\ny = 1  x:[-12, 12]\ny = -1  x:[-12, 12]\n' },
    'Spiral': { half: 11, text: '# Archimedean spiral\nr = 0.35 theta  theta:[0, 8pi]\n' },
    'Blank': { half: 11, text: '# Draw on the plane, or write equations here.\n# One curve per line. Try editing the numbers below.\ny = 2 sin(x)\n' },
  },
};

const HERO_CHIPS = [['pixel', 'Marble'], ['pixel', 'Eye'], ['pixel', 'Lit sphere'], ['swarm', 'Sunflower'], ['swarm', 'String art'], ['curves', 'Heart']];

const MODE_INFO = {
  pixel: {
    title: 'Functions',
    blurb: 'Define small functions, compose them, and give R, G and B. Every pixel is computed on the GPU.',
    txt: 'The functions as text',
    syntax:
`# helper functions, then the colour of every pixel (x, y)
f(x, y) = hypot(x, y)          your own functions; they can call each other
R = ...   G = ...   B = ...    channels from 0 to 1 (values are clamped)
color = (r, g, b)              or  gray = v
t                              time in seconds (press Animate)
k = 3.5                        constants (plain numbers)
sum(i, 1, 8, sin(i x) / i)     loops: sum prod smax smin, bounds are plain numbers
functions: sin cos tan asin acos atan atan2 sinh cosh tanh sqrt abs exp ln log
           floor ceil round sign min max pow mod saw fract hypot
           clamp mix step smoothstep sel(c,a,b) gt lt noise fbm noise3 fbm3 hash
constants: pi tau e     implicit multiplication: 2pi x, 3sin(2y)`,
    note: 'Pixel pictures are computed per pixel, so there is no vector form: PNG, JPG, PSD and ORA are available (up to 4× or the GPU limit). The equations can be saved as .txt or .json.',
  },
  swarm: {
    title: 'Swarm',
    blurb: 'Release thousands of circles, ellipses, lines and arcs. Each shape\'s position, size and colour is a formula in k.',
    txt: 'The formulas as text',
    syntax:
`bg rgb:(0.04, 0.05, 0.09)                     background colour
circle  (x, y, r)               k:[0, n]      one shape per integer k
ellipse (x, y, rx, ry, angle)
seg     (x1, y1, x2, y2)
arc     (x, y, r, a0, a1)
then, optionally, per shape (any formula in k):
  rgb:(r,g,b)  hsl:(hue°, s, l)  gray:(v)    colour
  alpha:(0.3)  width:(1.2)  mode:fill|stroke|both   add (glow)
n = 600                        constants. "Vary" re-rolls them to explore
functions as in Pixel (sin, cos, sqrt, hash, ...); sum(i,1,4, ...) loops work too`,
    note: 'Swarms are vector: SVG and PDF keep every shape; PSD and ORA add a layer for the shapes (colour-add glow only shows on canvas and raster exports).',
  },
  photo: {
    title: 'Photo',
    blurb: 'Rebuild any picture from thousands of coloured circles or ellipses placed where the error is largest.',
    txt: 'The shapes as a table (k, X, Y, RX, RY, angle, R, G, B)',
    syntax: '',
    note: 'The shapes are vector: SVG and PDF keep every circle. The data table (.txt) lists each shape\'s centre, radii, angle and colour in plane units.',
  },
  curves: {
    title: 'Equations',
    blurb: 'Draw on the plane and your strokes become Fourier equations. Or write curves and watch them draw.',
    txt: 'The equations as text',
    syntax:
`# one curve per line, anything after # is a comment
y = 2 sin(x)                       explicit, add x:[-3, 3] to limit it
r = 6 cos(5 theta / 3) theta:[0, 6pi]   polar
(3cos(t), 3sin(t)) t:[0, 2pi]      parametric (x(t), y(t))
(..., ...) t:[0, 2pi] k:[0, 62]    a family: k steps by 1
seg k:[0, 200] (x1, y1) - (x2, y2) one line segment per k
n = 200                            your own constants; f(x) = ... your own functions
functions: sin cos tan asin acos atan atan2 sinh cosh tanh sqrt abs exp ln log
           floor ceil round sign min max pow mod saw fract hypot
constants: pi tau e     implicit multiplication: 2pi k/n, 3cos(2t)`,
    note: 'Curves are vector: SVG and PDF keep them as lines. PSD and ORA have separate layers for the plane, your raw sketch and the fitted curves.',
  },
};
