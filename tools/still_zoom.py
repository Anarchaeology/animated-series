# Makes a held frame move: one frame of a clip, enlarged by Z0 at the start and eased (smoothstep) to Z1 by the last
# frame, scaled about the point PX,PY, which stays put on screen. With Z1=1 the last frame is the frame itself, so the
# held stretch runs straight into the shot when it starts playing (101's U18: a slow pull-out on Ross at his desk).
# Sub-pixel, bicubic, in floating point on the GPU, so a slow zoom doesn't step a pixel at a time and the dark sky
# doesn't band. Writes ProRes 422 HQ, BT.709, like the other fix sources.
# usage: python -I still_zoom.py FFMPEG_BIN CLIP.mov FRAME N OUT.mov Z0,Z1 PX,PY
import os, sys, subprocess
import numpy as np, torch

bin_dir, clip, frame, n, out, zs, ps = sys.argv[1:8]
frame, n = int(frame), int(n)
z0, z1 = map(float, zs.split(',')); px, py = map(float, ps.split(','))
W, H = 1284, 752
ff = os.path.join(bin_dir, 'ffmpeg')
raw = subprocess.run([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                      f'trim=start_frame={frame}:end_frame={frame + 1},scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                      '-frames:v', '1', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
img = torch.from_numpy(np.frombuffer(raw, np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1)[None].cuda()
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frame {frame} of {os.path.basename(clip)}, zoomed {z0} to {z1} about {px},{py}', out], stdin=subprocess.PIPE)
ys, xs = torch.meshgrid(torch.arange(H, dtype=torch.float32), torch.arange(W, dtype=torch.float32), indexing='ij')
for k in range(n):
    t = k / max(1, n - 1); e = t * t * (3 - 2 * t); z = z0 + (z1 - z0) * e
    sx, sy = px + (xs - px) / z, py + (ys - py) / z                       # where each output pixel comes from
    grid = torch.stack([(sx + 0.5) / W * 2 - 1, (sy + 0.5) / H * 2 - 1], -1)[None].cuda()
    o = torch.nn.functional.grid_sample(img, grid, mode='bicubic', padding_mode='border', align_corners=False)
    enc.stdin.write(o[0].permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {n} frames, zoom {z0} -> {z1} about ({px}, {py})')
