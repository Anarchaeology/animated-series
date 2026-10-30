// Finds where the shirt's red text sits relative to the logo: for each tracked frame of a composite run (track.tsv
// from logo_composite.js), takes the red pixels of the original (red well above green and blue) and maps them into
// the reference frame's coordinates through that frame's fit. Prints the box that holds most of them (reference
// full-size coordinates) and writes a heat map image of where they land.
// usage: node red_locate.js FFMPEG_BIN ORIGINAL.mov FIRST TRACK.tsv OUT.png
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const [bin, file, firstArg, trackFile, outPng] = process.argv.slice(2);
const W = 1284, H = 752, FIRST = +firstArg;
const track = fs.readFileSync(trackFile, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
const heat = new Float32Array(W * 2 * H * 2);   // reference coordinates may run past the frame; offset by (W/2, H/2)
const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', file, '-vf',
  `trim=start_frame=${FIRST}:end_frame=${FIRST + track.length},setpts=PTS-STARTPTS,scale=${W}:${H}:flags=bicubic:in_color_matrix=bt601:in_range=tv,format=rgb24`,
  '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
const size = W * H * 3;
let pending = Buffer.alloc(0), k = 0, used = 0;
ff.stdout.on('data', c => {
  pending = pending.length ? Buffer.concat([pending, c]) : c;
  while (pending.length >= size) {
    const f = pending.subarray(0, size), row = track[k++];
    pending = pending.subarray(size);
    if (row[1] === 'held') continue;
    const [a, b, cc, d, ex2, ey2] = row.slice(2, 8).map(Number);
    const ex = 2 * ex2 + 0.5 - 0.5 * (a + b), ey = 2 * ey2 + 0.5 - 0.5 * (cc + d);
    used++;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = 3 * (y * W + x), r = f[i], m = Math.max(f[i + 1], f[i + 2]);
      if (r < 40 || r < 1.8 * m + 10) continue;
      const rx = Math.round(a * x + b * y + ex + W / 2), ry = Math.round(cc * x + d * y + ey + H / 2);
      if (rx >= 0 && ry >= 0 && rx < 2 * W && ry < 2 * H) heat[ry * 2 * W + rx] += (r - m) / 255;
    }
  }
});
ff.on('close', () => {
  // box: smallest box holding 90% of the weight below the logo (reference y > 700) and near it in x
  const pts = [];
  for (let y = 0; y < 2 * H; y++) for (let x = 0; x < 2 * W; x++) { const v = heat[y * 2 * W + x]; if (v > 0) pts.push([x - W / 2, y - H / 2, v]); }
  const near = pts.filter(([x, y]) => y > 700 && x > 400 && x < 1000);
  const q = (arr, p) => { const s = [...arr].sort((u, v) => u[0] - v[0]); let acc = 0; const tot = s.reduce((t, e) => t + e[1], 0); for (const [v, w] of s) { acc += w; if (acc >= p * tot) return v; } return s[s.length - 1][0]; };
  const xs = near.map(p => [p[0], p[2]]), ys = near.map(p => [p[1], p[2]]);
  console.log(`frames used ${used}; red weight near the logo ${near.reduce((s, p) => s + p[2], 0).toFixed(0)} of ${pts.reduce((s, p) => s + p[2], 0).toFixed(0)}`);
  console.log(`red text box (reference full-size coords, 5%-95%): ${q(xs, 0.05)},${q(ys, 0.05)} - ${q(xs, 0.95)},${q(ys, 0.95)}`);
  let mx = 0; for (const v of heat) mx = Math.max(mx, v);
  const img = Buffer.alloc(2 * W * 2 * H);
  for (let i = 0; i < img.length; i++) img[i] = Math.min(255, Math.round(255 * Math.sqrt(heat[i] / mx)));
  const tmp = outPng + '.gray';
  fs.writeFileSync(tmp, img);
  execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${2 * W}x${2 * H}`, '-i', tmp,
    '-vf', `crop=${W}:${H}:${W / 2}:${H / 2 + 300},scale=642:-2`, '-frames:v', '1', outPng]);
  fs.unlinkSync(tmp);
});
