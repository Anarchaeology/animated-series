// Makes a comparison clip of one shot in four panes (original, Starlight, two composites; three panes if B is "-"), whole frames on top and a
// zoom underneath that follows the logo (from a logo_composite.js track.tsv: the reference point REFX,REFY carried
// into each frame through that frame's fit, smoothed). Original sound.
// usage: node make_variant_clip.js FFMPEG_BIN UPLOAD_DIR PART FIRST LAST TRACK.tsv ZOOM_W "LABEL_A|FILE_A" "LABEL_B|FILE_B" OUT.mp4 [REFX REFY]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, part, firstArg, lastArg, trackFile, zoomArg, va, vb, outFile, refX = '710', refY = '700'] = process.argv.slice(2);
const FIRST = +firstArg, LAST = +lastArg, ZW = Math.round(+zoomArg / 2) * 2, ZH = Math.round(ZW * 752 / 1284 / 2) * 2, fps = 30000 / 1001;
const rows = fs.readFileSync(trackFile, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
const pts = rows.map(r => {
  const [a, b, c, d, ex2, ey2] = r.slice(2, 8).map(Number), ex = 2 * ex2 + 0.5 - 0.5 * (a + b), ey = 2 * ey2 + 0.5 - 0.5 * (c + d), det = a * d - b * c;
  const rx = +refX - ex, ry = +refY - ey;
  return [(d * rx - b * ry) / det, (-c * rx + a * ry) / det];
});
const sm = pts.map((_, i) => { const n = pts.slice(Math.max(0, i - 8), i + 9); return [n.reduce((s, v) => s + v[0], 0) / n.length, n.reduce((s, v) => s + v[1], 0) / n.length]; });
const tmp = path.join(path.dirname(outFile), `variant_tmp_${process.pid}`);
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'cmd.txt'), sm.map(([cx, cy], i) => {
  const x = Math.round(Math.max(0, Math.min(1284 - ZW, cx - ZW / 2))), y = Math.round(Math.max(0, Math.min(752 - ZH, cy - ZH / 2)));
  return `${(i / fps).toFixed(4)} ${(vb !== '-' ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'c']).map(k => `crop@${k} x ${x}, crop@${k} y ${y}`).join(', ')};`;
}).join('\n') + '\n');
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const lab = t => `drawtext=${font}:text='${t}':x=10:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=5`;
const [la, fa] = va.split('|'), two = vb !== '-', [lb, fb] = two ? vb.split('|') : ['', ''];
const tr = `trim=start_frame=${FIRST}:end_frame=${LAST + 1},setpts=PTS-STARTPTS`;
execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
  '-i', path.join(dir, `${part}.mov`), '-i', path.join(dir, `${part}_starlight.mov`), '-i', fa, ...(two ? ['-i', fb] : []),
  '-filter_complex',
  `[0:v]${tr},scale=1284:752:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1,split[o][oz];` +
  `[1:v]${tr},split[s][sz];[2:v]setpts=PTS-STARTPTS,split[x][xz];` + (two ? `[3:v]setpts=PTS-STARTPTS,split[y][yz];` : '') +
  `[o]scale=642:376,${lab('Original')}[o1];[s]scale=642:376,${lab('Starlight')}[s1];[x]scale=642:376,${lab(la)}[x1];` + (two ? `[y]scale=642:376,${lab(lb)}[y1];` : '') +
  `[oz]sendcmd=f=cmd.txt,crop@a=${ZW}:${ZH}:0:0,scale=642:376:flags=lanczos[o2];[sz]crop@b=${ZW}:${ZH}:0:0,scale=642:376:flags=lanczos[s2];` +
  `[xz]crop@c=${ZW}:${ZH}:0:0,scale=642:376:flags=lanczos[x2];` + (two ? `[yz]crop@d=${ZW}:${ZH}:0:0,scale=642:376:flags=lanczos[y2];` : '') +
  (two ? `[o1][s1][x1][y1]hstack=4[top];[o2][s2][x2][y2]hstack=4[bot];` : `[o1][s1][x1]hstack=3[top];[o2][s2][x2]hstack=3[bot];`) + `[top][bot]vstack,format=yuv420p[v];` +
  `[0:a]atrim=start=${(FIRST / fps).toFixed(6)}:end=${((LAST + 1) / fps).toFixed(6)},asetpts=PTS-STARTPTS[au]`,
  '-map', '[v]', '-map', '[au]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outFile],
  { cwd: tmp, stdio: ['ignore', 'inherit', 'inherit'] });
fs.rmSync(tmp, { recursive: true });
console.log(`${path.basename(outFile)}: frames ${FIRST}-${LAST}`);
