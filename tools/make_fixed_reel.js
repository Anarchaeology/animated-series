// Makes a reel of fixed shots for judging at speed: each shot in turn, full frame, with its id and the part's frame
// number in the corner and the original sound, after a short black slate with the id. With --side, each shot is the
// original | Starlight | fixed side by side instead (make_shot_clip.js layout).
// LIST.tsv columns (no header): id, part, first, last, file (the fixed render covering the shot: a composite or
// preview named "... (frames A-B).mov", read from part frame A; or a whole fixed part, read from 0), note.
// usage: node make_fixed_reel.js FFMPEG_BIN UPLOAD_DIR LIST.tsv OUT.mp4 [--side]
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const args = process.argv.slice(2), side = args.includes('--side');
const [bin, dir, listFile, outFile] = args.filter(a => !a.startsWith('--'));
const fps = 30000 / 1001, SLATE = 12, PW = 1284, PH = 752;
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/,/g, '\\,').replace(/%/g, '\\%');
const lab = t => `drawtext=${font}:text='${esc(t)}':x=14:y=12:fontsize=30:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=6`;
const shots = fs.readFileSync(listFile, 'utf8').trim().split('\n').filter(Boolean).map(l => l.split('\t'))
  .map(([id, part, first, last, file, note = '']) => ({ id, part, first: +first, last: +last, file, note }));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fixedreel-'));
const clips = shots.map((s, k) => {
  const from = +(path.basename(s.file).match(/\(frames (\d+)-/) || [0, 0])[1];
  const cut = f0 => `trim=start_frame=${s.first - f0}:end_frame=${s.last - f0 + 1},setpts=PTS-STARTPTS`;
  const video = side
    ? `[0:v]${cut(0)},scale=${PW}:${PH}:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1,${lab('Original')}[o];` +
      `[1:v]${cut(0)},setsar=1,${lab('Starlight')}[s];[2:v]${cut(from)},setsar=1,${lab('Fixed')}[f];` +
      `[o][s][f]hstack=3,pad=iw:ih+56:0:56:black,drawtext=${font}:text='${esc(`${s.id}   ${s.note}`)}':x=16:y=12:fontsize=32:fontcolor=white,`
    : `[2:v]${cut(from)},setsar=1,`;
  const clip = path.join(tmp, `c${String(k).padStart(2, '0')}.mp4`);
  execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
    '-i', path.join(dir, `${s.part}.mov`), '-i', path.join(dir, `${s.part}_starlight.mov`), '-i', s.file,
    '-filter_complex', video +
    `drawtext=${font}:text='${esc(`${s.id}  ${s.part}`)}  %{eif\\:n+${s.first}\\:d}':x=${side ? 'w-text_w-16' : '14'}:y=${side ? 12 : 'h-text_h-14'}:fontsize=${side ? 32 : 24}:fontcolor=yellow:box=1:boxcolor=black@0.5:boxborderw=5,` +
    `format=yuv420p,tpad=start=${SLATE}:color=black[v0];` +
    `[v0]drawtext=${font}:text='${esc(s.id)}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=${side ? 140 : 90}:fontcolor=white:enable='lt(n,${SLATE})'[v];` +
    `[0:a]atrim=start=${(s.first / fps).toFixed(6)}:end=${((s.last + 1) / fps).toFixed(6)},asetpts=PTS-STARTPTS,adelay=${Math.round(SLATE / fps * 1000)}:all=1[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', side ? '18' : '15',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', clip]);
  console.log(`${s.id}: ${s.part} ${s.first}-${s.last}`);
  return clip;
});
fs.writeFileSync(path.join(tmp, 'list.txt'), clips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n') + '\n');
execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'),
  '-c', 'copy', '-movflags', '+faststart', outFile]);
fs.rmSync(tmp, { recursive: true });
console.log(`${outFile}: ${clips.length} shots`);
