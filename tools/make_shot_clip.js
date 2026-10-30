// Makes a review clip of one shot: the original (plainly enlarged), Starlight and the fixed version side by side at
// full size, with a bar on top naming the shot and showing the part's frame number. Original sound.
// FIXED can also be a single .mov covering the shot, such as an apply_fixes.js --range preview or a composite, named
// "... (frames A-B).mov"; it is read from part frame A.
// usage: node make_shot_clip.js FFMPEG_BIN UPLOAD_DIR FIXED_DIR|FIXED.mov PART FIRST LAST "TITLE" OUT.mp4
const path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, fixedDir, part, firstArg, lastArg, title, outFile] = process.argv.slice(2);
const FIRST = +firstArg, LAST = +lastArg, fps = 30000 / 1001;
const fixedFile = fixedDir.endsWith('.mov') ? fixedDir : path.join(fixedDir, `${part}_fixed.mov`);
const fixedFrom = fixedDir.endsWith('.mov') ? +(path.basename(fixedDir).match(/\(frames (\d+)-/) || [0, 0])[1] : 0;
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/,/g, '\\,').replace(/%/g, '\\%');
const lab = t => `drawtext=${font}:text='${t}':x=14:y=12:fontsize=30:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=6`;
const trim = `trim=start_frame=${FIRST}:end_frame=${LAST + 1},setpts=PTS-STARTPTS`;
execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
  '-i', path.join(dir, `${part}.mov`), '-i', path.join(dir, `${part}_starlight.mov`), '-i', fixedFile,
  '-filter_complex',
  `[0:v]${trim},scale=1284:752:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1,${lab('Original')}[o];` +
  `[1:v]${trim},setsar=1,${lab('Starlight')}[s];` +
  `[2:v]trim=start_frame=${FIRST - fixedFrom}:end_frame=${LAST - fixedFrom + 1},setpts=PTS-STARTPTS,setsar=1,${lab('Fixed')}[f];` +
  `[o][s][f]hstack=3,pad=iw:ih+56:0:56:black,drawtext=${font}:text='${esc(title)}':x=16:y=12:fontsize=32:fontcolor=white,` +
  `drawtext=${font}:text='frame %{eif\\:n+${FIRST}\\:d}':x=w-text_w-16:y=12:fontsize=32:fontcolor=yellow,format=yuv420p[v];` +
  `[0:a]atrim=start=${(FIRST / fps).toFixed(6)}:end=${((LAST + 1) / fps).toFixed(6)},asetpts=PTS-STARTPTS[a]`,
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outFile],
  { stdio: ['ignore', 'inherit', 'inherit'] });
console.log(`${path.basename(outFile)}: ${part} frames ${FIRST}-${LAST}`);
