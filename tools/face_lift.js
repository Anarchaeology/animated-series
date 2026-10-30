// Brightens a face in an original (352x188 ProRes) clip before it goes to Starlight, so a dim, far-off face gives it
// less to invent from (102's glasses shots: Starlight drew glasses on her, probably out of dark eye sockets). Inside a
// feathered oval that follows the face, luma goes through a gamma curve (n' = n^G on 64-940 luma) and chroma is
// scaled by the same brightness ratio, so the colour isn't washed out; everything else passes through untouched.
// After Starlight, the same oval and the inverse curve (n = n'^(1/G)) take the face back down to its own brightness.
// usage: node face_lift.js FFMPEG_BIN IN.mov OUT.mov OVALS.tsv SEGMENTS G1[,G2...]
//   OVALS.tsv  frame, cx, cy, rx, ry per part frame, in full-size (1284x752) coordinates
//   SEGMENTS   which part frames IN's frames are: A-B@F,... (IN's frames from A on are part frames F, F+1 ...)
//   G1,G2      one or more gammas: OUT holds IN once per gamma, one after another
const fs = require('fs'), { spawn } = require('child_process'), path = require('path');
const [bin, inFile, outFile, ovalFile, segArg, gArg] = process.argv.slice(2);
const W = 352, H = 188, CW = W / 2, FS = W * H * 2 + 2 * CW * H * 2, SX = W / 1284, SY = H / 752;
const ov = new Map(fs.readFileSync(ovalFile, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t').map(Number)).map(r => [r[0], r.slice(1)]));
const segs = segArg.split(',').map(s => { const [ab, f] = s.split('@'); const [a, b] = ab.split('-').map(Number); return { a, b, f: +f }; });
const partFrame = k => { const s = segs.find(s => k >= s.a && k <= s.b); return s ? s.f + k - s.a : null; };
const gammas = gArg.split(',').map(Number);

const writer = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv422p10le', '-s', `${W}x${H}`,
  '-framerate', '30000/1001', '-i', 'pipe:0', '-vf', 'setsar=21/23', '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0',
  '-colorspace', 'smpte170m', '-color_primaries', 'smpte170m', '-color_trc', 'smpte170m', '-color_range', 'tv', '-movie_timescale', '30000',
  '-metadata', `comment=face lifted (gamma ${gammas.join(', then ')}) for Starlight, ovals from ${path.basename(ovalFile)}`, outFile], { stdio: ['pipe', 'ignore', 'inherit'] });
const done = new Promise((res, rej) => writer.on('close', c => (c ? rej(new Error('encode failed')) : res())));

const lift = (buf, k, G) => {
  const pf = partFrame(k), o = pf != null && ov.get(pf); if (!o) return { n: 0 };
  const [cx, cy, rx, ry] = o, ox = (cx + 0.5) * SX - 0.5, oy = (cy + 0.5) * SY - 0.5, orx = rx * SX, ory = ry * SY;
  const Y = new Uint16Array(buf.buffer, buf.byteOffset, W * H), U = new Uint16Array(buf.buffer, buf.byteOffset + W * H * 2, CW * H), V = new Uint16Array(buf.buffer, buf.byteOffset + W * H * 2 + CW * H * 2, CW * H);
  // mask: full inside 60% of the oval, smooth to nothing at its edge
  const m = x => 0, mask = new Float32Array(W * H); let n = 0;
  for (let y = Math.max(0, Math.floor(oy - ory)); y <= Math.min(H - 1, Math.ceil(oy + ory)); y++)
    for (let x = Math.max(0, Math.floor(ox - orx)); x <= Math.min(W - 1, Math.ceil(ox + orx)); x++) {
      const d = Math.hypot((x - ox) / orx, (y - oy) / ory), t = Math.min(1, Math.max(0, (1 - d) / 0.4));
      if (t > 0) { mask[y * W + x] = t * t * (3 - 2 * t); n++; } }
  const ratio = new Float32Array(W * H).fill(1);
  for (let i = 0; i < W * H; i++) { const mk = mask[i]; if (!mk) continue;
    const y0 = Y[i], nrm = Math.min(1, Math.max(0, (y0 - 64) / 876)), y1 = 64 + 876 * Math.pow(nrm, G), yb = y0 + mk * (y1 - y0);
    Y[i] = Math.round(Math.min(940, Math.max(64, yb))); ratio[i] = Math.min(2.5, Math.max(1, (yb - 64 + 4) / (y0 - 64 + 4))); }
  for (let y = 0; y < H; y++) for (let c = 0; c < CW; c++) { const i = y * W + 2 * c, r = (ratio[i] + ratio[i + 1]) / 2; if (r === 1) continue;
    const j = y * CW + c; U[j] = Math.round(Math.min(960, Math.max(64, 512 + (U[j] - 512) * r))); V[j] = Math.round(Math.min(960, Math.max(64, 512 + (V[j] - 512) * r))); }
  return { n };
};
const pass = G => new Promise((res, rej) => {
  const reader = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', inFile, '-f', 'rawvideo', '-pix_fmt', 'yuv422p10le', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let pending = Buffer.alloc(0), k = 0;
  reader.stdout.on('data', chunk => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= FS) {
      const fr = Buffer.from(pending.subarray(0, FS)); pending = pending.subarray(FS);
      lift(fr, k++, G);
      if (!writer.stdin.write(fr)) { reader.stdout.pause(); writer.stdin.once('drain', () => reader.stdout.resume()); }
    }
  });
  reader.on('close', c => (c ? rej(new Error('read failed')) : res(k)));
});
(async () => {
  const counts = []; for (const G of gammas) counts.push(await pass(G));
  writer.stdin.end(); await done;
  console.log(`${path.basename(outFile)}: ${counts.join(' + ')} frames, gamma ${gammas.join(', then ')}`);
})();
