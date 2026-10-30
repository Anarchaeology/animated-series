// A still for judging a pinned logo's placement: around the logo, the original (plainly enlarged), Starlight and the
// composite side by side at the middle frame of the shot, enlarged ZOOM times, with a grid every 10 frame pixels
// (labelled every 50 with full-size coordinates) and the placement written underneath.
// usage: node placement_still.js FFMPEG_BIN UPLOAD_DIR PART FIRST LAST COMPOSITE.mov "CX,CY,WIDTH,ANGLE" OUT.png [ZOOM=4]
const path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, part, firstArg, lastArg, comp, place, out, zoomArg = '4'] = process.argv.slice(2);
const [cx, cy, w] = place.split(',').map(Number), Z = +zoomArg, FIRST = +firstArg, F = Math.round((FIRST + +lastArg) / 2);
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
// crop: 2.4x the word's width across, 3:2, rounded to the 10-pixel grid
const cw = Math.max(80, Math.ceil(2.4 * w / 10) * 10), ch = Math.ceil(cw / 1.5 / 10) * 10;
const x0 = Math.max(0, Math.min(1284 - cw, Math.round((cx - cw / 2) / 10) * 10)), y0 = Math.max(0, Math.min(752 - ch, Math.round((cy - ch / 2) / 10) * 10));
const labels = [];
for (let x = Math.ceil(x0 / 50) * 50; x < x0 + cw; x += 50) labels.push(`drawtext=${font}:text='${x}':x=${(x - x0) * Z + 2}:y=2:fontsize=14:fontcolor=cyan`);
for (let y = Math.ceil(y0 / 50) * 50; y < y0 + ch; y += 50) labels.push(`drawtext=${font}:text='${y}':x=2:y=${(y - y0) * Z + 2}:fontsize=14:fontcolor=cyan`);
const panel = (lab, pre) => `${pre}crop=${cw}:${ch}:${x0}:${y0},scale=${cw * Z}:${ch * Z}:flags=lanczos,` +
  `drawgrid=w=${10 * Z}:h=${10 * Z}:t=1:c=yellow@0.25,${labels.join(',')},` +
  `drawtext=${font}:text='${lab}':x=8:y=h-28:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=4`;
const compFrom = +(path.basename(comp).match(/\(frames (\d+)-/) || [0, FIRST])[1];
execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
  '-i', path.join(dir, `${part}.mov`), '-i', path.join(dir, `${part}_starlight.mov`), '-i', comp, '-filter_complex',
  `[0:v]select='eq(n,${F})',${panel('Original', 'scale=1284:752:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709,')}[o];` +
  `[1:v]select='eq(n,${F})',${panel('Starlight', '')}[s];[2:v]select='eq(n,${F - compFrom})',${panel('Pinned', '')}[c];` +
  `[o][s][c]hstack=3,pad=iw:ih+44:0:0:black,drawtext=${font}:text='${part}  frame ${F}   --place=${place.replace(/,/g, '\\,')}  (centre x\\, centre y\\, width\\, tilt degrees)':x=10:y=h-34:fontsize=22:fontcolor=white`,
  '-frames:v', '1', out]);
console.log(out);
