# Replaces a head in a shot with a real view of it from another shot: for 103's pull-back from Radiman and Ross at the
# window (13 aoe103b 2852-3005), whose backs of heads Starlight gave faces, the backs of their heads from shots where
# Starlight drew them right (Radiman at the window at 1930, Ross at his desk at 1470). Per --head (one per head):
#   SRC_FRAME:SRC_MASK.png:TARGET_DIR[:R/G/B|:xG|:xR/G/B]
# SRC_MASK is the head in that frame (head only, down to the neck), TARGET_DIR the head's sam_masks.py folder in the
# shot. In each frame the head there is first painted out (its mask grown --fillgrow px), each row from the picture
# left or right of it, whichever is nearer, so beside a head it's sky and at the collar it's coat (a fill from all
# sides, or blending the two sides, gave grey smudges), softened 1 px; then the source head is laid on: scaled so its
# width (the widest of its top 60% of rows, measured on the whole mask) matches the target's, centred on it, tops
# lined up, with the head's place and size steadied over --smooth frames either side; its mask shrunk --srcerode px
# so none of its own sky comes along; softened --soft px. Its colour: with R/G/B, the source head's mean brought to
# that colour (each pixel's ratio to the mean kept, capped 0.5-1.6, so a dark head's edge isn't blown up into a
# bright rim); with xG, times G, or with xR/G/B, each channel by its own (103's Ross: 1.46/1.6/1.63, his pink neck
# toned down a little); without either, times the ratio of the two shots' coats just below each head (each channel,
# kept within 0.6-1.6), or --gain=R/G/B for all heads. In floating point on the GPU; writes ProRes 422 HQ, BT.709,
# like the other fix sources.
# usage: python -I paste_head.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mov --head=SRC_FRAME:SRC_MASK.png:TARGET_DIR[:R/G/B|:xG|:xR/G/B] ...
#        [--fillgrow=3] [--feather=1] [--smooth=3] [--soft=0.6] [--srcerode=1] [--maskwin=0] [--fillsmooth=0] [--steady]
#        [--fillbelow]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = [(a[2:].split('=', 1) + [''])[:2] for a in sys.argv[1:] if a.startswith('--')]   # (a bare --flag is flag='')
opt = dict(o for o in opts if o[0] != 'head')
bin_dir, clip, first, last, out = args[:5]
first, last = int(first), int(last)
FILLGROW, FEATHER, SMOOTH, SOFT = int(opt.get('fillgrow', 3)), float(opt.get('feather', 1)), int(opt.get('smooth', 3)), float(opt.get('soft', 0.6))
SRCERODE = int(opt.get('srcerode', 1))
# --maskwin=N: the area painted out is the head's masks over N frames either side, so its edge holds still; --fillsmooth=N:
# the fill averaged over N frames either side (it's only sky and coat there; the head laid on top still moves each
# frame). Both against the flicker where Radiman's neck met his collar, 103's pull-back
MASKWIN, FILLSMOOTH = int(opt.get('maskwin', 0)), int(opt.get('fillsmooth', 0))
# --steady: instead of following the head's measured place and size frame by frame (smoothed --smooth frames), which
# bobbed and swelled with the SAM masks (Radiman's width 25-28 px), the head moves along a straight line through the
# shot (his slow drift as he shifts his weight) at one size, the shot's median
STEADY = 'steady' in opt
# --fillbelow: a painted-out pixel can also take the nearest picture below it, when that's nearer than left or right:
# for a head against a bright window (104's Radiman at 3:17), where the rows at his neck otherwise filled from the
# window either side and left a pale line between head and collar
FILLBELOW = 'fillbelow' in opt
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')

def frames(a, b):
    p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={a}:end_frame={b + 1},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                          '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    for _ in range(b - a + 1):
        yield torch.from_numpy(np.frombuffer(p.stdout.read(W * H * 6), np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    p.stdout.close(); p.wait()

def blur(t, s):
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    shp = t.shape; t = t.reshape(-1, 1, H, W)
    t = torch.nn.functional.conv2d(torch.nn.functional.pad(t, (r, r, 0, 0), mode='replicate'), k.view(1, 1, 1, -1))
    t = torch.nn.functional.conv2d(torch.nn.functional.pad(t, (0, 0, r, r), mode='replicate'), k.view(1, 1, -1, 1))
    return t.reshape(shp)

def geometry(m):   # top row, centre and width of a head mask (numpy bool): the widest of its top 60% of rows
    ys, xs = np.nonzero(m); top, bot = ys.min(), ys.max(); cut = top + 0.6 * (bot - top)
    sel = ys <= cut; widths = [np.ptp(xs[ys == y]) + 1 for y in range(top, int(cut) + 1) if (ys == y).any()]
    return float(top), float(xs[sel].mean()), float(max(widths)), float(bot)

def coat(img, cx, w, bot):   # the coat just below a head: mean colour of its dark pixels
    x0, x1, y0, y1 = int(cx - w), int(cx + w), int(bot + 3), int(bot + 18)
    p = img[:, y0:y1, x0:x1].reshape(3, -1); l = (p * torch.tensor([0.2126, 0.7152, 0.0722], device=dev).view(3, 1)).sum(0)
    return p[:, l <= torch.quantile(l, 0.5)].mean(1)

heads = []
for name, v in opts:
    if name != 'head': continue
    parts = v.split(':'); sf, smask, tdir = parts[:3]
    tone = [float(c) for c in parts[3].split('/')] if len(parts) > 3 and not parts[3].startswith('x') else None
    mult = [float(c) for c in parts[3][1:].split('/')] if len(parts) > 3 and parts[3].startswith('x') else None   # (xG, or xR/G/B)
    src = next(frames(int(sf), int(sf)))
    sm = np.array(Image.open(smask).convert('L')) > 127
    s_top, s_cx, s_w, s_bot = geometry(sm)   # (measured on the whole mask; only the alpha is shrunk)
    if SRCERODE > 0:
        sm = (-torch.nn.functional.max_pool2d(-torch.from_numpy(sm.astype(np.float32))[None, None], 2 * SRCERODE + 1, 1, SRCERODE))[0, 0].numpy() > 0.5
    geo = []
    for f in range(first, last + 1):
        geo.append(geometry(np.array(Image.open(os.path.join(tdir, f'{f}.png'))) > 127))
    geo = np.array(geo)
    if STEADY:   # (its place on a straight line through the shot, its size the shot's median)
        t = np.arange(len(geo)); geo = geo.copy()
        for j in (0, 1, 3): geo[:, j] = np.polyval(np.polyfit(t, geo[:, j], 1), t)
        geo[:, 2] = np.median(geo[:, 2])
    else:
        geo = np.array([geo[max(0, i - SMOOTH):i + SMOOTH + 1].mean(0) for i in range(len(geo))])
    # the area painted out, in a box round the head: each frame's mask joined with those --maskwin frames either side
    # (so its edge doesn't jump a pixel from frame to frame), grown --fillgrow px
    tm = np.stack([np.array(Image.open(os.path.join(tdir, f'{f}.png'))) > 127 for f in range(first, last + 1)])
    ys, xs = np.nonzero(tm.any(0)); pad = FILLGROW + 16
    box = (max(0, ys.min() - pad), min(H, ys.max() + pad + 1), max(0, xs.min() - pad), min(W, xs.max() + pad + 1))
    tm = torch.from_numpy(tm[:, box[0]:box[1], box[2]:box[3]].astype(np.float32))
    tm = torch.stack([tm[max(0, i - MASKWIN):i + MASKWIN + 1].amax(0) for i in range(len(tm))])
    tm = torch.nn.functional.max_pool2d(tm[:, None], 2 * FILLGROW + 1, 1, FILLGROW)[:, 0] > 0.5
    heads.append(dict(src=src, alpha=torch.from_numpy(sm.astype(np.float32)).to(dev), s=(s_top, s_cx, s_w, s_bot), geo=geo, tdir=tdir, sf=sf, tone=tone, mult=mult,
                      box=box, tm=tm))

gain_all = [float(g) for g in opt['gain'].split('/')] if 'gain' in opt else None
ys_, xs_ = torch.meshgrid(torch.arange(H, dtype=torch.float32, device=dev), torch.arange(W, dtype=torch.float32, device=dev), indexing='ij')
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, heads replaced from frames {",".join(h["sf"] for h in heads)}', out],
                       stdin=subprocess.PIPE)
def rowfill(img, m):   # each painted-out pixel from the nearer known pixel in its row (img 3 x h x w, m bool h x w)
    h_, w_ = m.shape; idx = torch.arange(w_, device=dev).expand(h_, w_).contiguous(); known = ~m
    left = torch.where(known, idx, torch.full_like(idx, -1)).cummax(1).values
    right = torch.where(known, idx, torch.full_like(idx, w_)).flip(1).cummin(1).values.flip(1)
    has_l, has_r = left >= 0, right < w_
    lv = img.gather(2, left.clamp(0, w_ - 1)[None].expand(3, h_, w_)); rv = img.gather(2, right.clamp(0, w_ - 1)[None].expand(3, h_, w_))
    nearer_l = has_l & (~has_r | ((idx - left) <= (right - idx)))   # (the nearer side only: blending gave grey where sky met a raised collar)
    out = torch.where(nearer_l[None], lv, rv)
    if FILLBELOW:
        idy = torch.arange(h_, device=dev)[:, None].expand(h_, w_).contiguous()
        below = torch.where(known, idy, torch.full_like(idy, h_)).flip(0).cummin(0).values.flip(0)
        side = torch.where(nearer_l, idx - left, torch.where(has_r, right - idx, torch.full_like(idx, 1 << 20)))
        use_b = (below < h_) & ((below - idy) < side)
        bv = img.gather(1, below.clamp(0, h_ - 1)[None].expand(3, h_, w_))
        out = torch.where(use_b[None], bv, out)
    return torch.where(m[None], out, img)

# pass 1: each head's fill, in its box, every frame, then averaged over --fillsmooth frames either side (each pixel
# only over the frames where it was painted out too, so none of the head that's there comes back in)
for h in heads: h['fills'] = []
for k, img in enumerate(frames(first, last)):
    for h in heads:
        y0, y1, x0, x1 = h['box']
        h['fills'].append(rowfill(img[:, y0:y1, x0:x1], h['tm'][k].to(dev)).cpu())
for h in heads:
    st, wt = torch.stack(h['fills']), h['tm'].float()[:, None]
    if FILLSMOOTH:
        st = torch.stack([(st[max(0, i - FILLSMOOTH):i + FILLSMOOTH + 1] * wt[max(0, i - FILLSMOOTH):i + FILLSMOOTH + 1]).sum(0) /
                          wt[max(0, i - FILLSMOOTH):i + FILLSMOOTH + 1].sum(0).clamp(min=1) for i in range(len(st))])
    h['fills'] = st

for k, img in enumerate(frames(first, last)):
    for h in heads:
        t_top, t_cx, t_w, t_bot = h['geo'][k]
        s_top, s_cx, s_w, s_bot = h['s']
        scale = t_w / s_w
        if k == 0:   # (the colour: the head's mean brought to its tone, or the two shots' coats below the heads, or as given)
            if h['tone']:
                h['gain'] = (torch.tensor(h['tone'], device=dev) * 257 / h['src'][:, h['alpha'] > 0.5].mean(1).clamp(min=1)).view(3, 1, 1)
            elif h['mult']:
                h['gain'] = torch.tensor((h['mult'] * 3)[:3], device=dev).view(3, 1, 1)
            else:
                h['gain'] = torch.tensor(gain_all, device=dev).view(3, 1, 1) if gain_all else \
                    (coat(img, t_cx, t_w, t_bot) / coat(h['src'], s_cx, s_w, s_bot).clamp(min=1)).clamp(0.6, 1.6).view(3, 1, 1)
            print(f'{h["tdir"]}: source frame {h["sf"]}, scale {scale:.2f}, colour gain {[round(g, 2) for g in h["gain"].flatten().tolist()]}')
        # paint out the head that's there (the fill from pass 1, softened 1 px)
        y0, y1, x0, x1 = h['box']; m = torch.zeros(H, W, dtype=torch.bool, device=dev); m[y0:y1, x0:x1] = h['tm'][k].to(dev)
        fill = img.clone(); fill[:, y0:y1, x0:x1] = h['fills'][k].to(dev)
        fill = torch.where(m[None], blur(torch.where(m[None], fill, img), 1), img)
        # lay the real head on
        sx = s_cx + (xs_ - t_cx) / scale; sy = s_top + (ys_ - t_top) / scale
        grid = torch.stack([(sx + 0.5) / W * 2 - 1, (sy + 0.5) / H * 2 - 1], -1)[None]
        col = torch.nn.functional.grid_sample(h['src'][None], grid, mode='bicubic', padding_mode='border', align_corners=False)[0]
        if h['tone']:   # (each pixel's ratio to the head's mean, capped 0.5-1.6, so the edge, which carries a little of the
                        # source's sky, isn't blown up into a bright rim when a dark head is brought up to its tone)
            mean = (h['tone_t'] if 'tone_t' in h else h.setdefault('tone_t', h['src'][:, h['alpha'] > 0.5].mean(1).clamp(min=1))).view(3, 1, 1)
            col = torch.tensor(h['tone'], device=dev).view(3, 1, 1) * 257 * (col / mean).clamp(0.5, 1.6)
        else:
            col = col * h['gain']
        a = torch.nn.functional.grid_sample(h['alpha'][None, None], grid, mode='bilinear', padding_mode='zeros', align_corners=False)[0, 0]
        if SOFT > 0: col = blur(col, SOFT)
        a = blur(a[None], FEATHER)[0] if FEATHER > 0 else a
        img = col * a + fill * (1 - a)
    enc.stdin.write(img.permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames')
