// Makes 2x2 comparison videos of one shot: original (plainly enlarged) | Starlight, and below them two Proteus
// renders, each pane labelled, with the original sound. Panes are 1284x752 (full size).
// SPOTS.tsv rows: part, first frame, last frame, Proteus file A, label A, Proteus file B, label B, output name.
// usage: node make_compare.js FFMPEG_BIN UPLOAD_DIR PROTEUS_DIR SPOTS.tsv OUT_DIR
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, pdir, spotsFile, out] = process.argv.slice(2);
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const label = t => `drawtext=${font}:text='${t.replace(/:/g, '\\:')}':x=12:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`;
const fps = 30000 / 1001, t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
fs.mkdirSync(out, { recursive: true });
for (const line of fs.readFileSync(spotsFile, 'utf8').trim().split('\n')) {
  const [part, first, last, pa, la, pb, lb, name] = line.split('\t');
  const trim = `trim=start_frame=${first}:end_frame=${+last + 1},setpts=PTS-STARTPTS`;
  const filter = [
    `[0:v]${trim},scale=1284:752:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1,${label(`Original (plain enlargement)   ${part} ${t(+first)}-${t(+last)}`)}[o]`,
    `[1:v]${trim},setsar=1,${label('Starlight Precise 2.6')}[s]`,
    `[2:v]setsar=1,${label(la)}[a]`,
    `[3:v]setsar=1,${label(lb)}[b]`,
    `[o][s][a][b]xstack=inputs=4:layout=0_0|1284_0|0_752|1284_752,format=yuv420p[v]`,
    `[0:a]atrim=start=${(first / fps).toFixed(6)}:end=${((+last + 1) / fps).toFixed(6)},asetpts=PTS-STARTPTS[aud]`,
  ].join(';');
  execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
    '-i', path.join(dir, `${part}.mov`), '-i', path.join(dir, `${part}_starlight.mov`),
    '-i', path.join(pdir, pa), '-i', path.join(pdir, pb),
    '-filter_complex', filter, '-map', '[v]', '-map', '[aud]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', path.join(out, name)], { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log(`${name}: ${part} frames ${first}-${last}`);
}
