// Lists the shots of an upload part from misread_scan.js output: hard cuts where the original's frame-to-frame
// change exceeds CUT_THRESHOLD, with softer changes above SOFT shown inside shots (dissolves, fast moves).
// usage: node list_shots.js SCAN_DIR PART CUT_THRESHOLD [SOFT]
const fs = require('fs'), path = require('path');
const [scanDir, part, cutAt, soft = '1e9'] = process.argv.slice(2);
const fps = 30000 / 1001, t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
const rows = fs.readFileSync(path.join(scanDir, `${part}.tsv`), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t').map(Number));
let start = 0;
const notes = [];
const close = end => { console.log(`${String(start).padStart(5)}-${String(end).padStart(5)}  ${t(start)}-${t(end)}  ${notes.join(' ')}`); notes.length = 0; };
for (let i = 1; i < rows.length; i++) {
  if (rows[i][5] > +cutAt) { close(i - 1); start = i; }
  else if (rows[i][5] > +soft) notes.push(`~${t(i)}(${rows[i][5].toFixed(0)})`);
}
close(rows.length - 1);
