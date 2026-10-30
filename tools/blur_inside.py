# Blurs part of something without its surroundings bleeding in: the clip is blurred (Gaussian --sigma) among the
# pixels of the --within masks only (e.g. SAM 2's mask of a head, so the bright sky past a face's profile stays out of
# it), and that blur is laid in where the --apply masks say (e.g. the beard area on 103's Radiman, who Starlight gave
# stubble), kept --erode px inside the within mask so the outline stays sharp, feathered --feather px. Mask folders
# hold <frame>.png. --grow=N grows the apply masks N px. --exclude=DIR leaves that mask's pixels (grown --grow px too)
# out of the blur, so what's laid in there comes only from around it: for 104's woman in red (15 aoe104a 663-814),
# whose ear Starlight embosses in her hair in the hair's own colour, the ear is filled from the hair around it (blurring
# it among its own pixels left a smudge of it). In floating point on the GPU; writes ProRes 422 HQ, BT.709, like the
# other fix sources.
# --clipfirst=N: the part frame CLIP's first frame is, for a fix source that starts partway (104's dissolve from the
# door sign to the housing project, where the housing signs are blurred on top of the door sign's own render).
# --range=R: edge-preserving (bilateral): a neighbour counts less the more its colour differs, by R levels of 255 as
# one sigma, so faint texture smooths and strong edges stay: 104's hologram Radiman (16 aoe104b 4754-4909), whose
# stubble is blurred while his lips and open mouth, inside the same mask, keep their shape.
# usage: python -I blur_inside.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mov --within=DIR --apply=DIR [--sigma=2]
#        [--erode=2] [--feather=3] [--grow=0] [--exclude=DIR] [--clipfirst=0] [--range=R]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, out = args[:5]
first, last = int(first), int(last)
SIGMA, ERODE, FEATHER = float(opt.get('sigma', 2)), int(opt.get('erode', 2)), float(opt.get('feather', 3))
GROW, CF = int(opt.get('grow', 0)), int(opt.get('clipfirst', 0))
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')

def blur(t, s):
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    shp = t.shape; t = t.reshape(-1, 1, H, W)
    t = torch.nn.functional.conv2d(t, k.view(1, 1, 1, -1), padding=(0, r))
    return torch.nn.functional.conv2d(t, k.view(1, 1, -1, 1), padding=(r, 0)).reshape(shp)

mask = lambda d, f: torch.from_numpy((np.array(Image.open(os.path.join(d, f'{f}.png'))) > 127).astype(np.float32)).to(dev)
erode = lambda m, k: m if k <= 0 else -torch.nn.functional.max_pool2d(-m[None, None], 2 * k + 1, 1, k)[0, 0]
grow = lambda m, k: m if k <= 0 else torch.nn.functional.max_pool2d(m[None, None], 2 * k + 1, 1, k)[0, 0]

def bilateral(img, wb, s, rng):   # (over the within mask's box only; neighbours outside the mask weigh nothing)
    ys, xs = torch.nonzero(wb, as_tuple=True); out = img.clone()
    if not len(ys): return out
    r = int(2.5 * s + 0.5); y0, y1, x0, x1 = max(0, int(ys.min()) - r), min(H, int(ys.max()) + r + 1), max(0, int(xs.min()) - r), min(W, int(xs.max()) + r + 1)
    c, m = img[:, y0:y1, x0:x1], wb[y0:y1, x0:x1]
    cp, mp = torch.nn.functional.pad(c[None], (r, r, r, r), mode='replicate')[0], torch.nn.functional.pad(m[None, None], (r, r, r, r))[0, 0]
    num, den, h, w = torch.zeros_like(c), torch.zeros_like(m), y1 - y0, x1 - x0
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            n, nm = cp[:, r + dy:r + dy + h, r + dx:r + dx + w], mp[r + dy:r + dy + h, r + dx:r + dx + w]
            wt = nm * np.exp(-(dx * dx + dy * dy) / (2 * s * s)) * torch.exp(-((n - c) / 257).pow(2).sum(0) / (2 * rng * rng))
            num += n * wt; den += wt
    out[:, y0:y1, x0:x1] = num / den.clamp(min=1e-6)
    return out

p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                      f'trim=start_frame={first - CF}:end_frame={last + 1 - CF},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                      '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, blurred {SIGMA} px inside {opt["within"]} where {opt["apply"]}', out],
                       stdin=subprocess.PIPE)
for f in range(first, last + 1):
    img = torch.from_numpy(np.frombuffer(p.stdout.read(W * H * 6), np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    w = mask(opt['within'], f)
    wb = w * (1 - grow(mask(opt['exclude'], f), GROW)) if 'exclude' in opt else w   # (the pixels the blur is taken from)
    # (with --exclude, a pixel deep inside the excluded area has only faint weights reaching it, so the floor is lower;
    # 1e-3 left a dark dot in the middle of the ear at --sigma=4. Without it, the 1e-3 of R7 is kept as it was)
    b = bilateral(img, wb, SIGMA, float(opt['range'])) if 'range' in opt else blur(img * wb, SIGMA) / blur(wb[None], SIGMA).clamp(min=1e-8 if 'exclude' in opt else 1e-3)
    a = blur((grow(mask(opt['apply'], f), GROW) * erode(w, ERODE))[None], FEATHER)[0] * w
    enc.stdin.write((b * a + img * (1 - a)).permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
p.stdout.close(); p.wait(); enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames')
