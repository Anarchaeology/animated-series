// Joins Funcom's 17 original parts of the Anarchy Online animated series into one MP4, in Funcom's playlist order
// (each episode: Teaser, Act 1-3, Tag), encoded once with x264 at near-transparent quality. Keeps the original
// 352x240 pixels and their 200:219 shape, so players show 4:3. Adds a chapter per part, and writes the same chapters
// as YouTube timestamps (per part and per episode) next to the video.
// usage: node make_joined.js FFMPEG_BIN_DIR ORIGINALS_DIR OUT_DIR
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, src, out] = process.argv.slice(2);
const ffprobe = path.join(bin, 'ffprobe'), ffmpeg = path.join(bin, 'ffmpeg');
const episodes = [
  ['101', 'Tricks and Treats', 'abcde'], ['102', 'Burning Bridges', 'abcde'],
  ['103', 'Reversal', 'abc'], ['104', 'Dust to Dust', 'abcd'],
];
const partName = (letter, count) => letter === 'a' ? 'Teaser' : letter === String.fromCharCode(96 + count) && count === 5 ? 'Tag' : `Act ${letter.charCodeAt(0) - 97}`;
fs.mkdirSync(out, { recursive: true });

const parts = [];
for (const [num, title, letters] of episodes)
  for (const l of letters) {
    const file = path.join(src, `aoe${num}${l}.mpg`);
    const secs = parseFloat(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
    parts.push({ num, title, file, secs, name: partName(l, letters.length) });
  }

// chapters (ffmetadata, milliseconds) and YouTube timestamps
const stamp = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(x).padStart(2, '0')}`; };
let meta = ';FFMETADATA1\ntitle=Anarchy Online: The Animated Series (2001)\nartist=Funcom\n', t = 0;
const perPart = [], perEpisode = [];
for (const p of parts) {
  const label = `${p.num} ${p.title}: ${p.name}`;
  meta += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(t * 1000)}\nEND=${Math.round((t + p.secs) * 1000)}\ntitle=${label}\n`;
  perPart.push(`${stamp(t)} ${label}`);
  if (p.name === 'Teaser') perEpisode.push(`${stamp(t)} Episode ${p.num}: ${p.title}`);
  t += p.secs;
}
fs.writeFileSync(path.join(out, 'chapters.ffmetadata'), meta);
fs.writeFileSync(path.join(out, 'youtube_chapters.txt'),
  `By episode:\n${perEpisode.join('\n')}\n\nBy part:\n${perPart.join('\n')}\n\nTotal ${stamp(t)}\n`);
fs.writeFileSync(path.join(out, 'parts.txt'), parts.map(p => `file '${p.file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n');

const video = path.join(out, 'Anarchy Online - The Animated Series (2001) - joined test.mp4');
execFileSync(ffmpeg, ['-v', 'error', '-stats', '-y',
  '-f', 'concat', '-safe', '0', '-i', path.join(out, 'parts.txt'),
  '-i', path.join(out, 'chapters.ffmetadata'), '-map', '0:v', '-map', '0:a', '-map_metadata', '1', '-map_chapters', '1',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-vf', 'setsar=200/219', '-r', '30000/1001',
  '-c:a', 'aac', '-b:a', '224k', '-movflags', '+faststart', video], { stdio: 'inherit' });
console.log(`${parts.length} parts, ${stamp(t)} -> ${video}`);
