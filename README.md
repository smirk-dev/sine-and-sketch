# Sine & Sketch

Pictures made of pure math, in the browser. Every image you make is shown as its mathematical function.

Live: https://sine-and-sketch.vercel.app

Four studios, all with a Cartesian plane:

- **Pixel**: write small functions, compose them, and give `R`, `G`, `B`. Every pixel is computed on the GPU (WebGL2).
- **Swarm**: thousands of circles, ellipses, lines and arcs whose position, size and colour are formulas in `k`. The **Vary** button re-rolls your constants into twelve thumbnails to pick from.
- **Photo**: rebuild any photo from thousands of ellipses. The result is one exact function, `I(x, y) = c[K(x, y)]`, shown in the function bar.
- **Curves**: draw by hand and get Fourier-series equations back.

Export PNG, JPG, SVG, PDF, layered PSD, layered ORA (Krita, GIMP), plain text and a reopenable project file.

## Run it

No build step. Serve the folder with any static server and open `index.html`:

```
python -m http.server 8000
```

The code is plain JavaScript in `js/`. `v1-curves-only.html` is the first version (sketch to equations only).

## Inspiration

This project takes heavy inspiration from the work of mathematical artist [Hamid Naderi Yeganeh](https://en.wikipedia.org/wiki/Hamid_Naderi_Yeganeh): swarms of shapes indexed by `k`, and networks of functions that decide the colour of every pixel. It is a tribute, not a copy, and it is not affiliated with him. His own formulas are mostly unpublished, so the examples here are original.

## Licence

Code: MIT, see `LICENSE`.
`img/hamid.jpg`: photo by Hamid Naderi Yeganeh, [CC BY 4.0](https://commons.wikimedia.org/wiki/File:Hamid_Naderi_Yeganeh_2018.jpg), via Wikimedia Commons (cropped and resized).
`img/suryansh.jpg`: Suryansh Mishra, all rights reserved.

Built by [Suryansh Mishra](https://github.com/smirk-dev).
