// Makes a reel for picking between two versions of a set of fixes: for each listed shot, four full frames in a grid
// (original plainly enlarged | Starlight, then version A | version B) under a bar naming the shot, with the part's
// frame number and the original sound, after a short black slate with the shot's id. A and B come from preview renders
// (apply_fixes.js --range), found in A_DIR and B_DIR as <part>_preview (frames X-Y).mov covering the shot.
// LIST.tsv columns: id, part, first, last, title (no header).
// usage: node make_ab_reel.js FFMPEG_BIN UPLOAD_DIR LIST.tsv A_DIR "A LABEL" B_DIR "B LABEL" OUT.mp4
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const [bin, dir, listFile, aDir, aLabel, bDir, bLabel, outFile] = process.argv.slice(2);
const fps = 30000 / 1001, SLATE = 15, PW = 1284, PH = 752;
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/,/g, '\\,').replace(/%/g, '\\%');
const lab = t => `drawtext=${font}:text='${esc(t)}':x=14:y=12:fontsize=30:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=6`;
// the preview in DIR that covers part frames first-last, and the frame it starts at
function preview(d, part, first, last) {
  const hit = fs.readdirSync(d).map(f => ({ f, m: f.match(/^(.*)_preview \(frames (\d+)-(\d+)\)\.mov$/) }))
    .find(({ m }) => m && m[1] === part && +m[2] <= first && +m[3] >= last);
  if (!hit) throw new Error(`no preview of ${part} ${first}-${last} in ${d}`);
  return { file: path.join(d, hit.f), from: +hit.m[2] };
}
const shots = fs.readFileSync(listFile, 'utf8').trim().split('\n').filter(Boolean).map(l => l.split('\t'))
  .map(([id, part, first, last, title]) => ({ id, part, first: +first, last: +last, title }));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abreel-'));
const clips = shots.map((s, k) => {
  const a = preview(aDir, s.part, s.first, s.last), b = preview(bDir, s.part, s.first, s.last);
  const cut = (from) => `trim=start_frame=${s.first - from}:end_frame=${s.last - from + 1},setpts=PTS-STARTPTS`;
  const clip = path.join(tmp, `c${String(k).padStart(2, '0')}.mp4`);
  execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
    '-i', path.join(dir, `${s.part}.mov`), '-i', path.join(dir, `${s.part}_starlight.mov`), '-i', a.file, '-i', b.file,
    '-filter_complex',
    `[0:v]${cut(0)},scale=${PW}:${PH}:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1,${lab('Original')}[o];` +
    `[1:v]${cut(0)},setsar=1,${lab('Starlight')}[s];[2:v]${cut(a.from)},setsar=1,${lab(aLabel)}[a];[3:v]${cut(b.from)},setsar=1,${lab(bLabel)}[b];` +
    `[o][s][a][b]xstack=inputs=4:layout=0_0|${PW}_0|0_${PH}|${PW}_${PH},pad=iw:ih+56:0:56:black,` +
    `drawtext=${font}:text='${esc(`${s.id}   ${s.title}`)}':x=16:y=12:fontsize=32:fontcolor=white,` +
    `drawtext=${font}:text='${esc(s.part)}  frame %{eif\\:n+${s.first}\\:d}':x=w-text_w-16:y=12:fontsize=32:fontcolor=yellow,format=yuv420p,` +
    `tpad=start=${SLATE}:color=black[v0];` +
    `[v0]drawtext=${font}:text='${esc(s.id)}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=140:fontcolor=white:enable='lt(n,${SLATE})'[v];` +
    `[0:a]atrim=start=${(s.first / fps).toFixed(6)}:end=${((s.last + 1) / fps).toFixed(6)},asetpts=PTS-STARTPTS,adelay=${Math.round(SLATE / fps * 1000)}:all=1[au]`,
    '-map', '[v]', '-map', '[au]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', clip]);
  console.log(`${s.id}: ${s.part} ${s.first}-${s.last}`);
  return clip;
});
fs.writeFileSync(path.join(tmp, 'list.txt'), clips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n') + '\n');
execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'),
  '-c', 'copy', '-movflags', '+faststart', outFile]);
fs.rmSync(tmp, { recursive: true });
console.log(`${outFile}: ${clips.length} shots`);
