// Fills small gaps in dark hair with the hair's own colour: pockets of sky that arching strands enclose near the top
// and sides of Eleena's hair (Episode 101b, behind her head as the pumpkin man appears; there in the original too),
// or with --only left off, any gap, the skin at her nape included. In each frame, inside a box around the hair, hair
// is anything darker than luma 40; a gap is a
// patch of non-hair of at most MAXAREA pixels that hair surrounds (thin links to the neck or sky, 1 px wide, are cut
// first, so holes open by a crack still count). Gaps are filled with the average colour of the hair around them,
// edges softened. Writes UPLOAD_DIR/<part>_<name> (frames A-B).mov (Starlight with the gaps filled, ProRes 422 HQ,
// BT.709, 1284x752), usable as a fix source. --debug=F writes OUT_DIR/debug_F.png (the box, gaps in red) and stops.
// --fadeout=A-B fades the fill out over those frames (the focus pull, where the holes blur away).
// usage: node hair_fill.js FFMPEG_BIN UPLOAD_DIR PART FIRST LAST X0,Y0,X1,Y1 OUT_DIR [--maxarea=150] [--name=hairfill]
//        [--fadeout=A-B] [--only=sky] [--hold=A-B] [--holdblur=8] [--debug=F] [--hair=40] [--headonly] [--maxlum=N[:Y]] [--thin=R] [--minarea=N] [--ring=D:F] [--steady=W:P] [--opentop] [--topmax=Y:AREA[:X0]]
// --maxlum=N[:Y]: a gap counts only if its average luma is below N (with Y, only for gaps reaching below frame row Y:
// lit pockets near the top of the head are brighter than the limit, the forehead is lower down): for 104's bar close-ups, where the gaps show a beige
// wall (luma 50-72) and her lit forehead (about 94) shows between strands at her hairline, and isn't a gap
// --opentop: patches reaching the box's top edge count too, for hair running off the top of the frame
// --topmax=Y:AREA[:X0]: patches wholly above frame row Y (and right of column X0, which --opentop then keeps to too) may
// be up to AREA px
// --headonly: a gap counts only if it lies against her head, the largest patch of hair in the box (most of its
// edge touching it), not against something else dark (a dark wall behind her: 102's desk scene)
const fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [bin, dir, part, firstArg, lastArg, boxArg, out] = args.filter(a => !a.startsWith('--'));
const W = 1284, H = 752, FIRST = +firstArg, LAST = +lastArg, N = LAST - FIRST + 1;
const [BX0, BY0, BX1, BY1] = boxArg.split(',').map(Number), BW = BX1 - BX0, BH = BY1 - BY0;
const MAXAREA = +(opt.maxarea ?? 150), NAME = opt.name || 'hairfill', HAIR = +(opt.hair ?? 40);   // --hair=L: hair is darker than luma L (default 40; 14 for 102's desk scene, where the wall behind her is 20-50)
fs.mkdirSync(out, { recursive: true });

function frames(first, last, onFrame) {
  return new Promise((res, rej) => {
    const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', path.join(dir, `${part}_starlight.mov`), '-vf',
      `trim=start_frame=${first}:end_frame=${last + 1},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv,format=rgb24`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const size = W * H * 3;
    let pending = Buffer.alloc(0), k = 0;
    ff.stdout.on('data', c => {
      pending = pending.length ? Buffer.concat([pending, c]) : c;
      while (pending.length >= size) { onFrame(Buffer.from(pending.subarray(0, size)), k++); pending = pending.subarray(size); }
    });
    ff.on('close', c => (c ? rej(new Error('ffmpeg failed reading')) : res(k)));
  });
}
function blur(src, w, h, sigma) {   // separable Gaussian
  const r = Math.ceil(3 * sigma), k = []; for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const t = k.reduce((a, b) => a + b, 0), kn = k.map(v => v / t), tmp = new Float32Array(w * h), dst = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += kn[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += kn[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; dst[y * w + x] = s; }
  return dst;
}
// 3x3 erosion / dilation of a 0/1 mask
const morph = (m, w, h, dilate) => {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy, s = xx < 0 || yy < 0 || xx >= w || yy >= h ? (dilate ? 0 : 1) : m[yy * w + xx];
      v = dilate ? v | s : v & s;
    }
    o[y * w + x] = v;
  }
  return o;
};

// the gaps in one frame: a 0..1 alpha over the box, and the fill colour
function gaps(buf, given) {   // (given: a gap mask to fill instead of finding one, --steady's second pass)
  const hair = new Uint8Array(BW * BH), rgb = [0, 1, 2].map(() => new Float32Array(BW * BH));
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const i = 3 * ((y + BY0) * W + x + BX0), j = y * BW + x;
    for (let c = 0; c < 3; c++) rgb[c][j] = buf[i + c];
    hair[j] = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2] < HAIR ? 1 : 0;
  }
  // --thin=R: strands up to about 2R px wide don't count as hair when deciding what's enclosed (the hair is shrunk R px
  // and grown back), so wall looped by a thin whisker stays open to the wall around it (104's 3:38 and 3:51, where a
  // whisker loop at the top right came out as a square pocket)
  if (opt.thin) { let o = hair.slice(); for (let i = 0; i < +opt.thin; i++) o = morph(o, BW, BH, false); for (let i = 0; i < +opt.thin; i++) o = morph(o, BW, BH, true); hair.set(o); }
  // dark but bluish isn't really hair: the hair is dark red, and sky seen through a thin gap, or round a pocket's
  // rim, is dark blue. Pockets are found both ways (dark blue as a wall, so a pocket near the outline stays enclosed;
  // and dark blue as a gap, so specks show), then grown up to 3 px into the dark blue around them
  const blueish = hair.map((v, j) => (v && rgb[2][j] > rgb[0][j] + 6 ? 1 : 0)), redHair = hair.map((v, j) => v & (1 - blueish[j]));
  // patches of a non-hair mask that are small and don't reach the box's edge (with --only=sky, only those showing
  // sky: bluer than red on average, so not the skin at the nape)
  // --opentop: the box's top edge doesn't count as an edge, for hair that runs off the top of the frame (104's bar
  // close-ups, where the pockets between the top strands reach the frame's top edge)
  const OPENTOP = 'opentop' in opt;
  // --topmax=Y:AREA: a patch lying wholly above frame row Y may be up to AREA px (the big pockets between the top strands),
  // while lower down --maxarea holds (bigger there, wall between the spikes at her sides came in as blobs)
  // (a third value, X0, keeps both that and --opentop to patches wholly right of frame column X0: 104's top-right pockets)
  const [TOPY, TOPAREA, TOPX = 0] = opt.topmax ? opt.topmax.split(':').map(Number) : [-1, 0, 0];
  const pockets = m => {
    const label = new Int32Array(BW * BH).fill(-1), found = new Uint8Array(BW * BH);
    for (let s = 0; s < BW * BH; s++) if (m[s] && label[s] < 0) {
      const stack = [s], cells = []; let edge = false, top = false, maxY = 0, minX = BW; label[s] = s;
      while (stack.length) {
        const p = stack.pop(), x = p % BW, y = (p - x) / BW; cells.push(p); if (y > maxY) maxY = y; if (x < minX) minX = x;
        if (x === 0 || x === BW - 1 || y === BH - 1) edge = true;
        if (y === 0) top = true;
        for (const q of [p - 1, p + 1, p - BW, p + BW]) {
          if (q < 0 || q >= BW * BH || Math.abs((q % BW) - x) > 1 || !m[q] || label[q] >= 0) continue;
          label[q] = s; stack.push(q);
        }
      }
      const sky = cells.reduce((a, p) => a + rgb[2][p] - rgb[0][p], 0) / cells.length > 15;
      const [MAXLUM, LUMBELOW = -1] = 'maxlum' in opt ? opt.maxlum.split(':').map(Number) : [0];
      const dim = !('maxlum' in opt) || maxY + BY0 < LUMBELOW || cells.reduce((a, p) => a + 0.2126 * rgb[0][p] + 0.7152 * rgb[1][p] + 0.0722 * rgb[2][p], 0) / cells.length < MAXLUM;
      const right = minX + BX0 >= TOPX;
      if (top && !(OPENTOP && right)) edge = true;
      const small = cells.length <= MAXAREA || (maxY + BY0 < TOPY && right && cells.length <= TOPAREA);
      if (!edge && small && (opt.only !== 'sky' || sky) && dim) for (const p of cells) found[p] = 1;
    }
    return found;
  };
  // gaps: enclosed patches of non-hair as they are (tiny specks included), and those with 1-px links cut (opening:
  // holes open to the sky or neck by a crack), the latter grown back over the non-hair the opening shaved off (2 px)
  const find = h => {
    const nonhair = h.map(v => 1 - v), direct = pockets(nonhair), cracked = pockets(morph(morph(nonhair, BW, BH, false), BW, BH, true));
    let g = cracked;
    for (let i = 0; i < 2; i++) g = morph(g, BW, BH, true).map((v, j) => v & nonhair[j] | cracked[j]);
    return g.map((v, j) => v | direct[j]);
  };
  const a = find(hair), b = find(redHair);
  let gap = a.map((v, j) => v | b[j]);
  if ('headonly' in opt) {
    // the head: the largest connected patch of hair (gaps closed first, so strands around a pocket join it)
    const closed = morph(morph(hair, BW, BH, true), BW, BH, false), lab = new Int32Array(BW * BH).fill(-1); let best = -1, bestN = 0;
    for (let s0 = 0; s0 < BW * BH; s0++) if (closed[s0] && lab[s0] < 0) { const st = [s0]; let n = 0; lab[s0] = s0;
      while (st.length) { const p = st.pop(), x = p % BW; n++; for (const q of [p - 1, p + 1, p - BW, p + BW]) { if (q < 0 || q >= BW * BH || Math.abs((q % BW) - x) > 1 || !closed[q] || lab[q] >= 0) continue; lab[q] = s0; st.push(q); } }
      if (n > bestN) { bestN = n; best = s0; } }
    // each gap patch: keep it if at least 70% of the hair pixels bordering it belong to the head
    const seen = new Uint8Array(BW * BH), keep = new Uint8Array(BW * BH);
    for (let s0 = 0; s0 < BW * BH; s0++) if (gap[s0] && !seen[s0]) { const st = [s0], cells = []; let head = 0, other = 0; seen[s0] = 1;
      while (st.length) { const p = st.pop(), x = p % BW; cells.push(p);
        for (const q of [p - 1, p + 1, p - BW, p + BW]) { if (q < 0 || q >= BW * BH || Math.abs((q % BW) - x) > 1) continue;
          if (gap[q]) { if (!seen[q]) { seen[q] = 1; st.push(q); } } else if (hair[q]) { if (lab[q] === best) head++; else other++; } } }
      if (head >= 0.7 * (head + other) && head > 0) for (const p of cells) keep[p] = 1; }
    gap = gap.map((v, j) => v & keep[j]);
  }
  // --minarea=N: gaps under N px don't count (104's 3:38 and 3:51, where small gaps came and went from frame to frame)
  // --ring=D:F: a gap counts only if the ring of pixels D-3 to D px out from it is at least F hair: a hole in the main mass
  // of her hair has hair all round it that far out, while wall between crossed shoots has the open wall just past the
  // thin shoots (104's 3:38, the gap between the tall shoot and the diagonal ones at the top left)
  const [RING, RINGF] = opt.ring ? opt.ring.split(':').map(Number) : [0, 0];
  if (opt.minarea || opt.ring) {
    const seen = new Uint8Array(BW * BH), keep = new Uint8Array(BW * BH), MIN = +(opt.minarea || 0);
    for (let s0 = 0; s0 < BW * BH; s0++) if (gap[s0] && !seen[s0]) { const st = [s0], cells = []; seen[s0] = 1;
      while (st.length) { const p = st.pop(), x = p % BW; cells.push(p);
        for (const q of [p - 1, p + 1, p - BW, p + BW]) { if (q < 0 || q >= BW * BH || Math.abs((q % BW) - x) > 1 || !gap[q] || seen[q]) continue; seen[q] = 1; st.push(q); } }
      let ringOK = true;
      if (RING) {   // (Chebyshev distance from the gap, in a box round it; outside the search box counts as not hair)
        let bx0 = BW, by0 = BH, bx1 = 0, by1 = 0;
        for (const p of cells) { const x = p % BW, y = (p - x) / BW; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
        const lx0 = bx0 - RING, ly0 = by0 - RING, lw = bx1 - bx0 + 1 + 2 * RING, lh = by1 - by0 + 1 + 2 * RING;
        let dist = new Uint8Array(lw * lh).fill(255);
        for (const p of cells) { const x = p % BW, y = (p - x) / BW; dist[(y - ly0) * lw + x - lx0] = 0; }
        for (let r = 1; r <= RING; r++) { const nd = dist.slice();
          for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) if (dist[y * lw + x] === 255) {
            let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < lw && yy < lh && dist[yy * lw + xx] === r - 1) { near = true; break; } }
            if (near) nd[y * lw + x] = r; }
          dist = nd; }
        let n = 0, h = 0;
        for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) { const d = dist[y * lw + x]; if (d < RING - 2 || d > RING) continue;
          n++; const fx = x + lx0, fy = y + ly0; if (fx >= 0 && fy >= 0 && fx < BW && fy < BH && hair[fy * BW + fx]) h++; }
        ringOK = n > 0 && h >= RINGF * n;
      }
      if (cells.length >= MIN && ringOK) for (const p of cells) keep[p] = 1; }
    gap = gap.map((v, j) => v & keep[j]);
  }
  for (let i = 0; i < 3; i++) gap = morph(gap, BW, BH, true).map((v, j) => v & blueish[j] | gap[j]);
  // then soften the edge
  const found = gap;
  if (given) gap = given;
  const grown = morph(gap, BW, BH, true), alpha = blur(Float32Array.from(grown), BW, BH, 0.8);
  // fill colour: the (red) hair's average around each pixel (hair-only blur, 4 px)
  const hw = blur(Float32Array.from(redHair), BW, BH, 4), fill = rgb.map(ch => { const b = blur(ch.map((v, j) => v * redHair[j]), BW, BH, 4); return b.map((v, j) => (hw[j] > 0.02 ? v / hw[j] : 20)); });
  // where the hair is (the centre of its dark pixels), to follow the head when a mask is held
  let n = 0, sx = 0, sy = 0;
  for (let j = 0; j < BW * BH; j++) if (hair[j]) { n++; sx += j % BW; sy += Math.floor(j / BW); }
  return { gap, found, hair, alpha, fill, rgb, count: gap.reduce((a, b) => a + b, 0), cx: sx / Math.max(1, n), cy: sy / Math.max(1, n) };
}
// --hold=A-B: through a focus pull the gaps blur and stop looking like enclosed pockets, but the sky still shows
// through softly. From frame A to B the last sharp frame's gaps (frame A-1) are kept instead, moved with the hair,
// widened and softened more each frame (up to --holdblur px, reached HOLDRAMP frames in), so they cover the blurred
// spots, at double strength (softening thins a small patch out). The colour comes from the blurred frame just around
// each spot (a weighted average that leaves the spot out), so it matches the softened hair, which near the edge has
// mixed with the sky; the sharp frame's hair colour would show as dark blobs
const HOLDBLUR = +(opt.holdblur ?? 8), HOLDRAMP = 6;
function held(from, now, k) {
  const dx = Math.round(now.cx - from.cx), dy = Math.round(now.cy - from.cy), sigma = 0.8 + (HOLDBLUR - 0.8) * Math.min(1, k / HOLDRAMP);
  let m = new Uint8Array(BW * BH);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const xs = x - dx, ys = y - dy;
    if (xs >= 0 && ys >= 0 && xs < BW && ys < BH) m[y * BW + x] = from.gap[ys * BW + xs];
  }
  for (let i = 0; i < Math.round(sigma); i++) m = morph(m, BW, BH, true);
  let out = m;
  for (let i = 0; i < 3; i++) out = morph(out, BW, BH, true);
  // (wide enough to reach past the widened spot from its middle)
  const s2 = Math.max(6, 2 * sigma + 2), wgt = Float32Array.from(out, v => 1 - v), wb = blur(wgt, BW, BH, s2);
  const fill = now.rgb.map(ch => { const b = blur(ch.map((v, j) => v * wgt[j]), BW, BH, s2); return b.map((v, j) => (wb[j] > 0.01 ? v / wb[j] : 20)); });
  return { alpha: blur(Float32Array.from(m), BW, BH, sigma).map(v => Math.min(1, 2 * v)), fill };
}

(async () => {
  if (opt.debug) {
    const F = +opt.debug;
    await frames(F, F, buf => {
      const { alpha } = gaps(buf), img = Buffer.alloc(BW * BH * 3);
      for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
        const i = 3 * ((y + BY0) * W + x + BX0), j = y * BW + x, a = Math.min(1, alpha[j]);
        img[3 * j] = Math.round(buf[i] * (1 - a) + 255 * a); img[3 * j + 1] = Math.round(buf[i + 1] * (1 - a)); img[3 * j + 2] = Math.round(buf[i + 2] * (1 - a));
      }
      spawnSync(path.join(bin, 'ffmpeg'), ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${BW}x${BH}`, '-i', '-', '-vf', 'scale=iw*2:ih*2:flags=neighbor', path.join(out, `debug_${F}.png`)], { input: img });
    });
    console.log(`wrote ${path.join(out, `debug_${F}.png`)}`);
    return;
  }
  const [fa, fb] = (opt.fadeout || `${LAST + 1}-${LAST + 1}`).split('-').map(Number);
  const outFile = path.join(dir, `${part}_${NAME} (frames ${FIRST}-${LAST}).mov`);
  const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
    '-i', path.join(dir, `${part}_starlight.mov`), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', '30000/1001', '-i', 'pipe:0',
    '-filter_complex', `[0:v]trim=start_frame=${FIRST}:end_frame=${LAST + 1},setpts=PTS-STARTPTS,format=yuv444p10le[s];` +
    `[1:v]setpts=PTS-STARTPTS,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuva444p10le[o];[s][o]overlay=format=yuv444p10,format=yuv422p10le[v]`,
    '-map', '[v]', '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', 'use_metadata_tags',
    '-metadata', `comment=${part} frames ${FIRST}-${LAST}: Starlight with gaps in the hair filled (hair_fill.js)`, outFile],
    { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('encode failed')) : res())));
  const overlay = Buffer.alloc(W * H * 4), counts = [];
  const [ha, hb] = (opt.hold || `${LAST + 1}-${LAST + 1}`).split('-').map(Number);
  let last = null;
  // --steady=W:P[:M]: two passes. The first finds each frame's gaps; then a pixel is filled in frame t only if it isn't hair
  // there and at least P of the frames within W either side had a gap within 2 px of it (each lined up on the hair's
  // centre, so her head's movement is followed). A pocket that shows for a frame or two isn't filled, and one that
  // blinks shut for a frame stays filled, so the fill doesn't flicker with Starlight's own holes (104's 3:38 and 3:51)
  let steady = null;
  if (opt.steady) {
    const [SW, SP, SM = 1] = opt.steady.split(':').map(Number), G = [], NH = [], C = [];
    await frames(FIRST, LAST, buf => { const g = gaps(buf); G.push(morph(morph(g.found, BW, BH, true), BW, BH, true)); NH.push(g.hair.map(v => 1 - v)); C.push([g.cx, g.cy]); });
    steady = G.map((_, k) => {
      const acc = new Uint8Array(BW * BH); let n = 0;
      for (let s = Math.max(0, k - SW); s <= Math.min(N - 1, k + SW); s++) {
        n++; const dx = Math.round(C[k][0] - C[s][0]), dy = Math.round(C[k][1] - C[s][1]);
        for (let y = 0; y < BH; y++) { const ys = y - dy; if (ys < 0 || ys >= BH) continue;
          for (let x = 0; x < BW; x++) { const xs = x - dx; if (xs >= 0 && xs < BW && G[s][ys * BW + xs]) acc[y * BW + x]++; } }
      }
      return acc.map((v, j) => (v >= SP * n && NH[k][j] ? 1 : 0));
    });
    // (a third value M drops fill that lasts fewer than M frames at a place: each frame's fill grown 3 px, a pixel's
    // fill kept only where that stays on for M frames running, so a pocket filled for a frame or two doesn't blink)
    if (SM > 1) {
      const D = steady.map(m => { let d = m; for (let i = 0; i < 3; i++) d = morph(d, BW, BH, true); return d; });
      for (let j = 0; j < BW * BH; j++) {
        let k = 0;
        while (k < N) {
          if (!D[k][j]) { k++; continue; }
          let e = k; while (e < N && D[e][j]) e++;
          if (e - k < SM) for (let q = k; q < e; q++) steady[q][j] = 0;
          k = e;
        }
      }
    }
  }
  await frames(FIRST, LAST, (buf, k) => {
    overlay.fill(0);
    const f = FIRST + k, fade = f < fa ? 1 : f >= fb ? 0 : 1 - (f - fa) / (fb - fa);
    if (fade > 0) {
      const now = gaps(buf, steady ? steady[k] : null), hold = last && f >= ha && f <= hb;
      if (f < ha) last = now;
      const { alpha, fill } = hold ? held(last, now, f - ha + 1) : now;
      counts.push(`${f}:${hold ? 'held' : now.count}`);
      for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
        const j = y * BW + x, a = Math.min(1, alpha[j]) * fade;
        if (a <= 0.004) continue;
        const o = 4 * ((y + BY0) * W + x + BX0);
        for (let c = 0; c < 3; c++) overlay[o + c] = Math.max(0, Math.min(255, Math.round(fill[c][j])));
        overlay[o + 3] = Math.round(255 * a);
      }
    }
    ff.stdin.write(Buffer.from(overlay));
  });
  ff.stdin.end();
  await done;
  console.log(`${path.basename(outFile)}: ${N} frames; gap pixels by frame: ${counts.join(' ')}`);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
