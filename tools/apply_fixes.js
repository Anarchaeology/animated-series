// Applies a fix list to upload parts: Starlight everywhere, with another source blended in through a soft mask where
// a fix says so. Writes OUT_DIR/<part>_fixed.mov (ProRes 422 HQ, BT.709, no audio) and OUT_DIR/<part>_mask.tsv
// (frame, mask strength 0-1023, fix ids, mask bounding box in 1284x752).
//
// Sources (option src=..., default proteus), all 1284x752 and frame-aligned with Starlight:
//   proteus  the Proteus 4 render (<part>_proteus.mov)
//   orig     the original, plainly enlarged (bicubic) - soft but exactly what's there
//   grain    Proteus with the original's grain put back (the original minus a blurred copy of itself, added on)
//   softN, softNgrain  Starlight blurred (Gaussian sigma N, e.g. soft2, soft1.5grain), optionally with the original's
//            grain put back; softgrain is soft3grain
//   any other name: another model's render, UPLOAD_DIR/<part>_<name>.mov, 1284x752 and aligned like Proteus. A render
//            of only some frames is named <part>_<name> (frames A-B).mov and starts at part frame A.
//
// FIXES.tsv columns: id, part, first frame, last frame, kind, spec, note. Coordinates are in the 1284x752 frame.
// spec is a list of options separated by |, plus keyframes for ellipses.
//   swap     the whole picture.
//   ellipse  a feathered oval, moving between keyframes (linear): F:cx,cy,rx,ry;F:cx,cy,rx,ry...
//   key      a box tracked from the Bronto Burger logo, found per frame by its green in the original (hue 125-150,
//            at least 20 pixels at quarter size). The box spans the logo's width and, in logo heights below the
//            logo's top edge, from top= (default 0) to down= (default 2.6); pad= adds quarter-size pixels. For small or
//            dim logos, sat= (default 0.45), val= (0.3) and px= (20) loosen the green test.
// Common options: src=, rampin=N, rampout=N (frames of fade at the ends).
// Masks are built at quarter size (321x188, 10-bit), one per source side by side in a single stream, and scaled up
// by ffmpeg; overlapping fixes on the same source combine by max, later sources are laid over earlier ones: model
// renders (whole-frame composites such as a logo) first, then the built-in sources (Proteus, the original, grain,
// blurred), so a spot oval sits on top of a composite in the same shot (102: the glasses fixes over the BABOONS ones).
// --range=A-B renders only part frames A-B (for previews), with just the fixes that touch them, to
// OUT_DIR/<part>_preview (frames A-B).mov.
// usage: node apply_fixes.js FFMPEG_BIN UPLOAD_DIR FIXES.tsv OUT_DIR [PART ...] [--range=A-B]
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const argv = process.argv.slice(2), rangeArg = argv.find(a => a.startsWith('--range='));
const [bin, dir, fixesFile, out, ...only] = argv.filter(a => !a.startsWith('--'));
const RANGE = rangeArg ? rangeArg.slice(8).split('-').map(Number) : null;
const QW = 321, QH = 188, S = 4, MAX = 1023, BUILTIN = ['proteus', 'orig', 'grain'];
// blurred-Starlight sources: softN / softNgrain
const softOf = s => { const m = s === 'softgrain' ? [s, '3', 'grain'] : s.match(/^soft(\d+(?:\.\d+)?)(grain)?$/); return m ? { sigma: +m[1], grain: !!m[2] } : null; };
const isBuiltin = s => BUILTIN.includes(s) || !!softOf(s);
const label = s => s.replace(/[^A-Za-z0-9_]/g, '_');
// the file behind a model-render source, and the part frame it starts at
function modelFile(part, name) {
  const exact = path.join(dir, `${part}_${name}.mov`);
  if (fs.existsSync(exact)) return { file: exact, from: 0 };
  const hit = fs.readdirSync(dir).find(f => f.startsWith(`${part}_${name} (frames `) && f.endsWith('.mov'));
  if (!hit) throw new Error(`no render for source ${name} in ${part}`);
  return { file: path.join(dir, hit), from: +hit.match(/\(frames (\d+)-/)[1] };
}
fs.mkdirSync(out, { recursive: true });

const fixes = fs.readFileSync(fixesFile, 'utf8').trim().split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('id\t')).map(l => {
  const [id, part, first, last, kind, spec = '', note = ''] = l.split('\t');
  const fields = spec.split('|').filter(Boolean);
  const o = Object.fromEntries(fields.filter(s => /^\w+=/.test(s)).map(s => s.split('=')).map(([k, v]) => [k, isNaN(+v) ? v : +v]));
  const keyText = fields.find(s => !/^\w+=/.test(s)) || '';
  const keys = kind === 'ellipse' ? keyText.split(';').map(k => { const [f, rest] = k.split(':'); const [cx, cy, rx, ry] = rest.split(',').map(Number); return { f: +f, cx, cy, rx, ry }; }) : [];
  const src = String(o.src || 'proteus');
  if (!isBuiltin(src)) modelFile(part, src);
  return { id, part, first: +first, last: +last, kind, o, src, keys, note };
});
const parts = [...new Set(fixes.map(f => f.part))].filter(p => !only.length || only.includes(p));

const isLogo = (r, g, b, sat = 0.45, val = 0.3) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx !== g || !d || d / mx <= sat || mx / 255 <= val) return false;
  const h = ((b - r) / d + 2) * 60;
  return h >= 125 && h <= 150;
};
// Per-frame logo boxes for one key fix (quarter-size coordinates), smoothed over +-2 frames.
async function logoBoxes(fix) {
  const size = QW * QH * 3, raw = [];
  const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', path.join(dir, `${fix.part}.mov`), '-vf',
    `trim=start_frame=${fix.first}:end_frame=${fix.last + 1},setpts=PTS-STARTPTS,scale=${QW}:${QH}:in_color_matrix=bt601:in_range=tv,format=rgb24`,
    '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let pending = Buffer.alloc(0);
  ff.stdout.on('data', c => {
    pending = pending.length ? Buffer.concat([pending, c]) : c;
    while (pending.length >= size) {
      const f = pending.subarray(0, size), xs = [], ys = [];
      for (let y = 0; y < QH; y++) for (let x = 0; x < QW; x++) {
        const i = 3 * (y * QW + x);
        if (isLogo(f[i], f[i + 1], f[i + 2], fix.o.sat, fix.o.val)) { xs.push(x); ys.push(y); }
      }
      if (xs.length < (fix.o.px ?? 20)) raw.push(null);
      else {
        xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
        const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
        raw.push([q(xs, 0.03), q(ys, 0.03), q(xs, 0.97), q(ys, 0.97)]);
      }
      pending = pending.subarray(size);
    }
  });
  await new Promise((res, rej) => ff.on('close', c => c ? rej(new Error(`logo pass failed on ${fix.part}`)) : res()));
  return raw.map((_, k) => {
    const near = raw.slice(Math.max(0, k - 2), k + 3).filter(Boolean);
    if (near.length < 3) return null;
    const med = i => near.map(b => b[i]).sort((a, b) => a - b)[Math.floor(near.length / 2)];
    return [med(0), med(1), med(2), med(3)];
  });
}
const ramp = (fix, i) => {
  const a = fix.o.rampin ? Math.min(1, (i - fix.first + 1) / fix.o.rampin) : 1;
  const b = fix.o.rampout ? Math.min(1, (fix.last - i + 1) / fix.o.rampout) : 1;
  return Math.max(0, Math.min(a, b));
};
const lerpKey = (keys, i) => {
  if (i <= keys[0].f) return keys[0];
  for (let k = 1; k < keys.length; k++) if (i <= keys[k].f) {
    const a = keys[k - 1], b = keys[k], t = (i - a.f) / (b.f - a.f);
    return { cx: a.cx + t * (b.cx - a.cx), cy: a.cy + t * (b.cy - a.cy), rx: a.rx + t * (b.rx - a.rx), ry: a.ry + t * (b.ry - a.ry) };
  }
  return keys[keys.length - 1];
};
function drawFix(fix, i, m, boxes) {
  const r = ramp(fix, i);
  if (fix.kind === 'swap') { const v = Math.round(MAX * r); for (let p = 0; p < m.length; p++) m[p] = Math.max(m[p], v); return; }
  if (fix.kind === 'ellipse') {
    const e = lerpKey(fix.keys, i), cx = e.cx / S, cy = e.cy / S, rx = e.rx / S, ry = e.ry / S;
    for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(QH, Math.ceil(cy + ry)); y++)
      for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(QW, Math.ceil(cx + rx)); x++) {
        const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
        if (d < 1) m[y * QW + x] = Math.max(m[y * QW + x], Math.round(MAX * r * Math.min(1, (1 - d) / 0.45)));
      }
    return;
  }
  if (fix.kind === 'key') {
    const b = boxes[i - fix.first];
    if (!b) return;
    const pad = fix.o.pad ?? 3, h = b[3] - b[1], F = 3;
    const X0 = b[0] - pad, X1 = b[2] + pad, Y0 = b[1] + (fix.o.top ?? 0) * h - pad, Y1 = b[1] + (fix.o.down ?? 2.6) * h + pad;
    for (let y = Math.max(0, Math.floor(Y0)); y < Math.min(QH, Math.ceil(Y1)); y++)
      for (let x = Math.max(0, Math.floor(X0)); x < Math.min(QW, Math.ceil(X1)); x++) {
        const e = Math.min(x + 0.5 - X0, X1 - x - 0.5, y + 0.5 - Y0, Y1 - y - 0.5);
        if (e > 0) m[y * QW + x] = Math.max(m[y * QW + x], Math.round(MAX * r * Math.min(1, e / F)));
      }
  }
}


(async () => {
  for (const part of parts) {
    const mine = fixes.filter(f => f.part === part && (!RANGE || (f.last >= RANGE[0] && f.first <= RANGE[1])));
    if (!mine.length) { console.log(`${part}: no fixes${RANGE ? ` in frames ${RANGE.join('-')}` : ''}`); continue; }
    // frames A-B only: each input trimmed (after any padding), and masks sent for those frames
    const cut = RANGE ? `trim=start_frame=${RANGE[0]}:end_frame=${RANGE[1] + 1},setpts=PTS-STARTPTS,` : '';
    const srcs = [...new Set(mine.map(f => f.src))];
    const used = [...srcs.filter(s => !isBuiltin(s)), ...BUILTIN.filter(s => srcs.includes(s)), ...srcs.filter(s => softOf(s))];
    const softs = used.filter(s => softOf(s));
    const models = used.filter(s => !isBuiltin(s)).map(s => ({ name: s, ...modelFile(part, s) }));
    const frames = +execFileSync(path.join(bin, 'ffprobe'), ['-v', 'error', '-count_packets', '-select_streams', 'v', '-show_entries',
      'stream=nb_read_packets', '-of', 'csv=p=0', path.join(dir, `${part}_starlight.mov`)]).toString().trim();
    const boxes = new Map();
    for (const f of mine.filter(f => f.kind === 'key')) boxes.set(f, await logoBoxes(f));
    // inputs: 0 Starlight, 1 Proteus, 2 original, 3 masks (one 321x188 mask per used source, side by side), 4+ model renders
    const toHD = 'scale=1284:752:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1,format=yuv422p10le';
    const uses = s => used.includes(s), grainSofts = softs.filter(s => softOf(s).grain);
    const withGrain = uses('grain') || grainSofts.length > 0;
    // send a stream to every consumer that needs it
    const fan = (chain, names) => names.length === 1 ? `${chain}[${names[0]}]` : `${chain},split=${names.length}${names.map(n => `[${n}]`).join('')}`;
    const g = [fan(`[0:v]${cut}setpts=PTS-STARTPTS,format=yuv422p10le`, ['s0', ...softs.map(s => `sb_${label(s)}`)])];
    const pUse = [...(uses('proteus') ? ['proteus'] : []), ...(uses('grain') ? ['pg'] : [])];
    if (pUse.length) g.push(fan(`[1:v]${cut}setpts=PTS-STARTPTS,format=yuv422p10le`, pUse));
    const oUse = [...(uses('orig') ? ['orig'] : []), ...(withGrain ? ['o1', 'o2'] : [])];
    if (oUse.length) g.push(fan(`[2:v]setpts=PTS-STARTPTS,fps=30000/1001,${cut}${toHD}`, oUse));
    if (withGrain) g.push('[o2]gblur=sigma=4[ob]', fan("[o1][ob]blend=all_expr='A-B+512'", [...(uses('grain') ? ['gr1'] : []), ...grainSofts.map(s => `gr_${label(s)}`)]));
    if (uses('grain')) g.push("[pg][gr1]blend=all_expr='clip(A+B-512,0,1023)'[grain]");
    for (const s of softs) {
      const { sigma, grain } = softOf(s), l = label(s);
      g.push(grain ? `[sb_${l}]gblur=sigma=${sigma}[sbb_${l}];[sbb_${l}][gr_${l}]blend=all_expr='clip(A+B-512,0,1023)'[${l}]` : `[sb_${l}]gblur=sigma=${sigma}[${l}]`);
    }
    models.forEach((m, j) => g.push(`[${4 + j}:v]setpts=PTS-STARTPTS${m.from ? `,tpad=start=${m.from}:start_mode=clone` : ''},${cut}format=yuv422p10le[${label(m.name)}]`));
    g.push(fan('[3:v]setpts=PTS-STARTPTS', used.map((_, k) => `mk${k}`)));
    let last = 's0';
    used.forEach((s, k) => {
      // (labels with a separator: "mk1" + "0" would be "mk10", the next mask's own label once there are 11 sources)
      const mk = `mk${k}`;
      g.push(`[${mk}]crop=${QW}:${QH}:${k * QW}:0,scale=1284:752:flags=bicubic,split=3[${mk}_y][${mk}_a][${mk}_b]`,
        `[${mk}_a]scale=642:752:flags=bilinear[${mk}_u]`, `[${mk}_b]scale=642:752:flags=bilinear[${mk}_v]`,
        `[${mk}_y][${mk}_u][${mk}_v]mergeplanes=map0s=0:map0p=0:map1s=1:map1p=0:map2s=2:map2p=0:format=yuv422p10le[${mk}_m]`,
        `[${last}][${label(s)}][${mk}_m]maskedmerge[x${k}]`);
      last = `x${k}`;
    });
    g.push(`[${last}]null[v]`);
    // (set DUMP_GRAPH=1 to print the filter graph and stop, for debugging)
    if (process.env.DUMP_GRAPH) { console.log(`inputs: 0 Starlight, 1 Proteus, 2 original, 3 masks (${used.join(', ')}), ${models.map((m, j) => `${4 + j} ${m.name}`).join(', ')}\n${g.join(';\n')}`); continue; }
    const [A, Z] = RANGE || [0, frames - 1];
    const N = used.length, outFile = path.join(out, RANGE ? `${part}_preview (frames ${A}-${Z}).mov` : `${part}_fixed.mov`);
    const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
      '-i', path.join(dir, `${part}_starlight.mov`), '-i', path.join(dir, `${part}_proteus.mov`), '-i', path.join(dir, `${part}.mov`),
      '-f', 'rawvideo', '-pix_fmt', 'gray10le', '-s', `${N * QW}x${QH}`, '-framerate', '30000/1001', '-i', 'pipe:0',
      ...models.flatMap(m => ['-i', m.file]),
      '-filter_complex', g.join(';'),
      '-map', '[v]', '-frames:v', String(Z - A + 1), '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
      '-pix_fmt', 'yuv422p10le', '-colorspace', 'bt709', '-color_range', 'tv', '-movflags', 'use_metadata_tags',
      '-metadata', `comment=Starlight Precise 2.6 with fixes from ${path.basename(fixesFile)}: ${mine.map(f => `${f.id} (${f.src})`).join(', ')}`, outFile],
      { stdio: ['pipe', 'ignore', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', c => c ? rej(new Error(`ffmpeg exit ${c} on ${part}`)) : res()));
    const stats = ['frame\tmask max\tfixes\tmask box (x0,y0,x1,y1 in 1284x752)'];
    const planes = used.map(() => new Uint16Array(QW * QH)), packed = new Uint16Array(N * QW * QH), zero = Buffer.alloc(N * QW * QH * 2);
    for (let i = A; i <= Z; i++) {
      const active = mine.filter(f => i >= f.first && i <= f.last);
      let chunk = zero;
      if (active.length) {
        planes.forEach(p => p.fill(0));
        for (const f of active) drawFix(f, i, planes[used.indexOf(f.src)], boxes.get(f));
        let mx = 0, x0 = QW, y0 = QH, x1 = -1, y1 = -1;
        for (const m of planes) for (let p = 0; p < m.length; p++) if (m[p]) {
          if (m[p] > mx) mx = m[p];
          const x = p % QW, y = (p - x) / QW;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (mx) {
          stats.push(`${i}\t${mx}\t${active.map(f => f.id).join(',')}\t${x0 * S},${y0 * S},${(x1 + 1) * S},${(y1 + 1) * S}`);
          for (let y = 0; y < QH; y++) planes.forEach((p, k) => packed.set(p.subarray(y * QW, (y + 1) * QW), y * N * QW + k * QW));
          chunk = Buffer.from(packed.buffer.slice(0));
        }
      }
      if (!ff.stdin.write(chunk)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    fs.writeFileSync(path.join(out, RANGE ? `${part}_preview_mask.tsv` : `${part}_mask.tsv`), stats.join('\n') + '\n');
    console.log(`${part}: ${RANGE ? `frames ${A}-${Z}` : `${frames} frames`}, ${stats.length - 1} with fixes (${mine.map(f => `${f.id} ${f.src}`).join(', ')})`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
