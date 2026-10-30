// Looks for places where an upscale changed what's in the picture: shrinks the upscale and the original to the same
// small size (176x94, half the original) and, frame by frame, finds the block where they differ most. Fine detail the
// upscaler adds averages away at this size; a changed object doesn't.
// Writes one row per frame: frame, mean difference, worst block's difference and position (in original 352x188
// pixels), and the original's change from the previous frame (high at cuts).
// usage: node misread_scan.js FFMPEG_BIN ORIGINAL UPSCALE OUT_TSV
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const [bin, original, upscale, out] = process.argv.slice(2);
const W = 176, H = 94, BLOCK = 10, STEP = 3;
const small = (matrix) => `scale=${W}:${H}:in_color_matrix=${matrix}:out_color_matrix=bt601:in_range=tv:out_range=tv:flags=area,format=yuv444p`;
const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', original, '-i', upscale, '-filter_complex',
  `[0:v]${small('bt601')}[a];[1:v]${small('bt709')}[b];[a][b]hstack=inputs=2`, '-f', 'rawvideo', '-pix_fmt', 'yuv444p', 'pipe:1'],
  { stdio: ['ignore', 'pipe', 'inherit'] });
const plane = 2 * W * H, frameBytes = 3 * plane;
const d = new Float32Array(W * H), integral = new Float64Array((W + 1) * (H + 1));
let prevY = null, n = 0, pending = Buffer.alloc(0);
const rows = ['frame\tmean\tworst\tx\ty\tcut'];
function frame(buf) {
  let sum = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = y * 2 * W + x, b = a + W;
    const v = Math.abs(buf[a] - buf[b]) + 0.5 * (Math.abs(buf[plane + a] - buf[plane + b]) + Math.abs(buf[2 * plane + a] - buf[2 * plane + b]));
    d[y * W + x] = v; sum += v;
  }
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += d[y * W + x]; integral[(y + 1) * (W + 1) + x + 1] = integral[y * (W + 1) + x + 1] + row; }
  }
  let worst = 0, wx = 0, wy = 0;
  for (let y = 0; y + BLOCK <= H; y += STEP) for (let x = 0; x + BLOCK <= W; x += STEP) {
    const s = integral[(y + BLOCK) * (W + 1) + x + BLOCK] - integral[y * (W + 1) + x + BLOCK] - integral[(y + BLOCK) * (W + 1) + x] + integral[y * (W + 1) + x];
    if (s > worst) { worst = s; wx = x; wy = y; }
  }
  let cut = 0;
  if (prevY) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cut += Math.abs(buf[y * 2 * W + x] - prevY[y * W + x]); cut /= W * H; }
  else prevY = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) prevY[y * W + x] = buf[y * 2 * W + x];
  rows.push([n++, (sum / (W * H)).toFixed(2), (worst / (BLOCK * BLOCK)).toFixed(2), 2 * (wx + BLOCK / 2), 2 * (wy + BLOCK / 2), cut.toFixed(2)].join('\t'));
}
ff.stdout.on('data', chunk => {
  pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
  while (pending.length >= frameBytes) { frame(pending.subarray(0, frameBytes)); pending = pending.subarray(frameBytes); }
});
ff.on('close', code => { fs.writeFileSync(out, rows.join('\n') + '\n'); console.log(`${path.basename(upscale)}: ${n} frames (ffmpeg exit ${code})`); });
