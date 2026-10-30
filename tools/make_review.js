// Makes one side-by-side review video per episode: the original (plainly enlarged) on the left, the Starlight upscale
// on the right, with the original sound. A bar on top labels each side and shows the part's file and its time and
// frame, so a spot can be reported as e.g. "08 aoe102b at 1:23.4".
// usage: node make_review.js FFMPEG_BIN UPLOAD_DIR OUT_DIR [SECONDS_PER_PART]   (seconds: short test renders)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [bin, dir, out, testSeconds] = process.argv.slice(2);
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const text = (t, x, size = 22) => `drawtext=${font}:text='${t}':x=${x}:y=9:fontsize=${size}:fontcolor=white`;
const parts = fs.readdirSync(dir).filter(f => /^\d\d .*\.mov$/.test(f) && !f.includes('_starlight')).sort();
fs.mkdirSync(out, { recursive: true });
for (const ep of ['101', '102', '103', '104']) {
  const mine = parts.filter(f => f.includes(`aoe${ep}`));
  const args = ['-nostdin', '-v', 'error', '-y'];
  for (const f of mine) {
    if (testSeconds) args.push('-t', testSeconds);
    args.push('-i', path.join(dir, f));
    if (testSeconds) args.push('-t', testSeconds);
    args.push('-i', path.join(dir, f.replace('.mov', '_starlight.mov')));
  }
  const chains = mine.map((f, k) => {
    const label = f.replace('.mov', '').replace(/[()]/g, '');
    return `[${2 * k}:v]scale=1284:752:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1[o${k}];` +
      `[${2 * k + 1}:v]setsar=1[s${k}];` +
      `[o${k}][s${k}]hstack=inputs=2,pad=2568:792:0:40:black,` +
      `${text('Original (plain enlargement)', 12)},${text('Starlight Precise 2.6', 1296)},` +
      `${text(`${label}   %{pts\\:hms}   frame %{frame_num}`, 'w-text_w-12')},format=yuv420p[v${k}]`;
  });
  const concat = mine.map((f, k) => `[v${k}][${2 * k}:a]`).join('') + `concat=n=${mine.length}:v=1:a=1[v][a]`;
  const file = path.join(out, `Episode ${ep} review - original vs Starlight${testSeconds ? ' (test)' : ''}.mp4`);
  args.push('-filter_complex', chains.join(';') + ';' + concat, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', file);
  const t0 = Date.now();
  execFileSync(path.join(bin, 'ffmpeg'), args, { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log(`${path.basename(file)}: ${mine.length} parts, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (testSeconds) break;
}
