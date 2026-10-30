// Compares two videos frame by frame (decoded picture hashes) and prints the frame ranges where they differ, in A's
// frame numbers. A clip can be compared against a stretch of a longer file: A.mov@START lines B's first frame up with
// A's frame START and compares as many frames as B has. Frames are counted from the start of the file, never found by
// seeking to a time, so an uneven timestamp (a master's joins) can't shift the comparison.
// usage: node compare_frames.js FFMPEG_BIN A.mov[@START] B.mov
const path = require('path'), { execFileSync } = require('child_process');
const [bin, aSpec, bFile] = process.argv.slice(2);
const [, aFile, startArg] = aSpec.match(/^(.*?)(?:@(\d+))?$/), start = +(startArg || 0);
const hashes = (file, from, count) => execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', file, '-map', '0:v:0',
  ...(count ? ['-vf', `trim=start_frame=${from}:end_frame=${from + count}`] : []), '-fps_mode', 'passthrough', '-f', 'framemd5', '-'],
  { maxBuffer: 2 ** 31 }).toString().split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(',').pop().trim());
const hb = hashes(bFile), ha = hashes(aFile, start, startArg ? hb.length : 0);
const n = Math.min(ha.length, hb.length), runs = [];
for (let i = 0; i < n; i++) if (ha[i] !== hb[i]) {
  const last = runs[runs.length - 1];
  if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]);
}
const diff = runs.reduce((s, [x, y]) => s + y - x + 1, 0);
console.log(`${path.basename(aFile)}${startArg ? ` from frame ${start}` : ''} vs ${path.basename(bFile)}: ${n} frames compared` +
  `${ha.length !== hb.length ? ` (lengths ${ha.length} and ${hb.length})` : ''}, ` +
  (diff ? `${diff} differ: ${runs.map(([x, y]) => x === y ? `${x + start}` : `${x + start}-${y + start}`).join(', ')}` : 'all identical'));
