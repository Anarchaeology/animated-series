// Checks each Topaz render in the upload folder against its input: model tag, size, codec, colour, frame count, length.
// usage: node check_renders.js FFMPEG_BIN UPLOAD_DIR
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir] = process.argv.slice(2);
const probe = f => JSON.parse(execFileSync(path.join(bin, 'ffprobe'), ['-v', 'error', '-count_packets', '-show_entries',
  'stream=codec_type,codec_name,profile,width,height,pix_fmt,color_space,nb_read_packets,duration:format=duration:format_tags',
  '-of', 'json', f]).toString());
const rows = [];
for (const f of fs.readdirSync(dir).filter(f => /_starlight\.mov$/.test(f)).sort()) {
  const input = f.replace('_starlight', '');
  const o = probe(path.join(dir, f)), i = probe(path.join(dir, input));
  const ov = o.streams.find(s => s.codec_type === 'video'), iv = i.streams.find(s => s.codec_type === 'video');
  const oa = o.streams.find(s => s.codec_type === 'audio');
  const t = o.format.tags || {};
  const problems = [];
  if (t.topazcloud !== 'slp-2.6') problems.push(`model ${t.topazcloud || t.videoai || 'unknown'}`);
  if (ov.width !== 1284 || ov.height !== 752) problems.push(`size ${ov.width}x${ov.height}`);
  if (ov.codec_name !== 'prores' || ov.profile !== 'HQ') problems.push(`codec ${ov.codec_name} ${ov.profile}`);
  if (+ov.nb_read_packets !== +iv.nb_read_packets) problems.push(`frames ${ov.nb_read_packets} vs ${iv.nb_read_packets}`);
  if (!oa) problems.push('no audio');
  rows.push([f, t.topazcloud, `${ov.width}x${ov.height}`, `${ov.codec_name} ${ov.profile}`, ov.color_space,
    `${ov.nb_read_packets}/${iv.nb_read_packets}`, (+o.format.duration).toFixed(2), (fs.statSync(path.join(dir, f)).size / 1e9).toFixed(2) + ' GB',
    t.topazcloud_timestamp, problems.join('; ') || 'ok'].join('\t'));
}
console.log(['file', 'model', 'size', 'codec', 'colour', 'frames out/in', 'seconds', 'file size', 'rendered', 'result'].join('\t'));
console.log(rows.join('\n'));
