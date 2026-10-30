// Checks each Proteus render in the upload folder against its input and its Starlight render: size, codec, colour
// tag, frame rate, frame count, and the model tag.
// usage: node check_proteus.js FFMPEG_BIN UPLOAD_DIR
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir] = process.argv.slice(2);
const probe = f => JSON.parse(execFileSync(path.join(bin, 'ffprobe'), ['-v', 'error', '-count_packets', '-select_streams', 'v',
  '-show_entries', 'stream=width,height,profile,pix_fmt,color_space,r_frame_rate,nb_read_packets:format_tags', '-of', 'json', f]).toString());
console.log(['file', 'size', 'codec', 'colour', 'fps', 'frames proteus/input/starlight', 'file size', 'result'].join('\t'));
let total = 0;
for (const f of fs.readdirSync(dir).filter(f => /_proteus\.mov$/.test(f)).sort()) {
  const p = probe(path.join(dir, f)), i = probe(path.join(dir, f.replace('_proteus', ''))), s = probe(path.join(dir, f.replace('_proteus', '_starlight')));
  const pv = p.streams[0], n = [pv, i.streams[0], s.streams[0]].map(x => +x.nb_read_packets);
  const problems = [];
  if (pv.width !== 1284 || pv.height !== 752) problems.push(`size ${pv.width}x${pv.height}`);
  if (pv.profile !== 'HQ' || pv.pix_fmt !== 'yuv422p10le') problems.push(`codec ${pv.profile} ${pv.pix_fmt}`);
  if (pv.color_space !== 'bt709') problems.push(`colour ${pv.color_space}`);
  if (pv.r_frame_rate !== '30000/1001') problems.push(`fps ${pv.r_frame_rate}`);
  if (n[0] !== n[1] || n[0] !== n[2]) problems.push('frame count differs');
  if (!/prob-4; mode: auto; recover original detail at 20/.test((p.format.tags || {}).videoai || '')) problems.push('settings tag');
  const size = fs.statSync(path.join(dir, f)).size; total += size;
  console.log([f, `${pv.width}x${pv.height}`, `prores ${pv.profile}`, pv.color_space, pv.r_frame_rate, n.join('/'), (size / 1e9).toFixed(2) + ' GB', problems.join('; ') || 'ok'].join('\t'));
}
console.log(`total ${(total / 1e9).toFixed(1)} GB`);
