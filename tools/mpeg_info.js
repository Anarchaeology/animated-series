// Reads the first MPEG video sequence header and MPEG audio frame header of each .mpg file given, and prints the
// picture size, aspect, frame rate, coded video bitrate and audio format. Reads only the first 2 MB of each file.
// usage: node mpeg_info.js FILE...
const fs = require('fs'), path = require('path');
const rates = [0, 23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
const aspects = { 1: '1:1', 2: '0.6735', 3: '0.7031 (16:9 PAL)', 4: '0.7615', 5: '0.8055', 6: '0.8437 (16:9 NTSC)', 7: '0.8935', 8: '0.9157 (CCIR601 PAL)', 9: '0.9815', 10: '1.0255', 11: '1.0695', 12: '1.0950 (CCIR601 NTSC)', 13: '1.1575', 14: '1.2015' };
const audioKbps = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384]; // MPEG-1 layer II
const audioHz = [44100, 48000, 32000];
for (const file of process.argv.slice(2)) {
  const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(2 * 1024 * 1024);
  const n = fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
  let video = '?', audio = '?';
  for (let i = 0; i + 12 < n; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1 && buf[i + 3] === 0xb3) {
      const w = (buf[i + 4] << 4) | (buf[i + 5] >> 4), h = ((buf[i + 5] & 15) << 8) | buf[i + 6];
      const ar = buf[i + 7] >> 4, fr = buf[i + 7] & 15;
      const br = ((buf[i + 8] << 10) | (buf[i + 9] << 2) | (buf[i + 10] >> 6)) * 400;
      video = `${w}x${h}, aspect ${aspects[ar] || ar}, ${rates[fr] || fr} fps, ${Math.round(br / 1000)} kbps`;
      break;
    }
  }
  // the first audio packet (stream 0xC0): find an MPEG audio frame sync after it
  for (let i = 0; i + 4 < n; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1 && buf[i + 3] === 0xc0) {
      for (let j = i + 6; j + 4 < Math.min(n, i + 64); j++) {
        if (buf[j] === 0xff && (buf[j + 1] & 0xf0) === 0xf0) {
          const layer = 4 - ((buf[j + 1] >> 1) & 3), bri = buf[j + 2] >> 4, sri = (buf[j + 2] >> 2) & 3, mode = buf[j + 3] >> 6;
          audio = `MPEG-1 layer ${layer}, ${audioKbps[bri]} kbps, ${audioHz[sri]} Hz, ${['stereo', 'joint stereo', 'dual', 'mono'][mode]}`;
          break;
        }
      }
      break;
    }
  }
  const size = fs.statSync(file).size;
  console.log(`${path.basename(file)}\t${(size / 1048576).toFixed(1)} MB\t${video}\t${audio}`);
}
