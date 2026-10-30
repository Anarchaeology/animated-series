# Draws sam_masks.py masks and point_tracks.py tracks over a stretch of a clip, full frame, for judging them by eye:
# each mask's edge in cyan over a light tint, visible points as yellow dots (with a short trail), hidden ones as dim
# red, and the frame number. Writes an H.264 MP4 at the clip's size.
# usage: python -I track_overlay.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.mp4 [--masks=DIR] [--tracks=TSV] [--slow=N]
import os, sys, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--'))
bin_dir, clip, first, last, out = args
first, last, slow = int(first), int(last), int(opt.get('slow', 1))

probe = subprocess.run([os.path.join(bin_dir, 'ffprobe'), '-v', 'error', '-select_streams', 'v', '-show_entries',
                        'stream=width,height', '-of', 'csv=p=0', clip], capture_output=True, text=True, check=True)
W, H = map(int, probe.stdout.strip().split(','))
reader = subprocess.Popen([os.path.join(bin_dir, 'ffmpeg'), '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0',
                           '-vf', f'trim=start_frame={first}:end_frame={last + 1}', '-fps_mode', 'passthrough',
                           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
writer = subprocess.Popen([os.path.join(bin_dir, 'ffmpeg'), '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo',
                           '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-framerate', f'{30000 / slow}/1001', '-i', '-',
                           '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)

mask_dirs = []
if 'masks' in opt:
    mask_dirs = [os.path.join(opt['masks'], d) for d in sorted(os.listdir(opt['masks'])) if d.startswith('obj')]
tracks = {}
if 'tracks' in opt:
    for line in open(opt['tracks'], encoding='utf-8').read().strip().split('\n')[1:]:
        f, p, x, y, v = line.split('\t')
        tracks.setdefault(int(f), []).append((int(p), float(x), float(y), int(v)))
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 20)

for fr in range(first, last + 1):
    img = np.frombuffer(reader.stdout.read(W * H * 3), np.uint8).reshape(H, W, 3).astype(np.float32)
    for d in mask_dirs:
        m = np.asarray(Image.open(os.path.join(d, f'{fr}.png'))) > 127
        img[m] = img[m] * 0.8 + np.array([0, 90, 110]) * 0.2
        edge = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
        img[edge] = [0, 230, 255]
    pic = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(pic)
    for p, x, y, v in tracks.get(fr, []):
        if v:
            trail = [(px, py) for g in range(max(first, fr - 6), fr + 1) for (q, px, py, pv) in tracks.get(g, []) if q == p and pv]
            if len(trail) > 1:
                draw.line(trail, fill=(255, 200, 0), width=1)
            draw.ellipse([x - 2.5, y - 2.5, x + 2.5, y + 2.5], fill=(255, 230, 0))
        else:
            draw.ellipse([x - 1.5, y - 1.5, x + 1.5, y + 1.5], fill=(150, 40, 40))
    draw.text((10, 8), f'{os.path.basename(clip)}  frame {fr}', font=font, fill=(255, 255, 0))
    for _ in range(slow):
        writer.stdin.write(pic.tobytes())
writer.stdin.close()
writer.wait()
print(f'{os.path.basename(out)}: frames {first}-{last}')
