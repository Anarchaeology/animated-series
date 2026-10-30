// Prints a hue histogram (10-degree bins) of the saturated, bright pixels in given frames of the originals, to tell
// apart the colours a key has to separate. Works at 321x188 (Starlight's geometry / 4).
// usage: node hue_probe.js FFMPEG_BIN UPLOAD_DIR "PART|FRAME|LABEL" ...
const path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, ...specs] = process.argv.slice(2);
const W = 321, H = 188, fps = 30000 / 1001;
const hsv = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
};
for (const spec of specs) {
  const [part, frame, label] = spec.split('|');
  const buf = execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-ss', ((frame - 0.5) / fps).toFixed(4), '-i', path.join(dir, `${part}.mov`),
    '-vf', `scale=${W}:${H}:in_color_matrix=bt601:in_range=tv,format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1e8 });
  const bins = new Array(36).fill(0);
  for (let i = 0; i < W * H; i++) {
    const [h, s, v] = hsv(buf[3 * i], buf[3 * i + 1], buf[3 * i + 2]);
    if (s > 0.45 && v > 0.3) bins[Math.floor(h / 10)]++;
  }
  console.log(`${label} (${part} ${frame}): ` + bins.map((n, k) => n > 20 ? `${k * 10}:${n}` : '').filter(Boolean).join(' '));
}
