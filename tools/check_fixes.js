// Makes check grids for applied fixes: each row is one sample frame, Starlight (before) beside the fixed version
// (after), cropped around that frame's mask (from <part>_mask.tsv; whole frame for swaps), 642x376 each.
// Samples: PER frames spread over each fix's masked frames. ROWS rows per image.
// usage: node check_fixes.js FFMPEG_BIN UPLOAD_DIR FIXED_DIR FIXES.tsv OUT_DIR [PER=2] [ROWS=4]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, fixedDir, fixesFile, out, perArg = '2', rowsArg = '4'] = process.argv.slice(2);
const PER = +perArg, ROWS = +rowsArg, W = 642, H = 376, fps = 30000 / 1001;
const t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const ff = args => execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const fixes = fs.readFileSync(fixesFile, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t')).map(([id, part, first, last, kind]) => ({ id, part, first: +first, last: +last, kind }));
const masks = {};
const samples = [];
for (const f of fixes) {
  masks[f.part] ||= fs.readFileSync(path.join(fixedDir, `${f.part}_mask.tsv`), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
  const rows = masks[f.part].filter(r => r[2].split(',').includes(f.id) && +r[1] >= 900);
  if (!rows.length) { console.log(`${f.id}: no masked frames`); continue; }
  for (let k = 0; k < PER; k++) {
    const r = rows[Math.floor((k + 0.5) * rows.length / PER)];
    let [x0, y0, x1, y1] = r[3].split(',').map(Number);
    if (f.kind === 'swap') [x0, y0, x1, y1] = [0, 0, 1284, 752];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let w = Math.max((x1 - x0) * 1.5, (y1 - y0) * 1.5 * 1284 / 752, 321);
    w = Math.min(1284, Math.round(w / 2) * 2);
    const h = Math.min(752, Math.round(w * 752 / 1284 / 2) * 2);
    const cxs = Math.round(Math.max(0, Math.min(1284 - w, cx - w / 2))), cys = Math.round(Math.max(0, Math.min(752 - h, cy - h / 2)));
    samples.push({ ...f, frame: +r[0], crop: `${w}:${h}:${cxs}:${cys}` });
  }
}
const tmp = path.join(out, 'tmp');
fs.mkdirSync(tmp, { recursive: true });
samples.forEach((s, i) => {
  const ss = ((s.frame - 0.5) / fps).toFixed(4);
  const label = `${s.id}  ${s.part.replace(/[()]/g, '')}  frame ${s.frame}  ${t(s.frame)}   before | after`.replace(/:/g, '\\:');
  ff(['-ss', ss, '-i', path.join(dir, `${s.part}_starlight.mov`), '-ss', ss, '-i', path.join(fixedDir, `${s.part}_fixed.mov`), '-filter_complex',
    `[0:v]crop=${s.crop},scale=${W}:${H}:flags=lanczos:in_color_matrix=bt709:in_range=tv,format=rgb24[a];[1:v]crop=${s.crop},scale=${W}:${H}:flags=lanczos:in_color_matrix=bt709:in_range=tv,format=rgb24[b];` +
    `[a][b]hstack,drawtext=${font}:text='${label}':x=8:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=4`,
    '-frames:v', '1', path.join(tmp, `r${i}.png`)]);
});
for (let g = 0; g * ROWS < samples.length; g++) {
  const rows = samples.slice(g * ROWS, (g + 1) * ROWS).map((_, k) => path.join(tmp, `r${g * ROWS + k}.png`));
  ff([...rows.flatMap(r => ['-i', r]), '-filter_complex', rows.length > 1 ? `vstack=inputs=${rows.length}` : 'null', '-frames:v', '1',
    path.join(out, `check_${String(g + 1).padStart(2, '0')}.png`)]);
}
fs.rmSync(tmp, { recursive: true });
console.log(`${samples.length} samples on ${Math.ceil(samples.length / ROWS)} grids`);
