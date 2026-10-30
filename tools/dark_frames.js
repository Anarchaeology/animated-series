// Finds single frames much darker than both neighbours (a frame dropped to black, or a render glitch like 101b's frame
// 230, where the city layer went missing mid-dissolve): the mean brightness of each frame at 64x38, flagged when it is
// below 80% of both neighbours or more than 12 levels under the darker one. Flickering light and dips inside fades
// also show up, so look at what it finds.
// usage: node dark_frames.js FFMPEG_BIN FILE [FIRST=0] [LAST] [MATRIX=bt601]   (bt601 for the originals, bt709 for renders)
const path = require('path'), { execFileSync } = require('child_process');
const [bin, file, firstArg = '0', lastArg = '9999999', matrix = 'bt601'] = process.argv.slice(2);
const W = 64, H = 38, first = +firstArg;
const buf = execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', file, '-vf',
  `trim=start_frame=${first}:end_frame=${+lastArg + 1},setpts=PTS-STARTPTS,scale=${W}:${H}:in_color_matrix=${matrix},format=gray`,
  '-f', 'rawvideo', '-'], { maxBuffer: 1e9 });
const n = buf.length / (W * H), mean = [];
for (let k = 0; k < n; k++) { let s = 0; for (let i = 0; i < W * H; i++) s += buf[k * W * H + i]; mean.push(s / (W * H)); }
let found = 0;
mean.forEach((v, k) => {
  if (k === 0 || k === n - 1) return;
  const lo = Math.min(mean[k - 1], mean[k + 1]);
  if (v < 0.8 * lo || v < lo - 12) { found++; console.log(`frame ${first + k}: ${v.toFixed(1)} (neighbours ${mean[k - 1].toFixed(1)} / ${mean[k + 1].toFixed(1)})`); }
});
console.log(`${path.basename(file)}: ${n} frames, ${found} flagged`);
