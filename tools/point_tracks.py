# Follows points through a stretch of a clip with CoTracker3 (Meta, offline model): each point is given on one frame
# and tracked forwards and backwards through the whole stretch, all points together, with a flag for when it's hidden.
# Writes OUT.tsv: frame, point, x, y, visible (clip pixels; frame = the clip's frame number).
# QUERIES: one or more of F:X,Y (a point on frame F) or F:X0,Y0,X1,Y1,STEP (a grid over that box), joined by ';'.
# The model works at 512x384 internally, so positions are good to about a pixel at full size.
# usage: python -I point_tracks.py FFMPEG_BIN CLIP.mov FIRST LAST OUT.tsv QUERIES
import os, sys, subprocess
import numpy as np, torch
from cotracker.predictor import CoTrackerPredictor

bin_dir, clip, first, last, out_file, query_arg = sys.argv[1:7]
first, last = int(first), int(last)
here = os.path.dirname(os.path.abspath(__file__))

probe = subprocess.run([os.path.join(bin_dir, 'ffprobe'), '-v', 'error', '-select_streams', 'v', '-show_entries',
                        'stream=width,height', '-of', 'csv=p=0', clip], capture_output=True, text=True, check=True)
W, H = map(int, probe.stdout.strip().split(','))
raw = subprocess.run([os.path.join(bin_dir, 'ffmpeg'), '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0',
                      '-vf', f'trim=start_frame={first}:end_frame={last + 1}', '-fps_mode', 'passthrough',
                      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
T = len(raw) // (W * H * 3)
assert T == last - first + 1, f'expected {last - first + 1} frames, got {T}'

queries = []
for q in query_arg.split(';'):
    fr, rest = q.split(':')
    v = [float(x) for x in rest.split(',')]
    if len(v) == 2:
        queries.append((int(fr) - first, v[0], v[1]))
    else:
        x0, y0, x1, y1, step = v
        for y in np.arange(y0, y1 + 1e-6, step):
            for x in np.arange(x0, x1 + 1e-6, step):
                queries.append((int(fr) - first, x, y))

model = CoTrackerPredictor(checkpoint=os.path.join(here, 'models', 'cotracker3_scaled_offline.pth'), offline=True,
                           window_len=60).cuda()
# frames go in at the model's working size (it would shrink them to that anyway), which keeps the video small on the GPU
video = torch.from_numpy(np.frombuffer(bytearray(raw), np.uint8).reshape(T, H, W, 3)).permute(0, 3, 1, 2)
small = torch.nn.functional.interpolate(video.float(), size=tuple(model.interp_shape), mode='bilinear', align_corners=True)
sx, sy = (model.interp_shape[1] - 1) / (W - 1), (model.interp_shape[0] - 1) / (H - 1)
qt = torch.tensor([[t, x * sx, y * sy] for t, x, y in queries], dtype=torch.float32)[None].cuda()
with torch.inference_mode():
    tracks, vis = model(small[None].cuda(), queries=qt, backward_tracking=True)
tracks, vis = tracks[0].cpu().numpy(), vis[0].cpu().numpy()
with open(out_file, 'w', encoding='utf-8') as fh:
    fh.write('frame\tpoint\tx\ty\tvisible\n')
    for t in range(T):
        for p in range(len(queries)):
            fh.write(f'{t + first}\t{p}\t{tracks[t, p, 0] / sx:.2f}\t{tracks[t, p, 1] / sy:.2f}\t{int(vis[t, p] > 0.5)}\n')
print(f'{os.path.basename(clip)} frames {first}-{last}: {len(queries)} points tracked into {os.path.basename(out_file)}')
