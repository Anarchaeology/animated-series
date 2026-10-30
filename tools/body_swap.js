// Swaps a person's whole figure for another render (e.g. Proteus) in a shot: Starlight everywhere else. The figure is
// two feathered ovals, one following a head track and one following a torso track (track_region output: frame, cx,
// cy, ...; several torso tracks are averaged), both smoothed over time, cut off sharply below --above=Y (whatever
// stands in front of her, e.g. the crates in 102's B22). Writes "<part>_<name> (frames A-B).mov".
// usage: node body_swap.js FFMPEG_BIN UPLOAD_DIR PART FIRST LAST --head=HEAD.tsv --torso=T1.tsv[,T2.tsv]
//          --headshape=DX,DY,RX,RY --torsoshape=DX,DY,RX,RY  (centre offset from the track's centre, half-width/height)
//          [--above=Y] [--feather=PX] [--from=proteus] [--name=NAME]
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [bin, dir, part, firstA, lastA] = args.filter(a => !a.startsWith('--'));
const FIRST = +firstA, LAST = +lastA, N = LAST - FIRST + 1, W = 1284, H = 752;
const FROM = opt.from ?? 'proteus', NAME = opt.name ?? `body${FROM}`, ABOVE = +(opt.above ?? H), FEATHER = +(opt.feather ?? 6);
const HS = opt.headshape.split(',').map(Number), TS = opt.torsoshape.split(',').map(Number);

// tracks: centre per frame, several averaged, then smoothed (Gaussian, sigma 3 frames)
const readTrack = file => { const rows = fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t').map(Number)); return f => rows.find(r => r[0] === f); };
const path2 = (files) => {
  const tr = files.split(',').map(readTrack);
  const raw = [...Array(N)].map((_, k) => [1, 2].map(i => tr.reduce((s, t) => s + t(FIRST + k)[i], 0) / tr.length));
  return raw.map((_, k) => [0, 1].map(i => { let s = 0, w = 0;
    for (let j = Math.max(0, k - 9); j <= Math.min(N - 1, k + 9); j++) { const ww = Math.exp(-((j - k) ** 2) / 18); s += ww * raw[j][i]; w += ww; }
    return s / w; }));
};
const headP = path2(opt.head), torsoP = path2(opt.torso);

// the box everything happens in
const ovals = k => [[headP[k][0] + HS[0], headP[k][1] + HS[1], HS[2], HS[3]], [torsoP[k][0] + TS[0], torsoP[k][1] + TS[1], TS[2], TS[3]]];
let X0 = W, Y0 = H, X1 = 0, Y1 = 0;
for (let k = 0; k < N; k++) for (const [cx, cy, rx, ry] of ovals(k)) { X0 = Math.min(X0, cx - rx); X1 = Math.max(X1, cx + rx); Y0 = Math.min(Y0, cy - ry); Y1 = Math.max(Y1, cy + ry); }
X0 = Math.max(0, Math.floor(X0) - 1); Y0 = Math.max(0, Math.floor(Y0) - 1); X1 = Math.min(W, Math.ceil(X1) + 1); Y1 = Math.min(H, Math.ceil(Math.min(Y1, ABOVE)) + 1);
const BW = X1 - X0, BH = Y1 - Y0, P = BW * BH;
const SRC = execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', path.join(dir, `${part}_${FROM}.mov`), '-vf',
  `select='between(n,${FIRST},${LAST})',scale=in_color_matrix=bt709:in_range=tv,crop=${BW}:${BH}:${X0}:${Y0},format=rgb24`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 29 });

const outFile = path.join(dir, `${part}_${NAME} (frames ${FIRST}-${LAST}).mov`);
const writer = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
  '-i', path.join(dir, `${part}_starlight.mov`), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', '30000/1001', '-i', 'pipe:0',
  '-filter_complex', `[0:v]trim=start_frame=${FIRST}:end_frame=${LAST + 1},setpts=PTS-STARTPTS,format=yuv444p10le[s];[1:v]setpts=PTS-STARTPTS,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuva444p10le[o];[s][o]overlay=format=yuv444p10,format=yuv422p10le[v]`,
  '-map', '[v]', '-frames:v', String(N), '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', outFile], { stdio: ['pipe', 'ignore', 'inherit'] });
const done = new Promise((res, rej) => writer.on('close', c => (c ? rej(new Error('encode failed')) : res())));
const overlay = Buffer.alloc(W * H * 4);
(async () => {
  for (let k = 0; k < N; k++) {
    overlay.fill(0);
    const ov = ovals(k), fr = SRC.subarray(k * P * 3, (k + 1) * P * 3);
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const X = X0 + x + 0.5, Y = Y0 + y;
      let a = 0;
      for (const [cx, cy, rx, ry] of ov) { const d = Math.hypot((X - cx) / rx, (Y + 0.5 - cy) / ry); a = Math.max(a, Math.min(1, Math.max(0, (1 - d) * Math.min(rx, ry) / FEATHER))); }
      a *= Math.min(1, Math.max(0, ABOVE - Y));     // a pixel row is kept whole above the cut, gone below it
      if (a <= 0) continue;
      const i = 3 * (y * BW + x), o = 4 * ((Y0 + y) * W + X0 + x);
      overlay[o] = fr[i]; overlay[o + 1] = fr[i + 1]; overlay[o + 2] = fr[i + 2]; overlay[o + 3] = Math.round(255 * a);
    }
    if (!writer.stdin.write(Buffer.from(overlay))) await new Promise(r => writer.stdin.once('drain', r));
  }
  writer.stdin.end(); await done;
  console.log(`${path.basename(outFile)}: ${N} frames; ${FROM} through ovals head ${HS} and torso ${TS}, feather ${FEATHER} px, cut at y ${ABOVE}; box ${X0},${Y0}-${X1},${Y1}`);
})();
