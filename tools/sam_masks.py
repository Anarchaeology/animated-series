# Masks objects through a stretch of a clip with SAM 2 (Meta's Segment Anything 2.1, large model): clicks or boxes on
# one or more frames say what each object is, and SAM 2 follows it through the stretch, forwards and backwards from the
# prompted frames. Writes OUT_DIR/obj<N>/<frame>.png (8-bit, 255 inside, at the clip's own size; frame = the clip's
# frame number) and OUT_DIR/areas.tsv (each object's area per frame, for spotting where a mask jumps).
# PROMPTS.tsv rows: frame, object (1, 2, ...), kind (+ = this is the object, - = this is not, box), x, y[, x2, y2]
#   (coordinates in the clip's pixels; a box is x,y to x2,y2).
# usage: python -I sam_masks.py FFMPEG_BIN CLIP.mov FIRST LAST PROMPTS.tsv OUT_DIR
import os, sys, subprocess, tempfile, shutil
import numpy as np, torch
from PIL import Image
from sam2.build_sam import build_sam2_video_predictor

bin_dir, clip, first, last, prompts_file, out_dir = sys.argv[1:7]
first, last = int(first), int(last)
here = os.path.dirname(os.path.abspath(__file__))
ckpt = os.path.join(here, 'models', 'sam2.1_hiera_large.pt')

prompts = []
for line in open(prompts_file, encoding='utf-8').read().strip().split('\n'):
    if not line.strip() or line.startswith('#') or line.startswith('frame'):
        continue
    f = line.split('\t')
    prompts.append((int(f[0]), int(f[1]), f[2], [float(v) for v in f[3:]]))

# the stretch's frames as JPEGs named 0.jpg, 1.jpg ... (SAM 2's video loader reads a folder of them), counted from the
# start of the clip, never sought by time
tmp = tempfile.mkdtemp(prefix='sam-')
subprocess.run([os.path.join(bin_dir, 'ffmpeg'), '-nostdin', '-v', 'error', '-i', clip, '-map', '0:v:0',
                '-vf', f'trim=start_frame={first}:end_frame={last + 1}', '-fps_mode', 'passthrough', '-q:v', '2',
                '-start_number', '0', os.path.join(tmp, '%d.jpg')], check=True)
n = len([x for x in os.listdir(tmp) if x.endswith('.jpg')])
assert n == last - first + 1, f'expected {last - first + 1} frames, got {n}'

predictor = build_sam2_video_predictor('configs/sam2.1/sam2.1_hiera_l.yaml', ckpt, device='cuda')
masks = {}  # (object, frame) -> bool array
with torch.inference_mode():
    state = predictor.init_state(video_path=tmp, offload_video_to_cpu=True, offload_state_to_cpu=True)
    by_frame_obj = {}
    for fr, obj, kind, v in prompts:
        by_frame_obj.setdefault((fr, obj), []).append((kind, v))
    for (fr, obj), items in sorted(by_frame_obj.items()):
        pts = [v[:2] for k, v in items if k in '+-']
        labels = [1 if k == '+' else 0 for k, v in items if k in '+-']
        boxes = [v[:4] for k, v in items if k == 'box']
        predictor.add_new_points_or_box(state, frame_idx=fr - first, obj_id=obj,
                                        points=np.array(pts, np.float32) if pts else None,
                                        labels=np.array(labels, np.int32) if pts else None,
                                        box=np.array(boxes[0], np.float32) if boxes else None)
    # forwards from the first prompted frame, then backwards from the last, keeping the forward result where both reach
    for reverse in (False, True):
        for idx, obj_ids, logits in predictor.propagate_in_video(state, reverse=reverse):
            for i, obj in enumerate(obj_ids):
                key = (obj, idx + first)
                if key not in masks:
                    masks[key] = (logits[i, 0] > 0).cpu().numpy()
shutil.rmtree(tmp)

objs = sorted({o for o, _ in masks})
for o in objs:
    os.makedirs(os.path.join(out_dir, f'obj{o}'), exist_ok=True)
with open(os.path.join(out_dir, 'areas.tsv'), 'w', encoding='utf-8') as fh:
    fh.write('frame\t' + '\t'.join(f'obj{o} area' for o in objs) + '\n')
    for fr in range(first, last + 1):
        row = [str(fr)]
        for o in objs:
            m = masks.get((o, fr))
            if m is None:
                m = np.zeros_like(next(iter(masks.values())))
            Image.fromarray((m * 255).astype(np.uint8)).save(os.path.join(out_dir, f'obj{o}', f'{fr}.png'))
            row.append(str(int(m.sum())))
        fh.write('\t'.join(row) + '\n')
print(f'{os.path.basename(clip)} frames {first}-{last}: {len(objs)} objects masked into {out_dir}')
