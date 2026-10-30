// Shows where ellipse fixes act: for each listed frame, the Starlight frame (half size) with the fix list's ellipse
// masks tinted red by strength, a 100-pixel grid (in 1284x752 coordinates) and labels.
// LIST.tsv rows: part, frame. Writes OUT_DIR/overlay_NN.png (4 frames each, 2x2).
// usage: node mask_overlay.js FFMPEG_BIN UPLOAD_DIR FIXES.tsv LIST.tsv OUT_DIR
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, fixesFile, listFile, out] = process.argv.slice(2);
const W = 642, H = 376, fps = 30000 / 1001, font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const fixes = fs.readFileSync(fixesFile, 'utf8').trim().split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('id\t')).map(l => {
  const [id, part, first, last, kind, spec = ''] = l.split('\t');
  const keyText = spec.split('|').find(s => s && !/^\w+=/.test(s)) || '';
  const keys = kind === 'ellipse' ? keyText.split(';').map(k => { const [f, rest] = k.split(':'); const [cx, cy, rx, ry] = rest.split(',').map(Number); return { f: +f, cx, cy, rx, ry }; }) : [];
  return { id, part, first: +first, last: +last, kind, keys };
});
const lerpKey = (keys, i) => {
  if (i <= keys[0].f) return keys[0];
  for (let k = 1; k < keys.length; k++) if (i <= keys[k].f) {
    const a = keys[k - 1], b = keys[k], t = (i - a.f) / (b.f - a.f);
    return { cx: a.cx + t * (b.cx - a.cx), cy: a.cy + t * (b.cy - a.cy), rx: a.rx + t * (b.rx - a.rx), ry: a.ry + t * (b.ry - a.ry) };
  }
  return keys[keys.length - 1];
};
const items = fs.readFileSync(listFile, 'utf8').trim().split('\n').map(l => { const [part, frame] = l.split('\t'); return { part, frame: +frame }; });
const tmp = path.join(out, 'tmp');
fs.mkdirSync(tmp, { recursive: true });
items.forEach((it, n) => {
  const m = Buffer.alloc(W * H);
  const ids = [];
  for (const f of fixes.filter(f => f.part === it.part && f.kind === 'ellipse' && it.frame >= f.first && it.frame <= f.last)) {
    ids.push(f.id);
    const e = lerpKey(f.keys, it.frame), s = 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot((x * s + 1 - e.cx) / e.rx, (y * s + 1 - e.cy) / e.ry);
      if (d < 1) m[y * W + x] = Math.max(m[y * W + x], Math.round(255 * Math.min(1, (1 - d) / 0.45)));
    }
  }
  const maskFile = path.join(tmp, `m${n}.gray`);
  fs.writeFileSync(maskFile, m);
  const label = `${it.part} frame ${it.frame} ${ids.join(',') || 'no fix'}`.replace(/:/g, '\\:');
  execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', '-ss', ((it.frame - 0.5) / fps).toFixed(4), '-i', path.join(dir, `${it.part}_starlight.mov`),
    '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${W}x${H}`, '-i', maskFile, '-filter_complex',
    `[0:v]scale=${W}:${H}:in_color_matrix=bt709:in_range=tv,format=rgb24[f];color=red:s=${W}x${H}:d=1,format=rgb24[r];[1:v]format=gray,geq=lum='lum(X,Y)*0.55'[a];` +
    `[r][a]alphamerge[ra];[f][ra]overlay=format=auto,drawgrid=w=50:h=50:t=1:c=white@0.25,drawtext=${font}:text='${label}':x=6:y=6:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6`,
    '-frames:v', '1', path.join(tmp, `o${n}.png`)], { stdio: ['ignore', 'inherit', 'inherit'] });
});
for (let g = 0; g * 4 < items.length; g++) {
  const files = items.slice(g * 4, g * 4 + 4).map((_, k) => path.join(tmp, `o${g * 4 + k}.png`));
  while (files.length < 4) files.push(files[files.length - 1]);
  execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', ...files.flatMap(f => ['-i', f]), '-filter_complex',
    `xstack=inputs=4:layout=0_0|${W}_0|0_${H}|${W}_${H}`, '-frames:v', '1', path.join(out, `overlay_${String(g + 1).padStart(2, '0')}.png`)], { stdio: ['ignore', 'inherit', 'inherit'] });
}
fs.rmSync(tmp, { recursive: true });
console.log(`${items.length} frames in ${out}`);
