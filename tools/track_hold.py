# Holds someone still through a shot the camera moves in: inside their mask, every frame shows them as they are in one
# chosen frame (HOLD), carried along with the camera and focused like that frame. For 103's bald man lying in the
# corridor (13 aoe103b 6925-7092), whose sleeve's pattern Starlight redraws in every frame (the original's crawls too)
# while the camera pulls back from him and comes into focus on him; he himself doesn't move.
# - The camera's move comes from point_tracks.py tracks of points on him (--tracks, given on HOLD), steadied over
#   --tsmooth frames: in each frame an affine fit (points more than 2 px off refitted without), plus each point's
#   own leftover spread --reach px around it (scaled with the shot), since a camera moving past him changes his shape
#   more than an affine can (4-6 px early in 103's shot). Frames with under 6 visible points use the hidden ones too,
#   where CoTracker3 says they'd be.
# - The held frame (picture and its --masks mask, small holes closed) is warped by that into each frame.
# - Focus: in each frame, the blur (0 to --maxblur px) that gives the warped hold as much detail (between 1 and 4 px)
#   as the frame has inside both masks, with a colour gain (each channel within 0.8-1.25); both steadied over time (median of 5 frames,
#   then a Gaussian of 1.5). With --sharpening, the blur is fitted as never rising, for a shot whose focus only
#   sharpens (103's pulls focus onto him; measured frame by frame, the still frames' blur wavered 0-0.5 px).
# - Laid in through the warped mask, grown --grow px and feathered --feather px or the frame's blur, whichever is more;
#   only his own colours are blurred, carried past his edge into the grown margin.
# In floating point on the GPU; writes ProRes 422 HQ, BT.709, like the other fix sources; prints each frame's blur.
# usage: python -I track_hold.py FFMPEG_BIN CLIP.mov FIRST LAST HOLD OUT.mov --tracks=TSV --masks=DIR [--tsmooth=2]
#        [--reach=60] [--grow=2] [--feather=1.5] [--maxblur=10] [--sharpening]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict((a[2:].split('=', 1) + [''])[:2] for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, hold, out = args[:6]
first, last, hold = int(first), int(last), int(hold)
TSMOOTH, REACH, GROW = float(opt.get('tsmooth', 2)), float(opt.get('reach', 60)), int(opt.get('grow', 2))
FEATHER, MAXBLUR = float(opt.get('feather', 1.5)), float(opt.get('maxblur', 10))
SHARPENING = 'sharpening' in opt
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')
P = torch.nn.functional.max_pool2d

def frames(a, b):
    p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={a}:end_frame={b + 1},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                          '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    for _ in range(b - a + 1):
        yield torch.from_numpy(np.frombuffer(p.stdout.read(W * H * 6), np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    p.stdout.close(); p.wait()

def blur(t, s):
    if s <= 0.05: return t
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    shp = t.shape; t = t.reshape(-1, 1, H, W)
    t = torch.nn.functional.conv2d(torch.nn.functional.pad(t, (r, r, 0, 0), mode='replicate'), k.view(1, 1, 1, -1))
    t = torch.nn.functional.conv2d(torch.nn.functional.pad(t, (0, 0, r, r), mode='replicate'), k.view(1, 1, -1, 1))
    return t.reshape(shp)

def mask(f):
    return torch.from_numpy((np.array(Image.open(os.path.join(opt['masks'], f'{f}.png'))) > 127).astype(np.float32)).to(dev)

# the tracks, steadied over time
d = np.loadtxt(opt['tracks'], skiprows=1)
n = int(d[:, 1].max()) + 1; T = last - first + 1
pos = np.zeros((T, n, 2)); vis = np.zeros((T, n), bool)
for f, p, x, y, v in d:
    if first <= f <= last: pos[int(f) - first, int(p)] = (x, y); vis[int(f) - first, int(p)] = v > 0.5
if TSMOOTH > 0:
    r = int(3 * TSMOOTH); k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * TSMOOTH ** 2))
    pos = np.stack([np.array([(pos[max(0, i - r):i + r + 1, p] * k[max(0, r - i):r + T - i, None]).sum(0) / k[max(0, r - i):r + T - i].sum()
                              for i in range(T)]) for p in range(n)], 1)
anchor = pos[hold - first]

# the warp for each frame: where each pixel of the frame comes from in the held frame (worked out at quarter size)
qh, qw = H // 4, W // 4
gy, gx = torch.meshgrid(torch.arange(qh, dtype=torch.float32, device=dev) * 4 + 1.5, torch.arange(qw, dtype=torch.float32, device=dev) * 4 + 1.5, indexing='ij')
def warp_field(k):
    b, a, v = pos[k], anchor, vis[k]
    use = v if v.sum() >= 6 else np.ones(n, bool)
    X = np.c_[b, np.ones(n)]; sel = use.copy()
    for _ in range(3):
        M = np.linalg.lstsq(X[sel], a[sel], rcond=None)[0]   # (3 x 2): frame -> held frame
        res = np.hypot(*(X @ M - a).T); sel = use & (res < max(2, np.percentile(res[use], 85)))
    reach = REACH / np.sqrt(abs(np.linalg.det(M[:2])))   # (a magnified frame spreads the points further apart)
    left = torch.tensor(a[sel] - (X @ M)[sel], dtype=torch.float32, device=dev); bp = torch.tensor(b[sel], dtype=torch.float32, device=dev)
    q = torch.stack([gx.flatten(), gy.flatten()], 1)
    w = torch.exp(-((q[:, None] - bp[None]) ** 2).sum(-1) / (2 * reach ** 2))
    corr = (w @ left) / (w.sum(1, keepdim=True) + 0.05)
    Mt = torch.tensor(M, dtype=torch.float32, device=dev)
    src = torch.cat([q, torch.ones(len(q), 1, device=dev)], 1) @ Mt + corr
    src = src.reshape(qh, qw, 2).permute(2, 0, 1)[None]
    src = torch.nn.functional.interpolate(src, size=(H, W), mode='bilinear', align_corners=False)[0]
    # (quarter-size samples sit at 4i+1.5; interpolate's half-pixel convention lines that up with full-size pixel centres)
    return torch.stack([(src[0] + 0.5) / W * 2 - 1, (src[1] + 0.5) / H * 2 - 1], -1)[None]

held = next(frames(hold, hold))
hm = mask(hold)[None, None]; hm = (-P(-P(hm, 5, 1, 2), 5, 1, 2))[0, 0]   # (small holes closed)
def warp(k):
    g = warp_field(k)
    col = torch.nn.functional.grid_sample(held[None], g, mode='bicubic', padding_mode='border', align_corners=False)[0]
    a = torch.nn.functional.grid_sample(hm[None, None], g, mode='bilinear', padding_mode='zeros', align_corners=False)[0, 0]
    return col, a

# pass 1: each frame's focus and colour
sig, gains = [], []
cands = np.arange(0, MAXBLUR + 0.01, 0.25)
for k, img in enumerate(frames(first, last)):
    col, a = warp(k)
    inside = (-P(-((a > 0.5) & (mask(first + k) > 0.5)).float()[None, None], 13, 1, 6))[0, 0] > 0.5
    if inside.sum() < 200: sig.append(np.nan); gains.append([1, 1, 1]); continue
    # (matched on sharpness, how much detail there is, rather than pixel by pixel: Starlight's redrawn pattern never
    # lines up with the held one, so a pixel match always took a little blur, softening the still frames. The detail
    # is measured between 1 and 4 px, since Starlight sprinkles finer grain over its out-of-focus frames)
    fine = lambda t: ((blur(t, 1) - blur(t, 4)).abs().sum(0))[inside].mean().item()
    target = fine(img); es = np.array([fine(blur(col, s)) for s in cands])
    s = float(np.interp(target, es[::-1], cands[::-1])); bc = blur(col, s)
    sig.append(s); gains.append((img[:, inside].mean(1) / bc[:, inside].mean(1).clamp(min=1)).clamp(0.8, 1.25).tolist())
sig, gains = np.array(sig, float), np.array(gains, float)
ok = ~np.isnan(sig); sig[~ok] = np.interp(np.flatnonzero(~ok), np.flatnonzero(ok), sig[ok])
def steady(v):
    v = np.array([np.median(v[max(0, i - 2):i + 3], 0) for i in range(len(v))])
    k = np.exp(-np.arange(-4, 5) ** 2 / (2 * 1.5 ** 2))
    return np.array([(v[max(0, i - 4):i + 5] * (k[max(0, 4 - i):4 + len(v) - i] if v.ndim == 1 else k[max(0, 4 - i):4 + len(v) - i, None])).sum(0) /
                     k[max(0, 4 - i):4 + len(v) - i].sum() for i in range(len(v))])
if SHARPENING:   # (the closest blur that never rises: pool adjacent violators)
    blocks = []
    for v in sig:
        blocks.append([v, 1])
        while len(blocks) > 1 and blocks[-2][0] < blocks[-1][0]:
            v2, n2 = blocks.pop(); v1, n1 = blocks.pop(); blocks.append([(v1 * n1 + v2 * n2) / (n1 + n2), n1 + n2])
    sig = np.concatenate([[v] * c for v, c in blocks])
sig, gains = steady(sig), steady(gains)
print('blur by frame:', ' '.join(f'{first + i}:{s:.1f}' for i, s in enumerate(sig) if i % 5 == 0))

enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, {opt["masks"]} held as at {hold}, carried by {opt["tracks"]}', out],
                       stdin=subprocess.PIPE)
for k, img in enumerate(frames(first, last)):
    col, a = warp(k)
    # (only his own colours are blurred, carried a little past his edge to cover the grown margin: blurring the held
    # frame whole brought its bright background into his out-of-focus edge as a pale rim)
    col = torch.where(a[None] > 0.5, col, blur(col * a[None], 3) / blur(a[None], 3).clamp(min=1e-3))
    if GROW > 0: a = P(a[None, None], 2 * GROW + 1, 1, GROW)[0, 0]
    col = blur(col * a[None], sig[k]) / blur(a[None], sig[k]).clamp(min=1e-3)
    col = col * torch.tensor(gains[k], dtype=torch.float32, device=dev).view(3, 1, 1)
    a = blur(a[None], max(FEATHER, sig[k]))[0]
    img = col * a + img * (1 - a)
    enc.stdin.write(img.permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {T} frames')
