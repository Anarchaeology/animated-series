# Brings something into focus gradually instead of cutting from soft to sharp: inside a feathered oval (keyframed as
# apply_fixes.js's ellipses, F:cx,cy,rx,ry;..., full strength in its inner 55%), the clip is blurred (Gaussian) by a
# sigma keyframed per frame (--sigma=F:S;F:S..., straight lines between keys, eased), and left as it is outside. For
# 104's BABOONS at 2:15 (17 aoe104c), where Starlight's print is softened 3 px during the camera move (BB1s) and the new
# word then came in sharp over 3 frames: the word now comes in under the same 3 px and sharpens over 12 frames.
# --clipfirst=N: the part frame CLIP's first frame is (a fix source that starts partway). Writes ProRes 422 HQ,
# BT.709, like the other fix sources.
# usage: python -I focus_pull.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mov --oval=KEYS --sigma=KEYS [--clipfirst=0]
import os, sys, subprocess
import numpy as np, torch

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, out = args[:5]
first, last, CF = int(first), int(last), int(opt.get('clipfirst', 0))
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')
keys = lambda s: sorted((int(f), list(map(float, v.split(',')))) for f, v in (k.split(':') for k in s.split(';')))
OVAL, SIG = keys(opt['oval']), keys(opt['sigma'])

def at(ks, f, ease=False):
    if f <= ks[0][0]: return ks[0][1]
    for (fa, a), (fb, b) in zip(ks, ks[1:]):
        if f <= fb:
            t = (f - fa) / (fb - fa); t = t * t * (3 - 2 * t) if ease else t
            return [x + (y - x) * t for x, y in zip(a, b)]
    return ks[-1][1]

def blur(t, s):
    r = int(3 * s + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * s * s)); k /= k.sum()
    t = t[:, None]
    t = torch.nn.functional.conv2d(torch.nn.functional.pad(t, (r, r, 0, 0), mode='replicate'), k.view(1, 1, 1, -1))
    return torch.nn.functional.conv2d(torch.nn.functional.pad(t, (0, 0, r, r), mode='replicate'), k.view(1, 1, -1, 1))[:, 0]

yy, xx = torch.meshgrid(torch.arange(H, device=dev, dtype=torch.float32) + 0.5, torch.arange(W, device=dev, dtype=torch.float32) + 0.5, indexing='ij')
p = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                      f'trim=start_frame={first - CF}:end_frame={last + 1 - CF},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                      '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, focus pulled: sigma {opt["sigma"]} inside {opt["oval"]}', out],
                       stdin=subprocess.PIPE)
for f in range(first, last + 1):
    img = torch.from_numpy(np.frombuffer(p.stdout.read(W * H * 6), np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)
    s = at(SIG, f, ease=True)[0]
    if s > 0.05:
        cx, cy, rx, ry = at(OVAL, f)
        a = ((1 - torch.hypot((xx - cx) / rx, (yy - cy) / ry)) / 0.45).clamp(0, 1)
        img = blur(img, s) * a + img * (1 - a)
    enc.stdin.write(img.permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
p.stdout.close(); p.wait(); enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames')
