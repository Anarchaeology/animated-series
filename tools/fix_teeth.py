# Mends gappy teeth: for 104's Eleena at the bar (16 aoe104b 1244-1384 and 6930-7000), whose upper teeth Starlight
# and the original both draw as separate pegs with dark gaps between them. Inside SAM 2's mask of her whole mouth
# (lips and opening, --mouth; holes filled), teeth are its near-grey pixels (chroma (max-min)/max under --chroma, blue at most 0.92 of green, max
# above --minbright, red/green under 1.6: lips, skin and the mouth's dark inside are all much redder). The top of the
# upper teeth, the topmost tooth pixel in each column of the mouth's upper half, is fitted with a smooth curve (a
# quadratic, outliers refitted without, steadied over --tsmooth frames) along which the teeth band lies, as wide as the
# upper teeth reach. Then, by --mode:
#   close  the dark gaps between teeth in that band (down to how far the teeth around them reach) are filled from the
#          teeth either side in the same row, with a faint seam where each gap was, so they read as whole teeth
#   paste  good teeth from another frame (--ref=FRAME:MOUTH_DIR, e.g. 7286, where her upper incisors are whole; the part
#          of its band to use, --refspan=A-B as fractions of its width, and --refdepth px of it below its curve: the upper
#          teeth only) are laid along the curve, scaled to the band's
#          width, toned to this frame's teeth, only over tooth and dark pixels (never the lips)
#   shade  the teeth and gaps are pulled towards the mouth's dark inside (--keep of their brightness above it), so the
#          broken row recedes into shadow
# Frames where too few teeth show (under --minteeth pixels) are left alone. --debug=F,F... writes OUT_debug_F.png
# (teeth cyan, the curve yellow, the band green) and stops. In floating point; writes ProRes 422 HQ, BT.709, like the
# other fix sources.
# usage: python -I fix_teeth.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mov --mouth=DIR --mode=close|paste|shade
#        [--ref=FRAME:DIR] [--refspan=0-1] [--refdepth=PX] [--uniform] [--refclip=CLIP.mov] [--keep=0.45] [--chroma=0.55] [--minbright=40] [--dark=38] [--toothw=10] [--minteeth=25] [--tsmooth=2]
#        [--debug=F,...]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict((a[2:].split('=', 1) + [''])[:2] for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, out = args[:5]
first, last = int(first), int(last)
MODE, CHROMA, MINB = opt.get('mode', 'close'), float(opt.get('chroma', 0.55)), float(opt.get('minbright', 40))
DARK = float(opt.get('dark', 38))   # (the mouth's dark inside: luma below this)
TOOTHW = float(opt.get('toothw', 10))
UNIFORM = 'uniform' in opt   # (paste: the reference at one scale, from the teeth's depth, centred, not stretched across the row)   # (a tooth's width in px, for the seams across wide gaps)
MINTEETH, TSMOOTH, KEEP = int(opt.get('minteeth', 25)), int(opt.get('tsmooth', 2)), float(opt.get('keep', 0.45))
DEBUG = [int(f) for f in opt['debug'].split(',')] if opt.get('debug') else []
W, H = 1284, 752
ff = os.path.join(bin_dir, 'ffmpeg')

def frames(a, b, src=None):
    p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', src or clip, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={a}:end_frame={b + 1},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                          '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, stdin=subprocess.DEVNULL)
    for _ in range(b - a + 1):
        yield np.frombuffer(p.stdout.read(W * H * 6), np.uint16).reshape(H, W, 3).astype(np.float32) / 257
    p.stdout.close(); p.wait()

def fill_holes(m):   # the mask with every pocket it encloses filled (what can't be reached from the border)
    t = torch.from_numpy(m.astype(np.float32))[None, None]; free = 1 - t
    reach = torch.zeros_like(t); reach[..., 0, :] = 1; reach[..., -1, :] = 1; reach[..., :, 0] = 1; reach[..., :, -1] = 1
    reach = reach * free
    while True:
        nxt = torch.nn.functional.max_pool2d(reach, 3, 1, 1) * free
        if torch.equal(nxt, reach): break
        reach = nxt
    return (reach[0, 0] < 0.5).numpy()

_mouths = {}
def mouth(d, f):   # (holes filled in a box round the mouth only; cached)
    if (d, f) in _mouths: return _mouths[(d, f)]
    p = os.path.join(d, f'{f}.png'); m = np.array(Image.open(p)) > 127 if os.path.exists(p) else np.zeros((H, W), bool)
    if m.any():
        ys, xs = np.nonzero(m); y0, y1, x0, x1 = max(0, ys.min() - 2), min(H, ys.max() + 3), max(0, xs.min() - 2), min(W, xs.max() + 3)
        m = m.copy(); m[y0:y1, x0:x1] = fill_holes(m[y0:y1, x0:x1])
    _mouths[(d, f)] = m
    return m

def teeth_of(img, m):
    # near-grey and warm (blue at most 0.92 of green: the lilac end of her lower lip is grey-ish too, but bluer), not
    # within 3 px of the mouth's outline (skin highlights touch its dark corners), and only patches that touch the
    # mouth's dark inside (lip highlights are surrounded by lip)
    mx, mn = img.max(2), img.min(2)
    inner = (-torch.nn.functional.max_pool2d(-torch.from_numpy(m.astype(np.float32))[None, None], 7, 1, 3))[0, 0].numpy() > 0.5
    cand = inner & ((mx - mn) / np.maximum(mx, 1) < CHROMA) & (mx > MINB) & (img[..., 0] / np.maximum(img[..., 1], 1) < 1.6) & \
        (img[..., 2] <= img[..., 1] * 0.92)
    if not cand.any(): return cand
    lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    ys, xs = np.nonzero(m); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    c = torch.from_numpy(cand[y0:y1, x0:x1].astype(np.float32))[None, None]
    dark = torch.from_numpy((m & (lum < DARK))[y0:y1, x0:x1].astype(np.float32))[None, None]
    keep = c * torch.nn.functional.max_pool2d(dark, 5, 1, 2)
    while True:
        nxt = torch.nn.functional.max_pool2d(keep, 3, 1, 1) * c
        if torch.equal(nxt, keep): break
        keep = nxt
    out = np.zeros_like(cand); out[y0:y1, x0:x1] = keep[0, 0].numpy() > 0.5
    return out

def analyse(img, m):
    """the upper teeth: their top curve (coefficients of y = a x^2 + b x + c), the columns they span, the tooth mask"""
    t = teeth_of(img, m)
    ys, xs = np.nonzero(m)
    if len(xs) == 0 or t.sum() < MINTEETH: return None
    tops = []
    for x in range(xs.min(), xs.max() + 1):
        col = np.nonzero(m[:, x])[0]
        if len(col) < 3: continue
        mid = (col.min() + col.max()) / 2
        tc = np.nonzero(t[col.min():int(mid) + 1, x])[0]
        if len(tc): tops.append((x, col.min() + tc.min()))
    if len(tops) < 6: return None
    tops = np.array(tops, float); sel = np.ones(len(tops), bool)
    for _ in range(3):
        k = np.polyfit(tops[sel, 0], tops[sel, 1], 2 if sel.sum() > 12 else 1)
        if len(k) == 2: k = np.r_[0, k]
        res = tops[:, 1] - np.polyval(k, tops[:, 0])
        sel = np.abs(res) < max(2.0, np.percentile(np.abs(res), 80))
    xs_t = tops[sel, 0]
    return dict(k=k, x0=np.percentile(xs_t, 2), x1=np.percentile(xs_t, 98), teeth=t)

def lengths(t, k, x0, x1, hmax):
    """how far the tooth reaches below the curve in each column (1-px breaks bridged)"""
    L = np.zeros(int(x1) - int(x0) + 1)
    for i, x in enumerate(range(int(x0), int(x1) + 1)):
        y = int(round(np.polyval(k, x))); n = 0; miss = 0
        for v in range(hmax):
            if y + v >= H: break
            if t[y + v, x]: n = v + 1; miss = 0
            else:
                miss += 1
                if miss > 1 and v > 1: break
        L[i] = n
    return L

def envelope(L, w):
    if len(L) == 0: return L
    p = np.pad(L, w, mode='edge'); e = np.array([p[i:i + 2 * w + 1].max() for i in range(len(L))])
    k = np.ones(w) / w; return np.convolve(np.pad(e, w, mode='edge'), k, mode='same')[w:-w]

# pass 1: analyse every frame, then steady the curve and span over time
info = []
for i, img in enumerate(frames(first, last)):
    m = mouth(opt['mouth'], first + i)
    info.append(analyse(img, m) if m.any() else None)
idx = [i for i, a in enumerate(info) if a]
steady = {}
for i in idx:
    near = [j for j in idx if abs(j - i) <= TSMOOTH]
    xm = np.mean([(info[j]['x0'] + info[j]['x1']) / 2 for j in near])
    # (average the curves as their values at three points across the band, so the average is a curve too)
    pts = np.array([[np.polyval(info[j]['k'], x) for x in (info[i]['x0'], xm, info[i]['x1'])] for j in near]).mean(0)
    k = np.polyfit([info[i]['x0'], xm, info[i]['x1']], pts, 2) if info[i]['x1'] - info[i]['x0'] > 4 else info[i]['k']
    steady[i] = dict(k=k, x0=np.mean([info[j]['x0'] for j in near]), x1=np.mean([info[j]['x1'] for j in near]))
# how deep the upper teeth reach below the curve (75th percentile across the row), as a median over 11 frames
for i in idx:
    L = lengths(info[i]['teeth'], steady[i]['k'], steady[i]['x0'], steady[i]['x1'], 30)
    info[i]['D'] = np.percentile(L[L > 0], 75) if (L > 0).any() else 0
for i in idx:
    steady[i]['D'] = float(np.median([info[j]['D'] for j in idx if abs(j - i) <= 5]))

ref = None
if MODE == 'paste':
    rf, rd = opt['ref'].split(':'); rf = int(rf)
    rimg = next(frames(rf, rf, opt.get('refclip'))); ra = analyse(rimg, mouth(rd, rf))   # (--refclip: from another part's clip)
    a, b = map(float, opt.get('refspan', '0-1').split('-'))
    rx0, rx1 = ra['x0'] + a * (ra['x1'] - ra['x0']), ra['x0'] + b * (ra['x1'] - ra['x0'])
    rL = lengths(ra['teeth'], ra['k'], ra['x0'], ra['x1'], 40); rE = envelope(rL, 4)
    Hr = int(opt['refdepth']) if 'refdepth' in opt else (int(np.median(rL[rL > 0])) + 1 if (rL > 0).any() else 8)
    rlum = rimg @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    rok = (ra['teeth'] | (mouth(rd, rf) & (rlum < DARK))).astype(np.float32)
    # (where the reference is teeth or mouth, not lip; shrunk 1 px, since its edge blends lip in and laid pink streaks
    # on her lower lip at 3:51)
    rok = (-torch.nn.functional.max_pool2d(-torch.from_numpy(rok)[None, None], 3, 1, 1))[0, 0].numpy()[..., None]
    ref = dict(img=rimg, ok=rok, k=ra['k'], x0=rx0, x1=rx1, H=Hr, mean=rimg[ra['teeth']].mean(0))
    print(f'reference {rf}: teeth band x {rx0:.0f}-{rx1:.0f}, {Hr} px deep, mean colour {ref["mean"].round(1)}')

def sample(img, xs, ys):   # bilinear
    x0 = np.clip(np.floor(xs).astype(int), 0, W - 2); y0 = np.clip(np.floor(ys).astype(int), 0, H - 2)
    fx = np.clip(xs - x0, 0, 1)[..., None]; fy = np.clip(ys - y0, 0, 1)[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)

def mend(img, i):
    if i not in steady: return img, None
    s = steady[i]; k, x0, x1 = s['k'], s['x0'], s['x1']
    m = mouth(opt['mouth'], first + i); t = teeth_of(img, m)
    lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    out = img.copy(); band = np.zeros((H, W), bool)
    xs_ = np.arange(int(x0), int(x1) + 1); n = len(xs_); ys_ = np.polyval(k, xs_)
    # the band: one depth across the row (how far most teeth reach here, steadied over time), tapering to half at the
    # corners, so it doesn't stop short in the middle of a wide gap
    D = s['D']; ramp = np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / max(1, 0.15 * n), 0, 1)
    E = D * (0.5 + 0.5 * ramp)
    # the opening below the teeth line: from the curve down, while it's tooth or the mouth's dark inside (the first
    # 2 rows whatever they are: the upper lip's soft edge), so nothing lands on the lower lip; its depth is then a
    # running median over 9 columns, so a column that stops early (a tooth's darker tip) doesn't leave a bar
    R = np.zeros(n); opening = np.zeros((H, W), bool)
    for ci, (x, y) in enumerate(zip(xs_, np.round(ys_).astype(int))):
        v = 0
        while v < 60 and 0 <= y + v < H and m[y + v, x] and (v < 2 or t[y + v, x] or lum[y + v, x] < DARK):
            opening[y + v, x] = True; v += 1
        R[ci] = v
    Rp = np.pad(R, 4, mode='edge'); R = np.array([np.median(Rp[c:c + 9]) for c in range(n)])
    g = np.exp(-np.arange(-6, 7) ** 2 / 8); R = np.convolve(np.pad(R, 6, mode='edge'), g / g.sum(), mode='same')[6:-6]   # (and smoothed)
    depth = np.minimum(R, E if MODE != 'paste' else np.minimum(R, D * 1.15))
    for ci, (x, y) in enumerate(zip(xs_, ys_)):
        for v in range(int(round(depth[ci]))):
            yy = int(round(y)) + v
            if 0 <= yy < H and m[yy, x]: band[yy, x] = True
    tw = TOOTHW   # (a tooth's width, for seams across wide gaps)
    if MODE == 'close':
        for yy in np.unique(np.nonzero(band)[0]):
            row = np.nonzero(band[yy])[0]; tx = row[t[yy, row]]
            if len(tx) < 2: continue
            for xa, xb in zip(tx[:-1], tx[1:]):
                if xb - xa < 2: continue
                # (a gap as wide as several teeth gets a seam every tooth-width, so it fills with teeth, not one slab)
                nt = max(1, int(round((xb - xa) / tw))); seams = [xa + (j + 0.5) * (xb - xa) / nt for j in range(nt)] if nt > 1 else [(xa + xb) / 2]
                for x in range(xa + 1, xb):
                    if not band[yy, x] or lum[yy, x] > lum[yy, xa] * 0.9 + 4: continue   # (only what's darker than the teeth)
                    w = (x - xa) / (xb - xa); c = img[yy, xa] * (1 - w) + img[yy, xb] * w
                    seam = 1 - 0.22 * max(np.exp(-((x - s) ** 2) / 1.2) for s in seams)
                    out[yy, x] = c * seam
    elif MODE == 'paste':
        # (across, the reference's teeth span is stretched over this frame's; down, its teeth depth over this frame's
        # teeth depth, kept within 0.7-1.4 of the across scale so the teeth don't turn into slabs or slivers)
        r = ref; sx = (r['x1'] - r['x0']) / max(x1 - x0, 1); sy = np.clip(r['H'] / max(D, 2), 0.7 * sx, 1.4 * sx)
        if UNIFORM: sx = sy = r['H'] / max(D, 2)   # (the reference's teeth at their own shape, centred on this frame's teeth)
        gain = np.clip((img[t].mean(0) if t.sum() > 10 else r['mean']) / np.maximum(r['mean'], 1), 0.6, 1.6)
        xc, rc = (x0 + x1) / 2, (r['x0'] + r['x1']) / 2
        for ci, (x, y) in enumerate(zip(xs_, ys_)):
            u = (rc + (x - xc) * sx) if UNIFORM else (r['x0'] + (x - x0) * sx); yr = np.polyval(r['k'], u)
            if not (r['x0'] <= u <= r['x1']): continue
            for v in range(-1, int(round(depth[ci])) + 1):
                yy = int(round(y)) + v
                if not (0 <= yy < H) or not m[yy, x]: continue
                vr = (yy - y) * sy
                if vr > r['H'] or v >= depth[ci] + 0.5: continue
                if not (t[yy, x] or lum[yy, x] < DARK + 8): continue   # (only onto teeth or the mouth's dark, never lip)
                c = sample(r['img'], np.array([u]), np.array([yr + vr]))[0] * gain
                ok = sample(r['ok'], np.array([u]), np.array([yr + vr]))[0, 0]
                a = np.clip((r['H'] - vr) / 2, 0, 1) * np.clip((v + 1.5) / 1.5, 0, 1) * np.clip((depth[ci] - v) / 1.5, 0, 1) * ok   # (soft at the top and bottom)
                out[yy, x] = c * a + img[yy, x] * (1 - a); band[yy, x] = True
    elif MODE == 'shade':
        # (with a soft edge: hard-edged, following the opening column by column, it left dark streaks)
        # (the upper teeth's band only: wider, it took in the pale rim Starlight draws on her lower lip at the corner)
        sel = band & (t | (lum < DARK))
        d = img[m & (lum <= np.percentile(lum[m], 5))].mean(0)
        a = torch.nn.functional.avg_pool2d(torch.from_numpy(sel.astype(np.float32))[None, None], 3, 1, 1)[0, 0].numpy()[..., None] * m[..., None]
        out = (d + (img - d) * KEEP) * a + img * (1 - a)
        band = sel
    # soften the mended pixels' edges into the picture
    a = torch.from_numpy((out != img).any(2).astype(np.float32))[None, None]
    a = torch.nn.functional.avg_pool2d(torch.nn.functional.max_pool2d(a, 3, 1, 1), 3, 1, 1)[0, 0].numpy()[..., None]
    return out * a + img * (1 - a), (t, k, x0, x1, band)

if DEBUG:
    for i, img in enumerate(frames(first, last)):
        f = first + i
        if f not in DEBUG: continue
        res, dbg = mend(img, i)
        vis = img.copy()
        if dbg:
            t, k, x0, x1, band = dbg
            vis[band] = vis[band] * 0.5 + np.array([0, 255, 0]) * 0.5
            vis[t] = [0, 255, 255]
            for x in range(int(x0), int(x1) + 1):
                y = int(round(np.polyval(k, x)))
                if 0 <= y < H: vis[y, x] = [255, 255, 0]
        ys, xs = np.nonzero(mouth(opt['mouth'], f))
        if len(xs) == 0: continue
        y0, y1, xa, xb = max(0, ys.min() - 10), min(H, ys.max() + 10), max(0, xs.min() - 10), min(W, xs.max() + 10)
        pane = np.concatenate([img[y0:y1, xa:xb], vis[y0:y1, xa:xb], res[y0:y1, xa:xb]], 1).clip(0, 255).astype(np.uint8)
        Image.fromarray(pane).resize((pane.shape[1] * 3, pane.shape[0] * 3), Image.NEAREST).save(f'{os.path.splitext(out)[0]}_debug_{f}.png')
    sys.exit()

enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, teeth mended ({MODE}) inside {opt["mouth"]}', out],
                       stdin=subprocess.PIPE)
n = 0
for i, img in enumerate(frames(first, last)):
    res, dbg = mend(img, i); n += dbg is not None
    enc.stdin.write((res.clip(0, 255) * 257).round().astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames, {n} mended')
