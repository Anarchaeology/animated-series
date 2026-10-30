# Measures how Starlight's own (misspelled) logo drifts against a tracks_to_mesh.py mesh, and writes it as
# logo_composite.js --meshshift keys: per frame, the centre of Starlight's logo colour (green for Bronto Burger, or
# --color=orange) inside CROP, minus where the mesh carries that same centre from the anchor frame; smoothed over
# SMOOTH frames so the logo follows the slow drift but not Starlight's frame-to-frame flicker, plus EXTRA (a nudge of
# your own). Prints the keys (every 5 frames) and writes OUT.tsv with the raw and smoothed offsets.
# usage: python -I mesh_drift.py FFMPEG_BIN CLIP.mov FIRST LAST MESH.tsv ANCHOR X,Y,W,H OUT.tsv [SMOOTH=15] [EXTRA=0,0] [--color=green|orange]
import sys, subprocess
import numpy as np

opt = dict((a[2:].split('=') + [''])[:2] for a in sys.argv[1:] if a.startswith('--'))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
bin_dir, clip, first, last, mesh_file, anchor, crop, out_file = args[:8]
smooth = float(args[8]) if len(args) > 8 else 15
extra = np.array([float(v) for v in (args[9] if len(args) > 9 else '0,0').split(',')])
first, last, anchor = int(first), int(last), int(anchor)
cx0, cy0, cw, ch = map(int, crop.split(','))
N = last - first + 1

raw = subprocess.run([bin_dir + '/ffmpeg', '-v', 'error', '-i', clip, '-map', '0:v:0', '-vf',
                      f'trim=start_frame={first}:end_frame={last + 1},setpts=PTS-STARTPTS,crop={cw}:{ch}:{cx0}:{cy0},scale=in_color_matrix=bt709:in_range=tv,format=rgb24',
                      '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, ch, cw, 3).astype(float)
ys, xs = np.mgrid[:ch, :cw]
star = []
for f in frames:
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    w = np.clip((r - b - 40) if opt.get('color') == 'orange' else (g - np.maximum(r, b) - 25), 0, None)
    star.append(((w * xs).sum() / w.sum() + cx0, (w * ys).sum() / w.sum() + cy0) if w.sum() > 200 else (np.nan, np.nan))
star = np.array(star)

mesh = {}
for l in open(mesh_file, encoding='utf-8').read().strip().split('\n')[1:]:
    f, i, j, x, y = l.split('\t')[:5]; mesh.setdefault(int(f), {})[(int(i), int(j))] = (float(x), float(y))
cols = 1 + max(i for i, _ in mesh[anchor]); rows = 1 + max(j for _, j in mesh[anchor])
def carry(p, f):   # p on the anchor frame -> the same spot of the mesh on frame f (barycentric in its triangle)
    A, B = mesh[anchor], mesh[f]
    for j in range(rows - 1):
        for i in range(cols - 1):
            for tri in (((i, j), (i + 1, j), (i, j + 1)), ((i + 1, j), (i + 1, j + 1), (i, j + 1))):
                (ax, ay), (bx, by), (qx, qy) = [A[t] for t in tri]
                d = (bx - ax) * (qy - ay) - (qx - ax) * (by - ay)
                l1 = ((p[0] - ax) * (qy - ay) - (qx - ax) * (p[1] - ay)) / d; l2 = ((bx - ax) * (p[1] - ay) - (p[0] - ax) * (by - ay)) / d
                if min(l1, l2, 1 - l1 - l2) >= -1e-6:
                    P = [np.array(B[t]) for t in tri]; return P[0] * (1 - l1 - l2) + P[1] * l1 + P[2] * l2
    return np.array([np.nan, np.nan])
c0 = star[anchor - first]
off = star - np.array([carry(c0, first + k) for k in range(N)])
ok = ~np.isnan(off[:, 0]); ks = np.arange(N)
sm = np.zeros_like(off)
for k in range(N):
    w = np.exp(-(ks[ok] - k) ** 2 / (2 * smooth ** 2)); sm[k] = (w[:, None] * off[ok]).sum(0) / w.sum()
sm += extra
with open(out_file, 'w', encoding='utf-8') as fh:
    fh.write('frame\tdx\tdy\tsmoothed dx\tsmoothed dy\n' + '\n'.join(f'{first + k}\t{off[k,0]:.2f}\t{off[k,1]:.2f}\t{sm[k,0]:.2f}\t{sm[k,1]:.2f}' for k in range(N)) + '\n')
print(';'.join(f'{first + k}:{sm[k,0]:.2f},{sm[k,1]:.2f}' for k in list(range(0, N, 5)) + [N - 1]))
