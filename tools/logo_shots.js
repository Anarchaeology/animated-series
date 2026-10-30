// Finds shots that show the Bronto Burger logo's green (hue 125-150, saturated, bright; same test as the fix tool's
// logo key) in upload parts. Shots come from misread_scan.js output (hard cuts above CUT). For each shot with at least
// MINF frames of 20+ logo pixels (at 321x188), prints: part, first, last, frames with logo, peak pixel count, the logo's
// box over the shot (1284x752 coordinates, from the per-frame 3%-97% extents), and the frame with the most logo.
// Other colours: --hue=LO-HI (degrees) picks another logo, e.g. Episode 102's BABOONS shirt text, orange-tan at hue
// 24-27; --darknear=V then counts a pixel only if there is something darker than V (0-1) within 3 rows above or below
// it, i.e. the colour sits on her black shirt (skin and lamps share the hue but not the black around it).
// usage: node logo_shots.js FFMPEG_BIN UPLOAD_DIR SCAN_DIR OUT.tsv PART... [--cut=20] [--minf=8] [--sat=0.45] [--val=0.3] [--px=20]
//        [--hue=125-150] [--darknear=V]
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [bin, dir, scanDir, outFile, ...parts] = args.filter(a => !a.startsWith('--'));
const W = 321, H = 188, S = 4, CUT = +(opt.cut || 20), MINF = +(opt.minf || 8), SAT = +(opt.sat || 0.45), VAL = +(opt.val || 0.3), PX = +(opt.px || 20);
const [HLO, HHI] = (opt.hue || '125-150').split('-').map(Number), DARK = opt.darknear ? 255 * +opt.darknear : null;
const isLogo = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d || d / mx <= SAT || mx / 255 <= VAL) return false;
  const h = ((mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
  return h >= HLO && h <= HHI;
};
// something darker than DARK within 3 rows above or below (x, y)
const darkNear = (f, x, y) => {
  for (let dy = -3; dy <= 3; dy++) {
    const yy = y + dy;
    if (!dy || yy < 0 || yy >= H) continue;
    const i = 3 * (yy * W + x);
    if (Math.max(f[i], f[i + 1], f[i + 2]) < DARK) return true;
  }
  return false;
};
function scanPart(part) {
  return new Promise((res, rej) => {
    const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', path.join(dir, `${part}.mov`),
      '-vf', `scale=${W}:${H}:in_color_matrix=bt601:in_range=tv,format=rgb24`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const size = W * H * 3, frames = [];
    let pending = Buffer.alloc(0);
    ff.stdout.on('data', c => {
      pending = pending.length ? Buffer.concat([pending, c]) : c;
      while (pending.length >= size) {
        const f = pending.subarray(0, size), xs = [], ys = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = 3 * (y * W + x);
          if (isLogo(f[i], f[i + 1], f[i + 2]) && (DARK === null || darkNear(f, x, y))) { xs.push(x); ys.push(y); }
        }
        if (xs.length >= PX) {
          xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
          const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
          frames.push({ n: xs.length, box: [q(xs, 0.03), q(ys, 0.03), q(xs, 0.97), q(ys, 0.97)] });
        } else frames.push({ n: xs.length, box: null });
        pending = pending.subarray(size);
      }
    });
    ff.on('close', c => c ? rej(new Error(`ffmpeg failed on ${part}`)) : res(frames));
  });
}
(async () => {
  const fps = 30000 / 1001, t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
  const rows = ['part\tfirst\tlast\ttimes\tlogo frames\tpeak px\tbox (x0,y0,x1,y1)\tbest frame'];
  for (const part of parts) {
    const frames = await scanPart(part);
    const scan = fs.readFileSync(path.join(scanDir, `${part}.tsv`), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t').map(Number));
    const cuts = [0];
    for (let i = 1; i < scan.length; i++) if (scan[i][5] > CUT) cuts.push(i);
    cuts.push(frames.length);
    let found = 0;
    for (let c = 0; c + 1 < cuts.length; c++) {
      const [a, b] = [cuts[c], cuts[c + 1] - 1];
      const hits = frames.slice(a, b + 1).map((f, k) => ({ ...f, i: a + k })).filter(f => f.box);
      if (hits.length < MINF) continue;
      const box = [Math.min(...hits.map(h => h.box[0])), Math.min(...hits.map(h => h.box[1])), Math.max(...hits.map(h => h.box[2])), Math.max(...hits.map(h => h.box[3]))].map(v => v * S);
      const best = hits.reduce((p, h) => (h.n > p.n ? h : p));
      rows.push([part, a, b, `${t(a)}-${t(b)}`, hits.length, best.n, box.join(','), best.i].join('\t'));
      found++;
    }
    console.log(`${part}: ${found} candidate shots`);
  }
  fs.writeFileSync(outFile, rows.join('\n') + '\n');
})().catch(e => { console.error(e.message); process.exit(1); });
