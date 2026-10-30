# Another stretch of a clip, played over FIRST-LAST of the part, sped or slowed to fit: output frame k shows the source
# at SRC_FIRST + k * (SRC_LAST - SRC_FIRST) / (LAST - FIRST), blended linearly between the two nearest frames (equal
# lengths copy it as it is). For a still camera only (104's teeth shot, 16 aoe104b 1244-1384, replaced by the wide shot
# of the bar, 1015-1108, whose only movement is the lamps' flicker). Writes ProRes 422 HQ, BT.709, like the other fix
# sources. usage: python -I retime.py FFMPEG_BIN CLIP.mov SRC_FIRST SRC_LAST FIRST LAST OUT.mov
import os, sys, subprocess
import numpy as np

bin_dir, clip, s0, s1, f0, f1, out = sys.argv[1:8]
s0, s1, f0, f1 = map(int, (s0, s1, f0, f1))
W, H = 1284, 752
ff = os.path.join(bin_dir, 'ffmpeg')
o = subprocess.run([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                    f'trim=start_frame={s0}:end_frame={s1 + 1},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], capture_output=True, stdin=subprocess.DEVNULL).stdout
src = np.frombuffer(o, np.uint16).reshape(-1, H, W, 3)
assert len(src) == s1 - s0 + 1, f'read {len(src)} frames, expected {s1 - s0 + 1}'
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {s0}-{s1} of {os.path.basename(clip)}, retimed to {f1 - f0 + 1} frames', out],
                       stdin=subprocess.PIPE)
n = f1 - f0
for k in range(n + 1):
    t = k * (s1 - s0) / n if n else 0; i = min(int(t), s1 - s0); a = t - i
    img = src[i] if a < 1e-6 or i == s1 - s0 else (src[i] * (1 - a) + src[i + 1].astype(np.float32) * a).round().astype(np.uint16)
    enc.stdin.write(img.tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {n + 1} frames from {s1 - s0 + 1} (speed {(s1 - s0) / n:.3f})')
