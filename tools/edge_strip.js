// Finds runs of frames with a light line down the left edge (101b's hologram close-ups: one bright column in the
// original, which Starlight turns into a bright and a dark column): the mean brightness of the outer EDGE columns
// against columns IN_FROM to IN_TO, over the middle 80% of the height, flagged when the edge is more than 8 levels
// lighter (and above 25, so dark shots don't count). Prints the runs of flagged frames. Bright things that really are at
// the edge (sky, a lamp) show up too, so look at what it finds.
// usage: node edge_strip.js FFMPEG_BIN FILE [MATRIX=bt601] [EDGE IN_FROM IN_TO]
//        (the defaults suit the 352-wide originals: 2 3 8; for 1284-wide renders use bt709 6 12 30)
const path = require('path'), { spawn, execFileSync } = require('child_process');
const [bin, file, matrix = 'bt601', edgeArg = '2', fromArg = '3', toArg = '8'] = process.argv.slice(2);
const [w, h] = execFileSync(path.join(bin, 'ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file])
  .toString().trim().split(',').map(Number);
const EDGE = +edgeArg, FROM = +fromArg, TO = +toArg, y0 = Math.floor(h * 0.1), y1 = Math.floor(h * 0.9), size = w * h;
const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', file, '-vf', `scale=in_color_matrix=${matrix},format=gray`, '-f', 'rawvideo', '-'],
  { stdio: ['ignore', 'pipe', 'inherit'] });
let pending = Buffer.alloc(0), k = 0, run = null;
const runs = [];
ff.stdout.on('data', c => {
  pending = pending.length ? Buffer.concat([pending, c]) : c;
  while (pending.length >= size) {
    const f = pending.subarray(0, size);
    let e = 0, i = 0;
    for (let y = y0; y < y1; y++) { for (let x = 0; x < EDGE; x++) e += f[y * w + x]; for (let x = FROM; x < TO; x++) i += f[y * w + x]; }
    e /= (y1 - y0) * EDGE; i /= (y1 - y0) * (TO - FROM);
    const on = e > i + 8 && e > 25;
    if (on && !run) run = { a: k, b: k, most: e - i };
    else if (on) { run.b = k; run.most = Math.max(run.most, e - i); }
    else if (run) { runs.push(run); run = null; }
    pending = pending.subarray(size); k++;
  }
});
ff.on('close', code => {
  if (code) { console.error('ffmpeg failed'); process.exit(1); }
  if (run) runs.push(run);
  for (const r of runs) console.log(`frames ${r.a}-${r.b} (${r.b - r.a + 1}): edge up to ${r.most.toFixed(0)} levels lighter`);
  console.log(`${path.basename(file)}: ${k} frames, ${runs.length} runs`);
});
