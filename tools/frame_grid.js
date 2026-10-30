// Makes grids for looking at frames: each row is one frame, original (plainly enlarged) beside Starlight (or another
// render), 642x376 each, labelled with part, frame and time. ROWS rows per image.
// LIST.tsv rows: part, frame[, label]. Writes OUT_DIR/grid_NN.png.
// usage: node frame_grid.js FFMPEG_BIN UPLOAD_DIR LIST.tsv OUT_DIR [ROWS=4] [SUFFIX=_starlight]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, listFile, out, rowsArg = '4', suffix = '_starlight'] = process.argv.slice(2);
const ROWS = +rowsArg, W = 642, H = 376;
const fps = 30000 / 1001, t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const ff = args => execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const items = fs.readFileSync(listFile, 'utf8').trim().split('\n').map(l => { const [part, frame, label = ''] = l.split('\t'); return { part, frame: +frame, label }; });
const tmp = path.join(out, 'tmp');
fs.mkdirSync(tmp, { recursive: true });
items.forEach((it, i) => {
  const ss = ((it.frame - 0.5) / fps).toFixed(4);
  const label = `${it.part.replace(/[()]/g, '')}  frame ${it.frame}  ${t(it.frame)}  ${it.label}`.replace(/:/g, '\\:');
  ff(['-ss', ss, '-i', path.join(dir, `${it.part}.mov`), '-ss', ss, '-i', path.join(dir, `${it.part}${suffix}.mov`), '-filter_complex',
    `[0:v]scale=${W}:${H}:flags=bicubic:in_color_matrix=bt601:in_range=tv,format=rgb24[a];[1:v]scale=${W}:${H}:in_color_matrix=bt709:in_range=tv,format=rgb24[b];` +
    `[a][b]hstack,drawtext=${font}:text='${label}':x=8:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=4`,
    '-frames:v', '1', path.join(tmp, `r${i}.png`)]);
});
for (let g = 0; g * ROWS < items.length; g++) {
  const rows = items.slice(g * ROWS, (g + 1) * ROWS).map((_, k) => path.join(tmp, `r${g * ROWS + k}.png`));
  ff([...rows.flatMap(r => ['-i', r]), '-filter_complex', rows.length > 1 ? `vstack=inputs=${rows.length}` : 'null', '-frames:v', '1',
    path.join(out, `grid_${String(g + 1).padStart(2, '0')}.png`)]);
}
fs.rmSync(tmp, { recursive: true });
console.log(`${items.length} frames on ${Math.ceil(items.length / ROWS)} grids in ${out}`);
