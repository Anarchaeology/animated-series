# Replaces the glasses Starlight drew on a face with the original's own (plainly enlarged, glasses-free) picture,
# only inside a sam_masks.py mask of the glasses: the mask was made on an enlarged crop of the face (CROP, SCALE x),
# so it's brought back to full size, grown by GROW pixels, feathered by FEATHER, and the original is matched in
# brightness to Starlight on a thin ring just outside the mask, per frame and channel. Writes
# UPLOAD_DIR/<part>_<NAME> (frames FIRST-LAST).mov (Starlight with the patch, ProRes 422 HQ, BT.709), usable as a fix
# source. Mask files are numbered from 0 = FIRST (the crop clip's own frame numbers).
# usage: python -I glasses_fill.py FFMPEG_BIN UPLOAD_DIR PART FIRST LAST X,Y,W,H SCALE MASK_DIR NAME [GROW=1] [FEATHER=1]
import os, sys, subprocess
import numpy as np
from PIL import Image

bin_dir, up, part, first, last, crop, scale, mask_dir, name = sys.argv[1:10]
grow = float(sys.argv[10]) if len(sys.argv) > 10 else 1.0
feather = float(sys.argv[11]) if len(sys.argv) > 11 else 1.0
first, last, scale = int(first), int(last), int(scale)
cx, cy, cw, ch = map(int, crop.split(','))
W, H, N = 1284, 752, last - first + 1
ff = os.path.join(bin_dir, 'ffmpeg')

def read(file, vf):
    out = subprocess.run([ff, '-nostdin', '-v', 'error', '-i', file, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={first}:end_frame={last + 1},setpts=PTS-STARTPTS,{vf}',
                          '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(out, np.uint16).reshape(-1, H, W, 3)

star = read(os.path.join(up, f'{part}_starlight.mov'), 'scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le')
orig = read(os.path.join(up, f'{part}.mov'), f'scale={W}:{H}:flags=bicubic:in_color_matrix=bt601:in_range=tv:out_range=pc,format=rgb48le')
assert len(star) == N and len(orig) == N

def blur(a, s):                 # separable Gaussian
    if s <= 0: return a
    r = int(np.ceil(3 * s)); k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * s * s)); k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode='edge'), k, 'valid'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode='edge'), k, 'valid'), 1, a)

def grown(m, px):               # max over a disc of radius px
    out = m.copy(); r = int(np.ceil(px))
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= px * px:
                out = np.maximum(out, np.roll(np.roll(m, dy, 0), dx, 1))
    return out

outfile = os.path.join(up, f'{part}_{name} (frames {first}-{last}).mov')
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}',
                        '-framerate', '30000/1001', '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment={part} frames {first}-{last}: Starlight with the glasses replaced by the original inside a SAM 2 mask', outfile],
                       stdin=subprocess.PIPE)
for k in range(N):
    f = star[k].astype(np.float32)
    mp = os.path.join(mask_dir, f'{k}.png')
    m = np.asarray(Image.open(mp).resize((cw, ch), Image.BILINEAR), np.float32) / 255 if os.path.exists(mp) else np.zeros((ch, cw), np.float32)
    if m.max() > 0:
        m = blur(grown(m, grow), feather).clip(0, 1)
        ring = (grown(m > 0.02, 3) & ~(m > 0.02)).astype(bool)
        s, o = f[cy:cy + ch, cx:cx + cw], orig[k][cy:cy + ch, cx:cx + cw].astype(np.float32)
        gain = (s[ring].mean(0) + 1) / (o[ring].mean(0) + 1) if ring.any() else np.ones(3)
        f[cy:cy + ch, cx:cx + cw] = s + m[..., None] * (o * gain - s)
    enc.stdin.write(f.clip(0, 65535).astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(outfile)}: {N} frames')
