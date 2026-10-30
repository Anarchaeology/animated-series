# How it was made

## The short version

1. **Start from the best surviving copies.** Funcom's own 2001 release files, all 17 parts.
2. **Enlarge them with an AI video model.** Topaz Labs' *Starlight*, in the program Topaz Video, redrew every frame at
   four times the size.
3. **Review every shot by eye** against the original.
4. **Fix what the AI got wrong, by hand**, wherever a fix looked better than leaving it. For example, words it misspelled, faces it drew on the backs of heads, wall
   showing through hair. A few changes go further than that, where the original itself had a flaw; those are listed
   separately in [DECISIONS.md](DECISIONS.md).
5. **Join everything** with the original, untouched sound, check every frame, and encode the YouTube file.

## What "Starlight" is

[Topaz Labs](https://www.topazlabs.com/) is a company that makes AI software for enhancing photos and video.
*Starlight* is its family of video models, which Topaz describes as the first diffusion AI model for video
enhancement: the same kind of generative AI as AI video generators, but trained to redraw existing footage rather
than make new footage. It doesn't just sharpen. It redraws each frame at a higher resolution, looking at the frames
around it so that motion stays steady.

That is why the results look so much better than older upscaling, and also why they need checking. A model that
redraws can redraw wrongly. Here it misspelled small lettering, turned a distant truck into a rock with two figures,
drew faces on the backs of bald heads, and invented an ear in someone's hair. Finding and fixing those is most of
the work this repository documents.

## 1. Source

| | |
|---|---|
| Files | Funcom's MPEG release of all 17 parts, `aoe101a.mpg` … `aoe104d.mpg` (538 MB in all), as Funcom's FTP held them (saved from it in 2016 into Timba's public collection; see [SOURCES.md](SOURCES.md)). Their sizes match Funcom's download pages; all decode without an error |
| Video | MPEG-1 (Video CD format), 352×240, 29.97 fps, 1,150 kb/s. Letterboxed: the picture is 352×188, with slightly narrow pixels (200:219), so it is about 1.71:1 when shown correctly |
| Sound | MPEG audio layer II, stereo, 44.1 kHz, 192–224 kb/s |

## 2. Preparing the files

- The black bars were cropped off (352×188 at y=26). The pixel shape tag (200:219) was kept.
- Constant 29.97 fps, ProRes 422 HQ, standard SD colour tags (BT.601), the sound as PCM.
- The opening titles are kept only in Episode 101. In 102–104 the same title sequence follows the teaser; it is cut
  at the teaser's fade to black.
- Part 101c (5:31) was split at a hard cut, because Topaz's cloud renders were limited to 9,000 frames.

18 files in all, 49:10.

## 3. The upscale

| Setting | Value |
|---|---|
| Program | Topaz Video (Topaz Labs) |
| Model | **Starlight Precise 2.6** (`slp-2.6`) |
| Sharpness | 1, the lowest of three |
| Scale | 4×, to 1284×752 with square pixels |
| Every other enhancement | off: frame interpolation, stabilization, grain, focus fix, motion deblur, denoise, SDR-to-HDR |
| Where | Topaz's cloud (the local graphics card, an RTX 2070 Super with 8 GB, can't run Starlight) |
| Cost | about 1,550 Topaz cloud credits for the series, from a month of Topaz's cloud credits ($99.99); the Topaz software itself was $69 |
| Output | ProRes 422 HQ, BT.709 colour |

### Choosing the model

On paper, Precise was the wrong choice. Topaz recommends *Starlight Mini* for older, low-quality and
standard-definition video, and describes *Precise 2.6* as tuned for realistic faces on medium- to high-quality
sources, "not ideal for content below 480p". This picture is 188 lines tall. So the models were tested on the footage
itself: four 10-second clips from Episode 104 (Eleena in close-up, a dark scene in the bar, the chess scene, the
opening titles), then 70 seconds of Episode 101, compared side by side with the original, both playing and paused.

| Tried | What it is | Result |
|---|---|---|
| Proteus 4, auto | Topaz's older, non-generative model: it cleans up what is there and invents little | Faithful, but soft. Kept as a source for spot fixes |
| Starlight Mini | Topaz's lighter generative model, the one it recommends for old, low-resolution video | Hazy and mushy here, barely better than Proteus. Dropped |
| Starlight Precise 2.6, sharpness 3 (Topaz's default) | Topaz's newest Starlight model (August 2026), at its sharpest | Crunchy edges, over-sharpened hair, heavier invented texture. Dropped |
| **Starlight Precise 2.6, sharpness 1** | The same model, at its lightest touch | A big jump in detail, with the faces still clearly the same characters and the titles intact. It does invent surface detail: weathering on a ship's hull, "text" on a panel that is a dark blur in the original. Judged acceptable. **Chosen** |
| Astra 2, creative mode | Topaz's web app, steered by a text prompt | Tried only on the distant truck that Starlight turned into a rock: it drew a ship, but not the one the shot pans to. Dropped |

Considered but not tested: free upscalers such as Video2X with Real-ESRGAN (made mostly for drawn anime, not 3D CG),
Topaz's Iris and Gaia 2, and the other Starlight variants (Sharp; HQ, made for better sources; Fast 2, made for
speed). None of the Starlight models runs on the local graphics card, so every Starlight test cost cloud credits.

Rendering at Starlight's own 4× size also kept the cost down: about 30 credits a minute, against about 90 at 1080p and
150 at 4K. The step from there to 4K was a plain enlargement at the end, since Starlight's own detail stops at 4×.

## 4. Review

Every episode was reviewed shot by shot, the original beside Starlight. Each problem became a note; each note became
one or more fixes, tried as a short clip (Starlight first, then the fix) and kept or redone on the reviewer's call.
[DECISIONS.md](DECISIONS.md) lists them all.

## 5. Fixing

Every fix is a row in a fix table ([fixes/](fixes/)): which part, which frames, what kind of fix, what it draws from.
`tools/apply_fixes.js` lays each fix over Starlight through a soft mask, so everything outside it stays Starlight's
own pixels. The commands that made every fix source are in [tools/README.md](tools/README.md). What the fixes draw
from:

- **Proteus 4** (Topaz's earlier, non-generative model; auto mode, "recover original detail" 20, 4×), rendered
  locally, for spots where Starlight misread something that Proteus gets right.
- **The original, plainly enlarged**: soft, but exactly what is there.
- **Starlight blurred**, for things that should stay unreadable rather than be redrawn wrong.
- **Lettering and logos laid back in**: the right word, taken from a frame where Starlight drew it correctly, tracked
  onto the shirt or sign (`tools/logo_composite.js`), following it as it moves and bends.
- **Masks and tracking**: Meta's SAM 2.1 (segmentation) and CoTracker3 (point tracking), run locally.
- **Paint-outs, holds and pastes**: filling a spot from around it, holding a frame still, or taking a detail from
  another frame where it is right (`inpaint_fill.py`, `mask_hold.py`, `track_hold.py`, `paste_head.py`, `hair_fill.js`
  and others).

## 6. Masters and the YouTube file

- **Episode masters**: the fixed parts joined frame for frame (ProRes 422 HQ), with Funcom's sound as PCM, each part's
  sound trimmed to its picture's length so sync holds across parts, and a chapter per released part. Each master
  checks itself: every frame identical to its part, every frame on the frame grid, the sound identical sample for
  sample.
- **The series master**: all four episodes in Funcom's order, with the end credits of 101–103 cut at the fade to black
  before them, so the credits come once, after 104.
- **The YouTube file**: the series master enlarged (Lanczos) to 3688×2160 (its own 1.71:1 shape at 2160 lines), x264 `slow`
  CRF 10, 4:2:0, BT.709, the PCM sound, 17 chapters; 21.8 GB at about 60 Mb/s. Checked: the sound is sample for
  sample the master's; the picture matches the master enlarged to 4K at 53 dB. 4K is only for YouTube: its 4K tier
  gets far more bitrate at every resolution it streams.

## Tools

Topaz Video (Starlight Precise 2.6 in Topaz's cloud, Proteus 4 locally); Meta's SAM 2.1 and CoTracker3; ffmpeg 9.0.2;
x264; Node.js and Python (PyTorch) for the scripts in [tools/](tools/). The scripts were written for this project with
an AI coding assistant (Claude); see [EFFORT.md](EFFORT.md).
