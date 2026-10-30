// Prepares the Topaz upload files for the Anarchy Online animated series from Funcom's original MPEGs: black bars
// cropped (352x188 at y=26), pixel shape kept (200:219), constant 29.97 fps, ProRes 422 HQ with BT.601 tags, PCM
// audio. Episodes 102-104 lose their repeated opening titles (cut at the teaser's fade to black, sound faded with the
// picture); 101c is split at the hard cut at frame 4507 to stay under the ~9,000-frame Starlight cloud limit.
// Writes upload_manifest.tsv next to the files.
// usage: node make_uploads.js FFMPEG_BIN ORIGINALS_DIR OUT_DIR
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, src, out] = process.argv.slice(2);
const ffmpeg = path.join(bin, 'ffmpeg'), ffprobe = path.join(bin, 'ffprobe');
const F = 1001 / 30000;                      // one frame at 29.97 fps
const fadeBlack = { aoe102a: 78.645, aoe103a: 95.996, aoe104a: 52.052 };   // where each teaser's picture is fully black
const SPLIT = 4507;                          // 101c: first frame of the shot after the hard cut at 2:30.38
const jobs = [];
for (const p of ['101a', '101b', '101c', '101d', '101e', '102a', '102b', '102c', '102d', '102e', '103a', '103b', '103c',
                 '104a', '104b', '104c', '104d']) {
  const name = 'aoe' + p;
  if (name === 'aoe101c') {
    jobs.push({ name, label: `${name}-1`, note: 'split at the hard cut, part 1 of 2', endFrame: SPLIT });
    jobs.push({ name, label: `${name}-2`, note: 'split at the hard cut, part 2 of 2', startFrame: SPLIT });
  } else if (fadeBlack[name]) {
    const endFrame = Math.round((fadeBlack[name] + 0.2) * 30000 / 1001);
    jobs.push({ name, label: `${name} (titles cut)`, note: `opening titles cut after the fade to black at ${fadeBlack[name]} s`, endFrame, fadeAt: fadeBlack[name] });
  } else jobs.push({ name, label: name, note: '' });
}
fs.mkdirSync(out, { recursive: true });
const rows = ['file\tsource\tfrom frame\tto frame\tframes\tseconds\tnote'];
jobs.forEach((j, i) => {
  const file = `${String(i + 1).padStart(2, '0')} ${j.label}.mov`;
  let v = 'setpts=PTS-STARTPTS,fps=30000/1001,crop=352:188:0:26,setsar=200/219';
  let a = 'asetpts=PTS-STARTPTS';
  if (j.startFrame) { v += `,trim=start_frame=${j.startFrame},setpts=PTS-STARTPTS`; a += `,atrim=start=${(j.startFrame * F).toFixed(6)},asetpts=PTS-STARTPTS`; }
  if (j.endFrame) { v += `,trim=end_frame=${j.endFrame}`; a += `,atrim=end=${(j.endFrame * F).toFixed(6)}`; }
  if (j.fadeAt) a += `,afade=t=out:st=${(j.fadeAt - 0.7).toFixed(3)}:d=0.7`;
  execFileSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', path.join(src, `${j.name}.mpg`),
    '-filter_complex', `[0:v]${v}[v];[0:a]${a}[a]`, '-map', '[v]', '-map', '[a]',
    '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le',
    '-color_primaries', 'smpte170m', '-color_trc', 'smpte170m', '-colorspace', 'smpte170m', '-color_range', 'tv',
    '-c:a', 'pcm_s16le', path.join(out, file)], { stdio: ['ignore', 'ignore', 'pipe'] });
  const frames = +execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v', '-count_packets', '-show_entries',
    'stream=nb_read_packets', '-of', 'csv=p=0', path.join(out, file)]).toString().trim();
  const from = j.startFrame || 0;
  rows.push([file, `${j.name}.mpg`, from, from + frames - 1, frames, (frames * F).toFixed(3), j.note].join('\t'));
  console.log(`${file}: ${frames} frames, ${(frames * F).toFixed(1)} s ${j.note}`);
});
fs.writeFileSync(path.join(out, 'upload_manifest.tsv'), rows.join('\n') + '\n');
