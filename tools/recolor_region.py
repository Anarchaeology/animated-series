# Recolours the dark pixels in given boxes of one frame, e.g. the black hair Starlight gives 103's Ross at his desk
# (13 aoe103b 780), who has light grey hair: each pixel in a box is moved towards TARGET (R,G,B, 0-255 full range) as
# far as it is dark (fully below luminance LO, not at all above HI), keeping its shading (brighter or darker than the
# boxes' fully dark pixels on average, by the same share, within 0.65-1.35). Writes the whole frame, recoloured, as
# OUT.npy (H x W x 3, 16-bit, full range), for paste_patch.py, and a 10x preview of the boxes beside the original.
# usage: python -I recolor_region.py FFMPEG_BIN CLIP.mov FRAME OUT.npy --boxes=X0,Y0,X1,Y1;... --target=R,G,B
#        [--dark=LO,HI] [--preview=PNG]
import os, sys, subprocess
import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, frame, out = args[:4]
W, H = 1284, 752
raw = subprocess.run([os.path.join(bin_dir, 'ffmpeg'), '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                      f'trim=start_frame={frame}:end_frame={int(frame) + 1},scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                      '-frames:v', '1', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
img = np.frombuffer(raw, np.uint16).reshape(H, W, 3).astype(np.float32) / 257
lo, hi = map(float, opt.get('dark', '30,50').split(','))
target = np.array([float(v) for v in opt['target'].split(',')], np.float32)
region = np.zeros((H, W), bool)
for b in opt['boxes'].split(';'):
    x0, y0, x1, y1 = map(int, b.split(',')); region[y0:y1 + 1, x0:x1 + 1] = True
lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
w = np.clip((hi - lum) / (hi - lo), 0, 1) * region
lref = lum[w >= 0.999].mean() if (w >= 0.999).any() else lo
new = target * np.clip((lum + 12) / (lref + 12), 0.65, 1.35)[..., None]
outimg = img * (1 - w[..., None]) + new * w[..., None]
np.save(out, np.clip(outimg * 257, 0, 65535).round().astype(np.uint16))
print(f'{os.path.basename(out)}: frame {frame}, {int((w > 0).sum())} pixels recoloured ({int((w >= 0.999).sum())} fully), their mean luminance {lref:.1f} -> target {target.tolist()}')
if opt.get('preview'):
    ys, xs = np.nonzero(region); y0, y1, x0, x1 = ys.min() - 4, ys.max() + 5, xs.min() - 4, xs.max() + 5
    crop = lambda a: np.kron(np.clip(a[y0:y1, x0:x1] * 1.7, 0, 255), np.ones((10, 10, 1))).astype(np.uint8)
    Image.fromarray(np.concatenate([crop(img), crop(outimg)], 1)).save(opt['preview'])
