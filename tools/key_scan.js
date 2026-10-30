// Finds where the Bronto Burger logo's green appears in an upload part: per frame, counts the pixels of the original
// (at 321x188) within the logo's hue range (125-150 degrees, saturation > 0.45, brightness > 0.3) and their bounding
// box, then prints the runs of frames with at least MIN such pixels.
// usage: node key_scan.js FFMPEG_BIN UPLOAD_DIR PART [MIN=15]
const path = require('path'), { spawn } = require('child_process');
const [bin, dir, part, minArg = '15'] = process.argv.slice(2);
const W = 321, H = 188, MIN = +minArg, fps = 30000 / 1001;
const t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
const isLogo = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx !== g || !d || d / mx <= 0.45 || mx / 255 <= 0.3) return false;
  const h = ((b - r) / d + 2) * 60;
  return h >= 125 && h <= 150;
};
const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', path.join(dir, `${part}.mov`),
  '-vf', `scale=${W}:${H}:in_color_matrix=bt601:in_range=tv,format=rgb24`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
const size = W * H * 3, frames = [];
let pending = Buffer.alloc(0);
ff.stdout.on('data', c => {
  pending = pending.length ? Buffer.concat([pending, c]) : c;
  while (pending.length >= size) {
    const f = pending.subarray(0, size);
    let n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = 3 * (y * W + x);
      if (isLogo(f[i], f[i + 1], f[i + 2])) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    frames.push({ n, box: n ? [x0, y0, x1, y1] : null });
    pending = pending.subarray(size);
  }
});
ff.on('close', () => {
  let run = null;
  const flush = end => { if (run) { console.log(`${part}\t${run.a}-${end}\t${t(run.a)}-${t(end)}\tmax ${run.max} px\tbox ${run.box.join(',')}`); run = null; } };
  frames.forEach((fr, i) => {
    if (fr.n >= MIN) {
      if (!run) run = { a: i, max: 0, box: [W, H, 0, 0] };
      run.max = Math.max(run.max, fr.n);
      run.box = [Math.min(run.box[0], fr.box[0]), Math.min(run.box[1], fr.box[1]), Math.max(run.box[2], fr.box[2]), Math.max(run.box[3], fr.box[3])];
    } else if (run && i - 1 >= run.a) flush(i - 1);
  });
  flush(frames.length - 1);
});
