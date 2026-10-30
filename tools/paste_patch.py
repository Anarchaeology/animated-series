# Pastes still patches into a shot: each --patch takes the pixels of one frame (of the same clip) under a mask, moves
# them by DX,DY, scales their colour by GAIN (one number, or R,G,B), and lays them over every frame of FIRST-LAST.
# For a far, still figure Starlight keeps redrawing wrong, e.g. 103's Ross seated at his desk (13 aoe103b 775-),
# whose hands are held as they are at the start of the shot and whose head is taken from the shot where he stands at
# the same desk. --weightkeys=F:V;... fades every patch by part frame (straight lines between, held past the ends),
# e.g. out through a dissolve. Masks are 8-bit PNGs at the clip's size, in the source frame's place, feathered
# --feather px. In floating point on the GPU; writes ProRes 422 HQ, BT.709, like the other fix sources.
# usage: python -I paste_patch.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mov --patch=SRC_FRAME|FRAME.npy:MASK.png:DX,DY[:GAIN] ...
#        [--weightkeys=F:V;...] [--feather=1]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = [a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--')]
bin_dir, clip, first, last, out = args[:5]
first, last = int(first), int(last)
opt = dict(o for o in opts if o[0] != 'patch')
FEATHER = float(opt.get('feather', 1))
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')

def reader(a, b):
    p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={a}:end_frame={b + 1},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                          '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    for _ in range(b - a + 1):
        buf = p.stdout.read(W * H * 6)
        if len(buf) < W * H * 6: raise RuntimeError('clip ended early')
        yield torch.from_numpy(np.frombuffer(buf, np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    p.stdout.close(); p.wait()

def soften(m, s):
    if s <= 0: return m
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    m = torch.nn.functional.conv2d(m[None, None], k.view(1, 1, 1, -1), padding=(0, r))
    return torch.nn.functional.conv2d(m, k.view(1, 1, -1, 1), padding=(r, 0))[0, 0]

def shift(t, dx, dy):   # moves an image by whole pixels, filling with 0
    o = torch.zeros_like(t)
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    o[..., yd, xd] = t[..., ys, xs]
    return o

patches = []
for name, v in opts:
    if name != 'patch': continue
    parts = v.split(':')
    src, mpath, (dx, dy) = parts[0], parts[1], map(int, parts[2].split(','))
    gain = torch.tensor([float(g) for g in parts[3].split(',')] if len(parts) > 3 else [1.0], device=dev).view(-1, 1, 1)
    # (SRC_FRAME can also be a prepared frame: an .npy of H x W x 3, 0-65535 full range, e.g. a frame with his hair
    # recoloured)
    img = (torch.from_numpy(np.load(src).astype(np.float32)).permute(2, 0, 1).to(dev) if src.endswith('.npy') else next(reader(int(src), int(src)))) * gain
    m = soften(torch.from_numpy(np.array(Image.open(mpath).convert('L')).astype(np.float32) / 255).to(dev), FEATHER)
    patches.append((shift(img, dx, dy), shift(m, dx, dy)))
    print(f'patch from frame {src}, {os.path.basename(mpath)}, moved {dx},{dy}, gain {parts[3] if len(parts) > 3 else 1}')

keys = sorted([tuple(map(float, k.split(':'))) for k in opt['weightkeys'].split(';')]) if opt.get('weightkeys') else [(0, 1.0)]
weight = lambda f: float(np.interp(f, [k[0] for k in keys], [k[1] for k in keys]))
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)} with {len(patches)} still patches laid over', out],
                       stdin=subprocess.PIPE)
for k, cur in enumerate(reader(first, last)):
    w = weight(first + k)
    for img, m in patches:
        a = m * w
        cur = img * a + cur * (1 - a)
    enc.stdin.write(cur.permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames')
