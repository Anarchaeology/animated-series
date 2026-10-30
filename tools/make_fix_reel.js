// Makes a review reel of applied fixes: for each fix in the list, the fixed frames plus a second either side,
// Starlight (before) beside the fixed version (after), with the original sound and a label naming the fix.
// usage: node make_fix_reel.js FFMPEG_BIN UPLOAD_DIR FIXED_DIR FIXES.tsv OUT.mp4
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, fixedDir, fixesFile, outFile] = process.argv.slice(2);
const fps = 30000 / 1001, HANDLE = 30;
const t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/,/g, '\\,').replace(/%/g, '\\%');
const fixes = fs.readFileSync(fixesFile, 'utf8').trim().split('\n').slice(1).filter(l => !l.startsWith('#'))
  .map(l => l.split('\t')).map(([id, part, first, last, kind, spec, note]) => ({ id, part, first: +first, last: +last, note }));
const tmp = path.join(path.dirname(outFile), 'reel_tmp');
fs.mkdirSync(tmp, { recursive: true });
const clips = [];
fixes.forEach((f, k) => {
  const frames = +execFileSync(path.join(bin, 'ffprobe'), ['-v', 'error', '-count_packets', '-select_streams', 'v', '-show_entries',
    'stream=nb_read_packets', '-of', 'csv=p=0', path.join(dir, `${f.part}_starlight.mov`)]).toString().trim();
  const a = Math.max(0, f.first - HANDLE), b = Math.min(frames - 1, f.last + HANDLE);
  const trim = `trim=start_frame=${a}:end_frame=${b + 1},setpts=PTS-STARTPTS`;
  const top = esc(`${f.id}  ${f.part.replace(/[()]/g, '')}  ${t(f.first)}-${t(f.last)}   ${f.note}`);
  const clip = path.join(tmp, `c${String(k).padStart(2, '0')}.mp4`);
  execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
    '-i', path.join(dir, `${f.part}_starlight.mov`), '-i', path.join(fixedDir, `${f.part}_fixed.mov`), '-i', path.join(dir, `${f.part}.mov`),
    '-filter_complex',
    `[0:v]${trim}[s];[1:v]${trim}[x];[s][x]hstack,pad=2568:792:0:40:black,` +
    `drawtext=${font}:text='${top}':x=12:y=9:fontsize=22:fontcolor=white,` +
    `drawtext=${font}:text='Starlight (before)':x=12:y=52:fontsize=24:fontcolor=yellow:box=1:boxcolor=black@0.5:boxborderw=5,` +
    `drawtext=${font}:text='Fixed (after)':x=1296:y=52:fontsize=24:fontcolor=yellow:box=1:boxcolor=black@0.5:boxborderw=5,` +
    `drawtext=${font}:text='fix on':x=1284-text_w/2:y=9:fontsize=22:fontcolor=lime:enable='between(n,${f.first - a},${f.last - a})',format=yuv420p[v];` +
    `[2:a]atrim=start=${(a / fps).toFixed(6)}:end=${((b + 1) / fps).toFixed(6)},asetpts=PTS-STARTPTS[aud]`,
    '-map', '[v]', '-map', '[aud]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', clip],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  clips.push(clip);
  console.log(`${f.id}: frames ${a}-${b}`);
});
fs.writeFileSync(path.join(tmp, 'list.txt'), clips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n') + '\n');
execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'),
  '-c', 'copy', '-movflags', '+faststart', outFile], { stdio: ['ignore', 'inherit', 'inherit'] });
fs.rmSync(tmp, { recursive: true });
console.log(`${outFile}: ${clips.length} fixes`);
