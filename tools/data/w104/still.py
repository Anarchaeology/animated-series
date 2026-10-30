# A labelled before/after still: one part frame from several versions side by side (or stacked), optionally cropped.
# Versions: orig (Funcom's file, enlarged plainly with bicubic to 1284x752), starlight, fixed, or FILE@START (another
# render starting at that part frame). usage: still.py OUT.jpg PART FRAME X0,Y0,X1,Y1|full WIDTH ver=Label ...
import sys, subprocess, numpy as np
from PIL import Image, ImageDraw, ImageFont
ff = 'ffmpeg'; W, H = 1284, 752
out, part, frame, box, width = sys.argv[1:6]; frame = int(frame); width = int(width)
def grab(ver):
    path, k, vf = ({'orig': (f'upload/{part}.mov', frame, f'scale={W}:{H}:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709,'),
                    'starlight': (f'upload/{part}_starlight.mov', frame, ''), 'fixed': (f'fixed/{part}_fixed.mov', frame, '')}.get(ver)
                   or (ver.split('@')[0], frame - int(ver.split('@')[1]), ''))
    o = subprocess.run([ff, '-nostdin', '-v', 'error', '-i', path, '-vf', f'select=eq(n\,{k}),{vf}scale=in_color_matrix=bt709:out_color_matrix=bt709,format=rgb24', '-frames:v', '1', '-f', 'rawvideo', '-'], capture_output=True).stdout
    return Image.fromarray(np.frombuffer(o, np.uint8).reshape(H, W, 3))
panels = []
for spec in sys.argv[6:]:
    ver, label = spec.split('=', 1); im = grab(ver)
    if box != 'full': im = im.crop(tuple(map(int, box.split(','))))
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS); panels.append((im, label))
f = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', max(16, width // 32)); pad = max(28, width // 20)
canvas = Image.new('RGB', (sum(p.width for p, _ in panels) + 8 * (len(panels) - 1), panels[0][0].height + pad), (16, 16, 16))
x = 0
for im, label in panels:
    canvas.paste(im, (x, pad)); ImageDraw.Draw(canvas).text((x + 8, (pad - f.size) // 2), label, fill=(240, 240, 240), font=f); x += im.width + 8
canvas.save(out, quality=88); print(out, canvas.size)
