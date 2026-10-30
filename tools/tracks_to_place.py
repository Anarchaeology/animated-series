# Turns point_tracks.py tracks of a shirt print into logo_composite.js --place keyframes: for each frame, the affine
# move (turn, scale, squeeze, slant, shift) that best carries the points' positions on the anchor frame to where they
# are now (visible points only, least squares, points more than TOL px off refitted without), applied to the word's
# placement on the anchor frame. So the anchor frame keeps the placement it was given, and every other frame follows
# the print. Frames with fewer than MIN visible points are left out (logo_composite.js then moves in a straight line
# between the frames either side). MIN=all uses every point, hidden ones too (where CoTracker3 says they would be), for a
# rough placement through a turn that a --mesh does the real work in. Prints the --place value; also writes OUT.tsv
# with the fit per frame.
#   --similar: turn, scale and shift only (the word keeps the anchor's shape), for a print on cloth that flexes and a
#     dim, blurred shot where a full affine fit chases the tracker's noise (102's B14)
#   --tol=PX: how far off a point may be and still count (default 2); when fewer than MIN would be left, the MIN
#     closest are kept instead
#   --smooth=S: the placement steadied over time, a Gaussian of S frames
# usage: python -I tracks_to_place.py TRACKS.tsv POINTS ANCHOR_FRAME CX,CY,W,ANG[,SQUEEZE[,SHEAR]] FIRST LAST OUT.tsv
#        [MIN=8|all] [--similar] [--tol=2] [--smooth=0]
#   POINTS: the track ids of the print's points, A-B, or several such ranges joined by commas (as point_tracks.py
#     numbered them)
import sys, math
import numpy as np

opt = dict((a[2:].split('=') + [''])[:2] for a in sys.argv[1:] if a.startswith('--'))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
tracks_file, pts_arg, anchor, place0, first, last, out_file = args[:7]
use_all = len(args) > 7 and args[7] == 'all'
min_pts = 8 if len(args) <= 7 or use_all else int(args[7])
similar, tol, smooth = 'similar' in opt, float(opt.get('tol') or 2), float(opt.get('smooth') or 0)
wanted = set()
for r in pts_arg.split(','):
    a, b = (r.split('-') + [r])[:2]
    wanted.update(range(int(a), int(b) + 1))
anchor, first, last = int(anchor), int(first), int(last)
v0 = [float(v) for v in place0.split(',')] + [1, 0][len(place0.split(',')) - 4:]
cx0, cy0, w0, ang0, q0, sh0 = v0[:6]

pos = {}
for line in open(tracks_file, encoding='utf-8').read().strip().split('\n')[1:]:
    f, p, x, y, vis = line.split('\t')
    f, p = int(f), int(p)
    if p in wanted:
        pos[(f, p)] = (float(x), float(y), int(vis))

# the word's shape as a linear map, the same way logo_composite.js's fitOf builds it (less its fixed reference scale):
# rows c/q, s/q and -s - k c, c - k s, over the width
def shape_of(w, ang, q, sh):
    t, k = math.radians(ang), math.tan(math.radians(sh))
    c, s = math.cos(t), math.sin(t)
    return np.array([[c / q, s / q], [-s - k * c, c - k * s]]) / w

def place_of(B):
    t = math.atan2(B[0, 1], B[0, 0]); c, s = math.cos(t), math.sin(t)
    inv_w = B[1, 0] * -s + B[1, 1] * c
    w = 1 / inv_w
    k = -(B[1, 0] * c + B[1, 1] * s) * w
    q = 1 / (w * math.hypot(B[0, 0], B[0, 1]))
    return w, math.degrees(t), q, math.degrees(math.atan(k))

def fit(src, dst):   # -> M (3x2) with dst = [src 1] @ M
    if not similar:
        M, *_ = np.linalg.lstsq(np.c_[src, np.ones(len(src))], dst, rcond=None)
        return M
    # x' = a x - b y + tx, y' = b x + a y + ty
    A = np.zeros((2 * len(src), 4)); A[0::2] = np.c_[src[:, 0], -src[:, 1], np.ones(len(src)), np.zeros(len(src))]
    A[1::2] = np.c_[src[:, 1], src[:, 0], np.zeros(len(src)), np.ones(len(src))]
    a, b, tx, ty = np.linalg.lstsq(A, dst.reshape(-1), rcond=None)[0]
    return np.array([[a, b], [-b, a], [tx, ty]])

B0 = shape_of(w0, ang0, q0, sh0)
ref = {p: pos[(anchor, p)][:2] for p in sorted(wanted) if (anchor, p) in pos}
got, rows = {}, {}
for f in range(first, last + 1):
    ids = [p for p in ref if (f, p) in pos and (use_all or pos[(f, p)][2])]
    if len(ids) < min_pts:
        rows[f] = f'{f}\t{len(ids)}\t\t\t\t\t\t\t'
        continue
    for _ in range(4):
        src = np.array([ref[p] for p in ids]); dst = np.array([pos[(f, p)][:2] for p in ids])
        M = fit(src, dst)
        res = np.hypot(*(np.c_[src, np.ones(len(src))] @ M - dst).T)
        keep = [p for p, r in zip(ids, res) if r <= tol]
        if len(keep) < min_pts:
            keep = [p for _, p in sorted(zip(res, ids))[:min_pts]]
        if len(keep) == len(ids):
            break
        ids = keep
    L = M[:2].T                                              # shot positions on the anchor frame -> on this frame
    w, ang, q, sh = place_of(B0 @ np.linalg.inv(L))
    cx, cy = np.array([cx0, cy0, 1]) @ M
    got[f] = np.array([cx, cy, w, ang, q, sh])
    rows[f] = (len(ids), res.max())
if smooth > 0:
    fs = sorted(got); arr = np.array([got[f] for f in fs])
    for f in fs:
        wts = np.exp(-(np.array(fs) - f) ** 2 / (2 * smooth ** 2)) * (np.abs(np.array(fs) - f) <= 3 * smooth)
        got[f] = (wts[:, None] * arr).sum(0) / wts.sum()
keys = []
for f in range(first, last + 1):
    if f not in got:
        continue
    cx, cy, w, ang, q, sh = got[f]
    keys.append(f'{f}:{cx:.2f},{cy:.2f},{w:.1f},{ang:.2f},{q:.3f},{sh:.2f}')
    n, worst = rows[f]
    rows[f] = f'{f}\t{n}\t{worst:.2f}\t{cx:.2f}\t{cy:.2f}\t{w:.1f}\t{ang:.2f}\t{q:.3f}\t{sh:.2f}'
with open(out_file, 'w', encoding='utf-8') as fh:
    fh.write('frame\tpoints used\tworst miss (px)\tcx\tcy\twidth\tangle\tsqueeze\tslant\n' + '\n'.join(rows[f] for f in range(first, last + 1)) + '\n')
print(';'.join(keys))
