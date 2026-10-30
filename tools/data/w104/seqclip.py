# Review clip: the same stretch of a part shown several times in a row, full frame, each labelled, with the part's
# original sound under each. usage: python seqclip.py FFMPEG PART FIRST LAST OUT.mp4 LABEL=PATH@START ...
# (PATH@START: the file and the part frame its first frame is; Starlight renders and the original start at 0)
import sys, subprocess
ff, part, first, last, out = sys.argv[1:6]; first, last = int(first), int(last)
items = [a.split('=', 1) for a in sys.argv[6:]]
font = "fontfile='C\\:/Windows/Fonts/arial.ttf'"
def lab(t):
    t = t.replace("'", "").replace('%', ' percent').replace(':', '\\:')
    return (f"drawtext={font}:text='{t}':x=14:y=12:fontsize=30:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=6,"
            f"drawtext={font}:text='frame %{{eif\\:n+{first}\\:d}}':x=w-text_w-14:y=12:fontsize=30:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=6")
args = [ff, '-nostdin', '-v', 'error', '-y']; fc = []
for i, (label, spec) in enumerate(items):
    path, start = spec.rsplit('@', 1); start = int(start)
    args += ['-i', path]
    fc.append(f'[{i}:v]trim=start_frame={first - start}:end_frame={last + 1 - start},setpts=PTS-STARTPTS,setsar=1,{lab(label)}[v{i}]')
args += ['-i', f'upload/{part}.mov']; n = len(items)
t0, t1 = first * 1001 / 30000, (last + 1) * 1001 / 30000
fc.append(f'[{n}:a]atrim=start={t0:.6f}:end={t1:.6f},asetpts=PTS-STARTPTS,asplit={n}' + ''.join(f'[a{i}]' for i in range(n)) if n > 1 else
          f'[{n}:a]atrim=start={t0:.6f}:end={t1:.6f},asetpts=PTS-STARTPTS[a0]')
fc.append(''.join(f'[v{i}][a{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=1[vv][au];[vv]format=yuv420p[v]')
args += ['-filter_complex', ';'.join(fc), '-map', '[v]', '-map', '[au]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
         '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]
subprocess.run(args, check=True, stdin=subprocess.DEVNULL)
import os; fr = subprocess.run([os.path.join(os.path.dirname(ff), 'ffprobe'), '-v', 'error', '-select_streams', 'v', '-count_frames', '-show_entries', 'stream=nb_read_frames',
                     '-of', 'csv=p=0', out], capture_output=True, text=True).stdout.strip()
print(f'{out}: {fr} frames (expected {(last - first + 1) * n})')
