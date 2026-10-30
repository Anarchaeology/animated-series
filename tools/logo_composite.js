// Puts a correctly spelled Bronto Burger logo onto a shot: takes the logo from a reference frame where Starlight got
// it right, tracks where the logo sits in each frame of the target shot (an affine fit of the reference's green to the
// original's green, which is blurry but in the right place), warps the reference onto Starlight there, and matches its
// colour to each frame. Writes UPLOAD_DIR/<part>_logo (frames A-B).mov (Starlight with the logo laid over, ProRes 422 HQ,
// BT.709, 1284x752), usable as a fix source, and OUT_DIR/track.tsv (per-frame fit, score, gain).
// The shirt's red text below the picture can be handled too: it is found in the original, in an area below the tracked
// logo, and --redmode=orig lays the original
// (plainly enlarged: soft, but what's really there) over it, --redmode=remove paints the red letters out to the
// shirt's colour. --name=NAME changes the output's name (default logo). --align moves the logo onto where Starlight's
// own logo is, for fast moves where the original's blur makes the fit trail.
// usage: node logo_composite.js FFMPEG_BIN UPLOAD_DIR REF_PART REF_FRAME PART FIRST LAST OUT_DIR [--soft=0.8] [--grow=6]
//        [--lockshape=A-B] [--guard] [--fade=6] [--nologo] [--redmode=orig|remove] [--name=logo] [--nosmooth]
//        [--align[=centroid]] [--alignblur=1.5] [--alignsmooth=3] [--color=green|orange] [--search=X0,Y0,X1,Y1] [--refbox=...]
//        [--orangeoff=40] [--orangegain=2] [--trackon=original|starlight] [--shape=a,b,c,d] [--clean] [--cleanoff=30]
//        [--hold] [--maxbright=V] [--persist] [--minscore=0.5] [--pin] [--place=CX,CY,WIDTH,ANGLE]
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [bin, dir, refPart, refFrameArg, part, firstArg, lastArg, out] = args.filter(a => !a.startsWith('--'));
const W = 1284, H = 752, HW = 642, HH = 376, FIRST = +firstArg, LAST = +lastArg, N = LAST - FIRST + 1;
const SOFT = +(opt.soft ?? 0.8), GROW = +(opt.grow ?? 6);
fs.mkdirSync(out, { recursive: true });

// ---- frame reading -------------------------------------------------------------------------------------------
const STAR = 'scale=in_color_matrix=bt709:in_range=tv,format=rgb24';
const ORIG = `scale=${W}:${H}:flags=bicubic:in_color_matrix=bt601:in_range=tv,format=rgb24`;
function frames(file, first, last, filter, onFrame) {
  return new Promise((res, rej) => {
    const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', file, '-vf',
      `trim=start_frame=${first}:end_frame=${last + 1},setpts=PTS-STARTPTS,${filter}`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const size = W * H * 3;
    let pending = Buffer.alloc(0), k = 0;
    ff.stdout.on('data', c => {
      pending = pending.length ? Buffer.concat([pending, c]) : c;
      while (pending.length >= size) { onFrame(Buffer.from(pending.subarray(0, size)), k++); pending = pending.subarray(size); }
    });
    ff.on('close', c => (c ? rej(new Error(`ffmpeg failed reading ${file}`)) : res(k)));
  });
}
const oneFrame = async (file, f, filter) => { let got; await frames(file, f, f, filter, b => (got = b)); return got; };
// several files read in step: onFrames gets frame k of each once all have it
function zipFrames(specs, first, last, onFrames) {
  const got = specs.map(() => new Map());
  let next = 0;
  const flush = () => { while (got.every(m => m.has(next))) { onFrames(got.map(m => m.get(next)), next); got.forEach(m => m.delete(next)); next++; } };
  return Promise.all(specs.map((s, i) => frames(s.file, s.first ?? first, s.last ?? last, s.filter, (b, k) => { got[i].set(k, b); flush(); })));
}

// ---- image helpers -------------------------------------------------------------------------------------------
// green-ness: how much green stands above red and blue (the logo is saturated green, little else in these shots is).
// --color=orange instead: twice how far red stands above blue past 40, for Episode 102's BABOONS shirt text (red minus
// blue 60-110 on the text; her face, hair, black shirt and the walls stay under about 50). The names below say
// "green" either way. In dim, cool light (the truck cab) the text is only 15-35 above blue: --orangeoff=8
// --orangegain=4 then (default 40 and 2); the reference frame always uses the defaults.
const ORANGE = opt.color === 'orange', OFF = +(opt.orangeoff ?? 40), OGAIN = +(opt.orangegain ?? 2);
const CLEAN = 'clean' in opt, CLOFF = +(opt.cleanoff ?? 30);
// (what the cleaning counts as Starlight's lettering: red over blue for the orange BABOONS, green over the larger of red
// and blue for the green Bronto Burger logo, 101's L10)
const tintAt = (img, i) => ORANGE ? img[i] - img[i + 2] : img[i + 1] - Math.max(img[i], img[i + 2]);
// --cleanfill=local: paint the cleaning with the shirt's colour right around each pixel (its non-orange, non-skin
// pixels, Gaussian sigma 3) instead of one median colour for the whole area, so it stays as light as the shirt where
// the shirt is lit (beside her arm in 102's B22, where the flat colour left a dark smudge)
const LOCALFILL = opt.cleanfill === 'local';
// --cleanwide: and where there's no shirt within that reach (inside a big blurred smear of Starlight's lettering, as
// the print swings round her side in 102's alley turn), from further out (sigma 10) rather than leaving it
const CLWIDE = 'cleanwide' in opt;
// --refedge[=INSET,SIGMA]: where the reference has no picture (a pixel that maps past the edge of the reference frame,
// e.g. the corner of 102's B26 print that runs off the bottom of frame 2687), neither the word nor the cleaning is
// drawn, so Starlight's own print shows there; both ease off over 4 reference pixels, starting INSET pixels inside the
// edge (default 0; the reference's last rows are dim). With SIGMA, Starlight's print there is softened by that much
// (its letters there are misspelled), only where it's lettering (orange), not the shirt around it
const REFEDGE = 'refedge' in opt, [RE_INSET, RE_SIG] = (opt.refedge || '0,0').split(',').map(Number);
// --cleankeys=F:V;F:V...: how strongly to clean, by part frame (straight lines between, held past the ends): e.g. easing
// off as the print turns into an unreadable smear, where Starlight's own smear is already right and only the new
// word's squeezed glow goes over it (102's alley turn)
// --wordkeys=F:V;...: the same for the new word alone, the cleaning left as it is: e.g. kept off while she's turned
// away and only Starlight's own unreadable glow should show at her chest's edge (the alley turn's way back)
const keyCurve = arg => { if (!arg) return () => 1; const ks = arg.split(';').map(s => s.split(':').map(Number)).sort((a, b) => a[0] - b[0]);
  return f => { if (f <= ks[0][0]) return ks[0][1];
    for (let j = 1; j < ks.length; j++) if (f <= ks[j][0]) { const [a, va] = ks[j - 1], [b, vb] = ks[j]; return va + (vb - va) * (f - a) / (b - a); }
    return ks[ks.length - 1][1]; }; };
const cleanAt = keyCurve(opt.cleankeys), wordAt = keyCurve(opt.wordkeys);
// --cleancore=T: how orange (red over blue) a pixel must be to count as Starlight's lettering for the cleaning to
// reach it; default 45, lower for faint print in dim light (102's B15: 25)
const CLCORE = +(opt.cleancore ?? 45);
// --cleanfeather=PX: the cleaning eases off over the last PX pixels of its box instead of stopping at the box's edge,
// where warm light on the shirt that passes for lettering (her arm's glow at the armpit, 102's B23) was painted inside
// the box and left outside it, a straight edge with a corner
const CFEATHER = +(opt.cleanfeather ?? 0);
// --lettersonly=A-B: in part frames A-B only the word's letter strokes are drawn, not the dark shirt around them in
// the reference, for light that changes her shirt's colour (a gun's flash, 102's B15)
const LONLY = opt.lettersonly ? opt.lettersonly.split('-').map(Number) : null;
// --cleanskip=R,L: on pale, bright pixels (blue at about R of their red or more, a soft step from R-0.03 to R+0.03,
// and brighter than L, mean of r, g, b, soft over 10) the cleaning paints with the colour of everything around them,
// her arm included, instead of the shirt's alone: a warm-lit arm's tip touching the lettering (102's B23: arm 0.55
// and up, lettering 0.5 and under for all but 2% of it) is neither notched dark nor left showing letter flecks.
// --patchskip=R,L: the same for the new word's patch: on those pixels only the word's letters are drawn, not the dark
// shirt and glow around them, so the patch's edge can't lie over the arm's tip. A pixel at the edge of the tip is
// pale in some frames and not others, so what counts is the palest it gets within 8 frames either side (at the same
// place relative to the word), and only within about 3 pixels of real skin (skin test over a half: the arm itself),
// so a pale letter highlight at the far end of Starlight's word is still painted out
const CSKIP = opt.cleanskip ? opt.cleanskip.split(',').map(Number) : null, PSKIP = opt.patchskip ? opt.patchskip.split(',').map(Number) : null;
const SKIP = CSKIP || PSKIP;
const paleNow = (b, i) => Math.min(1, Math.max(0, (b[i + 2] / Math.max(1, b[i]) - (SKIP[0] - 0.03)) / 0.06)) * Math.min(1, Math.max(0, ((b[i] + b[i + 1] + b[i + 2]) / 3 - SKIP[1]) / 10));
// --protect: keep the word and the cleaning off skin, judged in each Starlight frame: lit pixels with blue at 58-66% of
// their red and up (an arm's highlight is 0.65-0.85, e.g. 226,203,159; the lettering 0-0.52, its yellow highlights
// included, e.g. 110,88,56), so a warm-lit arm beside the text isn't painted over or taken for lettering (102's B22).
// --protect=left also keeps clear, in each row, everything left of the arm's lit edge and 2 pixels past it (its
// shadowed rim), for an arm at the left end of the word
const PROTECT = 'protect' in opt, PROTLEFT = opt.protect === 'left';
const skinAt = (b, i) => { const r = b[i], bl = b[i + 2], l = (r + b[i + 1] + bl) / 3;
  return Math.min(1, Math.max(0, (bl / Math.max(1, r) - 0.58) / 0.08)) * Math.min(1, Math.max(0, (l - 40) / 20)); };
// --maxbright=V: in the shot (not the reference), ignore anything brighter than V (mean of red, green, blue): a sunlit
// orange wall behind her is as orange as the text but far brighter (B23: 133 against about 40)
const MAXB = +(opt.maxbright ?? 999);
// --minscore: the match (0-1) a fit needs to count, in the fixed-shape mode (default 0.5)
const MINSCORE = +(opt.minscore ?? 0.5);
const colorOf = (r, g, b, off = OFF, k = OGAIN, maxb = MAXB) =>
  ((r + g + b) / 3 > maxb ? 0 : ORANGE ? k * Math.max(0, r - b - off) : Math.max(0, g - Math.max(r, b)));
// (--refoff / --refgain: the reference's own setting, for a faint reference print, e.g. a tan one in dim greenish
// light: 102's part 10, where the reference is that part's frame 2687)
const refColorOf = (r, g, b) => colorOf(r, g, b, +(opt.refoff ?? 40), +(opt.refgain ?? 2), 999);
const greenAt = (b, i) => colorOf(b[i], b[i + 1], b[i + 2]);
const refGreenAt = (b, i) => refColorOf(b[i], b[i + 1], b[i + 2]);
// --search=X0,Y0,X1,Y1 (full-size pixels): look for the logo in the original only inside this box (e.g. her torso
// over the whole shot, away from the orange cookie sign); --refbox likewise for the reference frame
const boxOpt = s => (s ? s.split(',').map(Number) : null);
const SEARCH = boxOpt(opt.search), REFBOX = boxOpt(opt.refbox);
// half-resolution green map (642x376), zero outside KEEP (full-size box) if given
function greenHalf(buf, keep, at = greenAt) {
  const g = new Float32Array(HW * HH);
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    if (keep && (2 * x < keep[0] || 2 * x >= keep[2] || 2 * y < keep[1] || 2 * y >= keep[3])) continue;
    let s = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += at(buf, 3 * ((2 * y + dy) * W + 2 * x + dx));
    g[y * HW + x] = s / 4;
  }
  return g;
}
function blur(src, w, h, sigma, sigmaY = sigma) {   // separable Gaussian (optionally different across and down)
  if (sigma <= 0 && sigmaY <= 0) return Float32Array.from(src);
  const kern = s => { const r = Math.ceil(3 * s), k = []; for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * s * s))); const t = k.reduce((a, b) => a + b, 0); return { r, k: k.map(v => v / t) }; };
  const kx = kern(Math.max(0.3, sigma)), ky = kern(Math.max(0.3, sigmaY)), tmp = new Float32Array(w * h), dst = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let i = -kx.r; i <= kx.r; i++) s += kx.k[i + kx.r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let i = -ky.r; i <= ky.r; i++) s += ky.k[i + ky.r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    dst[y * w + x] = s;
  }
  return dst;
}
const bil = (img, w, h, x, y) => {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
  return (img[y0 * w + x0] * (1 - fx) + img[y0 * w + x1] * fx) * (1 - fy) + (img[y1 * w + x0] * (1 - fx) + img[y1 * w + x1] * fx) * fy;
};
// weighted centroid and covariance of a map above a threshold, inside an optional box
function moments(g, w, h, thr, box = [0, 0, w, h]) {
  let s = 0, mx = 0, my = 0;
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) { const v = g[y * w + x] - thr; if (v > 0) { s += v; mx += v * x; my += v * y; } }
  if (!s) return null;
  mx /= s; my /= s;
  let cxx = 0, cxy = 0, cyy = 0;
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) { const v = g[y * w + x] - thr; if (v > 0) { cxx += v * (x - mx) ** 2; cxy += v * (x - mx) * (y - my); cyy += v * (y - my) ** 2; } }
  return { s, mx, my, cxx: cxx / s, cxy: cxy / s, cyy: cyy / s };
}
// largest blob box: bounding box of pixels above thr, trimmed to the 2%-98% extents
function blobBox(g, w, h, thr) {
  const xs = [], ys = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] > thr) { xs.push(x); ys.push(y); }
  if (xs.length < 30) return null;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  return [q(xs, 0.02), q(ys, 0.02), q(xs, 0.98) + 1, q(ys, 0.98) + 1];
}
const sqrt2 = (a, b, d) => {            // square root of symmetric [[a,b],[b,d]]
  const s = Math.sqrt(a * d - b * b), t = Math.sqrt(a + d + 2 * s);
  return [(a + s) / t, b / t, b / t, (d + s) / t];
};
const inv2 = m => { const det = m[0] * m[3] - m[1] * m[2]; return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det]; };
const mul2 = (p, q) => [p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3], p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3]];

// ---- registration (half resolution) --------------------------------------------------------------------------
// p = [a, b, c, d, ex, ey]: a target point t maps to the reference at [[a,b],[c,d]] t + e
function ncc(p, T, box, R, step) {
  let n = 0, st = 0, sr = 0, stt = 0, srr = 0, str = 0;
  for (let y = box[1]; y < box[3]; y += step) for (let x = box[0]; x < box[2]; x += step) {
    const t = T[y * HW + x], r = bil(R, HW, HH, p[0] * x + p[1] * y + p[4], p[2] * x + p[3] * y + p[5]);
    n++; st += t; sr += r; stt += t * t; srr += r * r; str += t * r;
  }
  const vt = stt - st * st / n, vr = srr - sr * sr / n;
  return vt > 0 && vr > 0 ? (str - st * sr / n) / Math.sqrt(vt * vr) : -1;
}
function nelderMead(f, x0, steps, iters) {
  let pts = [x0, ...steps.map((s, i) => x0.map((v, j) => (j === i ? v + s : v)))].map(x => ({ x, v: f(x) }));
  for (let it = 0; it < iters; it++) {
    pts.sort((a, b) => a.v - b.v);
    const n = x0.length, c = x0.map((_, j) => pts.slice(0, n).reduce((s, p) => s + p.x[j], 0) / n), w = pts[n];
    const at = k => c.map((v, j) => v + k * (w.x[j] - v)), r = at(-1), fr = f(r);
    if (fr < pts[0].v) { const e = at(-2), fe = f(e); pts[n] = fe < fr ? { x: e, v: fe } : { x: r, v: fr }; }
    else if (fr < pts[n - 1].v) pts[n] = { x: r, v: fr };
    else {
      const k = at(fr < w.v ? -0.5 : 0.5), fk = f(k);
      if (fk < Math.min(fr, w.v)) pts[n] = { x: k, v: fk };
      else pts = pts.map((p, i) => (i ? { x: p.x.map((v, j) => pts[0].x[j] + 0.5 * (v - pts[0].x[j])), v: 0 } : p)).map((p, i) => (i ? { x: p.x, v: f(p.x) } : p));
    }
  }
  pts.sort((a, b) => a.v - b.v);
  return pts[0];
}

// value at index k of a weighted local polynomial (degree up to DEG) through series[k-HALF .. k+HALF], Gaussian weights
function localPoly(series, k, half, sigma, maxDeg) {
  const js = []; for (let j = Math.max(0, k - half); j <= Math.min(series.length - 1, k + half); j++) js.push(j);
  const w = js.map(j => Math.exp(-((j - k) ** 2) / (2 * sigma ** 2)));
  const n = Math.min(maxDeg, js.length >= 5 ? 2 : js.length >= 2 ? 1 : 0) + 1;
  // normal equations for v(j) = c0 + c1 (j-k) + c2 (j-k)^2 ...; the value at k is c0
  const a = Array.from({ length: n }, (_, r) => {
    const row = new Array(n + 1).fill(0);
    js.forEach((j, q) => { for (let c = 0; c < n; c++) row[c] += w[q] * (j - k) ** (r + c); row[n] += w[q] * (j - k) ** r * series[j]; });
    return row;
  });
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < n; r++) { const f = a[r][c] / a[c][c]; for (let t = c; t <= n; t++) a[r][t] -= f * a[c][t]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = a[r][n]; for (let t = r + 1; t < n; t++) s -= a[r][t] * x[t]; x[r] = s / a[r][r]; }
  return x[0];
}

(async () => {
  const fps = 30000 / 1001;
  // reference: Starlight frame with the logo spelled right
  const refBuf = await oneFrame(path.join(dir, `${refPart}_starlight.mov`), +refFrameArg, STAR);
  const refG = greenHalf(refBuf, REFBOX, refGreenAt);
  const refBox = blobBox(blur(refG, HW, HH, 2), HW, HH, 25);
  console.log(`reference logo box (half size): ${refBox}`);
  // reference patch alpha (full res): the text block and its glow, gaps filled, feathered
  const refGfull = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i - x) / W;
    if (!REFBOX || (x >= REFBOX[0] && x < REFBOX[2] && y >= REFBOX[1] && y < REFBOX[3])) refGfull[i] = refGreenAt(refBuf, 3 * i);
  }
  const cover = blur(refGfull, W, H, GROW);
  let cmax = 0; for (const v of cover) cmax = Math.max(cmax, v);
  // only around the logo itself (its box, padded by MARGIN pixels, edges feathered over 10)
  const PCUT = (opt.patchcut ?? '0.06,0.2').split(',').map(Number);
  const MARGIN = +(opt.margin ?? 18), fb = refBox.map((v, i) => 2 * v + (i < 2 ? -MARGIN : MARGIN));
  const alphaRef = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = cover[i] / cmax, edge = Math.min(x - fb[0], fb[2] - x, y - fb[1], fb[3] - y);
    if (edge <= 0) continue;
    // (--patchcut=LO,HI: where the patch fades in, as a share of the strongest coverage; default 0.06,0.2. Higher keeps
    // less of the reference's brown glow around the letters, for a small word next to an arm, 102's B22)
    alphaRef[i] = Math.min(1, Math.max(0, (v - PCUT[0]) / (PCUT[1] - PCUT[0]))) * Math.min(1, edge / 10);
    // --refcut=X: only the word left of X in the reference (fading out over the 3 pixels before it), e.g. 830 for
    // BABOON without its S where her hand covers the end of the word (102's B04)
    if (opt.refcut) alphaRef[i] *= Math.min(1, Math.max(0, (+opt.refcut - x) / 3));
  }
  // --occlude=MASK.png: a grey full-frame mask (white: show, black: hidden) for what stays in front of the shirt the
  // whole shot (a desk edge, a resting hand); neither the word nor the cleaning is drawn where it's dark
  const OCC = opt.occlude ? (() => {
    const g = execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', opt.occlude, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 24 });
    return Float32Array.from(g, v => v / 255);
  })() : null;
  // --occludeseq=DIR: the same, one mask per frame, DIR/<part frame>.png (e.g. sam_masks.py's mask of her shirt, so
  // the word and the cleaning stay on the shirt as it turns and her arm crosses it), feathered 1.5 px; multiplied with
  // --occlude where both are given
  let occK = -1, occMask = OCC;
  const occAt = k => {
    if (!opt.occludeseq || k === occK) return occMask;
    const g = execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', path.join(opt.occludeseq, `${FIRST + k}.png`),
      '-vf', 'gblur=sigma=1.5', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 24 });
    occK = k; occMask = Float32Array.from(g, (v, i) => v / 255 * (OCC ? OCC[i] : 1));
    return occMask;
  };
  // --mesh=TSV: bend the word along a tracked grid on the print (tracks_to_mesh.py: frame, i, j, x, y), instead of
  // one affine fit, so it can squeeze and wrap round her chest as she turns. Each pixel is found in this frame's grid,
  // taken back to the same spot of the grid on --meshanchor=F (default the first frame), and from there through that
  // frame's placement to the reference. Grid triangles turned over against the anchor's (the part of the print gone
  // round behind her) aren't drawn; pair it with --occludeseq for her outline. No grid for a frame: no word that frame.
  // Each pixel is sampled --meshss=N x N times (default 3), so where the grid squeezes the word, as print seen nearly
  // edge-on, its letters run together softly the way a camera would show them, instead of staying crisp. And where
  // the tracker says the print is out of sight, the word goes: --meshvis=LO,HI on the mesh's visible column (default
  // 0.03,0.3: CoTracker3 calls print squeezed against her outline hidden a little before it really is)
  const MVIS = (opt.meshvis || '0.03,0.3').split(',').map(Number), MSTRETCH = +(opt.meshstretch ?? 1.6);
  // --meshshift=F:DX,DY;...: the whole mesh moved by that many pixels, keyframed by part frame (straight lines between,
  // held past the ends; one value for the whole shot without F:), e.g. to follow where Starlight's own logo slowly
  // drifts on the shirt against the tracked points, measured and smoothed (101's L10)
  const MSHIFT = opt.meshshift ? opt.meshshift.split(';').map(s => { const [f, v] = s.includes(':') ? s.split(':') : [0, s]; return [+f, ...v.split(',').map(Number)]; }).sort((a, b) => a[0] - b[0]) : null;
  const shiftAt = f => { if (!MSHIFT) return [0, 0]; if (f <= MSHIFT[0][0]) return MSHIFT[0].slice(1);
    for (let j = 1; j < MSHIFT.length; j++) if (f <= MSHIFT[j][0]) { const [a, ax, ay] = MSHIFT[j - 1], [b, bx, by] = MSHIFT[j], u = (f - a) / (b - a); return [ax + (bx - ax) * u, ay + (by - ay) * u]; }
    return MSHIFT[MSHIFT.length - 1].slice(1); };
  const MESH = opt.mesh ? (() => {
    let cols = 0, rows = 0; const byFrame = new Map();
    for (const l of fs.readFileSync(opt.mesh, 'utf8').trim().split('\n').slice(1)) {
      const [f, i, j, x, y, v = 1] = l.split('\t').map(Number);
      cols = Math.max(cols, i + 1); rows = Math.max(rows, j + 1);
      if (!byFrame.has(f)) byFrame.set(f, []);
      byFrame.get(f).push([i, j, x, y, v]);
    }
    const frames = new Map();
    for (const [f, list] of byFrame) { const X = new Float32Array(cols * rows), Y = new Float32Array(cols * rows), S = new Float32Array(cols * rows);
      for (const [i, j, x, y, v] of list) { X[j * cols + i] = x; Y[j * cols + i] = y; S[j * cols + i] = Math.min(1, Math.max(0, (v - MVIS[0]) / (MVIS[1] - MVIS[0]))); }
      frames.set(f, { X, Y, S }); }
    const ss = +(opt.meshss ?? 3), sub = [];
    for (let v = 0; v < ss; v++) for (let u = 0; u < ss; u++) sub.push([(u + 0.5) / ss - 0.5, (v + 0.5) / ss - 0.5]);
    return { cols, rows, frames, sub, anchor: +(opt.meshanchor ?? FIRST) };
  })() : null;
  let ax0 = W, ay0 = H, ax1 = 0, ay1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alphaRef[y * W + x] > 0) { ax0 = Math.min(ax0, x); ax1 = Math.max(ax1, x); ay0 = Math.min(ay0, y); ay1 = Math.max(ay1, y); }
  console.log(`reference patch (full size): ${ax0},${ay0}-${ax1},${ay1}`);
  // --keystone=K and --vsquash=V: the word leaning back on her chest, top further away: its top edge narrower than its
  // bottom (by K of the width at the top edge; the middle row unchanged) and the whole word V as tall (102's B09a).
  // Applied in the reference's own frame, where the word is level, so it goes with the word's turn and slant
  const KEY = +(opt.keystone ?? 0), VSQ = +(opt.vsquash ?? 1), rcx = (ax0 + ax1) / 2, rcy = (ay0 + ay1) / 2, rhh = Math.max(1, (ay1 - ay0) / 2);
  const tilt = (rx, ry) => { if (!KEY && VSQ === 1) return [rx, ry]; const v = (ry - rcy) / VSQ, sv = 1 / (1 + KEY * Math.max(-1, Math.min(1, v / rhh)));
    return [rcx + (rx - rcx) * sv, rcy + v]; };

  // pass 1: target green maps from the original (blurry, but the logo is where it really is). --trackon=starlight
  // tracks Starlight's own (misspelled but sharp, rightly placed) logo instead, for small or dimly lit text the
  // original barely shows (102's room shots)
  const T = new Array(N), onStar = opt.trackon === 'starlight';
  await frames(path.join(dir, onStar ? `${part}_starlight.mov` : `${part}.mov`), FIRST, LAST, onStar ? STAR : ORIG, (b, k) => { T[k] = greenHalf(b, SEARCH); });
  // the logo's area in each frame: green above 30% of that frame's brightest green, so it still works in fades
  const gmax = T.map(g => { const b = blur(g, HW, HH, 1); let m = 0; for (const v of b) m = Math.max(m, v); return m; });
  const boxes = T.map((g, k) => (gmax[k] >= 6 ? blobBox(blur(g, HW, HH, 1), HW, HH, Math.max(4, Math.min(20, 0.3 * gmax[k]))) : null));
  const strength = T.map((g, k) => (boxes[k] ? moments(g, HW, HH, Math.max(4, Math.min(20, 0.3 * gmax[k])), boxes[k]).s : 0));
  const peak = strength.reduce((m, v, k) => (v > strength[m] ? k : m), 0);
  console.log(`logo found in ${boxes.filter(Boolean).length}/${N} frames; strongest at frame ${FIRST + peak}`);

  // blur level for the reference so it looks like the original: best NCC at the strongest frame (similarity fit)
  const fit = (k, R) => {
    const box = boxes[k].map((v, i) => Math.max(0, Math.min(i % 2 ? HH : HW, v + (i < 2 ? -14 : 14))));
    const mt = moments(T[k], HW, HH, 20, boxes[k]), mr = moments(R, HW, HH, 20, refBox.map((v, i) => Math.max(0, v + (i < 2 ? -6 : 6))));
    const St = sqrt2(mt.cxx, mt.cxy, mt.cyy), Sr = sqrt2(mr.cxx, mr.cxy, mr.cyy), StI = inv2(St);
    let best = null;
    for (let deg = -40; deg <= 40; deg += 2) {
      const a = deg * Math.PI / 180, Rm = [Math.cos(a), -Math.sin(a), Math.sin(a), Math.cos(a)];
      const A = mul2(mul2(Sr, Rm), StI), p = [...A, mr.mx - (A[0] * mt.mx + A[1] * mt.my), mr.my - (A[2] * mt.mx + A[3] * mt.my)];
      const v = ncc(p, T[k], box, R, 2);
      if (!best || v > best.v) best = { p, v };
    }
    return best;
  };
  let sigma = 0, refBlur = null, bestS = -2;
  for (const s of [1, 2, 3, 4, 5, 6, 8, 11, 15]) {
    const R = blur(refG, HW, HH, s), r = fit(peak, R), refined = nelderMead(p => -ncc(p, T[peak], boxes[peak].map((v, i) => Math.max(0, Math.min(i % 2 ? HH : HW, v + (i < 2 ? -14 : 14)))), R, 2), r.p, [0.04, 0.04, 0.04, 0.04, 3, 3], 250);
    console.log(`  reference blur ${s}: match ${(-refined.v).toFixed(3)}`);
    if (-refined.v > bestS) { bestS = -refined.v; sigma = s; refBlur = R; }
  }
  console.log(`reference blur ${sigma} (match ${bestS.toFixed(3)})`);

  // track: from the strongest frame outward, each frame starting from its neighbour's fit
  const P = new Array(N), score = new Array(N).fill(null);
  const winOf = (k, p) => {
    if (boxes[k]) return boxes[k].map((v, i) => Math.max(0, Math.min(i % 2 ? HH : HW, v + (i < 2 ? -14 : 14))));
    return null;
  };
  const solve = (k, start) => {
    const box = winOf(k);
    if (!box) return null;
    const r = nelderMead(p => -ncc(p, T[k], box, refBlur, 2), start, [0.02, 0.02, 0.02, 0.02, 1.5, 1.5], 160);
    return { p: r.x, v: -r.v };
  };
  const first = nelderMead(p => -ncc(p, T[peak], winOf(peak), refBlur, 2), fit(peak, refBlur).p, [0.04, 0.04, 0.04, 0.04, 3, 3], 400);
  P[peak] = first.x; score[peak] = -first.v;
  // frames where the logo can't be seen keep moving the way it was moving (a straight-line fit of the last 8
  // tracked frames), so the composite doesn't stop while the shirt carries on
  // --hold: for a still shot (102's B04, her hand resting over the text), the nearest tracked fit is kept instead,
  // at full strength
  const HOLD = 'hold' in opt;
  const extrapolate = (k, dirn) => {
    const pts = [];
    for (let j = k - dirn; j >= 0 && j < N && pts.length < 8; j -= dirn) if (score[j] != null) pts.push(j);
    if (HOLD && pts.length) return P[pts[0]];
    if (pts.length < 3) return P[k - dirn];
    return P[pts[0]].map((_, i) => {
      const n = pts.length, mj = pts.reduce((s, j) => s + j, 0) / n, mv = pts.reduce((s, j) => s + P[j][i], 0) / n;
      const b = pts.reduce((s, j) => s + (j - mj) * (P[j][i] - mv), 0) / pts.reduce((s, j) => s + (j - mj) ** 2, 0);
      return mv + b * (k - mj);
    });
  };
  // a fit whose shape jumps from the last good one (by more than 20% of it) is a misfit, e.g. a logo turning edge-on;
  // a misfit frame is skipped and filled in later, and tracking stops after 4 in a row
  const jump = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]) / Math.hypot(q[0], q[1], q[2], q[3]);
  for (const dirn of [1, -1]) {
    let bad = 0, good = peak;
    for (let k = peak + dirn; k >= 0 && k < N; k += dirn) {
      const r = bad >= 4 ? null : solve(k, P[good]);
      if (r && r.v > 0.5 && jump(r.p, P[good]) < 0.2) { P[k] = r.p; score[k] = r.v; good = k; bad = 0; }
      else { bad++; P[k] = extrapolate(k, dirn); }
    }
  }
  // gaps between tracked frames: straight-line in-between of the fits either side
  for (let k = 0; k < N; k++) if (score[k] == null) {
    let a = k - 1, b = k + 1;
    while (a >= 0 && score[a] == null) a--;
    while (b < N && score[b] == null) b++;
    if (a >= 0 && b < N) P[k] = P[a].map((v, i) => v + (P[b][i] - v) * (k - a) / (b - a));
  }
  // --lockshape=A-B (part frames): for small logos, where the fit can tilt and slant freely, take the logo's shape
  // (the fit without its size) from frames A-B where it looks right, and re-fit every frame with only size and
  // position free
  // --shape=a,b,c,d gives the shape outright instead (1,0,0,1: the reference as it is, only scaled), for Starlight-
  // tracked text, whose italic misspelled letters would otherwise slant the fit
  if (opt.lockshape || opt.shape) {
    const [la, lb] = (opt.lockshape || `${FIRST}-${LAST}`).split('-').map(v => +v - FIRST);
    const shapes = [];
    for (let k = Math.max(0, la); k <= Math.min(N - 1, lb); k++) if (score[k] != null) {
      const s = Math.sqrt(Math.abs(P[k][0] * P[k][3] - P[k][1] * P[k][2]));
      shapes.push(P[k].slice(0, 4).map(v => v / s));
    }
    const Bs = opt.shape ? opt.shape.split(',').map(Number) : [0, 1, 2, 3].map(i => shapes.map(s => s[i]).sort((p, q) => p - q)[Math.floor(shapes.length / 2)]);
    const n = Math.sqrt(Math.abs(Bs[0] * Bs[3] - Bs[1] * Bs[2])), Bm = Bs.map(v => v / n);
    console.log(`shape locked${opt.shape ? ' as given' : ` from ${shapes.length} frames`}: ${Bm.map(v => v.toFixed(3)).join(', ')}`);
    const full = q => [q[0] * Bm[0], q[0] * Bm[1], q[0] * Bm[2], q[0] * Bm[3], q[1], q[2]];
    const Q = new Array(N), score3 = new Array(N).fill(null);
    // start: the fit's size, and the offset that keeps the middle of the search window mapped where the free fit put
    // it (with a different shape, the free fit's own offset would put the logo elsewhere)
    const startOf = k => {
      const p = P[k], s = Math.sqrt(Math.abs(p[0] * p[3] - p[1] * p[2])), b = winOf(k) || [0, 0, HW, HH];
      const tx = (b[0] + b[2]) / 2, ty = (b[1] + b[3]) / 2, rx = p[0] * tx + p[1] * ty + p[4], ry = p[2] * tx + p[3] * ty + p[5];
      return [s, rx - s * (Bm[0] * tx + Bm[1] * ty), ry - s * (Bm[2] * tx + Bm[3] * ty)];
    };
    // start from the middle of the locked range, where the fit is good (with --shape alone: the strongest frame)
    const k0 = opt.lockshape ? Math.round((Math.max(0, la) + Math.min(N - 1, lb)) / 2) : peak;
    const r0 = nelderMead(q => -ncc(full(q), T[k0], winOf(k0), refBlur, 2), startOf(k0), [0.1, 3, 3], 200);
    Q[k0] = r0.x; score3[k0] = -r0.v;
    // --persist: after a frame where the fit fails, keep trying the next ones (from the last good fit) instead of giving
    // up for the rest of the shot; for Starlight-tracked text, whose misspelling flickers frame to frame
    const PERSIST = 'persist' in opt;
    for (const dirn of [1, -1]) {
      let lost = false, good = k0;
      for (let k = k0 + dirn; k >= 0 && k < N; k += dirn) {
        const box = lost && !PERSIST ? null : winOf(k);
        const r = box ? nelderMead(q => -ncc(full(q), T[k], box, refBlur, 2), Q[good], [0.05, 1.5, 1.5], 120) : null;
        if (r && -r.v > MINSCORE) { Q[k] = r.x; score3[k] = -r.v; good = k; continue; }
        lost = true;
        const pts = [];
        for (let j = k - dirn; j >= 0 && j < N && pts.length < 8; j -= dirn) if (score3[j] != null) pts.push(j);
        Q[k] = HOLD && pts.length ? Q[pts[0]] : pts.length < 3 ? Q[k - dirn] : [0, 1, 2].map(i => {
          const m = pts.length, mj = pts.reduce((s, j) => s + j, 0) / m, mv = pts.reduce((s, j) => s + Q[j][i], 0) / m;
          return mv + pts.reduce((s, j) => s + (j - mj) * (Q[j][i] - mv), 0) / pts.reduce((s, j) => s + (j - mj) ** 2, 0) * (k - mj);
        });
      }
    }
    // with --persist, frames between two good fits are filled by a straight-line in-between of those fits, not by
    // carrying the earlier ones on
    if (PERSIST) for (let k = 0; k < N; k++) if (score3[k] == null) {
      let a = k - 1, b = k + 1;
      while (a >= 0 && score3[a] == null) a--;
      while (b < N && score3[b] == null) b++;
      if (a >= 0 && b < N) Q[k] = Q[a].map((v, i) => v + (Q[b][i] - v) * (k - a) / (b - a));
    }
    for (let k = 0; k < N; k++) { P[k] = full(Q[k]); score[k] = score3[k]; }
  }
  // smooth the fit over time (tracked and extrapolated frames alike): a weighted local curve (quadratic) through the
  // frames around each one, which follows speeding up and slowing down and doesn't lag at the ends of the shot the
  // way a plain average does
  const sm = 'nosmooth' in opt ? P.map(p => p.slice()) : P.map((_, k) => P[k].map((_, i) => localPoly(P.map(p => p[i]), k, 5, 2.5, 2)));
  // --pin: for a shot where she holds still, one placement for the whole shot (the median of the tracked frames' fits),
  // at full strength, so the word can't wobble. --place=CX,CY,WIDTH,ANGLE puts it exactly there instead: the word's
  // centre in full-size pixels, its width in pixels, and its tilt in degrees (positive: down to the right). Either way
  // the placement is printed in that form, to adjust from
  const PIN = 'pin' in opt || !!opt.place;
  const refW = 2 * (refBox[2] - refBox[0]), refC = [(2 * refBox[0] + 2 * refBox[2]) / 2, (2 * refBox[1] + 2 * refBox[3]) / 2];
  const toHalf = v => (v - 0.5) / 2;
  const placeOf = p => {          // a fit, as centre / width / angle in the shot
    const s = Math.sqrt(Math.abs(p[0] * p[3] - p[1] * p[2])), ang = Math.atan2(-p[2], p[0]) * 180 / Math.PI;
    const Ai = inv2(p.slice(0, 4)), rx = toHalf(refC[0]) - p[4], ry = toHalf(refC[1]) - p[5];
    return [2 * (Ai[0] * rx + Ai[1] * ry) + 0.5, 2 * (Ai[2] * rx + Ai[3] * ry) + 0.5, refW / s, ang];
  };
  // (an optional fifth value squeezes the word along its own length, its height kept: print on a chest turning away,
  // 102's B09a; 1 = not squeezed, 0.6 = 60% as long. An optional sixth slants its baseline by that many degrees as a
  // shear, the letters' upright strokes kept upright, which is how a line of print looks on a chest turning away;
  // the fourth value turns the whole word in the picture)
  const fitOf = ([cx, cy, w, ang, q = 1, sh = 0]) => {   // centre / width / angle, as a fit
    const s = refW / w, t = ang * Math.PI / 180, c = Math.cos(t), sn = Math.sin(t), k = Math.tan(sh * Math.PI / 180);
    const A = [s / q * c, s / q * sn, s * (-sn - k * c), s * (c - k * sn)];
    const tx = toHalf(cx), ty = toHalf(cy);
    return [...A, toHalf(refC[0]) - (A[0] * tx + A[1] * ty), toHalf(refC[1]) - (A[2] * tx + A[3] * ty)];
  };
  // --place can also be keyframes, F:CX,CY,WIDTH,ANGLE[,SQUEEZE];F:... (part frames), moving in straight lines between them, for
  // a shot where she shifts a little (102's B01)
  if (PIN) {
    const good = sm.filter((_, k) => score[k] != null);
    const med = i => good.map(p => p[i]).sort((a, b) => a - b)[Math.floor(good.length / 2)];
    const keys = (opt.place || '').includes(':')
      ? opt.place.split(';').map(s => { const [f, v] = s.split(':'); return { f: +f - FIRST, v: v.split(',').map(Number) }; }).sort((a, b) => a.f - b.f)
      : null;
    const placeAt = k => {
      if (k <= keys[0].f) return keys[0].v;
      for (let j = 1; j < keys.length; j++) if (k <= keys[j].f) {
        const a = keys[j - 1], b = keys[j], t = (k - a.f) / (b.f - a.f);
        return a.v.map((v, i) => v + (b.v[i] - v) * t);
      }
      return keys[keys.length - 1].v;
    };
    const pinned = keys ? null : opt.place ? fitOf(opt.place.split(',').map(Number)) : [0, 1, 2, 3, 4, 5].map(med);
    sm.forEach((p, k) => p.splice(0, 6, ...(keys ? fitOf(placeAt(k)) : pinned)));
    for (let k = 0; k < N; k++) if (score[k] == null) score[k] = 0;
    console.log(keys ? `placed by ${keys.length} keyframes` : `pinned at --place=${placeOf(pinned).map((v, i) => v.toFixed(i === 3 ? 1 : 0)).join(',')}`);
  }
  // --grow=F: the word F times as big about its own centre, every frame (1.12: 12% bigger, 104's BB3), its centre and
  // so everything that follows the word (cleaning, its shift) kept as tracked
  if (opt.grow) {
    const F = +opt.grow, hx = toHalf(refC[0]), hy = toHalf(refC[1]);
    for (const p of sm) { for (let i = 0; i < 4; i++) p[i] /= F; p[4] = hx * (1 - 1 / F) + p[4] / F; p[5] = hy * (1 - 1 / F) + p[5] / F; }
  }
  // the reference shrinks onto small logos: blur it first in proportion (reference pixels per target pixel), so it
  // doesn't alias
  const scales = sm.filter((_, k) => score[k] != null).map(p => Math.sqrt(Math.abs(p[0] * p[3] - p[1] * p[2]))).sort((a, b) => a - b);
  const scale = scales[Math.floor(scales.length / 2)];
  // frames before the first tracked one or after the last fade out over 6 frames (--fade=N), so a lost logo never
  // lingers; gaps between tracked frames stay at full strength
  const FADE = +(opt.fade ?? 6), tracked = score.map((v, k) => (v != null ? k : -1)).filter(k => k >= 0);
  const vis = sm.map((_, k) => {
    const d = k < tracked[0] ? tracked[0] - k : k > tracked[tracked.length - 1] ? k - tracked[tracked.length - 1] : 0;
    return HOLD || PIN ? 1 : Math.max(0, 1 - d / FADE);
  });
  // --fadein=A-B: the word and the cleaning come in over part frames A-B (e.g. as the focus pulls onto the shirt,
  // where Starlight's own letters are a blur anyway: 102's B25)
  if (opt.fadein) { const [fa, fb] = opt.fadein.split('-').map(Number); vis.forEach((v, k) => { vis[k] = v * Math.min(1, Math.max(0, (FIRST + k - fa) / Math.max(1, fb - fa))); }); }
  // --hide=A-B[,C-D]: and duck out for part frames A-B (a hand passing in front of her shirt: 102's B24), back to full
  // one frame either side
  if (opt.hide) for (const w of opt.hide.split(',')) { const [ha, hb] = w.split('-').map(Number);
    vis.forEach((v, k) => { const f = FIRST + k, d = f < ha ? ha - f : f > hb ? f - hb : 0; vis[k] = v * Math.min(1, d / 2); }); }
  // --fadeout=A-B: and go over part frames A-B (as the print turns away round her side: B09a)
  if (opt.fadeout) { const [fa, fb] = opt.fadeout.split('-').map(Number); vis.forEach((v, k) => { vis[k] = v * Math.min(1, Math.max(0, (fb - FIRST - k) / Math.max(1, fb - fa))); }); }
  const pre = Math.max(SOFT, 0.45 * scale);
  console.log(`reference is ${scale.toFixed(2)}x the target's size; reference blurred by ${pre.toFixed(2)} before warping`);
  const refRGB = [0, 1, 2].map(c => { const p = new Float32Array(W * H); for (let i = 0; i < W * H; i++) p[i] = refBuf[3 * i + c]; return blur(p, W, H, pre); });
  // --nologo: track the logo only to find the red text, and leave Starlight's logo as it is
  const REDMODE = opt.redmode || 'none', RED = REDMODE !== 'none', NAME = opt.name || 'logo', NOLOGO = 'nologo' in opt;
  // red letters: well above green and blue, and not orange (orange has much more green than blue)
  const redness = (r, g, b, k, off) => (g < 1.6 * b + 12 ? r - k * Math.max(g, b) - off : 0);

  // --align: the fit follows the original's green, which is blurry and can trail a fast move by a few pixels, while
  // Starlight's own logo (misspelled, but sharp and in the right place) shows where it really is. Per frame: the
  // shift that best lines up Starlight's green with the laid-over logo's green (normalised correlation of the two,
  // softened a little, over the laid-over logo's own area only, so a hand or another green thing nearby counts for
  // little), to a fraction of a pixel; a poor best match (under 0.5) or one at the edge of the search counts as no
  // measurement. --align=centroid uses the gap between the centres of the two greens instead (L01, L02)
  const ALIGN = 'align' in opt, ALIGNBLUR = +(opt.alignblur ?? 1.5), offs = new Array(N).fill(null);
  const greenShift = (star, px, bx0, by0, bx1, by1) => {
    const M = 14, x0 = Math.max(0, bx0 - M), y0 = Math.max(0, by0 - M), x1 = Math.min(W, bx1 + M + 1), y1 = Math.min(H, by1 + M + 1), w = x1 - x0, h = y1 - y0;
    const gS = new Float32Array(w * h), gR = new Float32Array(w * h), sup = new Float32Array(w * h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) gS[(y - y0) * w + x - x0] = greenAt(star, 3 * (y * W + x));
    for (const [x, y, a, rgb] of px) { const i = (y - y0) * w + x - x0; gR[i] = a * colorOf(rgb[0], rgb[1], rgb[2]); sup[i] = a; }
    // softened by 1.5 px, or --alignblur=N: on a small logo the letters sit a few pixels apart and the match can
    // jump a letter's width back and forth from frame to frame, so soften more there and the logo is matched as a
    // whole (L10)
    const S = blur(gS, w, h, ALIGNBLUR), R = blur(gR, w, h, ALIGNBLUR);
    // sample points: the logo's area, every other pixel, far enough in that every shift stays inside the region
    const pts = []; for (let y = M; y < h - M; y += 2) for (let x = M; x < w - M; x += 2) if (sup[y * w + x] > 0.05) pts.push(y * w + x);
    if (pts.length < 50) return null;
    let mr = 0, vr = 0; for (const i of pts) mr += R[i]; mr /= pts.length; for (const i of pts) vr += (R[i] - mr) ** 2;
    const D = 2 * M + 1, score = new Float32Array(D * D);
    let best = -2, bdx = 0, bdy = 0;
    for (let dy = -M; dy <= M; dy++) for (let dx = -M; dx <= M; dx++) {
      const o = dy * w + dx;
      let ms = 0; for (const i of pts) ms += S[i + o]; ms /= pts.length;
      let c = 0, vs = 0; for (const i of pts) { const s = S[i + o] - ms; c += s * (R[i] - mr); vs += s * s; }
      const v = vs > 0 && vr > 0 ? c / Math.sqrt(vs * vr) : -1;
      score[(dy + M) * D + dx + M] = v;
      if (v > best) { best = v; bdx = dx; bdy = dy; }
    }
    if (best < 0.5 || Math.abs(bdx) === M || Math.abs(bdy) === M) return null;
    // to a fraction of a pixel: a parabola through the best shift and its neighbours, each way
    const at = (dx, dy) => score[(dy + M) * D + dx + M], sub = (a, b, c) => (a - 2 * b + c < 0 ? 0.5 * (a - c) / (a - 2 * b + c) : 0);
    return [bdx + sub(at(bdx - 1, bdy), best, at(bdx + 1, bdy)), bdy + sub(at(bdx, bdy - 1), best, at(bdx, bdy + 1))];
  };
  const greenOffset = (star, px, bx0, by0, bx1, by1) => {
    const x0 = Math.max(0, bx0 - 15), y0 = Math.max(0, by0 - 15), x1 = Math.min(W, bx1 + 16), y1 = Math.min(H, by1 + 16), w = x1 - x0, h = y1 - y0;
    const gS = new Float32Array(w * h), gR = new Float32Array(w * h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) gS[(y - y0) * w + x - x0] = greenAt(star, 3 * (y * W + x));
    for (const [x, y, a, rgb] of px) gR[(y - y0) * w + x - x0] = a * colorOf(rgb[0], rgb[1], rgb[2]);
    const c = [gS, gR].map(g => { let m = 0; for (const v of g) m = Math.max(m, v); return m > 8 ? moments(g, w, h, 0.35 * m) : null; });
    return c[0] && c[1] ? [c[0].mx - c[1].mx, c[0].my - c[1].my] : null;
  };

  // pass 2: composite onto Starlight, matching colour per frame. --base=CLIP.mov composites onto that clip instead
  // (its frame 0 is part frame FIRST), e.g. Starlight with her body from Proteus (102's B22)
  const baseFile = opt.base ? path.resolve(opt.base) : path.join(dir, `${part}_starlight.mov`), b0 = opt.base ? 0 : FIRST, b1 = opt.base ? LAST - FIRST : LAST;
  const outFile = path.join(dir, `${part}_${NAME} (frames ${FIRST}-${LAST}).mov`);
  const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
    '-i', baseFile, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', '30000/1001', '-i', 'pipe:0',
    '-filter_complex', `[0:v]trim=start_frame=${b0}:end_frame=${b1 + 1},setpts=PTS-STARTPTS,format=yuv444p10le[s];` +
    `[1:v]setpts=PTS-STARTPTS,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuva444p10le[o];[s][o]overlay=format=yuv444p10,format=yuv422p10le[v]`,
    '-map', '[v]', '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', 'use_metadata_tags',
    '-metadata', `comment=${part} frames ${FIRST}-${LAST}: Starlight with the logo from ${refPart} frame ${refFrameArg} laid over${RED ? `; red text: ${REDMODE}` : ''}`, outFile],
    { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('composite encode failed')) : res())));
  const rows = ['frame\tscore\ta\tb\tc\td\tex\tey\tgain r\tgain g\tgain b'];
  const gains = [];
  const overlay = Buffer.alloc(W * H * 4);
  // --steadyclean: the same cleaning in every frame (each pixel's strongest over the shot, carried along with the
  // word, in the shot's median shirt colour), so Starlight's letters shimmering at the edge of it can't flicker
  // through (102's B17, B21: the tail of its last letter, just past the new word's end). --steadyclean=N takes each
  // pixel's strongest over only the N frames either side, for a shot where she moves and turns a lot (B23): over the
  // whole shot, what was lettering at one moment is her arm or the background at another
  const SCLEAN = 'steadyclean' in opt, SCWIN = SCLEAN && opt.steadyclean !== undefined && opt.steadyclean !== '' && !isNaN(+opt.steadyclean) ? +opt.steadyclean : Infinity;
  const cleanMax = new Map(), cleanMaps = new Array(N), cleanCols = [];
  const armEdges = new Array(N);   // --protect=left: each frame's arm edge by row, from the first pass
  const paleMaps = new Array(N);   // --cleanskip / --patchskip: each frame's pale pixels, relative to the word
  // --deflicker=X0,Y0,X1,Y1: a small box placed relative to the word's centre (pixels, to its top left when negative),
  // where each pixel becomes the median of Starlight's over the 4 frames either side at the same place relative to the
  // word: Starlight's own orange flicker on the edge of her arm, just by the word (102's B23), steadied, not painted out
  const DFL = opt.deflicker ? opt.deflicker.split(',').map(Number) : null, dflStore = new Array(N);
  const shiftOf = k => { const p = placeOf(sm[k]), p0 = placeOf(sm[0]); return [Math.round(p[0] - p0[0]), Math.round(p[1] - p0[1])]; };
  // (--mesh: this frame's pixel -> reference lookup, and the box it covers)
  const meshMap = k => {
    const m0 = MESH.frames.get(FIRST + k), q = MESH.frames.get(MESH.anchor);
    if (!m0 || !q) return null;
    const [sdx, sdy] = shiftAt(FIRST + k), m = { X: m0.X.map(v => v + sdx), Y: m0.Y.map(v => v + sdy), S: m0.S };
    const { cols, rows } = MESH;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let n = 0; n < cols * rows; n++) { x0 = Math.min(x0, m.X[n]); x1 = Math.max(x1, m.X[n]); y0 = Math.min(y0, m.Y[n]); y1 = Math.max(y1, m.Y[n]); }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
    const w = x1 - x0 + 1, h = y1 - y0 + 1, U = new Float32Array(w * h).fill(NaN), V = new Float32Array(w * h).fill(NaN), Sv = new Float32Array(w * h);
    const tri = (a, b, c) => {
      const ax = m.X[a], ay = m.Y[a], bx = m.X[b], by = m.Y[b], cx = m.X[c], cy = m.Y[c];
      const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      const dq = (q.X[b] - q.X[a]) * (q.Y[c] - q.Y[a]) - (q.X[c] - q.X[a]) * (q.Y[b] - q.Y[a]);
      // (nor ones stretched past --meshstretch=X their size on the anchor, default 1.6: a print turning away only
      // squeezes, so that's a grid point the tracker lost, e.g. stuck on her collar)
      if (d * dq <= 0 || Math.abs(d) < 1e-3 || Math.abs(d) > MSTRETCH * Math.abs(dq)) return;
      for (let y = Math.max(y0, Math.floor(Math.min(ay, by, cy))); y <= Math.min(y1, Math.ceil(Math.max(ay, by, cy))); y++)
        for (let x = Math.max(x0, Math.floor(Math.min(ax, bx, cx))); x <= Math.min(x1, Math.ceil(Math.max(ax, bx, cx))); x++) {
          const l1 = ((x - ax) * (cy - ay) - (cx - ax) * (y - ay)) / d, l2 = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / d, l0 = 1 - l1 - l2;
          if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
          const o = (y - y0) * w + x - x0;
          U[o] = l0 * q.X[a] + l1 * q.X[b] + l2 * q.X[c]; V[o] = l0 * q.Y[a] + l1 * q.Y[b] + l2 * q.Y[c];
          Sv[o] = l0 * m.S[a] + l1 * m.S[b] + l2 * m.S[c];
        }
    };
    for (let j = 0; j + 1 < rows; j++) for (let i = 0; i + 1 < cols; i++) { const n = j * cols + i; tri(n, n + 1, n + cols); tri(n + 1, n + cols + 1, n + cols); }
    // (the drawn area's own edges, where the grid ends or folds over, softened over about 2 pixels, which also takes
    // away specks of a stray triangle or two)
    const cov = new Float32Array(w * h); for (let o = 0; o < w * h; o++) cov[o] = Number.isNaN(U[o]) ? 0 : 1;
    const covB = blur(cov, w, h, 1.5);
    for (let o = 0; o < w * h; o++) Sv[o] *= Math.min(1, Math.max(0, (covB[o] - 0.5) / 0.4));
    const pa = sm[MESH.anchor - FIRST], Aa = pa.slice(0, 4), exa = 2 * pa[4] + 0.5 - 0.5 * (Aa[0] + Aa[1]), eya = 2 * pa[5] + 0.5 - 0.5 * (Aa[2] + Aa[3]);
    // (between pixels: bilinear where all four neighbours are on the grid, else the nearest)
    return { box: [x0, y0, x1, y1], refAt: (x, y) => {
      const fx = x - x0, fy = y - y0, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      let X, Y, S;
      if (ix >= 0 && iy >= 0 && ix + 1 < w && iy + 1 < h) {
        const o = iy * w + ix, os = [o, o + 1, o + w, o + w + 1], ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
        if (os.every(i => !Number.isNaN(U[i]))) { X = 0; Y = 0; S = 0; for (let n = 0; n < 4; n++) { X += ws[n] * U[os[n]]; Y += ws[n] * V[os[n]]; S += ws[n] * Sv[os[n]]; } }
      }
      if (X === undefined) {
        const jx = Math.round(fx), jy = Math.round(fy);
        if (jx < 0 || jy < 0 || jx >= w || jy >= h || Number.isNaN(U[jy * w + jx])) return null;
        X = U[jy * w + jx]; Y = V[jy * w + jx]; S = Sv[jy * w + jx];
      }
      return [...tilt(Aa[0] * X + Aa[1] * Y + exa, Aa[2] * X + Aa[3] * Y + eya), S];
    } };
  };
  const render = (star, k, gainOverride, orig) => {
    overlay.fill(0);
    const occ = occAt(k);
    const p = sm[k];
    // full-res map: R = A (T - 0.5) + 2e + 0.5
    const A = p.slice(0, 4), ex = 2 * p[4] + 0.5 - 0.5 * (A[0] + A[1]), ey = 2 * p[5] + 0.5 - 0.5 * (A[2] + A[3]);
    const Ai = inv2(A);
    let corners = [[ax0, ay0], [ax1, ay0], [ax0, ay1], [ax1, ay1]].map(([x, y]) => [Ai[0] * (x - ex) + Ai[1] * (y - ey), Ai[2] * (x - ex) + Ai[3] * (y - ey)]);
    let refAt = (x, y) => tilt(A[0] * x + A[1] * y + ex, A[2] * x + A[3] * y + ey);
    const refEdge = REFEDGE ? (x, y) => { const r = refAt(x, y); if (!r) return 1;
      return Math.min(1, Math.max(0, (Math.min(r[0], W - 1 - r[0], r[1], H - 1 - r[1]) - RE_INSET) / 4)); } : null;
    if (MESH) {
      const mm = meshMap(k);
      if (mm) { refAt = mm.refAt; const [x0, y0, x1, y1] = mm.box; corners = [[x0, y0], [x1, y1]]; } else { refAt = () => null; corners = [[0, 0], [0, 0]]; }
    }
    // --motionblur=F: smear the word along its own movement over F of a frame's time, as a camera would (where she
    // moves fast and Starlight's own letters are blurred, 102's B09a); its speed from the placement either side
    const MB = +(opt.motionblur ?? 0);
    const vel = MB ? (() => { const a = placeOf(sm[Math.max(0, k - 1)]), b = placeOf(sm[Math.min(N - 1, k + 1)]), d = Math.min(N - 1, k + 1) - Math.max(0, k - 1) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; })() : [0, 0];
    const mbLen = MB * Math.hypot(vel[0], vel[1]), mbN = mbLen > 0.75 ? Math.min(12, Math.ceil(mbLen) + 1) : 1, mbPad = Math.ceil(mbLen / 2) + 1;
    const bx0 = Math.max(0, Math.floor(Math.min(...corners.map(c => c[0]))) - (mbN > 1 ? mbPad : 0)), bx1 = Math.min(W - 1, Math.ceil(Math.max(...corners.map(c => c[0]))) + (mbN > 1 ? mbPad : 0));
    const by0 = Math.max(0, Math.floor(Math.min(...corners.map(c => c[1]))) - (mbN > 1 ? mbPad : 0)), by1 = Math.min(H - 1, Math.ceil(Math.max(...corners.map(c => c[1]))) + (mbN > 1 ? mbPad : 0));
    // --cleanskip / --patchskip: how pale each pixel is (this frame in the first pass; the palest within 8 frames
    // either side in the second)
    let paleAt = () => 0;
    if (SKIP) {
      const [qx, qy] = shiftOf(k);
      if (!gainOverride) {
        const pm = new Map(), mw = bx1 - bx0, mh = by1 - by0;
        const rx0 = Math.max(0, Math.floor(bx0 - mw / 2)), rx1 = Math.min(W - 1, Math.ceil(bx1 + mw / 2)), ry0 = Math.max(0, Math.floor(by0 - mh)), ry1 = Math.min(H - 1, Math.ceil(by1 + mh));
        const rw = rx1 - rx0 + 1, rh = ry1 - ry0 + 1, sk = new Float32Array(rw * rh);
        for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) sk[(y - ry0) * rw + x - rx0] = skinAt(star, 3 * (y * W + x)) > 0.5 ? 1 : 0;
        const nearSkin = blur(sk, rw, rh, 2);
        const pnow = (x, y) => (x < rx0 || x > rx1 || y < ry0 || y > ry1) ? 0 : paleNow(star, 3 * (y * W + x)) * Math.min(1, nearSkin[(y - ry0) * rw + x - rx0] / 0.08);
        for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) { const p = pnow(x, y); if (p > 0) pm.set((y - qy) * W + x - qx, p); }
        paleMaps[k] = pm;
        paleAt = pnow;
      } else paleAt = (x, y) => { let p = 0; const key = (y - qy) * W + x - qx;
        for (let j = Math.max(0, k - 8); j <= Math.min(N - 1, k + 8); j++) { const v = paleMaps[j] && paleMaps[j].get(key); if (v > p) p = v; }
        return p; };
    }
    // --protect: how much of each pixel may be drawn on (0 on skin; with =left, 0 from each row's arm edge leftwards).
    // The arm edge is where skin crosses 0.3 (the arm's warm lower rim is only about half skin), to a fraction of a pixel; the first pass finds it in every frame,
    // the second uses it smoothed over the 3 frames each side, so the edge slides with her arm instead of flipping a
    // whole pixel back and forth
    let armEdge = null;
    if (PROTLEFT && !gainOverride) {
      armEdge = new Map();
      const mid = (bx0 + bx1) / 2, hh = by1 - by0;
      for (let y = Math.max(0, by0 - hh); y <= Math.min(H - 1, by1 + hh); y++) {
        let e = -1;
        // (from as far left as the cleaning reaches: half the patch's width)
        for (let x = Math.max(0, Math.floor(bx0 - 0.5 * (bx1 - bx0))); x < mid; x++) if (skinAt(star, 3 * (y * W + x)) > 0.3) e = x;
        if (e < 0) continue;
        const s0 = skinAt(star, 3 * (y * W + e)), s1 = skinAt(star, 3 * (y * W + e + 1));
        armEdge.set(y, e + (s0 - 0.3) / Math.max(1e-3, s0 - s1));
      }
      armEdges[k] = armEdge;
    } else if (PROTLEFT) {
      armEdge = new Map();
      const near = [];
      for (let j = Math.max(0, k - 3); j <= Math.min(N - 1, k + 3); j++) if (armEdges[j]) near.push([armEdges[j], Math.exp(-((j - k) ** 2) / 8)]);
      const rows = new Set(); for (const [m] of near) for (const y of m.keys()) rows.add(y);
      for (const y of rows) {
        let s = 0, w = 0, n = 0; for (const [m, ww] of near) if (m.has(y)) { s += ww * m.get(y); w += ww; n++; }
        if (2 * n >= near.length) armEdge.set(y, s / w);
      }
    }
    const prot = (x, y) => {
      if (!PROTECT) return 1;
      let p = 1 - skinAt(star, 3 * (y * W + x));
      const e = armEdge && armEdge.get(y);
      if (e != null) p = Math.min(p, Math.min(1, Math.max(0, x - e - 2)));
      return p;
    };
    const px = [];
    let sa = 0, sS = [0, 0, 0], sRf = [0, 0, 0];
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      let a, rgb;
      if (MESH) {   // (--mesh: meshss x meshss samples inside the pixel, times mbN along the movement, each weighted by visibility)
        let sa1 = 0; const acc = [0, 0, 0];
        for (let n = 0; n < mbN; n++) { const t = mbN > 1 ? (n / (mbN - 1) - 0.5) * MB : 0;
          for (const [du, dv] of MESH.sub) { const r = refAt(x + du - t * vel[0], y + dv - t * vel[1]); if (!r) continue;
            const [rx, ry, sv] = r, as = bil(alphaRef, W, H, rx, ry) * sv;
            if (as > 0) { sa1 += as; for (let c = 0; c < 3; c++) acc[c] += as * bil(refRGB[c], W, H, rx, ry); } } }
        a = sa1 / (mbN * MESH.sub.length); rgb = sa1 > 0 ? acc.map(v => v / sa1) : [0, 0, 0];
      } else if (mbN > 1) {   // (the average of mbN samples along the movement, colour weighted by coverage)
        let sa1 = 0; const acc = [0, 0, 0];
        for (let n = 0; n < mbN; n++) { const t = (n / (mbN - 1) - 0.5) * MB, xx = x - t * vel[0], yy = y - t * vel[1];
          const r = refAt(xx, yy); if (!r) continue; const [rx, ry] = r, as = bil(alphaRef, W, H, rx, ry);
          if (as > 0) { sa1 += as; for (let c = 0; c < 3; c++) acc[c] += as * bil(refRGB[c], W, H, rx, ry); } }
        a = sa1 / mbN; rgb = sa1 > 0 ? acc.map(v => v / sa1) : [0, 0, 0];
      } else { const r = refAt(x, y); if (!r) continue; const [rx, ry] = r; a = bil(alphaRef, W, H, rx, ry); rgb = a > 0 ? refRGB.map(ch => bil(ch, W, H, rx, ry)) : null; }
      a *= (occ ? occ[y * W + x] : 1) * prot(x, y) * (refEdge ? refEdge(x, y) : 1);
      if (a <= 0) continue;
      const i = 3 * (y * W + x);
      px.push([x, y, a, rgb]);
      sa += a; for (let c = 0; c < 3; c++) { sS[c] += a * star[i + c]; sRf[c] += a * rgb[c]; }
    }
    // brightness only (one gain for all three channels): the reference's colour is right, and per-channel gains go
    // wild where the patch overlaps skin or a hand
    const lum = v => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const g1 = Math.min(1.8, Math.max(0, lum(sS) / Math.max(1, lum(sRf)))), g = gainOverride || [g1, g1, g1];
    // --guard: only where the original shows the logo's green (blurred, relative to this frame's brightest), so a
    // logo turning away or partly hidden isn't painted over what covers it (with --trackon=starlight: where
    // Starlight shows its own logo, which is clearer than the original's)
    let guard = null;
    const guardSrc = onStar ? star : orig;
    if ('guard' in opt && orig && bx1 > bx0 && by1 > by0) {
      const gw = bx1 - bx0 + 1, gh = by1 - by0 + 1, gm = new Float32Array(gw * gh);
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) gm[(y - by0) * gw + x - bx0] = greenAt(guardSrc, 3 * (y * W + x));
      const gb = blur(gm, gw, gh, Math.max(3, 0.04 * gw));
      let gmx = 0; for (const v of gb) gmx = Math.max(gmx, v);
      guard = { gw, v: gb.map(v => Math.min(1, Math.max(0, (v - 0.08 * gmx) / (0.22 * gmx)))) };
    }
    // (tracked frames only: where the logo was lost, e.g. turning edge-on, the shapes differ and the gap means nothing)
    if (ALIGN && !gainOverride && score[k] != null) offs[k] = (opt.align === 'centroid' ? greenOffset : greenShift)(star, px, bx0, by0, bx1, by1);
    // --clean: first paint out Starlight's own (misspelled) word around the patch, so none of it shows past the ends
    // of the new one or through its gaps: in a box half a patch wider each side and half a patch taller above and
    // below (inside --search, which keeps her face out), each pixel's orange (red over blue past CLOFF=30, full at
    // +25, spread 1.5 px) blends it to the shirt's colour, the median of the box's dark non-orange pixels
    if (CLEAN && !NOLOGO && bx1 > bx0 && by1 > by0) {
      const w = bx1 - bx0, h = by1 - by0, S0 = SEARCH || [0, 0, W, H];
      // (--cleanpad=PX: only PX pixels round the patch instead, where Starlight's word is no longer than the new one
      // and a hand rests just past its end, lit warm enough to pass for lettering: 102's B23)
      const padX = opt.cleanpad !== undefined ? +opt.cleanpad : 0.5 * w, padY = opt.cleanpad !== undefined ? +opt.cleanpad : 0.5 * h;
      const cx0 = Math.max(S0[0], Math.floor(bx0 - padX)), cx1 = Math.min(S0[2] - 1, Math.ceil(bx1 + padX));
      const cy0 = Math.max(S0[1], Math.floor(by0 - padY)), cy1 = Math.min(S0[3] - 1, Math.ceil(by1 + padY));
      const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1;
      if (cw > 2 && ch > 2) {
        const m = new Float32Array(cw * ch), cols = [[], [], []];
        // (in --lettersonly frames the light itself is orange: judge red over blue against the box's median)
        let base = 0;
        if (LONLY && FIRST + k >= LONLY[0] && FIRST + k <= LONLY[1]) { const rb = [];
          for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const i = 3 * (y * W + x); rb.push(star[i] - star[i + 2]); }
          rb.sort((p, q) => p - q); base = Math.max(0, rb[Math.floor(rb.length / 2)]); }
        for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
          // (nothing brighter than --maxbright: a sunlit wall isn't the shirt's lettering)
          const i = 3 * (y * W + x), lit = (star[i] + star[i + 1] + star[i + 2]) / 3 > MAXB;
          const v = lit ? 0 : Math.min(1, Math.max(0, (tintAt(star, i) - base - CLOFF) / 25));
          m[(y - cy0) * cw + x - cx0] = v;
          if (v === 0 && star[i] + star[i + 1] + star[i + 2] < 150) for (let c = 0; c < 3; c++) cols[c].push(star[i + c]);
        }
        const fabric = cols.map(v => (v.length ? v.sort((p, q) => p - q)[Math.floor(v.length / 2)] : 10));
        // only near the letters themselves (strongly orange, red over blue past 45, spread 4 px): a warm wall or floor
        // inside the box is left alone
        const core = new Float32Array(cw * ch);
        for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
          const i = 3 * (y * W + x);
          core[(y - cy0) * cw + x - cx0] = tintAt(star, i) - base > CLCORE && (base > 0 || (star[i] + star[i + 1] + star[i + 2]) / 3 <= MAXB) && !(PROTECT && skinAt(star, i) > 0.5) ? 1 : 0;
        }
        const near = blur(core, cw, ch, 4);
        const mb = blur(m, cw, ch, 1.5);
        let local = null;
        if (LOCALFILL) {
          const wgt = new Float32Array(cw * ch), num = [0, 1, 2].map(() => new Float32Array(cw * ch));
          for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
            const j = (y - cy0) * cw + x - cx0, i = 3 * (y * W + x), sum = star[i] + star[i + 1] + star[i + 2];
            const w = (1 - Math.min(1, 2 * mb[j])) * (sum < 360 ? 1 : 0) * (1 - skinAt(star, i));
            wgt[j] = w; for (let q = 0; q < 3; q++) num[q][j] = w * star[i + q];
          }
          const den = blur(wgt, cw, ch, 3), nb = num.map(a => blur(a, cw, ch, 3));
          // (the wide fill takes every non-lettering, non-skin pixel however bright: the lit shirt next to the smear is
          // brighter than the near fill's limit, and leaving it out makes the patch too dark)
          let denW = null, nbW = null;
          if (CLWIDE) { const ww = new Float32Array(cw * ch), nw = [0, 1, 2].map(() => new Float32Array(cw * ch));
            for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const j = (y - cy0) * cw + x - cx0, i = 3 * (y * W + x), w = (1 - Math.min(1, 2 * mb[j])) * (1 - skinAt(star, i));
              ww[j] = w; for (let q = 0; q < 3; q++) nw[q][j] = w * star[i + q]; }
            denW = blur(ww, cw, ch, 10); nbW = nw.map(a => blur(a, cw, ch, 10)); }
          let den2 = null, nb2 = null;
          if (CSKIP) {   // (everything that isn't lettering, arm included)
            const w2 = new Float32Array(cw * ch), n2 = [0, 1, 2].map(() => new Float32Array(cw * ch));
            for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const j = (y - cy0) * cw + x - cx0, i = 3 * (y * W + x), w = 1 - Math.min(1, 2 * mb[j]);
              w2[j] = w; for (let q = 0; q < 3; q++) n2[q][j] = w * star[i + q]; }
            den2 = blur(w2, cw, ch, 2); nb2 = n2.map(a => blur(a, cw, ch, 2));
          }
          local = (x, y) => { if (x < cx0 || x > cx1 || y < cy0 || y > cy1) return null; const j = (y - cy0) * cw + x - cx0;
            const a = den[j] > 0.05 ? nb.map(v => v[j] / den[j]) : CLWIDE && denW[j] > 0.01 ? nbW.map(v => v[j] / denW[j]) : null;
            if (!CSKIP) return a;
            const p = paleAt(x, y), b = den2[j] > 0.05 ? nb2.map(v => v[j] / den2[j]) : null;
            if (p <= 0 || !b) return a; if (!a) return b;
            return a.map((v, q) => v + (b[q] - v) * p); };
        }
        const [sx, sy] = SCLEAN ? shiftOf(k) : [0, 0];
        if (SCLEAN && !gainOverride) cleanCols.push(fabric);
        for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
          const j = (y - cy0) * cw + x - cx0, c = Math.min(1, 2 * mb[j]) * Math.min(1, near[j] / 0.05) * (occ ? occ[y * W + x] : 1) * (refEdge ? refEdge(x, y) : 1) *
            (CFEATHER > 0 ? Math.min(1, (Math.min(x - cx0, cx1 - x, y - cy0, cy1 - y) + 0.5) / CFEATHER) : 1);
          if (c <= 0.01) continue;
          // (steady: the first pass, for the gains, only gathers; the second paints from what was gathered)
          if (SCLEAN) { if (!gainOverride) { const key = (y - sy) * W + x - sx; cleanMax.set(key, Math.max(cleanMax.get(key) || 0, c));
            if (SCWIN < Infinity) (cleanMaps[k] || (cleanMaps[k] = new Map())).set(key, c); } continue; }
          const o = 4 * (y * W + x), lc = local && local(x, y) || fabric;
          for (let q = 0; q < 3; q++) overlay[o + q] = Math.round(lc[q]);
          overlay[o + 3] = Math.round(255 * c * vis[k] * cleanAt(FIRST + k) * prot(x, y));
        }
        if (SCLEAN && gainOverride) {
          const fab = [0, 1, 2].map(q => cleanCols.map(f => f[q]).sort((p, r) => p - r)[Math.floor(cleanCols.length / 2)]);
          let held = cleanMax;
          if (SCWIN < Infinity) { held = new Map(); for (let j = Math.max(0, k - SCWIN); j <= Math.min(N - 1, k + SCWIN); j++) if (cleanMaps[j]) for (const [key, c] of cleanMaps[j]) held.set(key, Math.max(held.get(key) || 0, c)); }
          for (const [key, c] of held) {
            const x = (key % W) + sx, y = Math.floor(key / W) + sy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            // (with --cleanfill=local, never the flat colour: where the local one can't be had, leave Starlight be)
            const lc = local ? local(x, y) : fab; if (!lc) continue;
            if (refEdge && refEdge(x, y) <= 0) continue;
            const o = 4 * (y * W + x);
            for (let q = 0; q < 3; q++) overlay[o + q] = Math.round(lc[q]);
            overlay[o + 3] = Math.round(255 * c * vis[k] * cleanAt(FIRST + k) * prot(x, y));
          }
        }
      }
    }
    if (DFL) {
      const [pcx, pcy] = placeOf(sm[k]).map(Math.round), bw = DFL[2] - DFL[0] + 1, bh = DFL[3] - DFL[1] + 1;
      if (!gainOverride) {
        const st = new Uint8Array(bw * bh * 3);
        for (let v = 0; v < bh; v++) for (let u = 0; u < bw; u++) { const x = pcx + DFL[0] + u, y = pcy + DFL[1] + v; if (x < 0 || y < 0 || x >= W || y >= H) continue;
          for (let q = 0; q < 3; q++) st[3 * (v * bw + u) + q] = star[3 * (y * W + x) + q]; }
        dflStore[k] = st;
      } else {
        for (let v = 0; v < bh; v++) for (let u = 0; u < bw; u++) {
          const x = pcx + DFL[0] + u, y = pcy + DFL[1] + v; if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const o = 4 * (y * W + x), med = [0, 1, 2].map(q => { const vals = []; for (let j = Math.max(0, k - 4); j <= Math.min(N - 1, k + 4); j++) if (dflStore[j]) vals.push(dflStore[j][3 * (v * bw + u) + q]); vals.sort((p, r) => p - r); return vals[Math.floor(vals.length / 2)]; });
          // (feathered over the box's outer pixel; any cleaning already there is replaced)
          const edge = Math.min(u, v, bw - 1 - u, bh - 1 - v) === 0 ? 0.5 : 1;
          for (let q = 0; q < 3; q++) overlay[o + q] = med[q];
          overlay[o + 3] = Math.round(255 * edge * vis[k]);
        }
      }
    }
    if (!NOLOGO) for (const [x, y, a, rgb] of px) {
      const o = 4 * (y * W + x), gv = guard ? guard.v[(y - by0) * guard.gw + x - bx0] : 1;
      // over any cleaning already there: the two layers combined into one
      let la = a * gv * vis[k] * wordAt(FIRST + k);
      if (LONLY) { const f = FIRST + k, w = Math.min(1, Math.max(0, Math.min(f - LONLY[0] + 2, LONLY[1] + 2 - f) / 2));
        if (w > 0) la *= 1 - w * (1 - Math.min(1, Math.max(0, (rgb[0] - rgb[2] - 25) / 40))); }
      if (PSKIP) { const p = paleAt(x, y);
        // (a letter stroke in the reference is bright: mean of r, g, b over 110; its glow and the shirt aren't)
        if (p > 0) la *= 1 - p * (1 - Math.min(1, Math.max(0, ((rgb[0] + rgb[1] + rgb[2]) / 3 - 90) / 30))); }
      const ca = overlay[o + 3] / 255, ta = la + (1 - la) * ca;
      if (ta <= 0) continue;
      for (let c = 0; c < 3; c++) overlay[o + c] = Math.max(0, Math.min(255, Math.round((la * rgb[c] * g[c] + (1 - la) * ca * overlay[o + c]) / ta)));
      overlay[o + 3] = Math.round(255 * ta);
    }
    if (REFEDGE && RE_SIG > 0 && bx1 > bx0 && by1 > by0) {
      const pad = Math.ceil(3 * RE_SIG) + 2, x0 = Math.max(0, bx0 - pad), x1 = Math.min(W - 1, bx1 + pad), y0 = Math.max(0, by0 - pad), y1 = Math.min(H - 1, by1 + pad);
      const w = x1 - x0 + 1, h = y1 - y0 + 1, letter = new Float32Array(w * h);
      const soft = [0, 1, 2].map(c => { const a = new Float32Array(w * h);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[(y - y0) * w + x - x0] = star[3 * (y * W + x) + c]; return blur(a, w, h, RE_SIG); });
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = 3 * (y * W + x);
        letter[(y - y0) * w + x - x0] = Math.min(1, Math.max(0, (star[i] - star[i + 2] - CLOFF) / 25)); }
      const lb = blur(letter, w, h, RE_SIG + 1);
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        const e = refEdge(x, y); if (e >= 1) continue;
        const j = (y - y0) * w + x - x0, wgt = (1 - e) * Math.min(1, 2 * lb[j]) * (occ ? occ[y * W + x] : 1);
        if (wgt <= 0.01) continue;
        const o = 4 * (y * W + x), ao = overlay[o + 3] / 255, A = wgt + (1 - wgt) * ao;
        for (let c = 0; c < 3; c++) overlay[o + c] = Math.max(0, Math.min(255, Math.round((wgt * soft[c][j] + (1 - wgt) * ao * overlay[o + c]) / A)));
        overlay[o + 3] = Math.round(255 * A);
      }
    }
    if (RED && orig) {
      // red text: found in the original (blurry, but where it really is) in an area below the logo, spread a little
      // so it covers Starlight's sharper letters
      const w = bx1 - bx0, h = by1 - by0;
      const rx0 = Math.max(0, Math.floor(bx0 - 0.5 * w)), rx1 = Math.min(W - 1, Math.ceil(bx1 + 0.5 * w));
      const ry0 = Math.max(0, Math.floor(by0 + 0.5 * h)), ry1 = Math.min(H - 1, Math.ceil(by1 + Math.max(1.8 * h, 0.9 * w)));
      const rw = rx1 - rx0 + 1, rh = ry1 - ry0 + 1;
      if (rw > 4 && rh > 4) {
        const m = new Float32Array(rw * rh);
        for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
          const i = 3 * (y * W + x), v = redness(orig[i], orig[i + 1], orig[i + 2], 1.25, 2);
          if (v > 0) m[(y - ry0) * rw + x - rx0] = v;
        }
        // a line of text: spread sideways more than up and down
        const mb = blur(m, rw, rh, Math.max(3, 0.05 * w), Math.max(2, 0.02 * w));
        // shirt colour for painting out: the median of the area's non-red Starlight pixels
        let fabric = null;
        if (REDMODE === 'remove') {
          const cols = [[], [], []];
          for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
            const i = 3 * (y * W + x);
            if (mb[(y - ry0) * rw + x - rx0] > 1 && redness(star[i], star[i + 1], star[i + 2], 1.05, 3) <= 0) for (let c = 0; c < 3; c++) cols[c].push(star[i + c]);
          }
          fabric = cols.map(v => (v.length ? v.sort((p, q) => p - q)[Math.floor(v.length / 2)] : 0));
        }
        for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
          const ra = Math.min(1, mb[(y - ry0) * rw + x - rx0] / 3), o = 4 * (y * W + x), i = 3 * (y * W + x);
          if (ra <= overlay[o + 3] / 255) continue;
          if (REDMODE === 'remove') {
            const red = Math.min(1, Math.max(0, redness(star[i], star[i + 1], star[i + 2], 1.15, 2) / 16));
            for (let c = 0; c < 3; c++) overlay[o + c] = Math.round(star[i + c] * (1 - red) + fabric[c] * red);
          } else for (let c = 0; c < 3; c++) overlay[o + c] = orig[i + c];
          overlay[o + 3] = Math.round(255 * ra * vis[k]);
        }
      }
    }
    return g;
  };
  // gains first (they need every frame), smoothed, then the real render
  await frames(baseFile, b0, b1, STAR, (b, k) => { gains[k] = render(b, k); });
  const gs = gains.map((_, k) => [0, 1, 2].map(c => {
    let s = 0, w = 0; for (let j = Math.max(0, k - 2); j <= Math.min(N - 1, k + 2); j++) { const ww = Math.exp(-((j - k) ** 2) / 2); s += ww * gains[j][c]; w += ww; }
    return s / w;
  }));
  // --steadygain: one gain for the whole shot (each channel's median), for a pinned shot where she and the light hold
  // still, so the word's brightness can't pulse either (102's B18)
  // --gainkeys=F:G;F:G...: the brightness, keyframed (part frames, straight lines between): for a faint print whose
  // light changes, measured from Starlight's own print rather than from the patch (102's part 10, 3387-3456)
  if (opt.gainkeys) {
    const gk = opt.gainkeys.split(';').map(t => t.split(':').map(Number)).sort((p, q) => p[0] - q[0]);
    const gAt = f => { if (f <= gk[0][0]) return gk[0][1]; for (let j = 1; j < gk.length; j++) if (f <= gk[j][0]) { const [fa, a0] = gk[j - 1], [fb, b0] = gk[j]; return a0 + (b0 - a0) * (f - fa) / (fb - fa); } return gk[gk.length - 1][1]; };
    gs.forEach((g, k) => { const v = gAt(FIRST + k); g.splice(0, 3, v, v, v); });
  }
  if ('steadygain' in opt && !opt.gainkeys) {   // (--gainkeys, where given, wins)
    const md = c => gains.map(g => g[c]).sort((a, b) => a - b)[Math.floor(N / 2)];
    const one = [0, 1, 2].map(md);
    // (--gainfollow=A-B: except in part frames A-B, where the light really changes, e.g. a gun's flash (102's B15),
    // the measured gain is kept there, blended in over 2 frames either side)
    const GF = opt.gainfollow ? opt.gainfollow.split('-').map(Number) : null;
    gs.forEach((g, k) => { const f = FIRST + k, w = GF ? Math.min(1, Math.max(0, Math.min(f - GF[0] + 2, GF[1] + 2 - f) / 2)) : 0;
      g.splice(0, 3, ...one.map((v, c) => v + (g[c] - v) * w)); });
  }
  // the gaps, smoothed (a local straight line over 3 frames each side; frames without a measurement take the nearest
  // one's) and capped at 12 pixels, are folded into the fit: moving the logo by d in the frame is e - A d / 2 at half size
  if (ALIGN && offs.some(Boolean)) {
    const ok = offs.map((v, k) => (v ? k : -1)).filter(k => k >= 0);
    const filled = offs.map((v, k) => v || offs[ok.reduce((b, j) => (Math.abs(j - k) < Math.abs(b - k) ? j : b), ok[0])]);
    // --alignsmooth=N widens the smoothing to N frames each side, so only slow drift is corrected and a noisy
    // measurement (small logos) can't make the logo pulse (L10: 30)
    const AS = +(opt.alignsmooth ?? 3);
    const shift = filled.map((_, k) => [0, 1].map(i => Math.max(-12, Math.min(12, localPoly(filled.map(v => v[i]), k, AS, AS / 2, 1)))));
    sm.forEach((p, k) => { const [dx, dy] = shift[k]; p[4] -= (p[0] * dx + p[1] * dy) / 2; p[5] -= (p[2] * dx + p[3] * dy) / 2; });
    fs.writeFileSync(path.join(out, 'align.tsv'), 'frame\tmeasured dx\tmeasured dy\tused dx\tused dy\n' +
      shift.map((s, k) => [FIRST + k, ...(offs[k] ? offs[k].map(v => v.toFixed(2)) : ['', '']), ...s.map(v => v.toFixed(2))].join('\t')).join('\n') + '\n');
    const mags = shift.map(s => Math.hypot(...s)).sort((a, b) => a - b);
    console.log(`aligned to Starlight's logo (${ok.length}/${N} frames measured): median shift ${mags[Math.floor(N / 2)].toFixed(1)} px, largest ${mags[N - 1].toFixed(1)} px (align.tsv)`);
  }
  let written = 0;
  await zipFrames([{ file: baseFile, filter: STAR, first: b0, last: b1 }, { file: path.join(dir, `${part}.mov`), filter: ORIG }], FIRST, LAST, ([b, o], k) => {
    render(b, k, gs[k], o);
    ff.stdin.write(Buffer.from(overlay));
    written++;
    rows.push([FIRST + k, score[k] == null ? 'held' : score[k].toFixed(3), ...sm[k].map(v => v.toFixed(4)), ...gs[k].map(v => v.toFixed(3))].join('\t'));
  });
  ff.stdin.end();
  await done;
  fs.writeFileSync(path.join(out, 'track.tsv'), rows.join('\n') + '\n');
  console.log(`${path.basename(outFile)}: ${written} frames; tracked ${score.filter(v => v != null).length}, median match ${score.filter(v => v != null).sort()[Math.floor(score.filter(v => v != null).length / 2)].toFixed(3)}`);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
