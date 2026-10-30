// Makes review sheets for looking over an upscale by eye. Each tile is one sample: the whole frame, original
// (plainly enlarged) beside the upscale, and below them a close-up of the spot the scan found most changed, original
// beside upscale (a red box on the whole-frame views marks where the close-up is from). Tiles are 640x400, COLS x ROWS
// per sheet. SAMPLES.tsv rows (from pick_samples.js): part, frame, x, y, stretch start, stretch end.
// Writes OUT_DIR/sheet_NNN.png and OUT_DIR/sheets.tsv (sheet, tile letter, part, frame, time, stretch).
// usage: node make_sheets.js FFMPEG_BIN UPLOAD_DIR SAMPLES.tsv OUT_DIR [COLS=2] [ROWS=4] [FIRST_SHEET=1] [LAST_SHEET]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, samplesFile, out, cols = '2', rows = '4', first = '1', last] = process.argv.slice(2);
const perSheet = cols * rows, FW = 1284, FH = 752, CW = 390, CH = 229;   // close-up: 390x229 of the 1284x752 frame
const ffmpeg = (args) => execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const all = fs.readFileSync(samplesFile, 'utf8').trim().split('\n').map((l, i) => {
  const [part, frame, x, y, from, to] = l.split('\t');
  return { i, part, frame: +frame, x: +x, y: +y, from: +from, to: +to };
});
const sheets = Math.ceil(all.length / perSheet), lastSheet = Math.min(sheets, +(last || sheets));
const samples = all.slice((first - 1) * perSheet, lastSheet * perSheet);
const tmp = path.join(out, 'frames');
fs.mkdirSync(tmp, { recursive: true });
const byPart = {};
samples.forEach(s => (byPart[s.part] ||= []).push(s));
for (const [part, list] of Object.entries(byPart)) {
  const sel = list.map(s => `eq(n\\,${s.frame})`).join('+'), stem = part.replace(/\W+/g, '_');
  for (const [side, file, matrix] of [['o', `${part}.mov`, 'bt601'], ['s', `${part}_starlight.mov`, 'bt709']]) {
    ffmpeg(['-i', path.join(dir, file), '-vf', `select='${sel}',scale=${FW}:${FH}:flags=bicubic:in_color_matrix=${matrix}:in_range=tv,format=rgb24`,
      '-fps_mode', 'passthrough', path.join(tmp, `${side}_${stem}_%04d.png`)]);
    list.forEach((s, k) => fs.renameSync(path.join(tmp, `${side}_${stem}_${String(k + 1).padStart(4, '0')}.png`), path.join(tmp, `${side}${s.i}.png`)));
  }
}
const fps = 30000 / 1001, t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const index = [];
for (let sheet = +first; sheet <= lastSheet; sheet++) {
  const group = all.slice((sheet - 1) * perSheet, sheet * perSheet);
  const args = [], chains = [];
  group.forEach((s, k) => {
    args.push('-i', path.join(tmp, `o${s.i}.png`), '-i', path.join(tmp, `s${s.i}.png`));
    const cx = Math.max(0, Math.min(FW - CW, Math.round(s.x * FW / 352 - CW / 2)));
    const cy = Math.max(0, Math.min(FH - CH, Math.round(s.y * FH / 188 - CH / 2)));
    const box = `drawbox=x=${cx}:y=${cy}:w=${CW}:h=${CH}:color=red:t=6`;
    const label = `${String.fromCharCode(65 + k)}  ${s.part.replace(/[()]/g, '')}  ${t(s.frame)}  (shot ${t(s.from)}-${t(s.to)})`.replace(/:/g, '\\:');
    chains.push(
      `[${2 * k}]split[o${k}a][o${k}b];[${2 * k + 1}]split[s${k}a][s${k}b];` +
      `[o${k}a]${box},scale=320:188[of${k}];[s${k}a]${box},scale=320:188[sf${k}];` +
      `[o${k}b]crop=${CW}:${CH}:${cx}:${cy},scale=320:188:flags=lanczos[oz${k}];[s${k}b]crop=${CW}:${CH}:${cx}:${cy},scale=320:188:flags=lanczos[sz${k}];` +
      `[of${k}][sf${k}][oz${k}][sz${k}]xstack=inputs=4:layout=0_0|320_0|0_188|320_188,pad=640:400:0:24:black,` +
      `drawtext=${font}:text='${label}':x=6:y=4:fontsize=16:fontcolor=yellow,drawbox=x=0:y=0:w=640:h=400:color=gray:t=2[p${k}]`);
  });
  for (let k = group.length; k < perSheet; k++) chains.push(`color=black:s=640x400:d=1,format=rgb24[p${k}]`);
  const layout = Array.from({ length: perSheet }, (_, k) => `${(k % cols) * 640}_${Math.floor(k / cols) * 400}`).join('|');
  chains.push(`${Array.from({ length: perSheet }, (_, k) => `[p${k}]`).join('')}xstack=inputs=${perSheet}:layout=${layout}`);
  const name = `sheet_${String(sheet).padStart(3, '0')}.png`;
  ffmpeg([...args, '-filter_complex', chains.join(';'), '-frames:v', '1', path.join(out, name)]);
  group.forEach((s, k) => index.push([name, String.fromCharCode(65 + k), s.part, s.frame, t(s.frame), `${t(s.from)}-${t(s.to)}`].join('\t')));
}
for (const s of samples) for (const side of ['o', 's']) fs.rmSync(path.join(tmp, `${side}${s.i}.png`), { force: true });
fs.appendFileSync(path.join(out, 'sheets.tsv'), index.join('\n') + '\n');
console.log(`sheets ${first}-${lastSheet} of ${sheets} (${samples.length} samples) in ${out}`);
