// Takes thin dark lines (glasses rims Starlight drew on her) out of a band across her eyes, keeping the rest of
// Starlight's face: pixels darker than their surroundings by a line's width (a grey closing over a (2R+1)-square, less
// the pixel) are marked and filled in. The band follows a head track (track_region output: frame, cx, cy, ang, scale,
// about the tracked box's centre), smoothed over time, and is given relative to the head at the track's reference
// frame. Writes "<part>_<name> (frames A-B).mov": the source clip with the fill laid over it.
// usage: node glasses_remove.js FFMPEG_BIN UPLOAD_DIR SOURCE.mov PART FIRST LAST HEAD.tsv
//          --band=DX,DY,RX,RY  (centre offset from the tracked head centre, and half-width/height, at scale 1)
//          [--radius=R] [--thresh=T0,T1] [--name=NAME] [--fillfrom=PART_CLIP.mov]
//          [--paint=skin [--grow=G] [--glints=T0,T1] [--fillrule=dark|robust]] [--tmax=T]
// Fills:
//   (default)   from the unmarked pixels around it (Gaussian, sigma 1.5, 9x9): wipes eyes too if R is 2 or more.
//   --fillfrom  from another render of the whole part (e.g. Proteus, her eyes without glasses), matched to
//               Starlight's local brightness and colour.
//   --paint=skin  the targeted one (use with --radius=1): each marked pixel takes the skin right beside it (unmarked,
//               skin-coloured pixels within 2 pixels, up to 6 if there are too few), so no eye, hair, shadow or distant
//               highlight is blended in. --fillrule=dark uses the darker half of those (rims sit in the eye sockets'
//               shadow); robust uses all but the outliers (more than 30 levels of (r+g+b)/3 off their median, like a
//               glint or a pupil); trim drops the brightest fifth and the darkest tenth and averages the rest (it moves
//               smoothly where lit skin meets shadow, where the median jumps between the two). --grow=G widens the mark G pixels at 70% for the lines' soft edges; --glints=T0,T1
//               also marks small bright spots in the band (the lenses' reflections), brighter than their surroundings
//               by T0 and up (full at T0+T1), over a (2G+1)-square with --glintradius=G (default R).
// --strength=S lays the fill over at S (0-1) of full strength, to make the lines fainter rather than remove them;
// --start=F leaves frames before part frame F alone and brings the fill in over the 4 frames from F (102's B24: the
// lower rim under her left eye, from 6515).
// --tmax=T: a pixel counts as marked if it is in any of the T frames either side (head movement allowed for), so the
// fill doesn't switch on and off where Starlight's rims come and go (102's B22: T=2). --tfill=T averages each fill
// with the fills at the same place on her head in the T frames either side.
// SOURCE.mov is read from its first frame as part frame FIRST (a composite named "(frames FIRST-...)" or similar).
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [bin, dir, src, part, firstA, lastA, headFile] = args.filter(a => !a.startsWith('--'));
const FIRST = +firstA, LAST = +lastA, N = LAST - FIRST + 1, W = 1284, H = 752;
const [BDX, BDY, BRX, BRY] = opt.band.split(',').map(Number), R = +(opt.radius ?? 2), [T0, T1] = (opt.thresh ?? '5,10').split(',').map(Number);
const NAME = opt.name ?? 'noglasses', PAINT = opt.paint === 'skin', GROW = +(opt.grow ?? 0), TMAX = +(opt.tmax ?? 0), TFILL = +(opt.tfill ?? 0);
const STRENGTH = +(opt.strength ?? 1), START = opt.start !== undefined ? +opt.start : null;
const GL = opt.glints ? opt.glints.split(',').map(Number) : null, RULE = opt.fillrule ?? 'dark', GR = +(opt.glintradius ?? R);
// (--skin=LMIN,RB: what counts as skin to paint from: brighter than LMIN and red over blue by more than RB; default
// 18,8; lower for a face in deep shadow, 102's B24: 14,2)
const [SKL, SKRB] = (opt.skin ?? '18,8').split(',').map(Number);
const skinLike = (r, g, b) => { const l = (r + g + b) / 3; return r > b + SKRB && r >= g - 4 && l > SKL && l < 210; };

// head track, smoothed (Gaussian, sigma 2 frames)
const tr = fs.readFileSync(headFile, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t').map(Number));
const at = f => tr.find(r => r[0] === f);
const head = [...Array(N)].map((_, k) => [1, 2, 3, 4].map(i => {
  let s = 0, w = 0;
  for (let j = Math.max(0, k - 6); j <= Math.min(N - 1, k + 6); j++) { const r = at(FIRST + j); if (!r) continue; const ww = Math.exp(-((j - k) ** 2) / 8); s += ww * r[i]; w += ww; }
  return s / w;
}));

// everything happens in a box around the head's whole path
const [X0, Y0, X1, Y1] = (() => { const xs = head.map(h => h[0]), ys = head.map(h => h[1]);
  const m = Math.max(BRX, BRY) * 1.3 + Math.hypot(BDX, BDY) * 1.3 + 2 * R + 8;
  return [Math.max(0, Math.floor(Math.min(...xs) - m)), Math.max(0, Math.floor(Math.min(...ys) - m)), Math.min(W, Math.ceil(Math.max(...xs) + m)), Math.min(H, Math.ceil(Math.max(...ys) + m))]; })();
const BW = X1 - X0, BH = Y1 - Y0, P = BW * BH;
const crops = file => execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', file, '-vf',
  `scale=in_color_matrix=bt709:in_range=tv,crop=${BW}:${BH}:${X0}:${Y0},format=rgb24`, '-frames:v', String(N), '-f', 'rawvideo', '-'], { maxBuffer: 1 << 29 });
const SRC = crops(src);
const FILL = opt.fillfrom ? execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', opt.fillfrom, '-vf',
  `select='between(n,${FIRST},${LAST})',scale=in_color_matrix=bt709:in_range=tv,crop=${BW}:${BH}:${X0}:${Y0},format=rgb24`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 29 }) : null;

// marks, every frame
const pass = (a, b, horiz, f, r = R) => { for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { let v = f === Math.max ? -1 : 1e9;
  for (let d = -r; d <= r; d++) { const xx = horiz ? Math.min(BW - 1, Math.max(0, x + d)) : x, yy = horiz ? y : Math.min(BH - 1, Math.max(0, y + d)); v = f(v, a[yy * BW + xx]); } b[y * BW + x] = v; } };
const marks = [...Array(N)].map((_, k) => {
  const fr = SRC.subarray(k * P * 3, (k + 1) * P * 3), L = new Float32Array(P), tmp = new Float32Array(P), C = new Float32Array(P), O = new Float32Array(P), m = new Float32Array(P);
  for (let i = 0; i < P; i++) L[i] = 0.2126 * fr[3 * i] + 0.7152 * fr[3 * i + 1] + 0.0722 * fr[3 * i + 2];
  pass(L, tmp, true, Math.max); pass(tmp, C, false, Math.max); pass(C, tmp, true, Math.min); pass(tmp, C, false, Math.min);   // closing
  if (GL) { pass(L, tmp, true, Math.min, GR); pass(tmp, O, false, Math.min, GR); pass(O, tmp, true, Math.max, GR); pass(tmp, O, false, Math.max, GR); }   // opening
  const [hx, hy, ha, hs] = head[k], t = ha * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    // the band, in head coordinates (rotated and scaled with the head), feathered over 2 pixels
    const dx = X0 + x + 0.5 - hx, dy = Y0 + y + 0.5 - hy, u = (c * dx + s * dy) / hs - BDX, v = (-s * dx + c * dy) / hs - BDY;
    const band = Math.min(1, Math.max(0, (1 - Math.hypot(u / BRX, v / BRY)) * Math.min(BRX, BRY) / 2)), i = y * BW + x;
    let mv = Math.min(1, Math.max(0, (C[i] - L[i] - T0) / T1));
    if (GL) mv = Math.max(mv, Math.min(1, Math.max(0, (L[i] - O[i] - GL[0]) / GL[1])));
    m[i] = band * mv;
  }
  for (let gi = 0; gi < GROW; gi++) {
    tmp.set(m);
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { let v = tmp[y * BW + x];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < BW && yy < BH) v = Math.max(v, 0.7 * tmp[yy * BW + xx]); }
      m[y * BW + x] = v; }
  }
  return m;
});
// --tmax: the strongest mark over the T frames either side, each moved by the head's movement since (whole pixels)
const M = TMAX ? marks.map((_, k) => {
  const out = new Float32Array(marks[k]);
  for (let j = Math.max(0, k - TMAX); j <= Math.min(N - 1, k + TMAX); j++) {
    if (j === k) continue;
    const sx = Math.round(head[k][0] - head[j][0]), sy = Math.round(head[k][1] - head[j][1]), mj = marks[j];
    for (let y = 0; y < BH; y++) { const yy = y - sy; if (yy < 0 || yy >= BH) continue;
      for (let x = 0; x < BW; x++) { const xx = x - sx; if (xx < 0 || xx >= BW) continue; out[y * BW + x] = Math.max(out[y * BW + x], mj[yy * BW + xx]); } }
  }
  return out;
}) : marks;

// fills, and the overlay frames
const outFile = path.join(dir, `${part}_${NAME} (frames ${FIRST}-${LAST}).mov`);
const writer = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
  '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', '30000/1001', '-i', 'pipe:0',
  '-filter_complex', `[0:v]setpts=PTS-STARTPTS,format=yuv444p10le[s];[1:v]setpts=PTS-STARTPTS,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuva444p10le[o];[s][o]overlay=format=yuv444p10,format=yuv422p10le[v]`,
  '-map', '[v]', '-frames:v', String(N), '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', outFile], { stdio: ['pipe', 'ignore', 'inherit'] });
const done = new Promise((res, rej) => writer.on('close', c => (c ? rej(new Error('encode failed')) : res())));
const overlay = Buffer.alloc(W * H * 4);
let filled = 0;
const fills = [...Array(N)].map(() => ({ rgb: new Float32Array(P * 3), a: new Float32Array(P) }));
const frameOverlay = k => {
  const fr = SRC.subarray(k * P * 3, (k + 1) * P * 3), m = M[k], fo = k * P * 3;
  const put = (x, y, rgb, a) => { const i = y * BW + x; for (let q = 0; q < 3; q++) fills[k].rgb[3 * i + q] = rgb[q]; fills[k].a[i] = a; filled++; };
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const mm = m[y * BW + x]; if (mm <= 0.02) continue;
    if (PAINT) {
      let cand = [];
      for (const rad of [2, 3, 4, 5, 6]) {
        cand = [];
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= BW || yy >= BH || m[yy * BW + xx] >= 0.05) continue;
          const i = 3 * (yy * BW + xx); if (!skinLike(fr[i], fr[i + 1], fr[i + 2])) continue;
          cand.push([fr[i] + fr[i + 1] + fr[i + 2], Math.exp(-(dx * dx + dy * dy) / 2), i]);
        }
        if (cand.length >= 4) break;
      }
      if (cand.length < 4) continue;
      cand.sort((p, q) => p[0] - q[0]);
      if (RULE === 'dark') cand = cand.slice(0, Math.ceil(cand.length / 2));
      else if (RULE === 'trim') cand = cand.slice(Math.floor(cand.length * 0.1), Math.max(Math.floor(cand.length * 0.1) + 1, Math.ceil(cand.length * 0.8)));
      else { const med = cand[Math.floor(cand.length / 2)][0]; cand = cand.filter(cc => Math.abs(cc[0] - med) <= 90); }
      let sw = 0; const acc = [0, 0, 0];
      for (const [, w, i] of cand) { acc[0] += w * fr[i]; acc[1] += w * fr[i + 1]; acc[2] += w * fr[i + 2]; sw += w; }
      put(x, y, acc.map(v => v / sw), mm);
      continue;
    }
    let sw = 0; const acc = [0, 0, 0], accF = [0, 0, 0];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= BW || yy >= BH) continue;
      const w = Math.exp(-(dx * dx + dy * dy) / 4.5) * (1 - m[yy * BW + xx]) ** 2; if (w <= 0) continue;
      const i = 3 * (yy * BW + xx); acc[0] += w * fr[i]; acc[1] += w * fr[i + 1]; acc[2] += w * fr[i + 2]; sw += w;
      if (FILL) { const j = fo + i; accF[0] += w * FILL[j]; accF[1] += w * FILL[j + 1]; accF[2] += w * FILL[j + 2]; }
    }
    if (sw <= 1e-6) continue;
    if (FILL) { const j = fo + 3 * (y * BW + x); put(x, y, [0, 1, 2].map(q => FILL[j + q] * Math.min(1.6, Math.max(0.6, (acc[q] + 4) / (accF[q] + 4)))), mm); }
    else put(x, y, acc.map(v => v / sw), mm);
  }
};
for (let k = 0; k < N; k++) frameOverlay(k);
const layOut = k => {
  overlay.fill(0);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const i = y * BW + x, a = fills[k].a[i]; if (a <= 0) continue;
    const acc = [0, 0, 0]; let sw = 0;
    for (let j = Math.max(0, k - TFILL); j <= Math.min(N - 1, k + TFILL); j++) {
      const xx = x - Math.round(head[k][0] - head[j][0]), yy = y - Math.round(head[k][1] - head[j][1]);
      if (xx < 0 || yy < 0 || xx >= BW || yy >= BH) continue;
      const ii = yy * BW + xx; if (fills[j].a[ii] <= 0) continue;
      const w = Math.exp(-((j - k) ** 2) / (2 * Math.max(1, TFILL) ** 2));
      for (let q = 0; q < 3; q++) acc[q] += w * fills[j].rgb[3 * ii + q]; sw += w;
    }
    const o = 4 * ((Y0 + y) * W + X0 + x);
    for (let q = 0; q < 3; q++) overlay[o + q] = Math.max(0, Math.min(255, Math.round(acc[q] / sw)));
    overlay[o + 3] = Math.round(255 * a * STRENGTH * (START === null ? 1 : Math.min(1, Math.max(0, (FIRST + k - START + 1) / 4))));
  }
};
(async () => {
  for (let k = 0; k < N; k++) {
    layOut(k);
    if (!writer.stdin.write(Buffer.from(overlay))) await new Promise(r => writer.stdin.once('drain', r));
  }
  writer.stdin.end(); await done;
  console.log(`${path.basename(outFile)}: ${N} frames, ${(filled / N).toFixed(0)} pixels filled per frame on average; band ${BDX},${BDY} ±${BRX}x${BRY}, radius ${R}, threshold ${T0}+${T1}${PAINT ? `, skin paint (${RULE}), grow ${GROW}` : ''}${GL ? `, glints ${GL}` : ''}${TMAX ? `, marks held ±${TMAX} frames` : ''}${TFILL ? `, fills averaged ±${TFILL} frames` : ''}`);
})();
