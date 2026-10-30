# A feel-for-it clip of the join between two episodes without the first one's end credits: the end of one part up
# to the cut (its fixed render, else Starlight), its sound faded out from FADE to the cut, then the start of the next
# part. usage: join_clip.py OUT.mp4 A_PART A_FIRST A_CUT A_FADE B_PART B_FIRST B_LAST
import sys, os, subprocess
ff = 'PATH/TO/ffmpeg/bin/ffmpeg'
out, ap, a0, a1, af, bp, b0, b1 = sys.argv[1:9]; a0, a1, af, b0, b1 = map(int, (a0, a1, af, b0, b1))
vid = lambda p: f'fixed/{p}_fixed.mov' if os.path.exists(f'fixed/{p}_fixed.mov') else f'upload/{p}_starlight.mov'
t = lambda n: n * 1001 / 30000
fc = (f'[0:v]trim=start_frame={a0}:end_frame={a1 + 1},setpts=PTS-STARTPTS,setsar=1[va];'
      f'[1:v]trim=start_frame={b0}:end_frame={b1 + 1},setpts=PTS-STARTPTS,setsar=1[vb];'
      f'[2:a]atrim=start={t(a0):.6f}:end={t(a1 + 1):.6f},asetpts=PTS-STARTPTS,afade=t=out:st={t(af - a0):.6f}:d={t(a1 + 1 - af):.6f}[aa];'
      f'[3:a]atrim=start={t(b0):.6f}:end={t(b1 + 1):.6f},asetpts=PTS-STARTPTS[ab];'
      '[va][aa][vb][ab]concat=n=2:v=1:a=1[v][a]')
subprocess.run([ff, '-nostdin', '-v', 'error', '-y', '-i', vid(ap), '-i', vid(bp), '-i', f'upload/{ap}.mov', '-i', f'upload/{bp}.mov',
                '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', out], check=True)
print(f'{out}: {a1 - a0 + 1} + {b1 - b0 + 1} frames')
