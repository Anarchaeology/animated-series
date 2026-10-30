# Paints something out of a shot by filling it from what's around it: inside each frame's mask (sam_masks.py
# folders, <frame>.png, grown --grow px), every pixel takes the colour of the nearest surroundings, from the smallest
# of a ladder of Gaussian neighbourhoods (3, 6, 12, 24, 48, 96 px) that holds enough known picture, then smoothed
# --smooth px so the steps between them don't show. For 103's Radiman, whose hands Starlight turns into a tangle of
# fingers at the corner of the chessboard shots, while his dark sleeves vanish into the dark around them: the corner
# is just dark, with the window's teal strip at the top. --grain=G adds G times the original's grain (the original
# less a copy blurred 4 px) taken --grainshift=DX/DY away, from plain dark picture, so the fill isn't flat. Feathered
# --feather px. In floating point on the GPU; writes ProRes 422 HQ, BT.709, like the other fix sources.
# usage: python -I inpaint_fill.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mov --masks=DIR [--grow=4] [--feather=3]
#        [--smooth=3] [--orig=ORIGINAL.mov --grain=1 --grainshift=DX/DY]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, out = args[:5]
first, last = int(first), int(last)
GROW, FEATHER, SMOOTH = int(opt.get('grow', 4)), float(opt.get('feather', 3)), float(opt.get('smooth', 3))
ORIG, GRAIN = opt.get('orig'), float(opt.get('grain', 0))
GDX, GDY = map(int, opt.get('grainshift', '0/0').split('/'))
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')

def reader(path, scale):
    p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', path, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={first}:end_frame={last + 1},setpts=PTS-STARTPTS,{scale}format=rgb48le',
                          '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    for _ in range(last - first + 1):
        buf = p.stdout.read(W * H * 6)
        if len(buf) < W * H * 6: raise RuntimeError(f'{path} ended early')
        yield torch.from_numpy(np.frombuffer(buf, np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    p.stdout.close(); p.wait()

def blur(t, s):
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    shp = t.shape; t = t.reshape(-1, 1, H, W)
    t = torch.nn.functional.conv2d(torch.nn.functional.pad(t, (r, r, 0, 0), mode='replicate'), k.view(1, 1, 1, -1))
    t = torch.nn.functional.conv2d(torch.nn.functional.pad(t, (0, 0, r, r), mode='replicate'), k.view(1, 1, -1, 1))
    return t.reshape(shp)

star = reader(clip, 'scale=in_color_matrix=bt709:in_range=tv:out_range=pc,')
orig = reader(ORIG, f'scale={W}:{H}:flags=bicubic:in_color_matrix=bt601:in_range=tv:out_range=pc,') if ORIG else None
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, {opt["masks"]} painted out from around it', out],
                       stdin=subprocess.PIPE)
for k, img in enumerate(star):
    org = next(orig) if orig else None
    m = torch.from_numpy((np.array(Image.open(os.path.join(opt['masks'], f'{first + k}.png'))) > 127).astype(np.float32)).to(dev)
    if GROW > 0: m = torch.nn.functional.max_pool2d(m[None, None], 2 * GROW + 1, 1, GROW)[0, 0]
    known = 1 - m
    fill = torch.zeros_like(img); done = torch.zeros_like(m)
    for s in (3, 6, 12, 24, 48, 96, 192):   # (the nearest neighbourhood that holds enough known picture)
        den = blur(known[None], s)[0]; est = blur(img * known, s) / den.clamp(min=1e-4)
        take = (den > 0.2) & (done < 0.5) & (m > 0.5)
        fill[:, take] = est[:, take]; done[take] = 1
    # (a corner deep inside a big mask, as 104's hologram hands reach the top-left corner of frame, may have too little
    # known picture even 192 px out: it takes that widest estimate anyway, not black)
    rest = (done < 0.5) & (m > 0.5); fill[:, rest] = est[:, rest]
    fill = torch.where(m[None] > 0.5, fill, img)
    if SMOOTH > 0: fill = torch.where(m[None] > 0.5, blur(fill, SMOOTH), img)
    if org is not None and GRAIN:
        gr = torch.roll(org - blur(org, 4), (-GDY, -GDX), (1, 2)); fill = fill + gr * GRAIN * m[None]
    a = blur(m[None], FEATHER)[0] if FEATHER > 0 else m
    enc.stdin.write((fill * a + img * (1 - a)).permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames')
