// Paints out a thin straight streak that Starlight drew sharp (a faint line in Funcom's artwork, e.g. the nebula in
// Episode 101's opening): follows the streak from rough keyframes (frame, x0, y0, x1, y1, read by eye), finds it
// exactly in each frame (where the line is darkest against its surroundings), and fills a narrow band along it from
// the picture either side of it. Writes UPLOAD_DIR/<part>_<name> (frames A-B).mov (Starlight with the band laid over,
// ProRes 422 HQ, BT.709, 1284x752), usable as a fix source, and OUT_DIR/line.tsv (per-frame line and its strength).
// --dry finds the line and writes line.tsv only.
// usage: node line_remove.js FFMPEG_BIN UPLOAD_DIR PART FIRST LAST KEYS.tsv OUT_DIR [--width=10] [--name=noline] [--dry]
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [bin, dir, part, firstArg, lastArg, keysFile, out] = args.filter(a => !a.startsWith('--'));
const W = 1284, H = 752, FIRST = +firstArg, LAST = +lastArg, N = LAST - FIRST + 1;
const HW = +(opt.width ?? 10) / 2, NAME = opt.name || 'noline';
fs.mkdirSync(out, { recursive: true });

function frames(file, filter, size, onFrame) {
  return new Promise((res, rej) => {
    const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', file, '-vf',
      `trim=start_frame=${FIRST}:end_frame=${LAST + 1},setpts=PTS-STARTPTS,${filter}`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let pending = Buffer.alloc(0), k = 0;
    ff.stdout.on('data', c => {
      pending = pending.length ? Buffer.concat([pending, c]) : c;
      while (pending.length >= size) { onFrame(Buffer.from(pending.subarray(0, size)), k++); pending = pending.subarray(size); }
    });
    ff.on('close', c => (c ? rej(new Error(`ffmpeg failed reading ${file}`)) : res(k)));
  });
}
function blur(src, w, h, sigma) {   // separable Gaussian
  const r = Math.ceil(3 * sigma), k = []; for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const t = k.reduce((a, b) => a + b, 0), kn = k.map(v => v / t), tmp = new Float32Array(w * h), dst = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += kn[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += kn[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; dst[y * w + x] = s; }
  return dst;
}
const bil = (img, w, h, x, y) => {
  x = Math.min(w - 1.001, Math.max(0, x)); y = Math.min(h - 1.001, Math.max(0, y));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (img[i] * (1 - fx) + img[i + 1] * fx) * (1 - fy) + (img[i + w] * (1 - fx) + img[i + w + 1] * fx) * fy;
};
// value at k of a weighted local straight line through series[k-half .. k+half]
function localLin(s, k, half, sigma) {
  let A = 0, X = 0, Y = 0, XX = 0, XY = 0;
  for (let j = Math.max(0, k - half); j <= Math.min(s.length - 1, k + half); j++) {
    const w = Math.exp(-((j - k) ** 2) / (2 * sigma * sigma)), x = j - k; A += w; X += w * x; Y += w * s[j]; XX += w * x * x; XY += w * x * s[j];
  }
  const d = A * XX - X * X; return d > 1e-9 ? (Y - X * (A * XY - X * Y) / d) / A : Y / A;
}

(async () => {
  // keyframes, and the rough line in every frame between them (straight-line in-between of the end points)
  const keys = fs.readFileSync(keysFile, 'utf8').trim().split('\n').filter(l => /^\d/.test(l)).map(l => l.split(/\s+/).map(Number)).sort((a, b) => a[0] - b[0]);
  const guess = Array.from({ length: N }, (_, k) => {
    const f = FIRST + k, b = keys.findIndex(r => r[0] >= f);
    if (b === 0) return keys[0].slice(1);
    if (b < 0) return keys[keys.length - 1].slice(1);
    const a = keys[b - 1], c = keys[b], t = (f - a[0]) / (c[0] - a[0]);
    return a.slice(1).map((v, i) => v + (c[i + 1] - v) * t);
  });

  // pass 1: in each frame, move each end of the rough line across it (up to 14 px) to where the line is darkest
  // against its surroundings (luma minus a 4-px blur of it), first in whole pixels, then in quarters
  const found = new Array(N);
  await frames(path.join(dir, `${part}_starlight.mov`), 'format=gray', W * H, (buf, k) => {
    const [gx0, gy0, gx1, gy1] = guess[k], M = 40;
    const bx0 = Math.max(0, Math.floor(Math.min(gx0, gx1) - M)), by0 = Math.max(0, Math.floor(Math.min(gy0, gy1) - M));
    const bx1 = Math.min(W, Math.ceil(Math.max(gx0, gx1) + M)), by1 = Math.min(H, Math.ceil(Math.max(gy0, gy1) + M)), w = bx1 - bx0, h = by1 - by0;
    const L = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L[y * w + x] = buf[(y + by0) * W + x + bx0];
    const B = blur(L, w, h, 4), hp = L.map((v, i) => v - B[i]);
    const len = Math.hypot(gx1 - gx0, gy1 - gy0), nx = -(gy1 - gy0) / len, ny = (gx1 - gx0) / len;
    // the line may bow a little: its middle sits c px off the straight line between its ends (a parabola)
    const score = (d0, d1, c) => {
      const ax = gx0 + nx * d0 - bx0, ay = gy0 + ny * d0 - by0, cx = gx1 + nx * d1 - bx0, cy = gy1 + ny * d1 - by0, n = Math.max(8, Math.round(len / 2));
      // (only the part of the line inside the picture counts: the streak enters and leaves past the edges)
      let s = 0, m = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n, bow = 4 * c * t * (1 - t), x = ax + (cx - ax) * t + nx * bow, y = ay + (cy - ay) * t + ny * bow;
        if (x < 1 || y < 1 || x > w - 2 || y > h - 2) continue;
        s += bil(hp, w, h, x, y); m++;
      }
      return m >= 8 ? s / m : 0;
    };
    let best = { v: Infinity, d0: 0, d1: 0, c: 0 };
    for (let d0 = -14; d0 <= 14; d0++) for (let d1 = -14; d1 <= 14; d1++) { const v = score(d0, d1, 0); if (v < best.v) best = { v, d0, d1, c: 0 }; }
    for (let c = -8; c <= 8; c++) { const v = score(best.d0, best.d1, c); if (v < best.v) best = { ...best, v, c }; }
    const c0 = best;
    for (let d0 = c0.d0 - 1; d0 <= c0.d0 + 1; d0 += 0.25) for (let d1 = c0.d1 - 1; d1 <= c0.d1 + 1; d1 += 0.25) for (let c = c0.c - 1; c <= c0.c + 1; c += 0.25) {
      const v = score(d0, d1, c); if (v < best.v) best = { v, d0, d1, c };
    }
    found[k] = { line: [gx0 + nx * best.d0, gy0 + ny * best.d0, gx1 + nx * best.d1, gy1 + ny * best.d1, best.c], dark: -best.v };
  });
  // strength: how dark the line is (luma levels below its surroundings; with no line, the darkest line the search
  // finds in plain nebula reads about 1), 0 up to 1.4, full from 2.6; then the line and its strength smoothed over
  // 3 frames each side
  const raw = found.map(f => Math.min(1, Math.max(0, (f.dark - 1.4) / 1.2)));
  const strength = raw.map((_, k) => Math.min(1, Math.max(0, localLin(raw, k, 3, 1.5))));
  const line = found.map((_, k) => [0, 1, 2, 3, 4].map(i => localLin(found.map(f => f.line[i]), k, 3, 1.5)));
  fs.writeFileSync(path.join(out, 'line.tsv'), 'frame\tx0\ty0\tx1\ty1\tbow\tdarkness\tstrength\n' +
    line.map((l, k) => [FIRST + k, ...l.map(v => v.toFixed(1)), found[k].dark.toFixed(2), strength[k].toFixed(2)].join('\t')).join('\n') + '\n');
  console.log('darkness by frame: ' + found.map((f, k) => `${FIRST + k}:${f.dark.toFixed(1)}`).join(' '));
  if ('dry' in opt) return;

  // pass 2: fill a band along the line (HW px each side, feathered over 6 more, and 10 px past each end, fading over
  // 15) with the average of the picture the same distance either side of it, so the line goes and the nebula's grain
  // and shading carry on through
  const outFile = path.join(dir, `${part}_${NAME} (frames ${FIRST}-${LAST}).mov`);
  const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
    '-i', path.join(dir, `${part}_starlight.mov`), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', '30000/1001', '-i', 'pipe:0',
    '-filter_complex', `[0:v]trim=start_frame=${FIRST}:end_frame=${LAST + 1},setpts=PTS-STARTPTS,format=yuv444p10le[s];` +
    `[1:v]setpts=PTS-STARTPTS,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuva444p10le[o];[s][o]overlay=format=yuv444p10,format=yuv422p10le[v]`,
    '-map', '[v]', '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', 'use_metadata_tags',
    '-metadata', `comment=${part} frames ${FIRST}-${LAST}: Starlight with a streak painted out (line_remove.js)`, outFile],
    { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('encode failed')) : res())));
  // (sampled past the band's feathered edge: Starlight draws a light fringe along one side of the line, which a
  // closer sample picks up and leaves as a pale band)
  // (a wide feather: a hard band edge shows as a faint seam either side of where the line was)
  const FEATHER = 6, D = HW + FEATHER + 3, PAST = 10, ENDFADE = 15, overlay = Buffer.alloc(W * H * 4);
  await frames(path.join(dir, `${part}_starlight.mov`), 'scale=in_color_matrix=bt709:in_range=tv,format=rgb24', W * H * 3, (star, k) => {
    overlay.fill(0);
    if (strength[k] > 0) {
      const [x0, y0, x1, y1, bowC] = line[k], len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy, ny = ux;
      const ch = [0, 1, 2].map(c => { const p = new Float32Array(W * H); for (let i = 0; i < W * H; i++) p[i] = star[3 * i + c]; return p; });
      const reach = HW + FEATHER + Math.abs(bowC) + 1, ex = PAST + 1;
      const xs = [x0 - ux * ex, x1 + ux * ex].flatMap(x => [x - reach, x + reach]), ys = [y0 - uy * ex, y1 + uy * ex].flatMap(y => [y - reach, y + reach]);
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++)
        for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) {
          const t = (x - x0) * ux + (y - y0) * uy, s = Math.min(1, Math.max(0, t / len)), d = (x - x0) * nx + (y - y0) * ny - 4 * bowC * s * (1 - s);
          const across = Math.min(1, Math.max(0, (HW + FEATHER - Math.abs(d)) / FEATHER)), along = Math.min(1, Math.max(0, (Math.min(t, len - t) + PAST) / ENDFADE));
          const a = across * along * strength[k];
          if (a <= 0) continue;
          const o = 4 * (y * W + x);
          for (let c = 0; c < 3; c++) overlay[o + c] = Math.round(0.5 * (bil(ch[c], W, H, x + nx * D, y + ny * D) + bil(ch[c], W, H, x - nx * D, y - ny * D)));
          overlay[o + 3] = Math.round(255 * a);
        }
    }
    ff.stdin.write(Buffer.from(overlay));
  });
  ff.stdin.end();
  await done;
  console.log(`${path.basename(outFile)}: ${N} frames, line painted out in ${strength.filter(s => s > 0).length}`);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
