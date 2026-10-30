# Tools

The scripts that made the files in this project, plus the small tables they depend on. Each script explains what it
does at the top and ends that comment with a `usage:` line. Every folder is passed in as an argument, so nothing
depends on where the scripts live.

What you need:

- Node.js (made with v24).
- ffmpeg, Gyan's full build 9.0.2 (`winget install Gyan.FFmpeg`). The scripts take the folder that holds
  `ffmpeg.exe`.
- For Proteus renders only: Topaz Video, whose own ffmpeg `proteus_render.js` uses
  (`C:\Program Files\Topaz Labs LLC\Topaz Video`).

The examples below run from the project folder in Git Bash, with:

```bash
FF="PATH/TO/ffmpeg/bin"
```

## Re-making Episode 101's fixes

**1. Logo composites.** Each writes `upload/02 aoe101b_logo-LNN (frames A-B).mov`. The folder named just before the
options gets that shot's tracking tables. The reference logo is L12 (`03 aoe101c-1` Starlight frame 400).

```bash
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "03 aoe101c-1" 400 "02 aoe101b" 854 892 tools/data/logo/L01 --redmode=orig --align=centroid --name=logo-L01
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "03 aoe101c-1" 400 "02 aoe101b" 1122 1205 tools/data/logo/L02 --guard --redmode=orig --fade=2 --align=centroid --name=logo-L02
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "03 aoe101c-1" 400 "02 aoe101b" 1473 1612 tools/data/logo/L04 --redmode=orig --align --name=logo-L04
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "03 aoe101c-1" 400 "02 aoe101b" 5303 5424 tools/data/logo/L07 --redmode=orig --align --name=logo-L07
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "03 aoe101c-1" 400 "02 aoe101b" 5477 5562 tools/data/logo/L08 --guard --fade=2 --redmode=orig --align --name=logo-L08
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "03 aoe101c-1" 400 "02 aoe101b" 6007 6407 tools/data/logo/L10 --lockshape=6110-6330 --redmode=orig --align --alignblur=4 --alignsmooth=30 --name=logo-L10
```

**Episode 102's BABOONS shirt.** Every shot listed in `data/baboons_runs.tsv` (id, part, frames, options) gets the
clean word from `09 aoe102c` frame 6701. The same tool does it with `--color=orange`, plus each shot's search box and
options. The main options:

- `--trackon=starlight`: for small or dim lettering the original barely shows, track Starlight's own misspelled but
  well-placed word instead.
- `--shape`: fix the word's shape outright (straight, or tilted for the overhead shots).
- `--clean`: paint out Starlight's word first.
- `--persist`: keep trying after a bad frame.
- `--hold`: keep a still shot's word in place behind her hand.
- `--maxbright`: ignore a sunlit wall.

Give ids or a part to redo just those:

```bash
sh tools/run_baboons.sh "$FF"
sh tools/run_baboons.sh "$FF" B05 B09a
```

**Other patches.** U9 paints out the nebula streak; U10 fills the sky showing through Eleena's hair; U12 replaces the
one-frame glitch at `02` frame 230 with a blend of its neighbours; U14 mirrors the outer 3 columns over the light line
at the left edge in the hologram close-ups; U13b holds the robot's clean head (fixed frame 2218) until the close-up.
Make U13b's still after part 05 has been fixed with U13 only up to 2218, which it is: the still is taken from the
fixed part itself.

```bash
node --max-old-space-size=8192 tools/line_remove.js "$FF" upload "01 aoe101a" 990 1100 tools/data/nebula_line/keys.tsv tools/data/nebula_line
node --max-old-space-size=8192 tools/hair_fill.js "$FF" upload "02 aoe101b" 5825 5880 120,0,640,400 tools/data/hair_fill --maxarea=900 --only=sky --hold=5866-5880 --holdblur=5 --fadeout=5872-5877
ENC="-c:v prores_ks -profile:v 3 -vendor apl0 -quant_mat hq -bits_per_mb 1350 -pix_fmt yuv422p10le -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -r 30000/1001"
"$FF/ffmpeg" -i "upload/02 aoe101b_starlight.mov" -vf "select='eq(n,229)+eq(n,231)',setpts=N/TB,format=yuv422p10le,tblend=all_mode=average" -frames:v 1 $ENC "upload/02 aoe101b_flashfix (frames 230-230).mov"
"$FF/ffmpeg" -i "upload/02 aoe101b_starlight.mov" -vf "trim=start_frame=2293:end_frame=4177,setpts=PTS-STARTPTS,fillborders=left=3:mode=mirror" $ENC "upload/02 aoe101b_edgefix (frames 2293-4176).mov"
"$FF/ffmpeg" -i "fixed/05 aoe101d_fixed.mov" -vf "select='eq(n,2218)',loop=loop=33:size=1:start=0,setpts=N/FRAME_RATE/TB" -frames:v 34 $ENC "upload/05 aoe101d_robothold (frames 2219-2252).mov"
```

**2. Apply the fix list.** This writes `fixed/<part>_fixed.mov` and `<part>_mask.tsv`. Name the parts to redo, or
leave them off to redo every part in the list.

```bash
node --max-old-space-size=8192 tools/apply_fixes.js "$FF" upload review/fixes_101.tsv fixed "02 aoe101b"
```

**3. Review clip of one shot.** Original, Starlight and fixed side by side, with the frame number.

```bash
node tools/make_shot_clip.js "$FF" upload fixed "02 aoe101b" 753 892 "L01   logo fixed from the hitch at frame 854" "review/logo shots/L01.mp4"
```

**4. Join an episode** into a lossless master. The picture is copied frame for frame, with the original sound trimmed
to each part's length, chapters and BT.709 tags; the tool then proves every frame and sample matches:

```bash
node tools/make_episode.js "$FF" upload fixed 101 "final/Episode 101 - Tricks and Treats (master).mov"
node tools/make_episode.js "$FF" upload fixed 104 "final/Episode 104 - Dust to Dust (master).mov"   # (30 Oct, built twice: after the first round of notes and again after round two; parts checked first with data/w104/part_check.py)
```

**Proteus renders** (all 18 parts at detail 20, as listed in `data/proteus_jobs.tsv`):

```bash
node tools/proteus_render.js "PROJECT/upload" tools/data/proteus_jobs.tsv "PROJECT/upload"   # (full paths: it runs from Topaz's folder)
```

## Masks and point tracks (SAM 2, CoTracker3)

These two models from Meta run here on the GPU (RTX 2070 Super, 8 GB):
- **SAM 2.1** masks an object through a shot from a few clicks.
- **CoTracker3** follows points through a shot.

They run from a Python environment in `tools/.venv` (4.4 GB): Python 3.12, PyTorch 2.11 with CUDA 12.8, and sam2 and
cotracker from their GitHub repositories. Their weights are in `tools/models/` (1 GB): `sam2.1_hiera_large.pt` and
`cotracker3_scaled_offline.pth`. To rebuild it if it's lost:

```bash
"$LOCALAPPDATA/Programs/Python/Python312/python.exe" -m venv tools/.venv
tools/.venv/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
SAM2_BUILD_CUDA=0 tools/.venv/Scripts/python -m pip install git+https://github.com/facebookresearch/sam2.git
tools/.venv/Scripts/python -m pip install git+https://github.com/facebookresearch/co-tracker.git
curl -L -o tools/models/sam2.1_hiera_large.pt https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
curl -L -o tools/models/cotracker3_scaled_offline.pth https://huggingface.co/facebook/cotracker3/resolve/main/scaled_offline.pth
```

(Output folders for the Python scripts should have short paths: Windows refuses very long ones there.)

**First use: 102's alley turn (29 Oct).** The data is in `data/sam/`:
- Her shirt was masked from clicks at 6318 and 6400.
- The print was tracked from point grids at 6318 and 6482.
- The tracks were turned into placements, and both composites were re-made.

```bash
P=tools/.venv/Scripts/python; T=tools/data/sam
$P -I tools/sam_masks.py "$FF" "upload/08 aoe102b_starlight.mov" 6318 6482 $T/alley_shirt_prompts.tsv $T/alley_shirt
$P -I tools/point_tracks.py "$FF" "upload/08 aoe102b_starlight.mov" 6318 6482 $T/alley_print_tracks.tsv \
  "6318:515,392,645,428,10;6318:500,330,720,570,30;6482:595,360,715,390,10"
$P -I tools/tracks_to_place.py $T/alley_print_tracks.tsv 0-55 6318 582.30,411.45,103.1,0.00,0.996,-0.23 6318 6385 \
  $T/alley_place_B09a.tsv > $T/alley_place_B09a.txt
$P -I tools/tracks_to_place.py $T/alley_print_tracks.tsv 128-179 6482 653.30,378.43,90.2,0,1.000,-1.50 6430 6482 \
  $T/alley_place_B09b.tsv > $T/alley_place_B09b.txt
```

Then `logo_composite.js` runs with B09a's and B09b's options from `data/baboons_runs.tsv`, changed as follows:
- `--place` is replaced by the tracked keys: 6318-6359 and 6452-6482. Outside those ranges, too few of the print's
  points are visible.
- `--occludeseq=tools/data/sam/alley_shirt/obj1` is added.
- `--name=baboons-B09a-tracked` (or B09b) is added.

The trial fix table is `review/trial_alley_tracked.tsv`.

**Second trial: the whole turn with no fade or blur (29 Oct).** The word is bent along a tracked mesh instead of one
affine fit, so it squeezes and wraps round her chest:
- The print was re-tracked with grids covering the whole word and its glow: 18x7 points at 6318 and 16x7 at 6482.
- Each grid became a mesh: the outgoing one anchored at 6318, the return one at 6482. Each carries the word from
  your approved placement there.
- The two meshes hand over at 6400-6411, while the word is a sliver at her chest edge.

```bash
$P -I tools/point_tracks.py "$FF" "upload/08 aoe102b_starlight.mov" 6318 6482 $T/alley_mesh_tracks.tsv \
  "6318:500,380,670,440,10;6318:500,330,720,570,30;6482:580,350,730,410,10"
$P -I tools/tracks_to_mesh.py $T/alley_mesh_tracks.tsv 0 18 7 $T/alley_mesh_A.tsv
$P -I tools/tracks_to_mesh.py $T/alley_mesh_tracks.tsv 198 16 7 $T/alley_mesh_B.tsv
$P -I tools/tracks_to_place.py $T/alley_mesh_tracks.tsv 0-125 6318 582.30,411.45,103.1,0.00,0.996,-0.23 6318 6430 \
  $T/alley_meshplace_A.tsv all > $T/alley_meshplace_A.txt
$P -I tools/tracks_to_place.py $T/alley_mesh_tracks.tsv 198-309 6482 653.30,378.43,90.2,0,1.000,-1.50 6390 6482 \
  $T/alley_meshplace_B.tsv all > $T/alley_meshplace_B.txt
```

Then `logo_composite.js` runs twice: as `baboons-mesh-A` for 6318-6430, and as `baboons-mesh-B` for 6390-6482.
Each run takes B09a's (or B09b's) options from `data/baboons_runs.tsv`, minus `--place`, `--fadeout` and `--fadein`,
plus:
- `--gainkeys=6318:1.8` (or `6482:1.8`): your approved brightness. Over the whole turn, `--steadygain` would average
  in the bright smear frames.
- `--cleanwide`
- `--cleankeys="6362:1;6372:0"` (or `"6446:0;6452:1"`): the paint-out eases off where Starlight's print is an
  unreadable smear anyway.
- `--wordkeys="6366:1;6374:0"` (or `"6446:0;6452:1"`): the word melts into Starlight's glow as the print turns
  into a smear, and stays off while she's turned away. Without it, the end of the word (its S) peeked round her chest
  edge both ways (your notes, 29 Oct).
- For the way back only:
  - `--cleanpad=12`: keeps the paint-out off a warm highlight by her collar.
- `--place="$(cat $T/alley_meshplace_A.txt)"` (or B)
- `--mesh=$T/alley_mesh_A.tsv --meshanchor=6318` (or B and 6482)
- `--occludeseq=$T/alley_shirt/obj1`

Triangles stretched past 1.6 times their anchor size (`--meshstretch`, default) are lost grid points and aren't
drawn. The trial fix table is `review/trial_alley_mesh.tsv`.

**The word coming back, gentler (29 Oct, evening; `ease20` picked, row B09m-back).** Your note: at 4:53-4:54, as she turns back, the return
of the word flashes. Starlight's print there is thick, full orange strokes; ours is finer, with more shirt showing.
Measured on her shirt (red over blue past 40, summed), Starlight's orange climbs from 73 to 177 over 6446-6460. Ours
dipped to 51 at 6450 and only then climbed to 124: the paint-out and the word came in together over 6 frames. Two
staggered hand-overs, the word earlier and the paint-out later and slower, so the orange only grows. Both are mesh-B
with different keys: `ease12` has `--wordkeys="6440:0;6452:1" --cleankeys="6448:0;6466:1"`, and `ease20` has
`--wordkeys="6436:0;6456:1" --cleankeys="6450:0;6474:1"`. Neither gets dimmer from frame to frame (the old one did
for 4 frames, by up to 7.6). The trial fix tables are `review/trial_alley_ease12.tsv` and `_ease20.tsv`.

```bash
opts=$(awk -F'\t' '$1=="B09b"{print $5}' tools/data/baboons_runs.tsv | tr ' ' '\n' | grep -v '^--place=\|^--fadeout=\|^--fadein=' | paste -sd' ')
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "08 aoe102b" 6390 6482 tools/data/logo/mesh-B-ease20 --color=orange --refbox=600,600,900,720 --name=baboons-mesh-B-ease20 $opts --gainkeys=6482:1.8 --cleanwide --cleanpad=12 --cleankeys="6450:0;6474:1" --wordkeys="6436:0;6456:1" --place="$(cat $T/alley_meshplace_B.txt)" --mesh=$T/alley_mesh_B.tsv --meshanchor=6482 --occludeseq=$T/alley_shirt/obj1
```

(`ease12` is the same with its own keys and names.) Review: `review/fix shots 102/baboons/17+18 alley turn - word
coming back - now, 12, 20.mp4`.

The two runs exactly as made (29 Oct; rows B09m-out and B09m-back in `review/fixes_102.tsv`):

```bash
opts() { awk -F'\t' -v id=$1 '$1==id{print $5}' tools/data/baboons_runs.tsv | tr ' ' '\n' | grep -v '^--place=\|^--fadeout=\|^--fadein=' | paste -sd' '; }
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "08 aoe102b" 6318 6430 tools/data/logo/mesh-A --color=orange --refbox=600,600,900,720 --name=baboons-mesh-A $(opts B09a) --gainkeys=6318:1.8 --cleanwide --cleankeys="6362:1;6372:0" --wordkeys="6366:1;6374:0" --place="$(cat $T/alley_meshplace_A.txt)" --mesh=$T/alley_mesh_A.tsv --meshanchor=6318 --occludeseq=$T/alley_shirt/obj1
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "08 aoe102b" 6390 6482 tools/data/logo/mesh-B --color=orange --refbox=600,600,900,720 --name=baboons-mesh-B $(opts B09b) --gainkeys=6482:1.8 --cleanwide --cleanpad=12 --cleankeys="6446:0;6452:1" --wordkeys="6446:0;6452:1" --place="$(cat $T/alley_meshplace_B.txt)" --mesh=$T/alley_mesh_B.tsv --meshanchor=6482 --occludeseq=$T/alley_shirt/obj1
```

**B26 with a mesh (29 Oct, trial).** For 11:58-12:00, which was blurred because the old composite's tracking showed:
- Her shirt was masked from clicks at 3387 and 3433.
- The print was tracked with a 21x9 grid at 3387 (plus a coarse grid over the shirt).
- The composite uses B26's own options (the B26 line at the end of this file). It anchors on its own fit at 3387, with
  `--mesh=$T/b26_mesh.tsv --meshanchor=3387 --occludeseq=$T/b26_shirt/obj1 --cleanwide --refedge=4,1.5 --name=baboons-B26-mesh`
  (the full command is the last line below; row B26m in `review/fixes_102.tsv`).
- `--refedge` matters here. The reference print at 2687 runs off the bottom of its frame, so its lower-left corner
  is missing. Without the option, that corner showed as a triangular hole once the print rose in the shot (your note,
  29 Oct). The print also runs off the bottom of the anchor frame (3387), so the mesh gets three
  extrapolated rows below (`--below=3`). In the corner the reference never had, Starlight's own print shows instead,
  softened 1.5 px (`--refedge=4,1.5`): its letters there are misspelled, and that matches the blur you'd approved for
  this shot.
- The trial fix table is `review/trial_b26_mesh.tsv`.

```bash
$P -I tools/sam_masks.py "$FF" "upload/10 aoe102d_starlight.mov" 3387 3456 $T/b26_shirt_prompts.tsv $T/b26_shirt
$P -I tools/point_tracks.py "$FF" "upload/10 aoe102d_starlight.mov" 3387 3456 $T/b26_tracks.tsv "3387:460,670,660,750,10;3387:250,520,650,740,40"
$P -I tools/tracks_to_mesh.py $T/b26_tracks.tsv 0 21 9 $T/b26_mesh.tsv --below=3
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "10 aoe102d" 2687 "10 aoe102d" 3387 3456 tools/data/logo/B26-mesh --color=orange --refbox=440,665,650,752 --refoff=14 --refgain=4 --orangeoff=14 --orangegain=4 --search=360,630,700,752 --trackon=starlight --patchcut=0.02,0.08 --soft=0.3 --gainkeys="3387:1.08;3392:1.0;3397:0.88;3402:0.76;3407:0.66;3412:0.59;3417:0.54;3456:0.54" --clean --cleanoff=8 --cleancore=16 --cleanfill=local --cleanwide --refedge=4,1.5 --mesh=$T/b26_mesh.tsv --meshanchor=3387 --occludeseq=$T/b26_shirt/obj1 --name=baboons-B26-mesh
```

**B27, the quick shot before B26 (29 Oct, evening; picked, row B27m).** 10 aoe102d 3149-3205 (11:50.6-11:52.5 in the master):
her profile in the ship again, just after the cut to the ship's exterior. It's the same set-up as B26 (and the same
reference, frame 2687), with the print running off the bottom of the frame:
- **Masks:** her shirt, from clicks at 3150 and 3205.
- **Mesh:** a 19x10 grid over the print at 3150, with three extrapolated rows below.
- **Composite:** B26's options, except `--steadygain` in place of B26's gain keys. The gain comes out at 0.75, which
  puts the print's most orange pixels at 90% of Starlight's (B26's approved version: 92%).

```bash
$P -I tools/sam_masks.py "$FF" "upload/10 aoe102d_starlight.mov" 3149 3205 $T/ship_shirt_prompts.tsv $T/ship_shirt
$P -I tools/point_tracks.py "$FF" "upload/10 aoe102d_starlight.mov" 3149 3205 $T/ship_tracks.tsv "3150:420,660,600,750,10;3150:200,520,600,740,40"
$P -I tools/tracks_to_mesh.py $T/ship_tracks.tsv 0 19 10 $T/ship_mesh.tsv --below=3
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "10 aoe102d" 2687 "10 aoe102d" 3149 3205 tools/data/logo/B27-mesh --color=orange --refbox=440,665,650,752 --refoff=14 --refgain=4 --orangeoff=14 --orangegain=4 --search=360,630,700,752 --trackon=starlight --patchcut=0.02,0.08 --soft=0.3 --steadygain --clean --cleanoff=8 --cleancore=16 --cleanfill=local --cleanwide --refedge=4,1.5 --mesh=$T/ship_mesh.tsv --meshanchor=3150 --occludeseq=$T/ship_shirt/obj1 --name=baboons-B27-mesh
```

The trial fix table is `review/trial_b27_mesh.tsv`. Review: `review/fix shots 102/baboons/24b B27 ship quick shot -
now, then fixed (11.48-12.00).mp4` and `- side by side.mp4`.

**B14 tracked (29 Oct, trial).** For 09 aoe102c 1240-1298, the dim truck shot that was blurred 5 px:
- **Masks:** her shirt was masked as before, and her hand separately (SAM 2 takes one object per run here; two at once
  hits a precision error). `data/sam/b14_shirt_nohand/` is the shirt minus the hand grown 4 px.
- **Tracking:** a 31x11 grid over the print at 1280.
- **Placement:** only the points over the word, with turn, scale and shift only, smoothed over 2 frames. The cloth
  flexes and the shot is dim, so a full fit wobbled. The anchor at 1280 (966,478, width 172, 7 degrees) was measured
  from Starlight's own lettering. The tool's detector misses this dim print, and 172 px gives 7 letters the size of
  Starlight's 8.
- **Brightness:** a steady `--gainkeys=1240:0.22`, matched by eye to Starlight's letters. The measured gain is thrown
  by the dark shirt around them.
- **Fades:** the word and the paint-out come in over 1243-1249 and go over 1290-1296, as Starlight's print does.

```bash
PTS=$(for r in 3 4 5 6 7 8 9; do printf '%d-%d,' $((r*31+8)) $((r*31+27)); done | sed 's/,$//')
$P -I tools/point_tracks.py "$FF" "upload/09 aoe102c_starlight.mov" 1240 1298 $T/b14_tracks.tsv "1280:800,420,1100,520,10;1280:780,400,1120,640,40"
$P -I tools/tracks_to_place.py $T/b14_tracks.tsv "$PTS" 1280 966,478,172,7 1240 1298 $T/b14_place.tsv 8 --similar --tol=3 --smooth=2 > $T/b14_place.txt
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "09 aoe102c" 1240 1298 tools/data/logo/B14-tracked   --color=orange --refbox=600,600,900,720 --search=780,400,1120,560 --trackon=starlight --orangeoff=22 --orangegain=4 --shape=1,0,0,1   --protect --clean --cleanoff=15 --cleancore=25 --cleanfill=local --cleanwide --patchcut=0.3,0.5 --motionblur=0.5 --gainkeys="1240:0.22"   --wordkeys="1243:0;1249:1;1290:1;1296:0" --cleankeys="1243:0;1249:1;1290:1;1296:0" --place="$(cat $T/b14_place.txt)"   --occludeseq=$T/b14_shirt_nohand --name=baboons-B14-tracked
```

The trial fix table is `review/trial_b14_tracked.tsv`.

**B23 tracked (29 Oct; picked, row B23t).** For 08 aoe102b 5933-6317 (4:37 in the master, far, behind the cookie stand), where
the approved word grew and shrank by up to 3 px and rocked up to 10 degrees on its own against her chest:
- **Masks:** her shirt, from clicks at 5940 and 6290 (`data/sam/b23_shirt_prompts.tsv`).
- **Tracking:** an 11x5 grid over the print at 5940 (points 0-54), a coarse grid over the shirt, and an 11x5 grid at
  6290.
- **Placement:** from the print points only, with turn, scale and shift only, steadied over 3 frames. The anchor at
  5940 is centred on Starlight's print, 3 px left of the old word, and 35 wide against 32.7.
- **Composite:** B23's own options minus `--place`, plus `--occludeseq` and `--lettersonly` for the whole shot.
- **Corner by her arm (your note on the first try, 6312):** her arm throws a warm glow onto the shirt at the armpit,
  just above-left of the word. The paint-out took it for lettering inside its box and left it outside, which made a
  straight-edged dark corner. Now `--cleanfeather=4` (new) eases the paint-out off over the last 4 px of its box, and
  `--cleanpad=7` (was 4) reaches Starlight's first letter. The shirt masks are grown 3 px (`data/sam/b23_shirt_grow3`)
  so the paint-out isn't cut at SAM's edge, 2 px short of the print; `--protect` still keeps it off her lit arm. The
  first try is kept as `upload/08 aoe102b_baboons-B23-tracked1 (frames 5933-6317).mov`.

```bash
$P -I tools/sam_masks.py "$FF" "upload/08 aoe102b_starlight.mov" 5933 6317 $T/b23_shirt_prompts.tsv $T/b23_shirt
$P -I tools/point_tracks.py "$FF" "upload/08 aoe102b_starlight.mov" 5933 6317 $T/b23_tracks.tsv "5940:787,334,827,350,4;5940:780,320,850,390,10;6290:789,342,829,358,4"
$P -I tools/tracks_to_place.py $T/b23_tracks.tsv 0-54 5940 805.8,341.0,35.0,-1.1 5933 6317 $T/b23_place.tsv 8 --similar --tol=2 --smooth=3 > $T/b23_place.txt
$P -I - <<'EOF'
import os, numpy as np, torch
from PIL import Image
src, dst = 'tools/data/sam/b23_shirt/obj1', 'tools/data/sam/b23_shirt_grow3'
os.makedirs(dst, exist_ok=True)
for f in range(5933, 6318):
    m = torch.from_numpy(np.array(Image.open(f'{src}/{f}.png')).astype(np.float32))[None, None]
    Image.fromarray(torch.nn.functional.max_pool2d(m, 7, 1, 3)[0, 0].numpy().astype(np.uint8)).save(f'{dst}/{f}.png')
EOF
opts=$(awk -F'\t' '$1=="B23"{print $5}' tools/data/baboons_runs.tsv | tr ' ' '\n' | grep -v '^--place=\|^--cleanpad=' | paste -sd' ')
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "08 aoe102b" 5933 6317 tools/data/logo/B23-tracked --color=orange --refbox=600,600,900,720 --name=baboons-B23-tracked $opts --cleanpad=7 --cleanfeather=4 --place="$(cat $T/b23_place.txt)" --occludeseq=$T/b23_shirt_grow3 --lettersonly=5933-6317
```

(The first try had the ungrown masks, `--occludeseq=$T/b23_shirt/obj1`, and B23's own `--cleanpad=4`, no feather.)

Review: `review/fix shots 102/baboons/16 B23 - first try, then corner fixed.mp4`, `- tracked, corner fixed.mp4`,
`- corner by her arm, close-up (brightened).png`; the first try's clips are named `... first try ...`. Not in
`fixes_102.tsv` unless picked.

**L02 (Episode 101) with a mesh (29 Oct, trial).** The logo is carried through her turn (1110-1210) on a 20x12 grid
tracked from 1170. The run is L02's own command (`--guard --redmode=orig --align=centroid`, with the anchor's fit from
its own tracking) plus `--hold --mesh=$T/l02_mesh.tsv --meshanchor=1170 --occludeseq=$T/l02_shirt/obj1`, named
`logo-L02-mesh`. The trial fix table is `review/trial_l02_mesh.tsv`; the row is L02m in `review/fixes_101.tsv`. Her
shirt is masked from the clicks in `data/sam/l02_shirt_prompts.tsv` (all at 1170):

```bash
$P -I tools/sam_masks.py "$FF" "upload/02 aoe101b_starlight.mov" 1110 1210 $T/l02_shirt_prompts.tsv $T/l02_shirt
$P -I tools/point_tracks.py "$FF" "upload/02 aoe101b_starlight.mov" 1110 1210 $T/l02_tracks.tsv "1170:590,225,780,335,10;1170:560,180,860,540,40"
$P -I tools/tracks_to_mesh.py $T/l02_tracks.tsv 0 20 12 $T/l02_mesh.tsv
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "03 aoe101c-1" 400 "02 aoe101b" 1110 1210 tools/data/logo/L02-mesh --guard --redmode=orig --align=centroid --hold --mesh=$T/l02_mesh.tsv --meshanchor=1170 --occludeseq=$T/l02_shirt/obj1 --name=logo-L02-mesh
```

**L10 (Episode 101) with a mesh (29 Oct, trial).** A coarse 7x4 grid is tracked from 6160 and made into a mesh,
steadied over only 1 frame so it doesn't trail her moves. Starlight's own logo drifts 1.5-3 px left of the tracked
points over the shot, so the mesh follows that drift (`mesh_drift.py`, smoothed over 15 frames, plus 1 px left).
Starlight's logo is also wider on the left than ours while the camera is close (its capital "B" against our
lowercase "b"), so the paint-out is on. It now knows green, and its thresholds are low for this dim logo.
The camera starts closer, so triangles may grow to 3 times their anchor size:

```bash
$P -I tools/point_tracks.py "$FF" "upload/02 aoe101b_starlight.mov" 6007 6407 $T/l10_tracks.tsv "6160:630,385,750,445,20;6160:600,340,780,600,30"
$P -I tools/tracks_to_mesh.py $T/l10_tracks.tsv 0 7 4 $T/l10_mesh.tsv 1
$P -I tools/mesh_drift.py "$FF" "upload/02 aoe101b_starlight.mov" 6007 6345 $T/l10_mesh.tsv 6160 560,240,240,320 $T/l10_drift.tsv 15 -1,0 > $T/l10_shift.txt
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "03 aoe101c-1" 400 "02 aoe101b" 6007 6407 tools/data/logo/L10-mesh   --lockshape=6110-6330 --redmode=orig --align --alignblur=4 --alignsmooth=30 --clean --cleanoff=8 --cleancore=18 --cleanfill=local   --cleanwide --mesh=$T/l10_mesh.tsv --meshanchor=6160 --meshstretch=3 --meshshift="$(cat $T/l10_shift.txt)" --name=logo-L10-mesh
```

The trial fix table is `review/trial_l10_mesh.tsv`.

**V4's viewscreen insert (29 Oct).** A plain ffmpeg crop, not a script:

```bash
ffmpeg -i "upload/07 aoe102a (titles cut)_starlight.mov" -map 0:v -vf "trim=start_frame=1495:end_frame=1563,setpts=PTS-STARTPTS,crop=514:301:770:22,scale=1284:752:flags=lanczos,setsar=1,format=yuv422p10le"   -fps_mode passthrough -c:v prores_ks -profile:v 3 -vendor apl0 -quant_mat hq -bits_per_mb 1350 -colorspace bt709 -color_primaries bt709   -color_trc bt709 -color_range tv "upload/07 aoe102a (titles cut)_viewscreen-V4 (frames 900-967).mov"
```

**U17's dark head (Episode 101, 29 Oct).** Starlight blurred 2 px, each channel 60% itself and 40% the grey of all
three, all times 0.7:

```bash
k=0.70; ffmpeg -i "upload/02 aoe101b_starlight.mov" -map 0:v -vf "trim=start_frame=516:end_frame=578,setpts=PTS-STARTPTS,gblur=sigma=2,format=gbrp,colorchannelmixer=rr=$k*0.6+0.4*$k*0.33:rg=0.4*$k*0.33:rb=0.4*$k*0.33:gr=0.4*$k*0.33:gg=$k*0.6+0.4*$k*0.33:gb=0.4*$k*0.33:br=0.4*$k*0.33:bg=0.4*$k*0.33:bb=$k*0.6+0.4*$k*0.33,format=yuv422p10le"   -fps_mode passthrough -c:v prores_ks -profile:v 3 -vendor apl0 -quant_mat hq -bits_per_mb 1350 "upload/02 aoe101b_darkhead70 (frames 516-577).mov"
```

**U16's chessboard stand-in (Episode 101, 29 Oct).** The chessboard shot from 4:47 (`02 aoe101b` 2342-2520, 179
frames) taken from part 02 as fixed (so it carries U4b's Proteus hologram and U14's edge fix), its first frame held 18
frames to fill Ross's 197-frame desk shot. Make it after part 02 has been fixed:

```bash
"$FF/ffmpeg" -i "fixed/02 aoe101b_fixed.mov" -map 0:v -vf "trim=start_frame=2342:end_frame=2521,setpts=PTS-STARTPTS,tpad=start=18:start_mode=clone,format=yuv422p10le" -fps_mode passthrough -c:v prores_ks -profile:v 3 -vendor apl0 -quant_mat hq -bits_per_mb 1350 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv "upload/03 aoe101c-1_chessboard (frames 3027-3223).mov"
```

**U18's slow pull-out (Episode 101, 29 Oct).** Frame 4143 of part 03 as fixed (U5's soft oval is already on it there),
198 frames, eased from 1.10x to 1.0 about Ross (444,450), so the last held frame is frame 4143 itself and the shot
plays on from there. Like U13b, the still comes from the fixed part itself; U18 covers only 3945-4142, so frame 4143
is the same before and after U18 goes in. `upload/03 aoe101c-1_rossstill (frames 3945-4142).mov` is the plain held
frame, kept for comparison (not in the fix table).

```bash
tools/.venv/Scripts/python -I tools/still_zoom.py "$FF" "fixed/03 aoe101c-1_fixed.mov" 4143 198 "upload/03 aoe101c-1_rosshold (frames 3945-4142).mov" 1.10,1.0 444,450
```

**102's desk-scene hair (HF1-HF7, 28 Oct).** Pockets of wall showing through her hair in the seven close-ups of the
desk scene (`09 aoe102c`), filled with hair colour. `--hair=14` because the wall behind her is only 20-50 bright;
`--headonly` keeps it to gaps against her head. Writes `upload/09 aoe102c_hairfill-H1 (frames 6267-6369).mov` and so
on: hairfill-H1, hairfill-H2, hairfill-H3, hairfill-H4, hairfill-H5, hairfill-H6, hairfill-H7.

```bash
for r in "H1 6267 6369" "H2 6603 6780" "H3 6931 7121" "H4 7329 7423" "H5 7858 7885" "H6 8072 8174" "H7 8477 8635"; do set -- $r
  node --max-old-space-size=4096 tools/hair_fill.js "$FF" upload "09 aoe102c" $2 $3 560,40,1000,205 tools/data/hair_fill_102 --maxarea=600 --hair=14 --headonly --name=hairfill-$1
done
```

## Episode 103

**Ross standing at his desk (29 Oct; approved, row R2).** 13 aoe103b 1454-1958 (0:48.5-1:05.3 in the part). Ross stands with his
back to us and doesn't move. Starlight's version of him changes anyway:
- from about 1540, the hand at his side glows like a flame;
- from about 1585, his coat gets a grid of lit windows;
- from about 1640, he's one of the city's towers, with a red flag for a head.

He's held as he is at 1470 for the whole shot (`mask_hold.py`, new). The mask is SAM 2's mask of him, both at 1470 and
in each frame, so the tower is covered too. The bald man walking to the window (masked separately) stays in front: he
crosses Ross's right side at 1498-1510 and 1562-1574. The clicks are in `data/sam/r103_ross_prompts.tsv` and
`r103_bald_prompts.tsv`.

```bash
$P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" 1454 1958 $T/r103_ross_prompts.tsv $T/r103_ross
$P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" 1454 1958 $T/r103_bald_prompts.tsv $T/r103_bald
$P -I tools/mask_hold.py "$FF" "upload/13 aoe103b_starlight.mov" 1454 1958 1470 "upload/13 aoe103b_rosshold (frames 1454-1958).mov" --add=$T/r103_ross/obj1 --sub=$T/r103_bald/obj1 --grow=3 --subgrow=1 --feather=1.5
```

Review: `review/fix shots 103/Ross standing at his desk - held.mp4` (and `- held, side by side.mp4`). Approved (29 Oct).

**Ross seated at his desk (29 Oct; picked, row R1).** 13 aoe103b 775-931 (0:25.9-0:31.1), the same camera on the office, Ross
small in his chair. Starlight gives him black hair, a face that changes from frame to frame (glowing eyes at 830) and,
from about 830, glowing hands. Ross has light grey hair (his close-up at 640).

The fix: his head and hands are held as they are at 780, the shot's first clean frame, with the hair recoloured grey.
- **The hair:** `recolor_region.py` (new) recolours the dark pixels of three boxes at 780 (the hair cap and both
  sides of his head) towards rgb 58,51,44, keeping their shading. That's about as light as his face there, as in the
  close-up, where his hair is as bright as his skin but grey. The chair and the sky aren't in the boxes.
- **The hold:** `paste_patch.py` (new) lays that frame over every frame, inside an oval over his head (649.5,452,
  8x13) and two over his hands. It fades out with the dissolve to the corridor, which runs straight from 901 to 931
  (measured as each frame's mix of 899 and 955).

```bash
D=tools/data/sam/r103_desk
$P -I tools/recolor_region.py "$FF" "upload/13 aoe103b_starlight.mov" 780 $D/ross780_greyhair.npy --boxes="644,440,655,443;643,444,645,451;652,444,655,451" --target=58,51,44 --dark=30,50 --preview=$D/ross780_greyhair_preview.png
$P -I tools/paste_patch.py "$FF" "upload/13 aoe103b_starlight.mov" 775 931 "upload/13 aoe103b_rossdesk (frames 775-931).mov" --patch=$D/ross780_greyhair.npy:$D/headhands780.png:0,0 --weightkeys="901:1;931:0" --feather=1
```

The masks:
- `headhands780.png`: the head oval plus `hands780.png`, ovals (635,489) 7x7 and (655.5,488.5) 7.5x7.

Review: `review/fix shots 103/Ross at his desk - Starlight, then fixed.mp4`, `- side by side.mp4` and `- close-up
(5x, brightened).png`.

Turned down (your call, 29 Oct): his head taken from the standing shot (the back of his head, frame 1470, rows
399-419, moved 12,42), with the hands as above. Source `upload/13 aoe103b_rossdesk-pastedhead (frames 775-931).mov`;
its clips are named `... (head from 0-48, turned down) ...`. It was made with
`--patch=780:$D/hands780.png:0,0 --patch=1470:$D/head1470.png:12,42:0.942,0.881,0.991`.

**Ross at the window, a face on the back of his head (29 Oct; picked, row R3).** 13 aoe103b 2180-2578 (1:12.7-1:26.0). He walks
from his desk to the window, and from about 2255 Starlight shows him facing us, sunglasses and all, though he has his
back to us. Done as 101's U17 (your pick there, "dark 70"): inside an oval that follows his head, Starlight is blurred
2 px, pulled 60% toward grey and darkened to 70%, fading in over 2250-2258. The oval (9x11) follows SAM 2's mask of
him: the centre of its top 14 rows, 9 px below its top, averaged over 7 frames, keyed every 6 frames.

```bash
$P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" 2250 2578 $T/r103_walk_prompts.tsv $T/r103_walk
k=0.70; "$FF/ffmpeg" -i "upload/13 aoe103b_starlight.mov" -map 0:v -vf "trim=start_frame=2250:end_frame=2579,setpts=PTS-STARTPTS,gblur=sigma=2,format=gbrp,colorchannelmixer=rr=$k*0.6+0.4*$k*0.33:rg=0.4*$k*0.33:rb=0.4*$k*0.33:gr=0.4*$k*0.33:gg=$k*0.6+0.4*$k*0.33:gb=0.4*$k*0.33:br=0.4*$k*0.33:bg=0.4*$k*0.33:bb=$k*0.6+0.4*$k*0.33,format=yuv422p10le" -fps_mode passthrough -c:v prores_ks -profile:v 3 -vendor apl0 -quant_mat hq -bits_per_mb 1350 "upload/13 aoe103b_darkhead70 (frames 2250-2578).mov"
```

The oval's keys are written out in the trial fix table, `review/trial_r3_darkhead.tsv` (row R3). Review:
`review/fix shots 103/Ross at the window - Starlight, then dark 70.mp4`, `- dark 70, side by side.mp4` and
`- close-up (3x, brightened).png`.

**Ross close up, hair glitch (29 Oct; picked, row R4).** 13 aoe103b frame 2833 (1:34.5): for one frame his hair vanishes and a
bare scalp shows. It's in Funcom's original too. Over his head only, the frame there is an in-between of 2832 and 2834,
laid inside a soft oval (1130,220, 330x280) large enough to reach the back of his head past the
ear. The camera move just before (2796-2815) is real motion, not a glitch.

The in-between is motion-compensated: ffmpeg's minterpolate, given 2830, 2832, 2834 and 2836 spaced two frames apart,
draws the frame halfway. His hair keeps moving, so the plain average of 2832 and 2834 (as 101's U12) was doubled and
about 10% softer than its neighbours (sharpness 1.78 against 1.96-1.98), and the hair seemed to jump for that frame
(your note). The motion-compensated frame measures 1.89, and sits halfway in movement (2.8 from 2832, 2.8 to 2834).

```bash
ENC="-c:v prores_ks -profile:v 3 -vendor apl0 -quant_mat hq -bits_per_mb 1350 -pix_fmt yuv422p10le -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -r 30000/1001"
"$FF/ffmpeg" -i "upload/13 aoe103b_starlight.mov" -vf "select='eq(n,2830)+eq(n,2832)+eq(n,2834)+eq(n,2836)',setpts=N*2002/30000/TB,format=yuv444p,minterpolate=fps=30000/1001:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=epzs:vsbmc=1,select='eq(n,3)',setpts=N/TB,format=yuv422p10le" -frames:v 1 $ENC "upload/13 aoe103b_hairfix-mci (frames 2833-2833).mov"
# (the first try, the plain average: select='eq(n,2832)+eq(n,2834)',setpts=N/TB,format=yuv422p10le,tblend=all_mode=average -> "..._hairfix (frames 2833-2833).mov")
```

The trial fix table is `review/trial_r4_hairfix.tsv` (row R4). Review: `review/fix shots 103/Ross close up, hair glitch
at 1-34 - Starlight, average, motion-compensated.mp4` and `- the in-between frame, average vs motion-compensated.png`
(the first try's clips: `- Starlight, then fixed.mp4`, `- frames 2832-2834.png`).

**Radiman and Ross at the window, pull-back, with their real heads (29 Oct; your idea, picked, row R5r).** 13 aoe103b 2852-3005.
You still saw this as the episode's biggest problem with Proteus in it, and Topaz's own tools (Astra 2 on the clip,
image enhance on a still) didn't help. So the backs of their heads come from shots where Starlight drew them right
(`paste_head.py`, new):
- **Radiman:** from the 0:48 shot at the window, frame 1930. His dark pixels against the sky, rows 327-371, pinholes
  closed. That's without filling each row end to end, which took in the sky between his ear and skull.
- **Ross:** from his desk, frame 1470. His SAM 2 mask, rows 399-425: head, neck and the top of his collar.

In each frame Starlight's head is painted out row by row from the nearer side (sky beside the head, coat at the
collar). Each real head is then laid on, scaled to the head's width (Ross 1.36, Radiman 0.81), tops lined up,
following each head's small drift. Its mask is shrunk 1 px so none of its own sky comes along.

The area painted out is steadied (your note, 29 Oct: flicker where Radiman's neck met his collar). Each frame's is
the head's masks over 4 frames either side joined (`--maskwin=4`), so its edge doesn't jump a pixel, and the fill
there is averaged over 5 frames either side (`--fillsmooth=5`), each pixel only over frames where it's painted out
too. It's only sky and coat there, which hardly move (the heads drift under 0.3 px in 10 frames); the head laid on
top still follows him every frame. Frame-to-frame change left of his neck: 1.05 before, 0.80 after, Starlight's own
0.82. The unsteadied version is `..._heads-real-v9 ...` (preview `..._preview-v9 ...`, clips `... (v9, neck
flicker) ...`).

The heads are held steady too (your note, 29 Oct: they bobbed and swelled). Following each head's SAM 2 mask frame by
frame, even smoothed over 3 frames either side, carried the masks' wander. Radiman's measured width went 25-28 px,
and since a head is scaled from its top, his neck moved up and down at the collar. With `--steady` each head moves
along a straight line through the shot, at one size, the shot's median (Radiman 0.76, Ross 1.38). That follows the
little real movement there is: Radiman's left shoulder rises about 3 px over the shot as he shifts, while Ross's
shoulders move under 0.3 px. Frame-to-frame change on Radiman's head went from 0.59 to 0.35, left of his neck from
0.80 to 0.56, and on Ross's head from 0.33 to 0.24. Starlight's own figures are 0.71, 0.82 and 0.67. The version that
followed the masks is `..._heads-real-v10 ...` (preview `..._preview-v10 ...`, clips `... (v10, following the
masks) ...`).
- **Radiman:** brightened 1.6x, as in the first version (you liked him there): a near-black bald head with ears.
- **Ross:** brightened 1.46/1.6/1.63 (red, green, blue): his own colours, a grey-blonde crown and a warm neck, with
  the pink toned down a little (your notes). The pink was plain 1.6x (`..._heads-real-v8pink ...`, clips `... (Ross
  pinker) ...`). The grey was re-toned to rgb 62,58,52, each pixel's ratio to the mean capped 0.5-1.6
  (`..._heads-real-v7tone ...`, clips `... (Ross toned grey) ...`); it looked too grey.

```bash
# (the source masks: tools/data/sam/r103_pull/radiman_head1930.png and ross_head1470.png, made as above)
$P -I tools/paste_head.py "$FF" "upload/13 aoe103b_starlight.mov" 2852 3005 "upload/13 aoe103b_heads-real (frames 2852-3005).mov" --head=1470:$T/r103_pull/ross_head1470.png:$T/r103_pull_ross/obj1:x1.46/1.6/1.63 --head=1930:$T/r103_pull/radiman_head1930.png:$T/r103_pull_radiman/obj1:x1.6 --srcerode=1 --maskwin=4 --fillsmooth=5 --steady
```

Along the way (sources `..._heads-real-v1` to `-v6`):
- the colour from the two shots' coats hit its 1.6 ceiling for both (Ross far too light);
- a fill from all sides, then a blend of left and right, left grey smudges beside Radiman's neck;
- raising Radiman to a tone multiplied his edge into a bright rim;
- his row-filled mask brought sky in beside his ear;
- shrinking a mask before measuring it made a head too big;
- Ross's head stopped short of his collar.

The trial fix table was `review/trial_r5_realheads.tsv`; it's row R5r now, with the Proteus row R5 kept to go
back to. Review: `review/fix shots 103/Radiman and Ross, pull-back -
Starlight, Proteus, real heads.mp4` and `- real heads, close-up (3x).png`, `- real heads, before and after steadying the neck.mp4`, `- real heads, bobbing then steady.mp4`
and `- Radiman's neck, frame-to-frame change (6x).png`.

**Radiman and Ross at the window, pull-back, with Proteus (29 Oct; detail 50 picked, row R5).** 13 aoe103b 2852-3005. After
three rounds of made-up silhouettes (below; you turned them down), Proteus is laid into both heads instead. It's
rendered from the original for this shot alone, at "recover original detail" 50 and 100. All of Proteus's settings
give faceless heads, mottled in the original's own colours: a greyer crown and a warmer neck. Ross's head is lighter
than Radiman's, as in the original. Detail 0, 20 and 50 look alike; 100 is softer.

The heads go in through their SAM 2 masks, grown 2 px and feathered 1.5 (`mask_swap.py`, new). apply_fixes.js's ovals
were tried first: they only reach full strength in their inner 55%, and on heads this small Starlight's faces showed
through.

```bash
U="PROJECT/upload"   # (proteus_render.js runs Topaz's ffmpeg from Topaz's folder: full paths)
node tools/proteus_render.js "$U" tools/data/proteus_jobs_r5.tsv "$U"
$P -I tools/mask_swap.py "$FF" "upload/13 aoe103b_starlight.mov" "upload/13 aoe103b_proteus-d50 (frames 2852-3005).mov" 2852 3005 "upload/13 aoe103b_heads-proteus-d50 (frames 2852-3005).mov" --masks=$T/r103_pull_ross/obj1,$T/r103_pull_radiman/obj1 --grow=2 --feather=1.5 --srcfirst=2852
```

(The same with `d100` for the softer version.) The trial fix tables are `review/trial_r5_proteus_d50.tsv` and
`_d100.tsv`. Review: `review/fix shots 103/Radiman and Ross, pull-back - Starlight, Proteus 50, Proteus 100.mp4` and
`- Proteus close-up (3x).png`.

**Radiman and Ross at the window, pull-back (29 Oct, trial, turned down).** 13 aoe103b 2852-3005 (1:35.2-1:40.3). The camera
pulls back from the two men standing at the window, backs to us, dark against a bright sky. Starlight draws faces on
the backs of both heads (a young face on Ross, a bearded one on Radiman). The fix (`silhouette_fill.py`, new):
- Inside each head's outline (SAM 2, one mask per head), the head is blurred within the outline only, so the features
  go.
- Its colour is the original's own head there (its mean inside the outline shrunk 4 px, steadied over 11 frames).
  Radiman, who is black, is at about rgb 41-43, 43-44, 40-42.
- Radiman keeps 30% of his blurred head's light and shade and gets 1.5x the original's grain (your OK, 29 Oct).
- Ross, who is white with grey-blonde hair, gets settings of his own (your notes on v2, 29 Oct):
  - His tone is 15% lighter and moved 60% towards his hair colour in his close-up (rgb 141,130,110). That gives
    about rgb 64-67, 60-61, 53-55.
  - The fill runs a pixel past his outline, so none of Starlight's black hair edge is left.
  - His light and shade come from the original, which has no face, blurred 5 px: only the lighter-crown,
    darker-neck fall-off, 60% of it.
  - His grain (2x) is taken from clear sky 34 px to his left, so it's only film grain. The original's grain on his
    head carried the head's own shape and put a dark band across his crown.
- Both heads and their outlines are blurred 1.2 px into the sky.

Frame-to-frame change on the heads stays at or below Starlight's (Ross 0.64 against 0.79, Radiman 0.77 against 0.80).

```bash
$P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" 2852 3005 $T/r103_pull_ross_prompts.tsv $T/r103_pull_ross
$P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" 2852 3005 $T/r103_pull_radiman_prompts.tsv $T/r103_pull_radiman
$P -I tools/silhouette_fill.py "$FF" "upload/13 aoe103b_starlight.mov" 2852 3005 "upload/13 aoe103b_heads-silhouette (frames 2852-3005).mov" --masks="$T/r103_pull_ross/obj1;erode=-1;keep=0.6;shade=orig;shadesigma=5;grain=2;grainblur=4;grainshift=-34/0;gain=1.15;tint=141/130/110;tintmix=0.6,$T/r103_pull_radiman/obj1" --orig="upload/13 aoe103b.mov" --origcore=4 --grain=1.5 --keep=0.3 --edgeblur=1.2
```

Turned down (your notes, 29 Oct), with what changed after each:
- **v1:** crisp outlines filled with each head's own darkest tone, which looked like ovals too perfect, too even and
  both too dark. Made with `--masks=... ` only (defaults), source `..._heads-silhouette-v1 (frames 2852-3005).mov`.
- **v2 with 50% shading kept:** a faint leftover of Radiman's face; source `..._heads-silhouette-v2keep50 ...`.
- **v2:** Radiman good, Ross too dark, with dark spots (Starlight's black hair edge and the grain's dark centre) and
  none of his hair colour. Both heads at the global settings above, without Ross's own ones; source
  `..._heads-silhouette-v2 (frames 2852-3005).mov`, clips named `... (v2, Ross too dark) ...`.

The trial fix table is `review/trial_r5_silhouette.tsv` (row R5). Review: `review/fix shots 103/Radiman and Ross,
pull-back - Starlight, then v3.mp4`, `- v3, side by side.mp4` and `- close-up (3x).png` (original, Starlight,
v2, v3).

**The blue sign on the tower (29 Oct; picked, rows R6a/R6b).** 13 aoe103b 380-514 (0:12.7-0:17.2, the dissolve into the
tower and on) and 3680-3800 (2:02.8-2:06.8, the same camera move used again, until the dissolve to the chess table).
On the glowing panel near the tower's foot, Starlight writes illegible text in the first shot. In the second, from
about 3692, it tries to spell something ("GUILLEN"). In both, the panel is blurred 2 px, the same for each, inside
SAM 2's mask of it (one click per shot, grown 2 px, feathered 2), so the light strips around it stay sharp.

```bash
$P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" 380 514 $T/r103_signA_prompts.tsv $T/r103_signA
$P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" 3680 3800 $T/r103_signB_prompts.tsv $T/r103_signB
ENC="-c:v prores_ks -profile:v 3 -vendor apl0 -quant_mat hq -bits_per_mb 1350 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv"
for spec in "A|380|514" "B|3680|3800"; do IFS='|' read -r s a b <<< "$spec"
  "$FF/ffmpeg" -i "upload/13 aoe103b_starlight.mov" -map 0:v -vf "trim=start_frame=$a:end_frame=$((b+1)),setpts=PTS-STARTPTS,gblur=sigma=2,format=yuv422p10le" -fps_mode passthrough $ENC "upload/13 aoe103b_soft2-sign$s (frames $a-$b).mov"
  $P -I tools/mask_swap.py "$FF" "upload/13 aoe103b_starlight.mov" "upload/13 aoe103b_soft2-sign$s (frames $a-$b).mov" $a $b "upload/13 aoe103b_signblur$s (frames $a-$b).mov" --masks=$T/r103_sign$s/obj1 --grow=2 --feather=2 --srcfirst=$a
done
```

The trial fix table is `review/trial_r6_sign.tsv` (rows R6a, R6b). Review: `review/fix shots 103/Blue sign on the tower
(0-13 and 2-03) - Starlight, then blurred.mp4` and `- close-up (2x).png`.

**Radiman's jaw at the chess table (29 Oct; picked, row R7).** 13 aoe103b 3780-3941 (2:06-2:11.5). Starlight gives
him a stubbly beard; the original's face is smooth. His cheek, jaw and chin are blurred 2 px, only among his own
pixels, inside SAM 2's mask of his head (`blur_inside.py`, new), so the bright sky past his profile doesn't bleed in
and his outline and lips stay sharp. The beard-area shape is drawn once, as he sits at 3800, and moves with the centre
of his head's mask, averaged over 7 frames: he drifts 16 px left and 6 down through the shot. The first try was a
plain 2 px blur in a fixed shape (`..._jawblur-v1 ...`). It also blurred his lips and smeared his profile into the
sky, and his drift left it off his jaw by the end.

```bash
$P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" 3780 3941 $T/r103_radhead_prompts.tsv $T/r103_radhead
# (the beard-area masks in $T/r103_jaw: polygon (250,153) (285,160) (303,172) (300,178) (298,190) (302,198) (310,206)
#  (306,215) (290,219) (275,218) (258,205) (248,188) at 3800, moved by the head mask's centre, 7-frame average)
$P -I tools/blur_inside.py "$FF" "upload/13 aoe103b_starlight.mov" 3780 3941 "upload/13 aoe103b_jawblur (frames 3780-3941).mov" --within=$T/r103_radhead/obj1 --apply=$T/r103_jaw --sigma=2 --erode=2 --feather=3
```

Row R7 in `fixes_103.tsv` (picked) lays the source in through an oval round his jaw (68x66, following the shape),
not the whole frame: R7's first frames overlap R6b's last (the sign fading out in the dissolve, 3780-3800), and a
whole-frame swap there brought the sign's letters back. The trial fix table is `review/trial_r7_jaw.tsv`. Review: `review/fix shots 103/Radiman at the chess table -
Starlight, then jaw blurred.mp4`, `- jaw blurred, side by side.mp4` and `- close-up (3x).png`.

**Radiman's hands in the overhead chessboard shots (29 Oct; picked, rows R8a-c).** 13 aoe103b 4242-4441 (2:21.5-2:28.2),
5005-5103 (2:47.0-2:50.3) and 5816-5960 (3:14.1-3:18.9). At the board's top-left corner Starlight turns his clasped
hands into a tangle of long fingers, and his dark sleeves vanish into the dark around them. The hands are masked with
SAM 2 (clicks in `data/sam/r103_hands{A,B,C}_prompts.tsv`) and painted out from their surroundings
(`inpaint_fill.py`, new). Each pixel takes the nearest surrounding colour, from the smallest Gaussian neighbourhood (3
to 96 px) that holds enough known picture, smoothed 3 px. The corner becomes plain shadow, with the window's teal strip
at the top.

The first try also added the original's grain, borrowed from 160-220 px to the right. That brought ghosts of the
chess pieces with it, so there's no grain now (Starlight's dark corner is smooth anyway). The masks are grown 8 px, not
4, so no rim of finger is left.

```bash
for spec in "A|4242|4441" "B|5005|5103" "C|5816|5960"; do IFS='|' read -r x a b <<< "$spec"
  $P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" $a $b $T/r103_hands${x}_prompts.tsv $T/r103_hands$x
  $P -I tools/inpaint_fill.py "$FF" "upload/13 aoe103b_starlight.mov" $a $b "upload/13 aoe103b_nohands$x (frames $a-$b).mov" --masks=$T/r103_hands$x/obj1 --grow=8 --feather=3 --smooth=3
done
```

The trial fix table is `review/trial_r8_hands.tsv` (rows R8a-c). Review: `review/fix shots 103/Radiman's hands,
chessboard shots - Starlight, then hands out.mp4` and `Radiman's hands - close-up (brightened).png`.

**The bald man lying in the corridor (29 Oct, trial, turned down: Starlight kept).** 13 aoe103b 6925-7092 (5:27.3-5:32.8 in the master). The
camera pulls back from him and racks focus onto him (sharp from about 6990), then holds still from about 7000 to the
cut. He doesn't move, but Starlight redraws the yellow pattern on his sleeve and coat in every frame; the original's
crawls too. With the camera's movement taken out, Starlight's sleeve changes 1.41 per frame (the original 1.25).

He's held as he is at frame 7060 (sharp, camera still, a clean mask) and carried along with the camera
(`track_hold.py`, new):
- **His mask:** SAM 2, clicks on frame 7040 (`data/sam/r103_lying_prompts.tsv`); 7040's own mask is spotty on his bald
  head, hence holding 7060.
- **The camera's move:** 173 points on him, 32 px apart, tracked with CoTracker3 (`data/sam/r103_lying_queries.txt`)
  and steadied over 2 frames. It's a pull-back as well as a tilt: he's 2x his final size at 6936 and 1.4x at 6960. His
  shape changes with the viewpoint (an even stretch is 4-6 px off), so each point's leftover is spread around it
  as well.
- **Focus:** matched to each frame by how much detail it has between 1 and 4 px: about 7 px of blur as he enters, sharp
  by 6990. A pixel-by-pixel match always took a little blur (Starlight's pattern never lines up), and finer detail
  was thrown off by the grain Starlight sprinkles over its out-of-focus frames. Fitted as never rising, since the focus
  only sharpens; the still frames waver 0-0.5 px otherwise.
- **His edge:** only his own colours are blurred. Blurring the whole held frame gave his out-of-focus edge a pale rim
  from the held frame's background.

His sleeve's leftover change is 0.46 (0.22 once the camera stops, against Starlight's 0.90). Versions along the way:
`..._lyinghold-v1` to `-v3 ...`.

```bash
$P -I tools/sam_masks.py "$FF" "upload/13 aoe103b_starlight.mov" 6920 7092 $T/r103_lying_prompts.tsv $T/r103_lying
$P -I tools/point_tracks.py "$FF" "upload/13 aoe103b_starlight.mov" 6920 7092 $T/r103_lying_tracks.tsv "$(cat $T/r103_lying_queries.txt)"
$P -I tools/track_hold.py "$FF" "upload/13 aoe103b_starlight.mov" 6925 7092 7060 "upload/13 aoe103b_lyinghold (frames 6925-7092).mov" --tracks=$T/r103_lying_tracks.tsv --masks=$T/r103_lying/obj1 --sharpening
```

(The query points are the grid points 32 px apart inside 7060's mask shrunk 12 px.) The trial fix table is
`review/trial_r9_lyinghold.tsv` (row R9). Review: `review/fix shots 103/Bald man lying in the corridor - Starlight, then
held.mp4`.

## Episode 104

**Eleena on the table, her open mouth (30 Oct; 30% picked, rows M1a/M1b).** 15 aoe104a (titles cut) 285-662 and 815-963 (0:09.5-0:22.1
and 0:27.2-0:32.1), her face in two shots either side of the wide shot of the two figures. Starlight draws the inside
of her mouth as glossy grey lobes either side of a dark centre line, shinier than black; the original's is shiny too,
only softer. The opening is masked with SAM 2 in each shot (clicks in `data/sam/w104_mouth{A,B}_prompts.tsv`). Inside
it, each pixel's brightness above the opening's dark (the mean of its darkest 5%, steadied over 5 frames either side)
is cut to a half or to 30%, colour kept, so the centre line still shows; the mask is shrunk 1 px so the lips' edge is
untouched, and feathered 1.5 px (`tone_inside.py`, new). The effect fades out over the dissolve to the desert
(933-963), where the mask would otherwise darken the desert coming in.

```bash
$P -I tools/sam_masks.py "$FF" "upload/15 aoe104a (titles cut)_starlight.mov" 250 662 $T/w104_mouthA_prompts.tsv $T/w104_mouthA
$P -I tools/sam_masks.py "$FF" "upload/15 aoe104a (titles cut)_starlight.mov" 815 979 $T/w104_mouthB_prompts.tsv $T/w104_mouthB
for k in 50 30; do $P -I tools/tone_inside.py "$FF" "upload/15 aoe104a (titles cut)_starlight.mov" 285 963 "upload/15 aoe104a (titles cut)_mouthtone$k (frames 285-963).mov" --masks=$T/w104_mouthA/obj1,$T/w104_mouthB/obj1 --keep=0.$k --fade=933-963; done
```

The trial fix tables were `review/trial_m1_mouth50.tsv` and `_mouth30.tsv`; the 30% rows are in `review/fixes_104.tsv`
now. Review: `review/fix shots 104/Eleena on the table, mouth - Starlight, half, 30 percent.mp4` and `- close-up
(3x).png`.

**The woman in red, an ear in her hair (30 Oct; picked, row E1).** 15 aoe104a (titles cut) 663-814 (0:22.1-0:27.2), the wide shot
between Eleena's two close-ups. Starlight draws the woman's bob as a smooth, glossy helmet and embosses an ear in it, in
the hair's own colour, through the whole shot; the original has only a blurred hint of one. Her hair and the ear are
masked with SAM 2 as two objects (clicks in `data/sam/w104_redhair_prompts.tsv`). The ear, grown 3 px, is filled from
her hair around it only: a 7 px blur among her hair's pixels, less the ear's (`blur_inside.py`, new options
`--exclude` and `--grow`), laid in 2 px inside her hair's outline and feathered 3 px. A 4 px blur left a dark dot in the
middle of the ear, where too little weight reached; the floor in that division is lower with `--exclude` now (R7, which
doesn't use it, is unchanged). Near the shot's end (about 803-814) Starlight also makes her hair stringy; that's left.

```bash
$P -I tools/sam_masks.py "$FF" "upload/15 aoe104a (titles cut)_starlight.mov" 663 814 $T/w104_redhair_prompts.tsv $T/w104_redhair
$P -I tools/blur_inside.py "$FF" "upload/15 aoe104a (titles cut)_starlight.mov" 663 814 "upload/15 aoe104a (titles cut)_noear (frames 663-814).mov" --within=$T/w104_redhair/obj1 --apply=$T/w104_redhair/obj2 --exclude=$T/w104_redhair/obj2 --grow=3 --sigma=7 --erode=2 --feather=3
```

The trial fix table was `review/trial_e1_noear.tsv`; row E1 is in `review/fixes_104.tsv` now. Review: `review/fix shots 104/Woman in red, ear in her hair -
Starlight, then ear out.mp4` and `- close-up (2x).png`.

**The blue sign on the tower again (30 Oct; picked, row S1).** 16 aoe104b 3925-4076 (2:11.0-2:16.0), the tower shot
103 uses twice, here dissolving in from the city at about 3925 until the cut to Ross. Blurred 2 px inside SAM 2's mask
of the panel (one click at 4040, `data/sam/w104_signC_prompts.tsv`), exactly as 103's R6.

```bash
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 3925 4076 $T/w104_signC_prompts.tsv $T/w104_signC
"$FF/ffmpeg" -i "upload/16 aoe104b_starlight.mov" -map 0:v -vf "trim=start_frame=3925:end_frame=4077,setpts=PTS-STARTPTS,gblur=sigma=2,format=yuv422p10le" -fps_mode passthrough $ENC "upload/16 aoe104b_soft2-signC (frames 3925-4076).mov"
$P -I tools/mask_swap.py "$FF" "upload/16 aoe104b_starlight.mov" "upload/16 aoe104b_soft2-signC (frames 3925-4076).mov" 3925 4076 "upload/16 aoe104b_signblurC (frames 3925-4076).mov" --masks=$T/w104_signC/obj1 --grow=2 --feather=2 --srcfirst=3925
```

(`$ENC` as for R6.) Trial table `review/trial_s1_sign.tsv` (row S1). Review: `review/fix shots 104/3 - Blue sign on the tower
(16b 2-11) - Starlight, then blurred.mp4` and `- close-up (2x).png`. Review clips for 104 are made with
`data/w104/seqclip.py` (the same stretch several times in a row, labelled, with the original sound).

**The sign above the door in the rock face (30 Oct, overnight trial).** 18 aoe104d 1496-1690 (0:49.9-0:56.4), from the
dissolve in to the dissolve out; the camera barely moves. Starlight spells something like "PCSRATIM?" on the bright
sign. It's washed out by a blur among the sign's own pixels (SAM 2 mask, clicks in
`data/sam/w104_doorsign_prompts.tsv`), kept 2 px inside its outline so the edge stays crisp: 3 px leaves a faint,
unreadable smudge of lettering, 5 px a plain white panel.

```bash
$P -I tools/sam_masks.py "$FF" "upload/18 aoe104d_starlight.mov" 1470 1700 $T/w104_doorsign_prompts.tsv $T/w104_doorsign
for s in 3 5; do $P -I tools/blur_inside.py "$FF" "upload/18 aoe104d_starlight.mov" 1496 1690 "upload/18 aoe104d_doorsign-s$s (frames 1496-1690).mov" --within=$T/w104_doorsign/obj1 --apply=$T/w104_doorsign/obj1 --sigma=$s --erode=2 --feather=2; done
```

Trial tables `review/trial_d1_doorsign3.tsv` and `5.tsv` (row D1). Review: `review/fix shots 104/8 - Sign above the door
(18d 0-50) - Starlight, blur 3, blur 5.mp4` and `- close-up (3x).png`.

**The Omni-Tek housing project signs (30 Oct, overnight trial).** 18 aoe104d 1630-2014 (0:54.4-1:07.2), from the dissolve
in to the cut to the explosion's flash; the camera pans and rises. Two things are washed out by a 3 px blur among their
own pixels, kept 2 px inside their outlines:
- the big sign's lower-left box of small nonsense print (the other three boxes, "omni-tek", "housing project" and
  "omni 491-112", are fine), until it slides off the left edge at about 1925;
- the glowing sign over the apartment block's entrance ("WAIMOTNUTIES"), from when it comes out from behind the big
  sign at about 1700.

Each is masked with SAM 2 in a run of its own (`data/sam/w104_housing{A,B}_prompts.tsv`). One run with both, clicked on
different frames, stopped with a bfloat16/float error inside SAM 2's memory attention. The two masks are joined into
`data/sam/w104_housingAB`.

```bash
for x in A B; do $P -I tools/sam_masks.py "$FF" "upload/18 aoe104d_starlight.mov" 1630 2014 $T/w104_housing${x}_prompts.tsv $T/w104_housing$x; done
# (w104_housingAB/<frame>.png = the two masks' union, frame by frame)
$P -I tools/blur_inside.py "$FF" "upload/18 aoe104d_starlight.mov" 1630 2014 "upload/18 aoe104d_housingsigns (frames 1630-2014).mov" --within=$T/w104_housingAB --apply=$T/w104_housingAB --sigma=3 --erode=2 --feather=2
```

Trial table `review/trial_h1_housing.tsv` (row H1). Review: `review/fix shots 104/9 - Housing project signs (18d 0-54) -
Starlight, then washed out.mp4` and `- close-up (2x).png`.

**The door sign and the housing signs, joined through the dissolve (30 Oct).** D1 runs to 1690 and H1 starts at 1630,
and the two overlap through the dissolve from the door to the housing project. Two whole-frame swaps on the same frames
don't combine (the later one replaces the earlier), so in each sign's own trial the other sign stayed as Starlight
there: in clip 8 the housing sign's lower-left box shows unfixed as the door fades out. For 1630-1690 the housing blur
is run on top of the door sign's own render (`--clipfirst`, new in blur_inside.py: the part frame a partial clip starts
at), once per door strength, and the rows are split: D1 1496-1629, DH 1630-1690 (`signsboth-s3` / `-s5`), H1 1691-2014.
The housing sign shows from 1636, when its mask starts. Checked frame by frame over 1600-1720: inside each sign's mask
the joined preview is within 1-3 of that sign's own fix render.

```bash
for s in 3 5; do $P -I tools/blur_inside.py "$FF" "upload/18 aoe104d_doorsign-s$s (frames 1496-1690).mov" 1630 1690 "upload/18 aoe104d_signsboth-s$s (frames 1630-1690).mov" --within=$T/w104_housingAB --apply=$T/w104_housingAB --sigma=3 --erode=2 --feather=2 --clipfirst=1496; done
```

Trial tables `review/trial_dh_signs3.tsv` and `5.tsv` (rows D1, DH, H1; these replace the separate D1 and H1 tables).
Review: `review/fix shots 104/8+9 - Door sign into the housing project (18d 0-53) - Starlight, door blur 3, door blur
5.mp4`.
Your pick was blur 3: rows D1, DH and H1 from `trial_dh_signs3.tsv` are in `review/fixes_104.tsv`, and part 18 is
rendered (`data/w104/part_check.py` streams the part against Starlight and the preview: identical to the preview over
1496-2014, Starlight elsewhere within 9):

```bash
node tools/apply_fixes.js "$FF" upload review/fixes_104.tsv fixed "18 aoe104d"
$P -I tools/data/w104/part_check.py "18 aoe104d" "upload/trial-dh-signs3/18 aoe104d_preview (frames 1496-2014).mov" 1496 2014
```

**Eleena's hair at the bar, pockets of wall (30 Oct, overnight trial, rows G1-G4).** 16 aoe104b 2058-2207 (1:08.7),
2304-2390 (1:16.9), 6552-6743 (3:38.6) and 6920-7383 (3:50.9, the long shot that also has her teeth at 3:51 and
4:03). Pockets of the beige wall show through her spiky red hair, mostly where strands arch over near the top. Filled
with hair colour by `hair_fill.js`, as 102's HF rows, with settings for this lighting:
- `--hair=55`: her hair is luma about 40 here and the wall 50-75, so the usual 40 missed her hair and 70 took in the
  wall;
- `--maxarea=250` and boxes ending at y 190-220: bigger patches, and the box's bottom corners, caught wall between
  the spikes at her sides, a blob in single frames;
- `--maxlum=82` (new): a pocket brighter than that is her lit forehead between strands at the hairline (about 94),
  not wall.

```bash
for r in "G3 6552 6743 250,0,880,190" "G4a 6920 7287 250,0,950,200" "G4b 7288 7383 480,0,950,200"; do set -- $r
  node --max-old-space-size=4096 tools/hair_fill.js "$FF" upload "16 aoe104b" $2 $3 $4 tools/data/hair_fill_104 --maxarea=250 --hair=55 --headonly --maxlum=82:120 --thin=1 --name=hairfill-${1}v2
  # (the steadier try, turned down: add --minarea=8 --ring=10:0.85 --steady=3:0.6:5, name hairfill-${1}steady)
done
node --max-old-space-size=4096 tools/hair_fill.js "$FF" upload "16 aoe104b" 2058 2207 250,0,920,200 tools/data/hair_fill_104 --maxarea=250 --topmax=80:1500:640 --hair=55 --headonly --name=hairfill-G1
node --max-old-space-size=4096 tools/hair_fill.js "$FF" upload "16 aoe104b" 2304 2390 330,0,900,175 tools/data/hair_fill_104 --maxarea=250 --topmax=80:1500:640 --hair=55 --headonly --name=hairfill-G2
```

**G1's top right (your note, 30 Oct: "still missing some big pockets in the top right").** Between the arching
strands at the top right of her head (about x 675-770, y 10-60), Starlight leaves pockets of wall of 300-1,500 px,
over the 250 px limit. `--topmax=80:1500:640` (new) lets a pocket lying wholly above row 80 and right of column 640 be up
to 1,500 px; elsewhere 250 still holds. `--opentop` (new: pockets touching the box's top edge count too) was tried
and is left off: it took the wall above her head between the upward spikes whenever a spike tip closed it off, a
blob on single frames (2086, 2119, 2132, 2145). Filled per frame now: median 307 px, at most 452, no jumps. The first
version is kept as `upload/16 aoe104b_hairfill-G1v1 (frames 2058-2207).mov` (preview `..._preview-v1 ...`).

**Your circles (30 Oct).** You circled what was still open on enlarged frames (`review/fix shots 104/2 - Hair pockets,
for circling/`: 2062, 2200, 2386):
- **2200 and 2386:** pockets near the top of her head that are lit, luma 84-90, so `--maxlum=82` (meant for her
  forehead at 3:38) threw them out. G1 and G2 now run without it (her forehead isn't in their boxes). G2's box stops at
  y 175, since without the limit it took a sliver between two spikes at the bottom right.
- **2062:** a pale pinkish fleck in a dark patch of hair (about 507,6, frames 2058-2063), barely brighter than the hair,
  so no pocket finder sees it. Softened 3 px by an oval (row G1f, `src=soft3`).

Earlier versions: `..._hairfill-G1v2`, `..._hairfill-G2v1 ...`.

**Note 5 (3:38, 3:51) checked the same way (30 Oct).** The same lit pockets near the top of her head were missed there,
since those shots need `--maxlum` to keep her forehead out. Now `--maxlum=82:120` (new: the limit only for pockets
reaching below row 120; her hairline is at 145-175). Two things this turned up, fixed:
- **The whisker square (your note):** a thin strand looping out from her hair at the top right closes off a square of
  wall (6616-6704, and 7016-7192), which was being filled. `--thin=1` (new) leaves strands up to about 2 px wide out
  when deciding what's enclosed, so the loop stays open.
- **The fixture at 3:55:** from about 7290 a dark round fixture moves in at the left. Its highlight, and the wall
  between it and her hair, came in as pockets for a few frames. G4 is split at 7288 (rows G4a, G4b), the second
  part's box starting at x 480.

**Note 5, flicker (turned down; your call: "lock in the previous attempt, it's good enough"; rows G3, G4a, G4b use
`..._hairfill-G3v2`, `-G4av2`, `-G4bv2 ...`). Your note, 30 Oct: "we've created a bunch of flicker; focus on the biggest holes in the main body of her
hair; we're getting misled by the shoots").** Most of what was filled were gaps among the shoots round her outline and
small pockets that Starlight opens and shuts from frame to frame, so the fill came and went with them (it was on in
every frame, a different patch each time). Now:
- `--ring=10:0.85` (new): a gap counts only if the ring of pixels 7-10 px out from it is at least 85% hair, so only
  holes in the main mass of her hair. Wall between crossed shoots, e.g. the gap between the tall shoot and the
  diagonal ones at the top left (3:38), has the open wall just past the thin shoots and fails it. (A `--body` option,
  the hair's mass with its spikes trimmed off, was tried first and taken out: the big shoots there are thick enough to
  count as body.)
- `--minarea=8` (new): gaps under 8 px don't count.
- `--steady=3:0.6:5` (new, two passes): a pixel is filled only if it isn't hair in that frame and at least 60% of the
  frames within 3 either side (lined up on the hair's centre) had a gap within 2 px of it; and fill lasting fewer than 5
  frames at a place is dropped. So a hole that shows for a frame isn't filled, and one that blinks shut for a frame
  stays filled.

The fill is now on in runs of 6-45 frames: G3 in 36 of 192 frames, G4a in 144 of 368, G4b in 52 of 96. A few single
frames still differ a little: 6704 (58 px) and 6707, 7108 (about 22 px each), the rest 5-9 px. The steadier try is kept as `..._hairfill-G3steady`, `-G4asteady`,
`-G4bsteady ...` (previews `..._preview-steady ...`, clips `5 - ... - steadied try (not used).mp4`).

G3's box stays as it was; G4a's stops at y 200 (at 220 it took wall between two converging spikes at the left,
7200). Filled per frame: G3 median 118, at most 268; G4a 89/262; G4b 37/194; no jumps. First versions:
`..._hairfill-G3v1`, `..._hairfill-G4v1 ...`. (A `--seal` option, closing cracks before the
search, was tried for these and taken back out: the pockets were enclosed already.)

Trial table `review/trial_g_hair.tsv` (rows G1-G3, G4a, G4b, G1f). Review: `review/fix shots 104/2 - Hair pockets (16b 1-08)`, `(16b
1-17)`, `(16b 3-38)`, `(16b 3-51) - Starlight, then filled.mp4` and `2+5 - Hair pockets (16b) - close-up (1.5x).png`.

**Radiman at his office window, a face on the back of his head (30 Oct, overnight trial, two options).** 16 aoe104b
5891-5945 (3:16.6-3:18.4), until the cut to Joshua on the screen. From about 5915 Starlight draws a face with glasses
and a beard on the back of his head; at 5891 there's only a dim hint of one, and the original is a dark, featureless
head against the window. Both options use `paste_head.py` on SAM 2's mask of his head
(`data/sam/w104_radhead_prompts.tsv`), at one size along a straight path (`--steady`):
- **A, your suggestion:** his own head as it is at 5891, held through the shot and softened 2 px so no features read.
- **B:** the real back of his head from the later look-out shot (6230: bald, one ear, about the same size, masked with
  `data/sam/w104_radsrc_prompts.tsv`), toned down to this shot's backlit head (rgb 110,107,139; it's lit brighter
  there).

`--fillbelow` (new): a painted-out pixel can also take the picture below it. Without it, the rows at his neck filled
from the window either side and left a pale line between his head and collar.

```bash
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 5891 5945 $T/w104_radhead_prompts.tsv $T/w104_radhead
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 6225 6235 $T/w104_radsrc_prompts.tsv $T/w104_radsrc
$P -I tools/paste_head.py "$FF" "upload/16 aoe104b_starlight.mov" 5891 5945 "upload/16 aoe104b_radhead-held (frames 5891-5945).mov" --head=5891:$T/w104_radhead/obj1/5891.png:$T/w104_radhead/obj1:x1 --soft=2 --srcerode=1 --steady --maskwin=2 --fillsmooth=3 --fillbelow
$P -I tools/paste_head.py "$FF" "upload/16 aoe104b_starlight.mov" 5891 5945 "upload/16 aoe104b_radhead-later (frames 5891-5945).mov" --head=6230:$T/w104_radsrc/obj1/6230.png:$T/w104_radhead/obj1:110/107/139 --soft=0.6 --srcerode=1 --steady --maskwin=2 --fillsmooth=3 --fillbelow
```

Trial tables `review/trial_rh_held.tsv` and `_later.tsv` (row RH).

**B held (your note, 30 Oct: B is most promising, but his torso moves too much against his head; hold the whole frame,
as before).** Option B's frame 5897, where the pasted head sits on his collar with the ear showing, held for the whole
shot, as 101's robot hold:

```bash
"$FF/ffmpeg" -i "upload/16 aoe104b_radhead-later (frames 5891-5945).mov" -vf "select='eq(n,6)',loop=loop=54:size=1:start=0,setpts=N/FRAME_RATE/TB" -frames:v 55 $ENC "upload/16 aoe104b_radhold-B (frames 5891-5945).mov"
```

Trial table `review/trial_rh_hold.tsv`. Review: `4 - Radiman at his window (16b 3-16) - Starlight, then B held.mp4` and
`- B held, close-up (2x).png`.

**First frame held, head blurred (your idea, 30 Oct; picked, row RH).** The shot's first frame (5891), where Starlight's face is only a
dim hint, with his head blurred 3 px among its own pixels (SAM 2's mask, kept 2 px inside the outline so it stays crisp;
2 px left a faint line where the glasses were), held for the whole shot:

```bash
$P -I tools/blur_inside.py "$FF" "upload/16 aoe104b_starlight.mov" 5891 5891 tools/data/w104/radblur3.mov --within=$T/w104_radhead/obj1 --apply=$T/w104_radhead/obj1 --sigma=3 --erode=2 --feather=2
"$FF/ffmpeg" -i tools/data/w104/radblur3.mov -vf "loop=loop=54:size=1:start=0,setpts=N/FRAME_RATE/TB" -frames:v 55 $ENC "upload/16 aoe104b_radhold-A (frames 5891-5945).mov"
```

Trial table `review/trial_rh_holdA.tsv`. Review: `4 - ... - Starlight, first frame held and blurred, B held.mp4` and
`- both holds, close-up (2x).png`. Review: `review/fix shots 104/4 - Radiman at his window
(16b 3-16) - Starlight, A held head, B later head.mp4` and `- close-up (2x).png`.

**Eleena's gappy teeth at the bar (30 Oct, overnight trial, three options).** 16 aoe104b 1244-1384 (0:41.5-0:46.2, the
worst) and 6930-7000 (3:51.2-3:53.6, milder). Her upper teeth are separate pegs with dark gaps, in the original too.
Elsewhere they're whole, e.g. 7280-7286 (4:03) in the second shot. `fix_teeth.py` (new) works along the line where her
upper teeth meet her lip:
- **Mouth:** SAM 2's mask of her whole mouth, lips and opening (`data/sam/w104_mouth{T1,T2,R}_prompts.tsv`). A mask
  of just the opening failed: SAM 2 took the lips in some frames and lost the thin slit in others.
- **Teeth:** near-grey, warm pixels inside it (blue at most 0.92 of green: the lilac end of her lower lip is greyish
  but bluer), not within 3 px of the mouth's outline, in patches touching the mouth's dark inside.
- **Teeth line:** a curve fitted to the topmost tooth pixels, steadied over 2 frames either side. The teeth's depth
  below it is a median over 11 frames.
- **Where it may paint:** from the curve down through teeth and the mouth's dark inside only, stopping at the lower
  lip, its depth a running median over 9 columns (single columns stopped early and left bars).

The options:
- **A, `--mode=paste`: real teeth from 4:03** (7286, the upper incisors, 13 px deep, `--refdepth=13`) laid along her
  teeth line, toned to her teeth. Only where the reference is teeth or mouth (that mask shrunk 1 px), and only onto
  her teeth or the mouth's dark: at first its blended edge laid pink streaks on her lower lip at 3:51. At 0:41
  the reference's teeth span is stretched across hers. At 3:51, `--uniform` (new) keeps the reference at its own shape,
  scaled from the teeth's depth and centred: stretched, the few big incisors became slabs across her many smaller teeth.
- **B, `--mode=close`: gaps closed** from her own teeth. In each row of the teeth band, what's darker than the teeth
  between two teeth is filled from the teeth either side, with a faint seam every tooth-width (`--toothw=10`).
- **C, `--mode=shade`: the broken row shaded** into the mouth's shadow: teeth and gaps in the band kept at 45% of their
  brightness above the mouth's dark, soft-edged. Wider than the band, it darkened the pale rim Starlight draws on her
  lower lip at the corner.

None adds flicker: change from frame to frame inside the mouth is Starlight's, within 0.1-0.3.

Your other references, in 17 aoe104c, are options too, **D** and **E**: A's method with the teeth from there
(`--refclip`, new: the reference from another part's clip; their mouths masked with
`data/sam/w104_mouthR17_prompts.tsv` and `_R17b_prompts.tsv`). Neither looks as good as 4:03:
- **1:52 (3370),** head-on but a small smile: her teeth there are only 5 px deep, so stretched into the gaps they come
  out patchy.
- **1:10 (2112),** the fullest teeth in that shot: they're lit pink by the scene's light, and lay in as pink slabs.

Sources `upload/16 aoe104b_teeth-paste152`, `_teeth2-paste152`, `_teeth-paste110`, `_teeth2-paste110 (frames ...)`
(the same `fix_teeth.py` commands as A, with `--ref=3370:$T/w104_mouthR17/obj1` or `--ref=2112:$T/w104_mouthR17b/obj1`
and `--refclip="upload/17 aoe104c_starlight.mov"`); trial tables `review/trial_t_teeth_paste152.tsv` and `_paste110.tsv`.
Review: `1 - Teeth (16b 0-41)` and `(16b 3-51) - real teeth from A 4-03, D 1-52, E 1-10.mp4`, and `Teeth - the three
references compared (2x).png`.

```bash
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 1244 1384 $T/w104_mouthT1_prompts.tsv $T/w104_mouthT1
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 6930 7000 $T/w104_mouthT2_prompts.tsv $T/w104_mouthT2
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 7270 7292 $T/w104_mouthR_prompts.tsv $T/w104_mouthR
R="--ref=7286:$T/w104_mouthR/obj1 --refdepth=13"
for m in close paste shade; do
  $P -I tools/fix_teeth.py "$FF" "upload/16 aoe104b_starlight.mov" 1244 1384 "upload/16 aoe104b_teeth-$m (frames 1244-1384).mov" --mouth=$T/w104_mouthT1/obj1 --mode=$m $R
  $P -I tools/fix_teeth.py "$FF" "upload/16 aoe104b_starlight.mov" 6930 7000 "upload/16 aoe104b_teeth2-$m (frames 6930-7000).mov" --mouth=$T/w104_mouthT2/obj1 --mode=$m $R $([ $m = paste ] && echo --uniform)
done
```

(The 3:51 sources are named `teeth2-`: `apply_fixes.js` finds a source by name and part, so two `teeth-close (frames
...)` files in one part made it take the first, and the 3:51 preview came out empty.) Trial tables
`review/trial_t_teeth_{paste,close,shade}.tsv` (rows T1, T2). Review: `review/fix shots 104/1 - Teeth (16b 0-41)` and `(16b
3-51) - Starlight, A real teeth, B gaps closed, C shaded.mp4`, and `1+6 - Teeth (16b 0-41 and 3-51) - close-up (2x).png`.

**Note 1 replaced by the wide shot; note 6 kept as Starlight (30 Oct, your calls).** The teeth close-up, 16 aoe104b
1244-1384 (cut to the bottles at 1385), is cut short and the rest replaced by the part's earlier wide shot of the bar,
924-1108 (fade-in from black done by 1015; the camera still, only the lamps flicker; 94 clean frames, 1015-1108).
Her lips are closed to about 1255; one tooth tip shows from then, the gap beside it from about 1298, the broken row
from 1310. `tools/retime.py` (new) plays a stretch of a clip over other part frames, sped or slowed, neighbouring frames
blended. A: from 1291, at its own speed (94 frames, a straight copy). B: from 1255, slowed to 72%.

```bash
$P -I tools/retime.py "$FF" "upload/16 aoe104b_starlight.mov" 1015 1108 1291 1384 "upload/16 aoe104b_wideshot-A (frames 1291-1384).mov"
$P -I tools/retime.py "$FF" "upload/16 aoe104b_starlight.mov" 1015 1108 1255 1384 "upload/16 aoe104b_wideshot-B (frames 1255-1384).mov"
```

Trial tables `review/trial_t1_wide_A.tsv` and `_B.tsv` (row T1). Review: `review/fix shots 104/1 - Teeth (16b 0-41) -
Starlight, A wide shot from 1291, B wide shot from 1255 slowed.mp4`.
Your pick: A (row T1 in `review/fixes_104.tsv`).

**Round two, after the master (30 Oct, trials, rows NS, BD1, HH, BD2).** 16 aoe104b. Trial table
`review/trial_104_round2.tsv`; previews in `upload/trial-104-round2`; clips `review/fix shots 104/10 - ...` to `13 - ...`.
- **NS, the neon sign behind Mack, 1109-1243.** The camera is still and the neon steady (the "&" body 161-166 all
  shot); only the "&"'s little tail to the right comes and goes, so it reads as a "6". `tools/hold_glow.py` (new) takes
  the tail as what 1196-1204 have and 1220 doesn't, and lightens every frame towards 1196-1204 there, skin (his hand)
  left alone.
- **BD1, the hologram's beard, 4754-4909.** SAM 2 masks the stubble well (clicks on 4820). A plain 2.5 px blur also
  smoothed his open mouth away (4850; a SAM mouth mask to cut out drifted onto his chin), so `blur_inside.py --range`
  (new: bilateral, neighbours weighed by colour difference too) smooths the stubble and keeps the mouth's edges. The
  plain blur is kept as `beardblurAv1`.
- **HH, his hands at the chessboard, 4910-5012.** SAM 2 mask (clicks on 4960), painted out as R8. From 4970 the hands
  reach the frame's top-left corner, where even 96 px out there was too little known picture and the fill stayed
  black: `inpaint_fill.py` now goes to 192 px and gives whatever is left the widest estimate.
- **BD2, his beard again, 5237-5340.** The first SAM run (clicks on 5300) took his whole face; clicks on 5320 on the
  dark jaw and chin seen through his collar give that alone, from 5262 as it comes into view. Plain 2.5 px blur.
  Your note: it needed smoothing from the jump where he turns back to Ross (5246, in the original). A second SAM run
  (clicks on 5254) masks the stubble on his cheek, jaw and chin from 5246 to the end of the shot; the two masks are
  joined into `data/sam/w104_beardB23` (frame by frame, the union) and blurred as before. The first render is kept as
  `beardblurBv1`.

```bash
$P -I tools/hold_glow.py "$FF" "upload/16 aoe104b_starlight.mov" 1109 1243 "upload/16 aoe104b_neontail (frames 1109-1243).mov" --ref=1196-1204 --without=1220 --box=258,132,295,175
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 4754 4909 $T/w104_beardA_prompts.tsv $T/w104_beardA
$P -I tools/blur_inside.py "$FF" "upload/16 aoe104b_starlight.mov" 4754 4909 "upload/16 aoe104b_beardblurA (frames 4754-4909).mov" --within=$T/w104_beardA/obj1 --apply=$T/w104_beardA/obj1 --sigma=2.5 --range=18 --erode=1 --feather=2
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 4910 5012 $T/w104_handsH_prompts.tsv $T/w104_handsH
$P -I tools/inpaint_fill.py "$FF" "upload/16 aoe104b_starlight.mov" 4910 5012 "upload/16 aoe104b_nohandsH (frames 4910-5012).mov" --masks=$T/w104_handsH/obj1 --grow=8 --feather=3 --smooth=3
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 5237 5340 $T/w104_beardB2_prompts.tsv $T/w104_beardB2
$P -I tools/sam_masks.py "$FF" "upload/16 aoe104b_starlight.mov" 5246 5340 $T/w104_beardB3_prompts.tsv $T/w104_beardB3
# (w104_beardB23/<frame>.png = the union of w104_beardB2/obj1 and w104_beardB3/obj1, 5237-5340)
$P -I tools/blur_inside.py "$FF" "upload/16 aoe104b_starlight.mov" 5237 5340 "upload/16 aoe104b_beardblurB (frames 5237-5340).mov" --within=$T/w104_beardB23 --apply=$T/w104_beardB23 --sigma=2.5 --erode=1 --feather=2
```

**BABOONS shirt at the bar door (30 Oct, overnight trial, rows BB1-BB4).** 17 aoe104c, four stretches where Starlight's
print reads wrong, each with 102's recipe:
- **BB1:** 4048-4126 (2:15.0-2:17.6), "BABMSS"; the camera closes in, the print growing from 46 to 113 px.
- **BB2:** 5399-5512 (3:00.1-3:03.9), "BARNES", until she has turned far enough that it squeezes out of legibility.
- **BB3:** 5991-6056 (3:19.9-3:22.1), "BABNMES", until his shoulder covers it.
- **BB4:** 6150-6230 (3:25.2-3:27.9), "MANNES", from when it comes out from behind his shoulder (6153) as she turns away, until her arm covers it.

The recipe: SAM 2 masks of her shirt, grown 3 px (`data/sam/w104_bab{A-D}_prompts.tsv`), so whatever passes in front
stays in front; CoTracker3 points over the print; `logo_composite.js` with B23's options and `--lettersonly`.
- **BB1** is placed like B23 (`tracks_to_place.py`, anchor 4100 from Starlight's own print: 820.9,608.2, 113 wide,
  -8 degrees). A mesh failed there (the tool couldn't fit its anchor). Before 4068 the placement trails the print in
  the fast camera move (3-6 px high, too wide), which left pieces of the old print beside the new word. So the word
  comes in at 4065-4068, the paint-out a frame ahead. Before that, an oval following the measured print softens it 3 px
  (row BB1s, `src=soft3`), so its misspelling can't be read during the move.
- **BB2-BB4** use a tracked mesh, as B26m: a grid of points wider than the print (so the whole word fits), anchored on
  the tool's own fit. Fitted only by shift, scale and turn, the word couldn't squeeze as her chest turned, and pieces
  of Starlight's letters slid out of the paint-out ("ANNE" at 5450). On the mesh it bends with the cloth. The paint-out
  stays full to the end of each stretch and only the word fades, as the print disappears. (The stretches first ended at
  5455, 6050 and 6216, where an orange test said the print had gone. Frame by frame, it hadn't: dimmed, it stayed
  readable, "FAFNES" to about 5490 and "MANNES" to 6224, so the masks, tracks and meshes were redone to those ends.)
- **BB2's tail (row BB2s):** past about 5496 the tracker loses the print (98 of 114 frames fitted), so the paint-out
  stops and Starlight's squeezed strokes showed through as the word faded. An oval on the print's mesh centre, 62 px,
  softens it 3 px over 5488-5520 (6 frames in, 6 out), so the word dissolves into a glow; by 5517 Starlight's print is
  only stripes.
- **Every frame checked** (`... - every frame, fixed (brightened).png`, one sheet per stretch), which turned up three
  more things, now fixed:
  - **BB4's start:** the print comes out from behind his shoulder from 6153, so Starlight's "NNES" showed before the
    word faded in at 6158-6165. BB4 now starts at 6150 with the word and paint-out at full strength, clipped to her
    shirt's mask, so "BABOONS" comes out from behind the shoulder letter by letter.
  - **BB1's last frames, 4117-4126:** in the fast tilt before the cut, the tracked placement trailed the print by up to
    10 px and the old letters' tops showed above the word. There the placement follows the measured print (its box's
    centre, 1 px above), easing in over 4117-4119 (`data/sam/w104_babA_place.txt`; the tracked one is kept as
    `w104_babA_place_tracked.txt`).
  - **BB1s now starts at 4038:** a sliver of the print shows as she enters frame, from about 4040.

```bash
$P -I tools/sam_masks.py "$FF" "upload/17 aoe104c_starlight.mov" 4048 4126 $T/w104_babA_prompts.tsv $T/w104_babA   # (B 5399-5512, C 5991-6056, D 6150-6230 the same way)
$P -I tools/point_tracks.py "$FF" "upload/17 aoe104c_starlight.mov" 4048 4126 $T/w104_babA_tracks.tsv "4100:765,595,877,620,10;4100:740,520,900,680,20"
$P -I tools/tracks_to_place.py $T/w104_babA_tracks.tsv 0-87 4100 820.9,608.2,113.0,-8.0 4048 4126 $T/w104_babA_place.tsv 8 --similar --tol=2 --smooth=3 > $T/w104_babA_place_tracked.txt
# (w104_babA_place.txt = that, with 4117-4126 moved onto the measured print as described above)
$P -I tools/point_tracks.py "$FF" "upload/17 aoe104c_starlight.mov" 5399 5512 $T/w104_babB_tracksw.tsv "5411:874,452,972,480,7;5411:860,400,990,540,20"   # (mesh 15x5)
$P -I tools/point_tracks.py "$FF" "upload/17 aoe104c_starlight.mov" 5991 6056 $T/w104_babC_tracksw.tsv "6011:844,446,964,478,8;6011:830,400,980,540,20"   # (16x5)
$P -I tools/point_tracks.py "$FF" "upload/17 aoe104c_starlight.mov" 6150 6230 $T/w104_babD_tracksw.tsv "6180:788,441,908,473,8;6180:780,400,930,540,20"   # (16x5)
$P -I tools/tracks_to_mesh.py $T/w104_babB_tracksw.tsv 0 15 5 $T/w104_babB_meshw.tsv   # (C, D: 0 16 5)
# (shirt masks grown 3 px into $T/w104_bab{A-D}_grow3, as for B23)
O="--color=orange --refbox=600,600,900,720 --trackon=starlight --orangeoff=30 --orangegain=3 --protect --steadygain --steadyclean=8 --clean --cleanoff=12 --cleanfill=local --cleanpad=7 --cleanfeather=4 --cleanskip=0.53,60 --patchskip=0.53,60 --patchcut=0.3,0.5"
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "17 aoe104c" 4048 4126 tools/data/logo/W104-A $O --shape=1,0,0,1 --search=700,480,950,680 --name=baboons-WA --place="$(cat $T/w104_babA_place.txt)" --occludeseq=$T/w104_babA_grow3 --lettersonly=4048-4126 --wordkeys="4065:0;4068:1" --cleankeys="4064:0;4067:1"
# (BB1f, your note of 30 Oct, the word cut in too abruptly at 4065-4068: it comes into focus instead, under the same 3 px
# oval as BB1s, which now ends at 4047, sharpening over 4066-4078; the oval follows BB1s's keys, then the placement)
$P -I tools/focus_pull.py "$FF" "upload/17 aoe104c_baboons-WA (frames 4048-4126).mov" 4048 4078 "upload/17 aoe104c_baboons-WAf (frames 4048-4078).mov" --clipfirst=4048 --sigma="4048:3;4066:3;4078:0" --oval="4048:810,506,40,22;4050:803,522,48,22;4052:805,527,48,22;4054:808,537,50,22;4056:814,550,54,22;4058:814,561,58,22;4060:816,568,62,22;4062:819,571,66,22;4064:821,574,70,22;4066:823,576,74,22;4068:824,578,77,22;4072:825.3,585.5,81.1,23.2;4075:825.3,593,83.8,24;4078:824.7,601.5,86.8,24.8"
# (BB1 v2, your next note: the trouble was the word coming in late, after the misspelled print had already been seen
# almost face on. Measured frame by frame (tools/data/w104/print_measure_tight.py), the tracked placement was 3-6 px off
# and up to 16% too wide through the camera move, and held the slant at -13 degrees where the print turns from -21; it
# only meets the print at about 4088. bab_place2.py places the word on the print itself (calibrated on 4090-4110, where
# the two agree: width = print length / 1.04), extrapolated over 4048-4049, eased into the tracked placement over
# 4077-4088. The word is then at full strength from 4048, as the print comes out from behind the figure in front, with
# --cleanwide (as BB2-BB4): inside the blurred print the plain shirt is out of the near fill's reach, which left an
# orange haze between the letters over 4048-4058. BB1s now only softens the sliver before it, 4038-4047. BB1f (the focus
# pull) and baboons-WA are kept, commented out in the trial table.)
$P -I tools/data/w104/bab_place2.py $T/w104_babA_place.txt $T/w104_babA_place2.txt
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "17 aoe104c" 4048 4126 tools/data/logo/W104-A2 $O --cleanwide --shape=1,0,0,1 --search=700,480,950,680 --name=baboons-WA2 --place="$(cat $T/w104_babA_place2.txt)" --occludeseq=$T/w104_babA_grow3 --lettersonly=4048-4126
# (BB1 v3, your notes on v2: the start a bit too small, the word bobbing over 4079-4095, the way it gets onto the shirt
# kept. Against a similarity fit of the CoTracker points on the print, v2's word sat 8-10% narrower than the shirt over
# 4051-4069, and over 4077-4100 the hand-over to the tracked placement had it lag the shirt by up to 6.5 px and catch
# up. bab_place3.py: 10% wider over 4048-4066 about the same centre and slant, easing into the shirt's width by 4076;
# over 4077-4100 the word follows the shirt's points, what it was off by at 4077 easing out by 4100; from 4101 as
# before. Measured on the render, the word now drifts about 1.5 px against the shirt over 4076-4100 instead of
# swinging 6.5 px. The v2 render baboons-WA2 is kept, commented out in the trial table.)
$P -I tools/data/w104/bab_place3.py $T/w104_babA_place2.txt $T/w104_babA_tracks.tsv $T/w104_babA_place3.txt
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "17 aoe104c" 4048 4126 tools/data/logo/W104-A3 $O --cleanwide --shape=1,0,0,1 --search=700,480,950,680 --name=baboons-WA3 --place="$(cat $T/w104_babA_place3.txt)" --occludeseq=$T/w104_babA_grow3 --lettersonly=4048-4126
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "17 aoe104c" 5399 5512 tools/data/logo/W104-Bm $O --cleanwide --search=840,430,1000,500 --name=baboons-WBm --mesh=$T/w104_babB_meshw.tsv --meshanchor=5411 --occludeseq=$T/w104_babB_grow3 --lettersonly=5399-5512 --wordkeys="5486:1;5498:0" --cleankeys="5399:1;5504:1;5512:0"
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "17 aoe104c" 5991 6056 tools/data/logo/W104-Cm $O --cleanwide --search=830,420,990,500 --name=baboons-WCm --mesh=$T/w104_babC_meshw.tsv --meshanchor=6011 --occludeseq=$T/w104_babC_grow3 --lettersonly=5991-6056 --wordkeys="6041:1;6049:0" --cleankeys="5991:1;6056:1" --grow=1.12
node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "17 aoe104c" 6150 6230 tools/data/logo/W104-Dm $O --cleanwide --search=770,420,940,510 --name=baboons-WDm --mesh=$T/w104_babD_meshw.tsv --meshanchor=6180 --occludeseq=$T/w104_babD_grow3 --lettersonly=6150-6230 --wordkeys="6150:1;6216:1;6225:0" --cleankeys="6150:1;6230:1"
```

Trial table `review/trial_bb_baboons.tsv` (rows BB1, BB1s, BB2, BB2s, BB3, BB4). 3:20 (BB3) was asked a little bigger: `--grow=1.12` (new in logo_composite.js: the word 12% bigger about its own centre every frame, its tracking and cleaning unchanged); the smaller word is kept as `upload/17 aoe104c_baboonsv1-WCm (frames 5991-6056).mov` (work folder `tools/data/logo/W104-Cm-v1`), its clip and sheet marked `(previous, smaller word)`. Review: `review/fix shots 104/7 - BABOONS shirt (17c
2-15)`, `(17c 3-00)`, `(17c 3-20)`, `(17c 3-25) - Starlight, then fixed.mp4` and `7 - BABOONS shirt (17c) - close-up (2x).png`, and the four `... - every frame, fixed (brightened).png` sheets.
All four OK'd (30 Oct): BB1-BB4, BB1s and BB2s are in `review/fixes_104.tsv`, and part 17 is rendered and checked
(identical to the four previews, Starlight elsewhere within 11):

```bash
node tools/apply_fixes.js "$FF" upload review/fixes_104.tsv fixed "17 aoe104c"
B=upload/trial-bb-baboons; $P -I tools/data/w104/part_check.py "17 aoe104c" "$B/17 aoe104c_preview (frames 4036-4126).mov" 4036 4126 "$B/17 aoe104c_preview (frames 5399-5524).mov" 5399 5524 "$B/17 aoe104c_preview (frames 5991-6056).mov" 5991 6056 "$B/17 aoe104c_preview (frames 6146-6230).mov" 6146 6230
```

**Every-frame check of the overnight 104 trials (30 Oct).** `data/w104/every_check.py` compares each trial preview with
Starlight on every frame:
- **Leaks:** pixels changed by 16 or more (of 255) outside the area the fix should touch. Re-encoding alone moves
  pixels by up to about 11 anywhere, so smaller changes don't count.
- **Softening:** for blurs and head replacements, the fixed area's fine detail as a share of Starlight's.
- **Flicker:** the frame-to-frame change inside the area, fixed against Starlight.

Report: `review/fix shots 104/Every-frame check of the trials (30 Oct).txt`. Results:
- **Hair G1-G4:** nothing changed outside the boxes; flicker is Starlight's.
- **Door sign D1 (both):** no leaks; detail kept 33-67%.
- **Tower sign S1:** no leaks; detail kept 33-42%. One flicker flag (3928) is in the dissolve, where the sign is
  faint and its mask grows; side by side, nothing shows.
- **Housing H1:** detail kept 24-53%. 14 single pixels changed by 16-18 outside, which is codec noise.
- **Teeth (all five options, both shots):** no leaks beyond one pixel at the mouth's edge at 6968 in three options;
  flicker within Starlight's, except two frames of E (1308, 1310), slightly up.
- **Radiman RH:** a few pixels 1 px past the head's mask, on the soft edge of the replaced head, where Starlight's
  face is. Every frame checked by eye too (`data/w104/every/RH_held.png`, `RH_later.png`): A is featureless
  throughout, and B is the back of a head with an ear and no face. B's detail is about Starlight's, since it's a real
  head, not a blur.
- **BABOONS:** checked by eye on every frame (the `... - every frame, fixed (brightened).png` sheets).

## Data

- `data/scan/`: per frame of each part, how much Starlight differs from the original, and the original's
  frame-to-frame change (column 6, used to find cuts). Made by `misread_scan.js`. Used by `list_shots.js`,
  `shot_at.js`, `pick_samples.js`, `scan_shots.js` and `logo_shots.js`.
- `data/proteus_jobs.tsv`: the Proteus job list (part, first frame, last frame, detail, output name).
- `data/logo/LNN/`: each composited logo shot's tables:
  - `track.tsv`: the per-frame fit, match score and brightness gain.
  - `align.tsv`: the line-up shifts, measured and used. L01 and L02 were made before this file existed.

The truck patch keeps its own `truck_mask.js` and `truck_track.tsv` in `patches/truck/`.

## Scripts

| Script | What it does |
|---|---|
| `apply_fixes.js` | Applies a fix list to upload parts: Starlight everywhere, with another source blended in through a soft mask where a fix says so. |
| `check_fixes.js` | Makes check grids for applied fixes: each row is one sample frame, Starlight (before) beside the fixed version (after), cropped around that frame's mask (from <part>_mask.tsv; whole frame for swaps), 642x376 each. |
| `check_proteus.js` | Checks each Proteus render in the upload folder against its input and its Starlight render: size, codec, colour tag, frame rate, frame count, and the model tag. |
| `check_renders.js` | Checks each Topaz render in the upload folder against its input: model tag, size, codec, colour, frame count, length. |
| `dark_frames.js` | Finds single frames much darker than both neighbours (a dropped frame, or a render glitch like 101b frame 230); flickering light and fades show up too. |
| `edge_strip.js` | Finds runs of frames with a light line down the left edge (as in 101b's hologram close-ups, U14). |
| `frame_grid.js` | Makes grids for looking at frames: each row is one frame, original (plainly enlarged) beside Starlight (or another render), 642x376 each, labelled with part, frame and time. |
| `hair_fill.js` | Fills small gaps in dark hair with the hair's own colour (`--maxlum` keeps out bright skin between strands, 104): pockets of sky enclosed by arching strands in Eleena's hair (Episode 101b, behind her head as the pumpkin man appears). Run as `--only=sky` for U10, so the skin at her nape is left alone. |
| `hue_probe.js` | Prints a hue histogram (10-degree bins) of the saturated, bright pixels in given frames of the originals, to tell apart the colours a key has to separate. |
| `ia_fetch.js` | Downloads the Anarchy Online animated series item from the Internet Archive into the project folder, choosing the files worth keeping (episode MP4s, Funcom's original intro.mpg, the script PDFs, the episode images) and checking each against the Archive's MD5. |
| `key_scan.js` | Finds where the Bronto Burger logo's green appears in an upload part: per frame, counts the pixels of the original (at 321x188) within the logo's hue range (125-150 degrees, saturation > 0.45, brightness > 0.3) and their bounding box, then prints the runs of frames with at least MIN such pixels. |
| `list_shots.js` | Lists the shots of an upload part from misread_scan.js output: hard cuts where the original's frame-to-frame change exceeds CUT_THRESHOLD, with softer changes above SOFT shown inside shots (dissolves, fast moves). |
| `line_remove.js` | Paints out a thin streak that Starlight drew sharp (the faint streak in Episode 101's nebula): follows it from rough keyframes, finds it exactly in each frame, and fills a band along it from the picture either side. |
| `logo_composite.js` | Puts a correctly spelled Bronto Burger logo onto a shot: takes the logo from a reference frame where Starlight got it right, tracks where the logo sits in each frame of the target shot (an affine fit of the reference's green to the original's green, which is blurry but in the right place), warps the reference onto Starlight there, and matches its colour to each frame. | New on 29 Oct, all opt-in: `--occludeseq` (a mask per frame), `--mesh`/`--meshanchor`/`--meshss`/`--meshvis`/`--meshstretch` (bend the word along a tracked mesh), `--cleanwide` and `--cleankeys` (paint-out reach and strength), `--cleanfeather` (paint-out eased off at its box's edge), `--wordkeys` (the word's own strength), `--refedge` (Starlight shows where the reference has no picture), `--meshshift` (moves the mesh, keyframed); `--clean` now knows the green logo too; `--gainkeys` now wins over `--steadygain`.
| `logo_drift.js` | Compares where the logo is in two renders of a shot, frame by frame: the green-weighted centroid of the logo (green above red and blue, relative to that frame's brightest green) in file A and file B, and the gap between them. |
| `logo_shots.js` | Finds shots that show the Bronto Burger logo's green (hue 125-150, saturated, bright; same test as the fix tool's logo key) in upload parts. |
| `make_episode.js` | Joins one episode's fixed parts into a lossless master: picture copied frame for frame, original sound trimmed to each part's length, chapters (Teaser, Act 1-3, Tag) and BT.709 tags, each part's length set from its frame count (not the file's stated duration), then checks every frame, the timestamps and every sound sample. |
| `compare_frames.js` | Compares two videos frame by frame (decoded picture MD5s) and lists the frame ranges that differ; `A.mov@START` compares a clip against a stretch of a longer file. Counts frames rather than seeking, so a master's joins can't shift it. |
| `sam_masks.py` | Masks objects through a stretch of a clip with SAM 2, from clicks or boxes on one or more frames. Writes a PNG mask per frame, plus each mask's area per frame. |
| `point_tracks.py` | Follows points (single points, or grids over a box) through a stretch of a clip with CoTracker3, forwards and backwards. Each point gets a hidden/visible flag per frame. |
| `tracks_to_place.py` | Turns tracked points on a shirt print into `logo_composite.js --place` keyframes. It takes how the points moved from the anchor frame and applies that to the word's placement there. `--similar` (turn, scale and shift only), `--tol`, `--smooth`. |
| `tracks_to_mesh.py` | Turns a tracked grid on a print into a mesh for `logo_composite.js --mesh`: every point's position each frame, hidden or not, plus a steadied visible flag. |
| `glasses_fill.py` | Replaces Starlight's glasses with the original's own picture inside a SAM 2 mask made on an enlarged crop of her face (the 29 Oct spike: the original is too blurred at that distance, so it didn't work). |
| `mask_hold.py` | Holds part of a shot still: inside a mask (SAM 2's, at the held frame and each frame, less a passer-by's mask), every frame shows that part of one chosen frame; the rest plays on (103's Ross standing at his desk). |
| `paste_patch.py` | Lays still patches over a shot: each the pixels of one frame (or a prepared frame) under a mask, moved and colour-scaled, faded by keyframes (103's Ross at his desk, held from the shot's start). |
| `recolor_region.py` | Recolours the dark pixels in boxes of one frame towards a colour, keeping their shading (103's Ross: Starlight's black hair made grey). |
| `silhouette_fill.py` | Turns heads seen from behind against a bright sky back into silhouettes where Starlight drew faces: inside each head's SAM 2 outline, blurred within the outline and set to the head's own dark tone (103's Radiman and Ross at the window). |
| `mask_swap.py` | Lays another frame-aligned render (e.g. Proteus) into a shot through per-frame SAM 2 masks, at full strength to the mask's edge (103's pull-back heads). |
| `blur_inside.py` | Blurs among the pixels of a mask only (e.g. a head, so the sky past its profile stays out) and lays that in where a second mask says (103's Radiman: the stubble Starlight gave him). With `--exclude`, fills an area from around it only (104's woman in red: the ear in her hair). |
| `hold_glow.py` | Holds a small glowing detail Starlight keeps losing, for a still camera: what some frames have and another doesn't, lightened in on every frame, skin left alone (104's neon "&" behind the bartender). |
| `inpaint_fill.py` | Paints something out of a shot from its surroundings: inside per-frame SAM 2 masks, each pixel takes the nearest known colour, multi-scale (103's Radiman's hands at the chessboard). |
| `fix_teeth.py` | Mends gappy teeth along the line where the upper teeth meet the lip: gaps closed from the teeth either side, real teeth from another frame laid in, or the row shaded into the mouth (104's Eleena). |
| `tone_inside.py` | Tones down shine inside a mask: brightness above the area's own dark cut to a share, colour kept, fading out over a dissolve (104's open mouth). |
| `track_hold.py` | Holds someone who doesn't move still through a shot the camera moves in: one frame of them, warped into every frame by tracked points (affine plus each point's leftover), blurred to the frame's focus (103's lying man). |
| `paste_head.py` | Replaces a head with a real view of it from another shot: paints the head that's there out row by row, then lays the source head on, scaled to the head's width and following it, toned (103's pull-back). |
| `still_zoom.py` | Makes a held frame move: one frame of a clip, eased from one zoom to another about a fixed point, sub-pixel on the GPU (101's U18). |
| `mesh_drift.py` | Measures how Starlight's own logo drifts against a tracked mesh and writes it, smoothed, as `logo_composite.js --meshshift` keys. |
| `track_overlay.py` | Draws masks and tracked points over a stretch of a clip, full frame, for judging them by eye. |
| `make_fixed_reel.js` | Makes a reel of fixed shots for judging at speed (each shot full frame with its id), or side by side with `--side`. |
| `make_compare.js` | Makes 2x2 comparison videos of one shot: original (plainly enlarged) beside Starlight, and below them two Proteus renders, each pane labelled, with the original sound. |
| `make_ab_reel.js` | Makes a reel for picking between two versions of a set of fixes: per shot, original, Starlight, A and B in a grid, with sound. |
| `make_fix_reel.js` | Makes a review reel of applied fixes: for each fix in the list, the fixed frames plus a second either side, Starlight (before) beside the fixed version (after), with the original sound and a label naming the fix. |
| `make_joined.js` | Joins Funcom's 17 original parts of the Anarchy Online animated series into one MP4, in Funcom's playlist order (each episode: Teaser, Act 1-3, Tag), encoded once with x264 at near-transparent quality. |
| `make_logo_reel.js` | Makes a review reel of listed shots: each shot whole, with the original (plainly enlarged) beside Starlight on top and a zoom that follows the shirt logo (with room below it for the picture and text) underneath, original beside Starlight. |
| `make_review.js` | Makes one side-by-side review video per episode: the original (plainly enlarged) on the left, the Starlight upscale on the right, with the original sound. |
| `make_sheets.js` | Makes review sheets for looking over an upscale by eye. |
| `make_shot_clip.js` | Makes a review clip of one shot: the original (plainly enlarged), Starlight and the fixed version side by side at full size, with a bar on top naming the shot and showing the part's frame number. |
| `make_uploads.js` | Prepares the Topaz upload files for the Anarchy Online animated series from Funcom's original MPEGs: black bars cropped (352x188 at y=26), pixel shape kept (200:219), constant 29.97 fps, ProRes 422 HQ with BT.601 tags, PCM audio. |
| `make_variant_clip.js` | Makes a comparison clip of one shot in four panes (original, Starlight, two composites; three panes if B is "-"), whole frames on top and a zoom underneath that follows the logo (from a logo_composite.js track.tsv: the reference point REFX,REFY carried into each frame through that frame's fit, smoothed). |
| `mask_overlay.js` | Shows where ellipse fixes act: for each listed frame, the Starlight frame (half size) with the fix list's ellipse masks tinted red by strength, a 100-pixel grid (in 1284x752 coordinates) and labels. |
| `misread_scan.js` | Looks for places where an upscale changed what's in the picture: shrinks the upscale and the original to the same small size (176x94, half the original) and, frame by frame, finds the block where they differ most. |
| `mpeg_info.js` | Reads the first MPEG video sequence header and MPEG audio frame header of each .mpg file given, and prints the picture size, aspect, frame rate, coded video bitrate and audio format. |
| `pick_samples.js` | Picks frames to look over by eye from misread_scan.js output: splits each part into shots (at cuts), splits long shots into stretches of at most MAX_SECONDS, and from each stretch takes the frame whose most-changed block differs most (skipping a few frames at each end, where dissolves sit). |
| `proteus_render.js` | Renders Proteus 4 upscales of frame ranges of the upload files with Topaz's own ffmpeg (the filter and settings the Topaz Video app uses: auto mode, everything else at 0), made to drop in beside the Starlight renders: 1284x752 square pixels (squeezed to 321x188 first, as Starlight does), BT.709, ProRes 422 HQ 10-bit, 29.97 fps, no audio. |
| `red_locate.js` | Finds where the shirt's red text sits relative to the logo: for each tracked frame of a composite run (track.tsv from logo_composite.js), takes the red pixels of the original (red well above green and blue) and maps them into the reference frame's coordinates through that frame's fit. |
| `run_baboons.sh` | Composites the BABOONS shirt text onto every shot in `data/baboons_runs.tsv` (or the ids/parts given). |
| `scan_shots.js` | Groups misread_scan.js output into shots and ranks the shots where the upscale differs most from the original. |
| `shot_at.js` | Finds the shot containing a given time in an upload part, from misread_scan.js output (cuts where the original's frame-to-frame change exceeds CUT_THRESHOLD). |
| `truck_mask.js` | Writes a soft moving mask (raw 8-bit gray frames, 1284x752) to stdout for the 70-second Episode 101 clip: a feathered oval over the distant hover-truck, which Starlight misread as a rock. |
| `sharpness_check.sh` | Checks which Starlight sharpness a full render used, by comparing it with test renders whose setting is known. |

Glasses painted out of Starlight's face (102's B22 trial, 28 Oct): head track by `track_region.js`-style tracking in
`tools/data/glasses/B22_head.tsv`, then
`node tools/glasses_remove.js "$FF" upload "upload/08 aoe102b_baboons-B22 (frames 5568-5829).mov" "08 aoe102b" 5568 5829 tools/data/glasses/B22_head.tsv --band=-1,11,28,9 --radius=1 --thresh=3,6 --paint=skin --grow=1 --glints=8,10 --glintradius=2 --fillrule=trim --tmax=2 --tfill=2 --name=paint9`

Her whole figure from Proteus (102's B22 trial, 28 Oct): `body_swap.js` (head and torso ovals on the tracks in
`tools/data/glasses/`, cut at the crates' top edge), then the word laid on that with `logo_composite.js --base`:
`node tools/body_swap.js "$FF" upload "08 aoe102b" 5568 5829 --head=tools/data/glasses/B22_head.tsv --torso=tools/data/glasses/B22_torso_starlight.tsv,tools/data/glasses/B22_torso_original.tsv --headshape=-2,0,25,36 --torsoshape=-2,25,60,70 --above=389 --feather=6 --name=bodyproteus`
then B22's `baboons_runs.tsv` options without `--clean --cleanoff=12 --steadyclean --protect=left`, plus
`--base="upload/08 aoe102b_bodyproteus (frames 5568-5829).mov" --soft=9 --name=baboons-B22p`.

102's B24 (clip 19): the shirt is left as Starlight (too far away to matter); only the lower rim of her left lens is
softened, from 6515, on a lossless cut of Starlight's frames 6483-6587 (the fix table lays it in through an oval
that follows her head, `src=glassesrim-B24`):
`node tools/glasses_remove.js "$FF" upload STARLIGHT_6483-6587.mov "08 aoe102b" 6483 6587 tools/data/glasses/B24_head.tsv --band=1,5,11,4.5 --radius=2 --thresh=4,8 --paint=skin --skin=14,2 --grow=1 --fillrule=trim --tmax=2 --tfill=2 --strength=0.8 --start=6515 --name=glassesrim-B24`
(the cut: `ffmpeg -ss 216.316100 -i "upload/08 aoe102b_starlight.mov" -frames:v 105 -map 0:v -c copy STARLIGHT_6483-6587.mov`)

102's B26 (part 10, 11:58-12:00, frames 3387-3456; not in `baboons_runs.tsv` because its reference is that part's own
print at frame 2687, a faint tan one, rather than 09's frame 6701):
`node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "10 aoe102d" 2687 "10 aoe102d" 3387 3456 tools/data/logo/B26 --color=orange --refbox=440,665,650,752 --refoff=14 --refgain=4 --orangeoff=14 --orangegain=4 --search=360,630,700,752 --trackon=starlight --patchcut=0.02,0.08 --soft=0.3 --gainkeys="3387:1.08;3392:1.0;3397:0.88;3402:0.76;3407:0.66;3412:0.59;3417:0.54;3456:0.54" --clean --cleanoff=8 --cleancore=16 --cleanfill=local --name=baboons-B26`
(the gain keyframes follow the brightness of Starlight's own print there, which halves as she turns from the light)
