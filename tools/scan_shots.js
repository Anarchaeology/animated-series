// Groups misread_scan.js output into shots and ranks the shots where the upscale differs most from the original.
// A shot's score is the median, over its frames, of the worst block's difference: a persistent change scores high,
// a one-frame blip doesn't.
// usage: node scan_shots.js CUT_THRESHOLD TOP SCAN.tsv...   (file names like 01.tsv; prints the TOP shots, worst first)
const fs = require('fs'), path = require('path');
const [cutAt, top, ...files] = process.argv.slice(2);
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const shots = [], all = [];
for (const f of files) {
  const rows = fs.readFileSync(f, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t').map(Number));
  let start = 0;
  const close = end => {
    const r = rows.slice(start, end);
    if (r.length < 8) return;                       // flashes and dissolve fragments
    const worst = r.map(x => x[2]), mean = r.map(x => x[1]);
    const peak = r.reduce((a, b) => (b[2] > a[2] ? b : a));
    shots.push({ file: path.basename(f, '.tsv'), from: start, to: end - 1, score: median(worst), mean: median(mean), peak: peak[2], at: `${peak[3]},${peak[4]}` });
  };
  for (let i = 1; i < rows.length; i++) if (rows[i][5] > +cutAt) { close(i); start = i; }
  close(rows.length);
  all.push(...rows.map(r => r[2]));
}
const s = [...all].sort((a, b) => a - b), pct = p => s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2);
console.log(`frames ${s.length}, shots ${shots.length}; worst-block p50 ${pct(0.5)} p90 ${pct(0.9)} p99 ${pct(0.99)} p99.9 ${pct(0.999)} max ${s[s.length - 1]}`);
const fps = 30000 / 1001, t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
shots.sort((a, b) => b.score - a.score).slice(0, +top).forEach((x, i) =>
  console.log([i + 1, x.file, `${x.from}-${x.to}`, `${t(x.from)}-${t(x.to)}`, `score ${x.score.toFixed(2)}`, `mean ${x.mean.toFixed(2)}`, `peak ${x.peak.toFixed(1)} at ${x.at}`].join('\t')));
