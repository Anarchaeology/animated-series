// Downloads the Anarchy Online animated series item from the Internet Archive into the project folder, choosing
// the files worth keeping (episode MP4s, Funcom's original intro.mpg, the script PDFs, the episode images) and
// checking each against the Archive's MD5. Writes ia_files.tsv (name, folder, bytes, md5, width x height, seconds).
// usage: node ia_fetch.js IDENTIFIER DESTFOLDER
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const [id, dest] = process.argv.slice(2);
const meta = JSON.parse(execFileSync('curl', ['-s', '--max-time', '60', `https://archive.org/metadata/${id}`]).toString());
const pick = f => /\.mp4$/i.test(f.name) && /^Episode/.test(f.name) ? 'episodes'
  : f.name === 'intro.mpg' ? 'intro'
  : /script\.pdf$|scipt\.pdf$/i.test(f.name) ? 'scripts'
  : /^10[1-4]\.jpg$/.test(f.name) ? 'images' : null;
const rows = ['name\tfolder\tbytes\tmd5\tsize\tseconds\tsource'];
for (const f of meta.files) {
  const folder = pick(f);
  if (!folder) continue;
  const dir = path.join(dest, folder);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, f.name);
  const md5 = () => crypto.createHash('md5').update(fs.readFileSync(out)).digest('hex');
  if (!(fs.existsSync(out) && md5() === f.md5)) {
    execFileSync('curl', ['-s', '-L', '--max-time', '900', '--retry', '3', '-o', out,
      `https://archive.org/download/${id}/${encodeURIComponent(f.name)}`]);
  }
  const ok = md5() === f.md5;
  console.log(`${ok ? 'ok ' : 'BAD'} ${folder}/${f.name} ${f.size}`);
  rows.push([f.name, folder, f.size, f.md5, f.width ? `${f.width}x${f.height}` : '', f.length || '', `https://archive.org/download/${id}/${f.name}`].join('\t'));
}
fs.writeFileSync(path.join(dest, 'ia_files.tsv'), rows.join('\n') + '\n');
