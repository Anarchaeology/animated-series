# How much of the picture the fixes changed: every fixed part against its Starlight render, frame by frame, at half
# size; a pixel counts as changed where the luma difference, averaged over 5x5 pixels (so re-encoding noise, which
# flickers pixel to pixel, averages away), is 3 levels or more. Parts are cut as in the series master (101-103's end
# credits left out). Prints per part and in all, and writes changed_share.tsv.
import subprocess, os, sys, numpy as np
ff = sys.argv[1]; W, H = 642, 376
man = [l.rstrip('\n').split('\t') for l in open('upload/upload_manifest.tsv', encoding='utf-8')][1:]
cut = {'06 aoe101e': 1622, '11 aoe102e': 1070, '14 aoe103c': 1728}
rd = lambda p: subprocess.Popen([ff, '-nostdin', '-v', 'error', '-i', p, '-map', '0:v:0', '-vf', f'scale={W}:{H}:flags=area,format=gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
def box(a, r=2):
    c = np.cumsum(np.cumsum(np.pad(a, ((r + 1, r), (r + 1, r))), 0), 1)
    return (c[2 * r + 1:, 2 * r + 1:] - c[:-2 * r - 1, 2 * r + 1:] - c[2 * r + 1:, :-2 * r - 1] + c[:-2 * r - 1, :-2 * r - 1]) / (2 * r + 1) ** 2
out = open('tools/data/w104/changed_share.tsv', 'w'); out.write('part\tframes\tframes_changed\tpixel_share_changed\n')
T = C = F = 0
for r in man:
    n = r[0][:-4]; frames = cut.get(n, int(r[4])); T += frames
    fx = f'fixed/{n}_fixed.mov'
    if not os.path.exists(fx): out.write(f'{n}\t{frames}\t0\t0\n'); continue
    a, b = rd(fx), rd(f'upload/{n}_starlight.mov'); ch = 0.0; fc = 0
    for k in range(frames):
        x = np.frombuffer(a.stdout.read(W * H), np.uint8).reshape(H, W).astype(np.float32); y = np.frombuffer(b.stdout.read(W * H), np.uint8).reshape(H, W).astype(np.float32)
        m = (box(np.abs(x - y)) >= 3).mean(); ch += m; fc += m > 0
    a.kill(); b.kill(); C += ch; F += fc
    out.write(f'{n}\t{frames}\t{fc}\t{ch / frames:.6f}\n'); print(n, frames, 'frames;', fc, 'with a change;', f'{100 * ch / frames:.3f}% of their pixels', flush=True)
out.write(f'series\t{T}\t{F}\t{C / T:.6f}\n'); out.close()
print(f'series: {T} frames, {F} with a change ({100 * F / T:.1f}%); {100 * C / T:.3f}% of all pixels changed')
