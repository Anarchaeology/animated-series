# Tones down shine inside a mask: each pixel's brightness above the masked area's dark (the mean colour of its
# darkest --pct percent, steadied over 5 frames either side) is cut to --keep of what it was, with its colour kept
# (the pixel is scaled as a whole, so a pinkish bit stays pinkish, only darker); pixels at or below the dark are left
# as they are. For 104's Eleena on the table (15 aoe104a 290-960), whose open mouth Starlight draws as glossy grey
# lobes either side of a dark centre line, shinier than black (the original's is shiny too). The mask (sam_masks.py
# folders, <frame>.png; frames without one are left alone) is shrunk --erode px so the lips' edge is untouched, and
# feathered --feather px. --fade=A-B takes the effect down to nothing from frame A to B (a dissolve, where the mask
# would otherwise darken what's coming in). In floating point on the GPU; writes ProRes 422 HQ, BT.709, like the
# other fix sources.
# usage: python -I tone_inside.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mov --masks=DIR[,DIR...] [--keep=0.5] [--pct=5]
#        [--erode=1] [--feather=1.5] [--fade=A-B]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict((a[2:].split('=', 1) + [''])[:2] for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, out = args[:5]
first, last = int(first), int(last)
KEEP, PCT, ERODE, FEATHER = float(opt.get('keep', 0.5)), float(opt.get('pct', 5)), int(opt.get('erode', 1)), float(opt.get('feather', 1.5))
FADE = tuple(map(int, opt['fade'].split('-'))) if 'fade' in opt else None
dirs = opt['masks'].split(',')
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')
LUM = torch.tensor([0.2126, 0.7152, 0.0722], device=dev).view(3, 1, 1)

def frames():
    p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={first}:end_frame={last + 1},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                          '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    for _ in range(last - first + 1):
        yield torch.from_numpy(np.frombuffer(p.stdout.read(W * H * 6), np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    p.stdout.close(); p.wait()

def blur(t, s):
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    shp = t.shape; t = t.reshape(-1, 1, H, W)
    t = torch.nn.functional.conv2d(torch.nn.functional.pad(t, (r, r, 0, 0), mode='replicate'), k.view(1, 1, 1, -1))
    t = torch.nn.functional.conv2d(torch.nn.functional.pad(t, (0, 0, r, r), mode='replicate'), k.view(1, 1, -1, 1))
    return t.reshape(shp)

def mask(f):
    m = torch.zeros(H, W, device=dev)
    for d in dirs:
        p = os.path.join(d, f'{f}.png')
        if os.path.exists(p): m = torch.maximum(m, torch.from_numpy((np.array(Image.open(p)) > 127).astype(np.float32)).to(dev))
    return m

# pass 1: the dark of the masked area in each frame, steadied
darks = []
for k, img in enumerate(frames()):
    m = mask(first + k) > 0.5
    if m.sum() < 20: darks.append(None); continue
    px = img[:, m]; l = (px * LUM.view(3, 1)).sum(0)
    darks.append(px[:, l <= torch.quantile(l, PCT / 100)].mean(1).cpu().numpy())
have = [i for i, d in enumerate(darks) if d is not None]
dk = np.array([darks[i] if darks[i] is not None else darks[min(have, key=lambda j: abs(j - i))] for i in range(len(darks))]) if have else None

enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, shine inside {opt["masks"]} toned down to {KEEP}', out],
                       stdin=subprocess.PIPE)
for k, img in enumerate(frames()):
    f = first + k; m = mask(f)
    s = 1.0 if not FADE else float(np.clip((FADE[1] - f) / max(1, FADE[1] - FADE[0]), 0, 1))
    if m.sum() >= 20 and s > 0:
        d = torch.tensor(dk[max(0, k - 5):k + 6].mean(0), dtype=torch.float32, device=dev).view(3, 1, 1)
        ld = (d * LUM).sum(0); l = (img * LUM).sum(0, keepdim=True)
        toned = img * torch.where(l > ld, (ld + (l - ld) * KEEP) / l.clamp(min=1), torch.ones_like(l))
        if ERODE > 0: m = (-torch.nn.functional.max_pool2d(-m[None, None], 2 * ERODE + 1, 1, ERODE))[0, 0]
        a = (blur(m[None], FEATHER)[0] if FEATHER > 0 else m) * s
        img = toned * a + img * (1 - a)
    enc.stdin.write(img.permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames')
