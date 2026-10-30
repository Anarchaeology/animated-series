# Turns heads seen from behind against a bright sky back into silhouettes, where Starlight has drawn faces on them
# (103's Radiman and Ross at the window, 13 aoe103b 2852-3005). Inside each head's own outline (a sam_masks.py
# folder per head, shrunk --erode px so the outline itself stays Starlight's, feathered --feather px), the head is
# blurred within the outline only (Gaussian --sigma, no sky bleeding in), so the features go; its colour becomes a
# tone (steadied over --smooth frames either side), keeping --keep of the blurred head's light and shade so it isn't
# a flat cut-out. The tone is either the head's own dark tone (the mean of its darkest --pct percent; the default)
# or, with --orig=CLIP, the original's own head (its mean inside the outline shrunk --origcore px: in the original a
# white man's head reads lighter than a black man's, 103's Ross against Radiman). With --orig, --grain=G adds G times
# the original's grain (the original less a copy blurred 4 px, as apply_fixes.js does), and --edgeblur=S then blurs
# the head and its outline S px into the sky, so it isn't a hard-edged shape (your notes on the first try, 29 Oct).
# Any of erode, keep, pct, grain can be set for one head, after its folder: DIR;keep=0;grain=1, and with --orig also
# grainblur (the grain's blur, default 4: smaller is finer noise, without the blob's own shape), gain (its tone times
# this), tint=R/G/B with tintmix=M (the tone moved M of the way to that colour at the same brightness: grey-blonde
# hair for 103's Ross), shade=orig (light and shade from the original, which has no face, instead of Starlight) and
# erode=-1 (fill one pixel past the outline, so none of Starlight's dark hair edge is left), shadesigma (the blur
# for the light and shade, default --sigma: larger keeps only the broad lighter-crown, darker-neck fall-off) and
# grainshift=DX,DY (the grain taken from that far away, e.g. clear sky beside the head, so it is only film grain and
# carries none of the head's own shape, which made a dark band across 103's Ross's crown).
# In floating point on the GPU; writes ProRes 422 HQ, BT.709, like the other fix sources.
# usage: python -I silhouette_fill.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mov --masks=DIR[;key=val...][,DIR...] [--erode=1]
#        [--feather=1] [--sigma=3] [--pct=30] [--keep=0.3] [--smooth=5]
#        [--orig=ORIGINAL.mov [--origcore=4] [--grain=0] [--edgeblur=0]]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, out = args[:5]
first, last = int(first), int(last)
heads = [(e.split(';')[0], dict(kv.split('=', 1) for kv in e.split(';')[1:])) for e in opt['masks'].split(',')]
dirs = [d for d, _ in heads]
P = {d: o for d, o in heads}
val = lambda d, key, default: float(P[d].get(key, default))
ERODE, FEATHER, SIGMA = int(opt.get('erode', 1)), float(opt.get('feather', 1)), float(opt.get('sigma', 3))
PCT, KEEP, SMOOTH = float(opt.get('pct', 30)), float(opt.get('keep', 0.3)), int(opt.get('smooth', 5))
ORIG, OCORE, GRAIN, EDGEBLUR = opt.get('orig'), int(opt.get('origcore', 4)), float(opt.get('grain', 0)), float(opt.get('edgeblur', 0))
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')
LUM = torch.tensor([0.2126, 0.7152, 0.0722], device=dev).view(3, 1, 1)

def reader(path, scale):
    p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', path, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={first}:end_frame={last + 1},setpts=PTS-STARTPTS,{scale}format=rgb48le',
                          '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    for _ in range(last - first + 1):
        buf = p.stdout.read(W * H * 6)
        if len(buf) < W * H * 6: raise RuntimeError(f'{path} ended early')
        yield torch.from_numpy(np.frombuffer(buf, np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    p.stdout.close(); p.wait()
star = lambda: reader(clip, 'scale=in_color_matrix=bt709:in_range=tv:out_range=pc,')
# (the original plainly enlarged, as apply_fixes.js's orig)
orig = lambda: reader(ORIG, f'scale={W}:{H}:flags=bicubic:in_color_matrix=bt601:in_range=tv:out_range=pc,')
frames = lambda: zip(star(), orig()) if ORIG else ((s, None) for s in star())

def mask(d, f):
    return torch.from_numpy((np.array(Image.open(os.path.join(d, f'{f}.png'))) > 127).astype(np.float32)).to(dev)

def blur(t, s):
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    shp = t.shape; t = t.reshape(-1, 1, H, W)
    t = torch.nn.functional.conv2d(t, k.view(1, 1, 1, -1), padding=(0, r))
    return torch.nn.functional.conv2d(t, k.view(1, 1, -1, 1), padding=(r, 0)).reshape(shp)

grow = lambda m, k: m if k <= 0 else torch.nn.functional.max_pool2d(m[None, None], 2 * k + 1, 1, k)[0, 0]
erode = lambda m, k: grow(m, -k) if k < 0 else m if k == 0 else -torch.nn.functional.max_pool2d(-m[None, None], 2 * k + 1, 1, k)[0, 0]

# pass 1: each head's tone in each frame
tones = {d: [] for d in dirs}
for k, (img, org) in enumerate(frames()):
    for d in dirs:
        m = mask(d, first + k)
        if ORIG:
            tones[d].append(org[:, erode(m, OCORE) > 0.5].mean(1))
        else:
            px = img[:, m > 0.5]; l = (px * LUM.view(3, 1)).sum(0)
            tones[d].append(px[:, l <= torch.quantile(l, val(d, 'pct', PCT) / 100)].mean(1))
tones = {d: torch.stack(v) for d, v in tones.items()}
steady = {d: torch.stack([v[max(0, i - SMOOTH):i + SMOOTH + 1].mean(0) for i in range(len(v))]) for d, v in tones.items()}
for d in dirs:   # (per head: brighter or darker, and moved towards a colour at the same brightness)
    s = steady[d] * val(d, 'gain', 1)
    if 'tint' in P[d]:
        tint = torch.tensor([float(c) for c in P[d]['tint'].split('/')], device=dev)
        lum_s, lum_t = (s * LUM.view(1, 3)).sum(1, keepdim=True), (tint * LUM.view(3)).sum()
        s = s * (1 - val(d, 'tintmix', 0.5)) + (tint * 257 / lum_t * lum_s / 257) * val(d, 'tintmix', 0.5)
    steady[d] = s

enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, heads in {",".join(dirs)} made silhouettes', out],
                       stdin=subprocess.PIPE)
for k, (img, org) in enumerate(frames()):
    for d in dirs:
        m = mask(d, first + k)
        er = int(val(d, 'erode', ERODE)); core = erode(m, er)
        src = org if P[d].get('shade') == 'orig' else img
        ss = val(d, 'shadesigma', SIGMA)
        b = blur(src * core, ss) / blur(core[None], ss).clamp(min=1e-3)             # blurred inside the outline only
        bl = (b * LUM).sum(0)
        mean_l = bl[core > 0.5].mean()
        new = steady[d][k].view(3, 1, 1) * (1 + val(d, 'keep', KEEP) * (bl / mean_l - 1))[None]
        g = val(d, 'grain', GRAIN) if ORIG else 0
        if g:
            gr = org - blur(org, val(d, 'grainblur', 4))
            if 'grainshift' in P[d]:
                dx, dy = map(int, P[d]['grainshift'].split('/')); gr = torch.roll(gr, (-dy, -dx), (1, 2))
            new = new + gr * g
        a = blur(core[None], FEATHER)[0] * (m if er >= 0 else core) if FEATHER > 0 else core
        res = new * a + img * (1 - a)
        if EDGEBLUR > 0:   # (the head and its outline softened into the sky around it)
            r = int(2 * EDGEBLUR + 2); e = blur(grow(m, r)[None], EDGEBLUR)[0]
            res = blur(res, EDGEBLUR) * e + res * (1 - e)
        img = res
    enc.stdin.write(img.permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
for d in dirs:
    t = (steady[d] / 257).cpu().numpy()
    print(f'{d}: tone rgb from {np.round(t[0]).astype(int).tolist()} to {np.round(t[-1]).astype(int).tolist()}')
print(f'{os.path.basename(out)}: {last - first + 1} frames')
