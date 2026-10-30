# A rendered part against Starlight and its previews, frame by frame, streamed: inside each preview's frames the part
# should be that preview; elsewhere, Starlight. Prints the largest difference of each, and the frames that differ by
# more than 16. usage: part_check.py PART PREVIEW FIRST LAST [PREVIEW FIRST LAST ...]
import sys, subprocess, numpy as np
ff = 'PATH/TO/ffmpeg/bin/ffmpeg'; W, H = 1284, 752
part, rest = sys.argv[1], sys.argv[2:]
op = lambda p: subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', p, '-map', '0:v:0', '-vf', 'format=gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
prevs = [(rest[i], int(rest[i + 1]), int(rest[i + 2])) for i in range(0, len(rest), 3)]
fx, st = op(f'fixed/{part}_fixed.mov'), op(f'upload/{part}_starlight.mov')
pvs = {p: op(p) for p, _, _ in prevs}
rd = lambda p: (lambda o: np.frombuffer(o, np.uint8).reshape(H, W).astype(np.int16) if len(o) == W * H else None)(p.stdout.read(W * H))
n, out_max, in_max, bad = 0, 0, 0, []
while True:
    x, s = rd(fx), rd(st)
    if x is None or s is None: break
    hit = [p for p, a, b in prevs if a <= n <= b]
    ref = rd(pvs[hit[0]]) if hit else s
    d = int(np.abs(x - ref).max())
    if hit: in_max = max(in_max, d)
    else: out_max = max(out_max, d)
    if d > 16: ys, xs = np.nonzero(np.abs(x - ref) > 16); bad.append(f"{n} (x {xs.min()}-{xs.max()}, y {ys.min()}-{ys.max()})")
    n += 1
print(f'{part}: {n} frames; outside the previews vs Starlight, largest difference {out_max}; inside vs the previews, {in_max}; frames over 16: {bad[:20]}{" ..." if len(bad) > 20 else ""} ({len(bad)})')
