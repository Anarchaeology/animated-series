// Compares where the logo is in two renders of a shot, frame by frame: the green-weighted centroid of the logo
// (green above red and blue, relative to that frame's brightest green) in file A and file B, and the gap between them.
// usage: node logo_drift.js FFMPEG_BIN FILE_A A_FIRST FILE_B B_FIRST COUNT MATRIX_A MATRIX_B
const path = require('path'), { spawn } = require('child_process');
const [bin, fa, a0, fb, b0, count, ma, mb] = process.argv.slice(2);
const W = 1284, H = 752;
function centroids(file, first, matrix) {
  return new Promise((res, rej) => {
    const ff = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', file, '-vf',
      `trim=start_frame=${first}:end_frame=${+first + +count},setpts=PTS-STARTPTS,scale=${W}:${H}:flags=bicubic:in_color_matrix=${matrix}:in_range=tv,format=rgb24`,
      '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const size = W * H * 3, out = [];
    let pending = Buffer.alloc(0);
    ff.stdout.on('data', c => {
      pending = pending.length ? Buffer.concat([pending, c]) : c;
      while (pending.length >= size) {
        const f = pending.subarray(0, size);
        let mx = 0;
        for (let i = 0; i < W * H; i++) mx = Math.max(mx, f[3 * i + 1] - Math.max(f[3 * i], f[3 * i + 2]));
        let s = 0, sx = 0, sy = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = 3 * (y * W + x), g = f[i + 1] - Math.max(f[i], f[i + 2]) - 0.35 * mx;
          if (g > 0) { s += g; sx += g * x; sy += g * y; }
        }
        out.push(s ? [sx / s, sy / s, mx] : null);
        pending = pending.subarray(size);
      }
    });
    ff.on('close', c => (c ? rej(new Error('read failed')) : res(out)));
  });
}
(async () => {
  const [A, B] = await Promise.all([centroids(fa, a0, ma), centroids(fb, b0, mb)]);
  A.forEach((p, k) => {
    const q = B[k];
    console.log([+a0 + k, p ? `${p[0].toFixed(1)},${p[1].toFixed(1)} (${p[2]})` : '-', q ? `${q[0].toFixed(1)},${q[1].toFixed(1)} (${q[2]})` : '-',
      p && q ? `gap ${Math.hypot(p[0] - q[0], p[1] - q[1]).toFixed(1)} (dx ${(q[0] - p[0]).toFixed(1)}, dy ${(q[1] - p[1]).toFixed(1)})` : ''].join('\t'));
  });
})();
