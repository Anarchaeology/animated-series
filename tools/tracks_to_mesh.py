# Turns a grid of point_tracks.py tracks (one F:X0,Y0,X1,Y1,STEP query) into a mesh for logo_composite.js --mesh:
# each grid point's position in every frame, hidden or not (CoTracker3 still says where a hidden point would be: on a
# print turning away round her chest, squeezed against the edge), steadied over time with a Gaussian of SIGMA frames.
# Writes OUT.tsv: frame, i (column), j (row), x, y, visible (0-1: the tracker's hidden/visible flag, steadied over
# VSIGMA frames, so the word can fade where the print has gone out of sight without flickering).
# --below=N adds N rows under the grid, carried on in a straight line from the last two (each frame), for a print that
# runs off the bottom of the frame on the anchor frame, where no point could be placed (102's B26); they're marked
# visible like the row above them.
# usage: python -I tracks_to_mesh.py TRACKS.tsv FIRST_ID COLUMNS ROWS OUT.tsv [SIGMA=1] [VSIGMA=2] [--below=N]
import sys
import numpy as np

below = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--below=')), 0))
sys.argv = [a for a in sys.argv if not a.startswith('--')]
tracks_file, first_id, cols, rows, out_file = sys.argv[1:6]
first_id, cols, rows = int(first_id), int(cols), int(rows)
sigma = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
vsigma = float(sys.argv[7]) if len(sys.argv) > 7 else 2.0

data = {}
for line in open(tracks_file, encoding='utf-8').read().strip().split('\n')[1:]:
    f, p, x, y, v = line.split('\t')
    p = int(p) - first_id
    if 0 <= p < cols * rows:
        data[(int(f), p)] = (float(x), float(y), int(v))
frames = sorted({f for f, _ in data})
T, P = len(frames), cols * rows
xy = np.array([[data[(f, p)][:2] for p in range(P)] for f in frames])     # T x P x 2
vis = np.array([[data[(f, p)][2] for p in range(P)] for f in frames], dtype=float)

def steady(a, s):   # Gaussian over time (axis 0), the ends held
    if s <= 0:
        return a
    r = int(np.ceil(3 * s)); w = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * s ** 2))
    pad = np.concatenate([np.repeat(a[:1], r, 0), a, np.repeat(a[-1:], r, 0)])
    return sum(w[d] * pad[d:d + len(a)] for d in range(2 * r + 1)) / w.sum()

xy, vis = steady(xy, sigma), steady(vis, vsigma)
for _ in range(below):
    last, prev = xy[:, -cols:], xy[:, -2 * cols:-cols]
    xy = np.concatenate([xy, 2 * last - prev], 1); vis = np.concatenate([vis, vis[:, -cols:]], 1)
P = xy.shape[1]
with open(out_file, 'w', encoding='utf-8') as fh:
    fh.write('frame\ti\tj\tx\ty\tvisible\n')
    for t, f in enumerate(frames):
        for p in range(P):
            fh.write(f'{f}\t{p % cols}\t{p // cols}\t{xy[t, p, 0]:.2f}\t{xy[t, p, 1]:.2f}\t{vis[t, p]:.3f}\n')
print(f'{cols}x{rows} mesh over {T} frames into {out_file}')
