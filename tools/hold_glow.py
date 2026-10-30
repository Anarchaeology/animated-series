# Holds a small piece of glowing detail that Starlight keeps losing and redrawing, for a still camera: 104's neon
# sign behind the bartender (16 aoe104b 1109-1243), whose "&" needs its little tail to the right to read as an "&"
# and not a "6"; Starlight shows it on some frames only. The detail is what the --ref frames (averaged) have and the
# --without frame doesn't (brighter by more than --thresh in any channel, inside --box), grown --grow px and feathered
# --feather px; each frame is then lightened towards the ref there (the brighter of the two, per channel), so where
# the detail already shows nothing changes. Skin (warm, lit: the bartender's hand passing in front) is left alone.
# Writes ProRes 422 HQ, BT.709, like the other fix sources.
# usage: python -I hold_glow.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mov --ref=A-B --without=F --box=X0,Y0,X1,Y1
#        [--thresh=8] [--grow=3] [--feather=2]
import os, sys, subprocess
import numpy as np, torch

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, out = args[:5]
first, last = int(first), int(last)
R0, R1 = map(int, opt['ref'].split('-')); WO = int(opt['without']); X0, Y0, X1, Y1 = map(int, opt['box'].split(','))
TH, GROW, FEATHER = float(opt.get('thresh', 8)), int(opt.get('grow', 3)), float(opt.get('feather', 2))
W, H = 1284, 752
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
ff = os.path.join(bin_dir, 'ffmpeg')
rd = lambda a, b: subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                                    f'trim=start_frame={a}:end_frame={b + 1},setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb48le',
                                    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
frame = lambda p: torch.from_numpy(np.frombuffer(p.stdout.read(W * H * 6), np.uint16).reshape(H, W, 3).astype(np.float32)).permute(2, 0, 1).to(dev)

p = rd(R0, R1); ref = sum(frame(p) for _ in range(R1 - R0 + 1)) / (R1 - R0 + 1); p.stdout.close(); p.wait()
p = rd(WO, WO); wo = frame(p); p.stdout.close(); p.wait()
m = torch.zeros(H, W, device=dev)
m[Y0:Y1, X0:X1] = ((ref - wo)[:, Y0:Y1, X0:X1].max(0).values > TH * 257).float()
if GROW: m = torch.nn.functional.max_pool2d(m[None, None], 2 * GROW + 1, 1, GROW)[0, 0]
r = int(3 * FEATHER + 0.5); x = torch.arange(-r, r + 1, dtype=torch.float32, device=dev); k = torch.exp(-x * x / (2 * FEATHER * FEATHER)); k /= k.sum()
m = torch.nn.functional.conv2d(torch.nn.functional.conv2d(m[None, None], k.view(1, 1, 1, -1), padding=(0, r)), k.view(1, 1, -1, 1), padding=(r, 0))[0, 0]
print(f'detail: {int((m > 0.5).sum())} px, box {X0},{Y0}-{X1},{Y1}')

p = rd(first, last)
enc = subprocess.Popen([ff, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-framerate', '30000/1001',
                        '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv422p10le',
                        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-metadata', f'comment=frames {first}-{last} of {os.path.basename(clip)}, glow held from {R0}-{R1} (not in {WO}) inside {X0},{Y0}-{X1},{Y1}', out],
                       stdin=subprocess.PIPE)
for f in range(first, last + 1):
    img = frame(p); rr, gg, bb = img[0] / 257, img[1] / 257, img[2] / 257
    skin = ((rr > 90) & (gg > 0.45 * rr) & (rr > bb)).float()
    a = m * (1 - skin)
    enc.stdin.write((img + (torch.maximum(img, ref) - img) * a).permute(1, 2, 0).clamp(0, 65535).round().cpu().numpy().astype(np.uint16).tobytes())
p.stdout.close(); p.wait(); enc.stdin.close(); enc.wait()
print(f'{os.path.basename(out)}: {last - first + 1} frames')
