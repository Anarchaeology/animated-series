// Writes a soft moving mask (raw 8-bit gray frames, 1284x752) to stdout for the 70-second Episode 101 clip: a
// feathered oval over the distant hover-truck, which Starlight misread as a rock. The truck's path comes from the
// tracked orange glow (truck_track.tsv: frame, glow pixels, x, y in 352x188 source pixels), smoothed and continued in
// a straight line through the dissolve into the close-up. The mask fades in and out over half a second.
// usage: node truck_mask.js truck_track.tsv FRAMES | ffmpeg -f rawvideo -pix_fmt gray -s 1284x752 ...
const fs = require('fs');
const [trackFile, framesArg] = process.argv.slice(2);
const W = 1284, H = 752, SX = W / 352, SY = H / 188, FRAMES = +framesArg;
const START = 360, FULL_FROM = 375, FULL_TO = 528, END = 543;     // fade in 12.0-12.5 s, out 17.6-18.1 s
const rows = fs.readFileSync(trackFile, 'utf8').trim().split('\n').map(l => l.split('\t').map(Number))
  .filter(r => r[1] >= 10 && r[0] >= 375 && r[0] <= 505);
// straight-line fit of the glow's path (it pans at a steady speed)
const fit = k => { const n = rows.length, mx = rows.reduce((s, r) => s + r[0], 0) / n, my = rows.reduce((s, r) => s + r[k], 0) / n;
  const b = rows.reduce((s, r) => s + (r[0] - mx) * (r[k] - my), 0) / rows.reduce((s, r) => s + (r[0] - mx) ** 2, 0);
  return f => my + b * (f - mx); };
const gx = fit(2), gy = fit(3);
const RX = 100, RY = 70;              // half-size of the oval in output pixels: the truck, its glow, and the "figures"
const zero = Buffer.alloc(W * H), frame = Buffer.alloc(W * H);
let i = 0;
function next() {
  while (i < FRAMES) {
    let buf = zero;
    if (i >= START && i <= END) {
      const ramp = i < FULL_FROM ? (i - START) / (FULL_FROM - START) : i > FULL_TO ? (END - i) / (END - FULL_TO) : 1;
      const cx = gx(i) * SX, cy = (gy(i) - 5) * SY;   // the body sits just above the glow
      frame.fill(0);
      for (let y = Math.max(0, Math.floor(cy - RY)); y < Math.min(H, Math.ceil(cy + RY)); y++)
        for (let x = Math.max(0, Math.floor(cx - RX)); x < Math.min(W, Math.ceil(cx + RX)); x++) {
          const d = Math.hypot((x - cx) / RX, (y - cy) / RY);       // 0 at the centre, 1 at the edge
          if (d < 1) frame[y * W + x] = Math.round(255 * ramp * Math.min(1, (1 - d) / 0.45));
        }
      buf = frame;
    }
    i++;
    if (!process.stdout.write(buf)) { process.stdout.once('drain', next); return; }
  }
}
next();
process.stderr.write(`path: x ${gx(375).toFixed(1)} -> ${gx(528).toFixed(1)}, y ${gy(375).toFixed(1)} -> ${gy(528).toFixed(1)} (source px)\n`);
