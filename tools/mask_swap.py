# Lays another render into a shot through masks that follow what they cover: inside each frame's mask (sam_masks.py
# folders, <frame>.png, one or more, grown --grow px and feathered --feather px), the pixels come from SOURCE, a
# frame-aligned render of the same stretch (e.g. a Proteus render of it), everywhere else from CLIP. At full strength
# right up to the mask's edge, unlike apply_fixes.js's ovals, whose strength falls off over their outer 45%, too much
# for small heads (103's Radiman and Ross at the window, where Starlight's faces showed through). SOURCE starts at
# frame SRC_FIRST of the part (default FIRST). In floating point on the GPU; writes ProRes 422 HQ, BT.709, like the
# other fix sources.
# usage: python -I mask_swap.py FFMPEG_BIN CLIP.mov SOURCE.mov FIRST LAST OUT.mov --masks=DIR[,DIR...] [--grow=2]
#        [--feather=1.5] [--srcfirst=N]
import os, sys, subprocess
import numpy as np, torch
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, source, first, last, out = args[:6]
first, last = int(first), int(last)
GROW, FEATHER, SRCFIRST = int(opt.get('grow', 2)), float(opt.get('feather', 1.5)), int(opt.get('srcfirst', first))
dirs = opt['masks'].split(',')
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')

def reader(path, a, b):
    p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', path, '-map', '0:v:0', '-vf',
                          f'trim=start_frame={a}:end_frame={b + 1},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                          '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    for _ in range(b - a + 1):
        buf = p.stdout.read(W * H * 6)
        if len(buf) < W * H * 6: raise RuntimeError(f'{path} ended early')
        yield torch.from_numpy(np.frombuffer(buf, np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    p.stdout.close(); p.wait()

def soften(m, s):
    if s <= 0: return m
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    m = torch.nn.functional.conv2d(m[None, None], k.view(1, 1, 1, -1), padding=(0, r))
    return torch.nn.functional.conv2d(m, k.view(1, 1, -1, 1), padding=(r, 0))[0, 0]

enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, {os.path.basename(source)} inside the masks in {",".join(dirs)}', out],
                       stdin=subprocess.PIPE)
for k, (cur, src) in enumerate(zip(reader(clip, first, last), reader(source, first - SRCFIRST, last - SRCFIRST))):
    m = torch.zeros(H, W, device=dev)
    for d in dirs:
        m = torch.maximum(m, torch.from_numpy((np.array(Image.open(os.path.join(d, f'{first + k}.png'))) > 127).astype(np.float32)).to(dev))
    if GROW > 0: m = torch.nn.functional.max_pool2d(m[None, None], 2 * GROW + 1, 1, GROW)[0, 0]
    a = soften(m, FEATHER)
    enc.stdin.write((src * a + cur * (1 - a)).permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames')
