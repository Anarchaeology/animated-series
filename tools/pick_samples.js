// Picks frames to look over by eye from misread_scan.js output: splits each part into shots (at cuts), splits long
// shots into stretches of at most MAX_SECONDS, and from each stretch takes the frame whose most-changed block differs
// most (skipping a few frames at each end, where dissolves sit). Writes part, frame, x, y (the block's centre in
// original 352x188 pixels), stretch start and end.
// usage: node pick_samples.js CUT_THRESHOLD MAX_SECONDS OUT.tsv SCAN.tsv...   (scan files named after the part)
const fs = require('fs'), path = require('path');
const [cutAt, maxSeconds, out, ...files] = process.argv.slice(2);
const maxFrames = Math.round(maxSeconds * 30000 / 1001), EDGE = 3, MIN = 8;
const rows = [];
for (const f of files.sort()) {
  const part = path.basename(f, '.tsv');
  const scan = fs.readFileSync(f, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t').map(Number));
  const cuts = [0];
  for (let i = 1; i < scan.length; i++) if (scan[i][5] > +cutAt) cuts.push(i);
  cuts.push(scan.length);
  for (let c = 0; c + 1 < cuts.length; c++) {
    const [a, b] = [cuts[c], cuts[c + 1]];
    if (b - a < MIN) continue;
    const pieces = Math.ceil((b - a) / maxFrames);
    for (let p = 0; p < pieces; p++) {
      const s = a + Math.floor((b - a) * p / pieces), e = a + Math.floor((b - a) * (p + 1) / pieces);
      const lo = s + (p === 0 ? EDGE : 0), hi = e - (p === pieces - 1 ? EDGE : 0);
      let best = scan[Math.floor((s + e) / 2)];
      for (let i = lo; i < hi; i++) if (scan[i][2] > best[2]) best = scan[i];
      rows.push([part, best[0], best[3], best[4], s, e - 1].join('\t'));
    }
  }
}
fs.writeFileSync(out, rows.join('\n') + '\n');
console.log(`${rows.length} samples from ${files.length} parts`);
