// Finds the shot containing a given time in an upload part, from misread_scan.js output (cuts where the original's
// frame-to-frame change exceeds CUT_THRESHOLD). Prints part, first frame, last frame, and times.
// usage: node shot_at.js SCAN_DIR CUT_THRESHOLD "PART|M:SS" ...
const fs = require('fs'), path = require('path');
const [scanDir, cutAt, ...specs] = process.argv.slice(2);
const fps = 30000 / 1001, t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
for (const spec of specs) {
  const [part, time] = spec.split('|');
  const [m, s] = time.split(':').map(Number), frame = Math.round((m * 60 + s) * fps);
  const rows = fs.readFileSync(path.join(scanDir, `${part}.tsv`), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t').map(Number));
  let a = frame, b = frame;
  while (a > 0 && rows[a][5] <= +cutAt) a--;
  while (b + 1 < rows.length && rows[b + 1][5] <= +cutAt) b++;
  console.log([part, a, b, `${t(a)}-${t(b)}`, `${b - a + 1} frames`].join('\t'));
}
