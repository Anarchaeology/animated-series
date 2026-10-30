# Holds part of a shot still: inside a mask, every frame shows that part of one chosen frame (HOLD); outside it, the
# shot plays as it is. For someone who doesn't move while Starlight's version of them changes, e.g. 103's Ross standing
# at his desk (13 aoe103b 1454-1958), whom Starlight turns into one of the city's towers. The mask in each frame is the
# held frame's mask together with that frame's own, from each --add folder (sam_masks.py output, <frame>.png), so
# whatever Starlight draws in his place is covered too; grown --grow px, less anything in the --sub folder's mask for
# that frame (grown --subgrow px: someone passing in front, who stays in front), feathered --feather px. In floating
# point on the GPU; writes ProRes 422 HQ, BT.709, like the other fix sources, plus OUT's mask area per frame on stdout.
# usage: python -I mask_hold.py FFMPEG_BIN CLIP.mov FIRST LAST HOLD OUT.mov --add=DIR[,DIR...] [--sub=DIR]
#        [--grow=3] [--subgrow=1] [--feather=1.5]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, hold, out = args[:6]
first, last, hold = int(first), int(last), int(hold)
GROW, SUBGROW, FEATHER = int(opt.get('grow', 3)), int(opt.get('subgrow', 1)), float(opt.get('feather', 1.5))
adds, sub = opt['add'].split(','), opt.get('sub')
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')
rgb_in = 'scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le'

def reader(a, b):
    p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={a}:end_frame={b + 1},setpts=PTS-STARTPTS,{rgb_in}', '-fps_mode', 'passthrough',
                          '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    for _ in range(b - a + 1):
        buf = p.stdout.read(W * H * 6)
        if len(buf) < W * H * 6: raise RuntimeError('clip ended early')
        yield torch.from_numpy(np.frombuffer(buf, np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    p.stdout.close(); p.wait()

def mask(folder, f):
    path = os.path.join(folder, f'{f}.png')
    if not os.path.exists(path): return torch.zeros(H, W, device=dev)
    return torch.from_numpy((np.array(Image.open(path)) > 127).astype(np.float32)).to(dev)

def grow(m, px):
    return m if px <= 0 else torch.nn.functional.max_pool2d(m[None, None], 2 * px + 1, 1, px)[0, 0]

def soften(m, s):
    if s <= 0: return m
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    m = torch.nn.functional.conv2d(m[None, None], k.view(1, 1, 1, -1), padding=(0, r))
    return torch.nn.functional.conv2d(m, k.view(1, 1, -1, 1), padding=(r, 0))[0, 0]

held = next(reader(hold, hold))
held_mask = sum(mask(d, hold) for d in adds).clamp(max=1)
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, held at frame {hold} inside the masks in {",".join(adds)}', out],
                       stdin=subprocess.PIPE)
areas = []
for k, cur in enumerate(reader(first, last)):
    f = first + k
    m = grow((held_mask + sum(mask(d, f) for d in adds)).clamp(max=1), GROW)
    if sub: m = m * (1 - grow(mask(sub, f), SUBGROW))
    m = soften(m, FEATHER)
    o = held * m + cur * (1 - m)
    enc.stdin.write(o.permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
    areas.append(f'{f}:{int(m.sum().item())}')
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames held at {hold}; mask area by frame: {" ".join(areas[::10])}')
