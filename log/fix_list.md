# Starlight fix list

> The list of review notes and fixes as it was kept, 26–30 Oct 2026, lightly edited for publication.
> Claude wrote it as the work went; "you" and "your call" mean the person reviewing and deciding. It refers to
> project folders (`originals/`, `upscaled/`, `review/`…) that hold video and aren't in this repository.

## Your review (watching the review videos)

Episode 101 (times approximate):

| # | Part | Time | What's off | Fix idea |
|---|---|---|---|---|
| U1 | 01 aoe101a | 1:07 | The parked truck coming in from the right looks like a rock | patch (reuse the test patch in `patches/truck/`) |
| U2 | 02 aoe101b | 0:18 | Left side: the flat table in front of the two seats becomes a stand with strange letters (later shots show a table with cups) | patch |
| U3 | 02 aoe101b | 0:39, 0:53, 3:04 (and more) | Shirt logo misspelled ("breate burger", "brneta burger"); the original is too blurry to read. Good at 03 0:16 | logo patch from a green key, every shirt shot |
| U4 | 02 aoe101b; 03 aoe101c-1 | 02: 1:06–1:16, 1:19–1:24, 2:03–2:07, 2:20–2:27; 03: 0:32, 1:10, 1:48 | The far-away hologram man looks like a different person | swap to Proteus |
| U5 | 03 aoe101c-1 | 2:11 | Ross farther away: face made super sharp, looks like a different person | patch or swap |
| U6 | 04 aoe101c-2 | 0:51 | Shirt: the logo is fine, the small red text under it is wonky | logo patch |
| U7 | 05 aoe101d | 0:53 | Man far away facing out: a face drawn on the back of his head (clears up as the camera gets closer) | patch or swap |
| U8 | 06 aoe101e | 0:18 | Masked man: very grainy original, Starlight overdoes it (nose especially) | swap to Proteus |

Status (27 Oct): all of these are applied in `fixed/` from `fixes_101.tsv`; see
`Episode 101 fixes - Starlight vs fixed.mp4`. U3 (logo spelling) is fixed by compositing the correct logo from L12 onto
L01, L02, L04, L07, L08 and L10, with the red text below made soft; each was reviewed and approved shot by shot
(`logo shots/`). L03 was kept as Starlight, without the red softening. See `logo_shots.tsv`.

Claude's notes for Episode 101, as of 27 Oct (clips in `fix shots/`):

- #1 truck: U1.
- #2 the "chair" at the back of the office: this is Eva Pourais. Starlight's face for her contradicts her close-ups in
  Episode 104, so she's U11 (Starlight blurred 1.5 + grain, your pick).
- #8 masked figure: U8.
- #10 hologram: the far shots are U4. The shoulder crack lines at 1:52 are in the original too; left.
- #12 nebula line: U9. The diagonal streak is painted out; the starburst cross stays (approved).
- #13 hair: U10. The sky showing through her hair is filled, including through the focus pull (approved); the nape
  is left as is.
- #14 banner squiggle (`05 aoe101d` 1:12): you checked it; fine as Starlight.

Episode 101 is done: every note from both lists is fixed, or left as Starlight by your decision.
29 Oct, with SAM 2 and CoTracker3: L02 now carries the logo through her whole turn (it used to hand over to
Starlight's misspelled logo at the ends), and L10 no longer pulses or shows Starlight's capital "B" at the left (a
tracked mesh following Starlight's own slow drift, with Starlight's leftover logo painted out). L03 and L05 stay as
they were (your call). Master rebuilt and checked.
29 Oct, second round: Ross's reflection (U15, U15b) back to plain Starlight (your call); Ross at his desk at 8:44-8:51
(new, U16) replaced by the chessboard shot from 4:47, its first frame held 18 frames.
Also new: U17, Ross far away at the window (3:47): the face Starlight drew on the back of his head is blurred,
greyed and darkened inside his silhouette (dark 70, your pick).
Also new: U18, Ross far away at his desk (9:15-9:21): opens on the softened frame 4143 with a slow pull-out from
1.10x, then plays on; U5 now starts at 4143. Parts 02 and 03 re-rendered; master rebuilt and checked (29 Oct,
evening). Round done.

Your watch of the joined master (27 Oct), times in the master:

- 3:37, black flash: a one-frame glitch in Funcom's original (`02` frame 230, city layer missing mid-dissolve). U12
  blends frames 229 and 231.
- 13:48, robot with a human face: Starlight paints a face on its dome as the focus pulls to it (`05` frames
  2205-2252). U13 puts a Proteus oval over its head. U13b (your idea) holds the clean head from frame 2218 as a still
  until the close-up (approved).
- About 4:46-5:49, light line down the left edge in the hologram close-ups: it's in the original too, and Starlight
  makes it a bright and a dark column. U14a-c mirror the outer 3 columns from inside (approved: "we prolly got the
  worst of it").
- Opening of Act 1, Ross's reflection in the window: his stubble flickers in and out. U15 (frames 231-515, right
  after the U12 flash frame) and U15b (the second reflection shot, 578-710) cover his face with Proteus, your pick:
  the reflection is meant to look unclear.

A scan of all 18 original parts for single dark frames found two more worth a look:

- `03 aoe101c-1` frame 1539 (about 9:25 in the master): one black frame exactly at the cut from Ross to the hologram.
  Left alone for now; it may be deliberate.
- For later: `18 aoe104d` frame 1281 (a big dip, like 230), `16 aoe104b` 7384, and `17 aoe104c` 3903.

The other hits are flickering firelight in 101a and dips within fades.

**Episode 101 signed off (27 Oct).** The black frame at frame 1539 stays as Funcom made it.

## Episode 102: your review (28 Oct)

Times are within each part, as in the review video's bar; the shot ranges were found from them.

**Her BABOONS shirt.** The biggest job. Starlight reads the orange text right in some shots, such as `08` 65-93 and
all of `09`'s close-ups. Elsewhere it writes gibberish ("BABNMES", "BABANEB", "SABMIES", "GANJNER"...). There are 21
shots, B01-B21, in `baboons_shots.tsv`; a sheet of what Starlight writes is in `Baboons shots - what Starlight
writes.png`. The fix is the same as Bronto Burger in 101: composite the clean word from `09 aoe102c` frame 6701 (the
clearest, front-on, your pick) onto each shot, following the original.

| # | Part | Shots | What's off | Fix (in `fixes_102.tsv`) |
|---|---|---|---|---|
| V1a-c | 08 aoe102b | 5568-5829 (3:06-3:14), 5933-6317 (to 3:31), 6483-6587 (3:36-3:40) | She's suddenly wearing glasses, in far shots behind the cookie stand | **Left as Starlight (glasses kept), 28 Oct**: see below |
| V2 | 09 aoe102c | 35-330 (around 0:05) | Walking away from us, a face grows on the back of her head | Proteus oval over her head |
| V3 | 09 aoe102c | 8701-8818 (4:50-4:54) | Joshua Khan walking towards us down a dark corridor: his face looks too feminine | Proteus oval following his face |
| V4 | 07 aoe102a (titles cut) | 900-967 (0:30-0:32) | Pulled-back shot of Radiman at his desk: he looks like a generic male model | ~~Proteus oval over his whole head~~ **Left as Starlight (your call on rewatching the master, 28 Oct; Proteus was too soft, blurring didn't help)** |

You called this "approximately all the issues". The face fixes were compared in `fix shots 102/V1-V4 faces - pick A
or B.mp4` and the close-up still. You picked A, Proteus, for all four (28 Oct): blurred + grain left the glasses and
the false faces faintly visible.

The glasses shots V1a-c also need the BABOONS fix: her shirt reads "BABMES"-like there too. They're added to the
BABOONS list as B22-B24.

**Glasses kept (28 Oct).** Tried on V1a (clip 14) and none was good enough: the Proteus face oval (rough next to
Starlight's sharp body), taking the rims out of Starlight's face (filled from skin or from Proteus: a ghost outline;
then a narrow skin paint: still didn't work), and her whole figure from Proteus (no glasses, but out of focus against
the alley). Blur + grain had already left them faintly visible. Your call: keep Starlight's faces, glasses and all,
and just fix the shirt. V1a-c are out of `fixes_102.tsv`; the trial files (`upload/08 aoe102b_noglasses*`,
`_paint*`, `_bodyproteus`, `_baboons-B22p`) and `upload/glasses redo/` aren't used.

**BABOONS shots, one clip at a time (28 Oct).** Clips 01-16 approved with the word composited (pinned where she holds
still, following her torso or Starlight's own lettering where she moves). Added B25 (clip 10b), the shot rising from
the COOKIES crate to her chest, which the first list missed. **Clips 17 and 18 (B09a/B09b, the turn behind the crate)
use blurred Starlight instead**: after many rounds the composite never sat right through the turn, so Starlight's own
lettering is blurred 3 px (with the original's grain) inside an oval that follows it (6318-6380 and 6410-6482), your
pick over 5 px. The composited versions are kept in `fix shots 102/baboons/versions/` and `upload/versions/`, with
their run options in `tools/data/logo/B09a_versions.tsv`. **Clip 19 (B24)**: no shirt fix, it's too far away to
matter (your call); the only change there is the lower rim of her left lens, softened from 6515 where it cut across
her cheek.

**All BABOONS clips approved (28 Oct)**: 01-24 and 10b. Clip 20 (B15, truck cab) now covers the whole shot,
1776-1876, through the gun's flash and her lunge; clips 21-24 (B10-B13, at the desk) stop at the table's edge.
B14 (09 aoe102c, inside the truck in dim light): where she comes up facing us (1240-1298) the print reads
"BASANES"; it's too dim for a composite, so it's blurred 5 px instead (your pick). Not fixed, Starlight's lettering
left as is: the two far shots behind the crate (08 aoe102b 4458-4572
and 5253-5362), too far away to matter, as with clip 19. Two far shots behind the crate (4458-4572, 5253-5362) are
still unfixed, waiting on your word.

**Reopened 29 Oct (evening).** Clip 16 (B23, 4:37 in the master): the word bounced and seemed to come off her chest.
It's now placed from her tracked shirt print (SAM 2 + CoTracker3), with only its letter strokes drawn and the
paint-out eased off by her arm. Your pick: row B23t, part 08 re-rendered, master not yet.
Same evening: the alley turn's word coming back (4:53-4:54) no longer flashes. Our word comes in first and Starlight's
thick print is painted out after it, over 20-24 frames, so the orange never dips (your pick over a 12-18 frame version;
row B09m-back now uses `mesh-B-ease20`). New clip, B27: the quick shot of her profile in the ship (11:50.6-11:52.5,
`10 aoe102d` 3149-3205), done like B26 (your pick, row B27m). The long profile shot before it (2891-3105) stays as
Starlight (your call). Parts 08 and 10 re-rendered; master rebuilt and checked (29 Oct, evening).


## Claude's pass (still frames)

Times are within each part file, as shown in the bar at the top of the review videos (e.g. "03 aoe101c-1 2:19").
Fix choices: **patch** (Proteus through a soft mask over just that spot, like the truck), **swap** (use Proteus for
the whole shot), **leave**.

The first list comes from Claude looking over 1,014 still frames (about one every 3 seconds, each with a close-up of
the spot that changed most). Motion, and anything outside the close-ups, can be missed, so the watch-through is the
real check; add rows for anything else that looks off.

## Starlight changed what's there (likely fix)

| # | Part | Time | What's off | Fix |
|---|---|---|---|---|
| 1 | 01 aoe101a | 1:05–1:13 | The distant hover truck becomes a rock with "figures" on top (known) | patch |
| 2 | 03 aoe101c-1 | 2:19–2:30 | A small seated person at the back of the office looks like a chair with a white object on it | |
| 3 | 10 aoe102d | 2:33–2:36 | The man looking up in the warehouse: his face is mostly shadow and blur in the original; Starlight builds a full face | |
| 4 | 14 aoe103c | 0:47–0:50 | The man behind the hatch: a blur in the original, a specific face in Starlight | |
| 5 | 12 aoe103a | 0:17–0:21, 0:47–0:55, 1:00–1:03 | The eyepiece man in profile: a spiky tuft (like wire or feathers) drawn at his temple | |
| 6 | 16 aoe104b | 0:41 | Same tuft on the eyepiece man | |
| 7 | 13 aoe103b | 1:24–1:27 | Light through the window blinds: soft bands become ragged, torn-looking edges | |

## Different look, not wrong (judge by eye)

| # | Part | Time | What changed | Fix |
|---|---|---|---|---|
| 8 | 06 aoe101e | 0:18–0:52 | The hooded masked figure: the original's murk and grain (looks deliberate) is cleaned away, leaving a crisp gas mask | |
| 9 | 16 aoe104b | 2:20–3:02 | The see-through ghostly man at the chessboard: grain cleaned, he looks more solid | |
| 10 | 02 aoe101b | 1:05–2:26 | The green hologram: soft glow becomes a sharper figure with glitter; a few white crack lines on its shoulder at 1:52 | |
| 11 | (everywhere) | | Backgrounds and background people that Funcom left out of focus get sharpened, e.g. 09 aoe102c 1:53–2:01 (eye-patch man), 17 aoe104c 0:05–0:32 (masked doctor behind the console) | |

## Small things (probably leave)

| # | Part | Time | What changed |
|---|---|---|---|
| 12 | 01 aoe101a | 0:30–0:42 | Nebula: a thin straight line and extra specks added |
| 13 | 02 aoe101b | 3:14–3:17 | Back of the girl's head: the hair edge turns ragged |
| 14 | 05 aoe101d | 1:12–1:15 | A squiggle symbol drawn on the blurry hanging banner |
| 15 | 09 aoe102c | 0:36–0:44 | Speckled wall grime becomes long drip streaks |
| 16 | (several) | | Tiny unreadable text becomes fake lettering: the cookie crates (102c), a bottle label (104b 1:13), the SNARF poster's small print (104b 3:16), the girl's shirt logo (104c 2:13–3:29), the lit tower top (104d 1:16) |

## Checked and faithful

Faces and expressions, all title cards and credits (names spelled right, ø/æ/å intact), the signs (Bronto Burger,
Bingo Cookies, OUT OF ORDER, ALERT, BAR, omni-tek housing project / omni 491-112, The Outzone), the chess pieces, the
explosions and smoke.


## Episode 102: revisions after watching the master (28 Oct)

- V4 (Radiman at his desk): back to plain Starlight. Later (29 Oct) the shot was replaced outright: brows painted on (from his
  close-ups) didn't work, a different shot was the better answer. Its 2.3 s (no dialogue, only room sound) now show a still
  insert of the viewscreen, cropped 2.5x from the later back view (row V4s; the sound is untouched). Part 07 needs re-rendering and the master rebuilding once the
  revisions are done.
- The alley turn (clips 17+18, 08 aoe102b 6318-6482), now treated as one shot: the BABOONS composites are back,
  handing over to Starlight through a 3 px blur (the word goes soft, then fades under the blur as she turns away;
  the reverse as she turns back) instead of blurring the whole turn. Rows B09a, B09b, B09a-blur, B09b-blur.
  Part 08 needs re-rendering too.
- Desk scene, 8:34-9:55 (09 aoe102c 6267-8635): pockets of wall showing through her hair, filled with hair colour
  in her seven close-ups (rows HF1-HF7; tools/hair_fill.js, with --hair=14 and --headonly added for this dark room).
  The shirt fixes in the wide shots (B10-B13) are untouched, checked frame for frame. Approved. Part 09 needs re-rendering.
- 11:58-12:00 (10 aoe102d 3387-3456, her profile, a faint tan print): Starlight blurred 1.5 px over its own print
  (row B26). A composite of the 11:35 print (frame 2687) was tried first; at this size its tracking showed. Part 10
  now has a fix too, so it needs a fixed render for the master.
- Far warehouse shots in part 10 (11:03.5, 11:19.9, 12:41.7, 12:48.3, 13:06.6; frames 1744-1860, 2234-2349,
  4685-4781, 4884-5014, 5432-5560): Starlight makes the tiny figures by the crates look like shiny dolls, so each
  figure is blurred 2 px with grain in its own oval (rows F1a-F5). Approved.
- Rebuilt 29 Oct: parts 08-10 re-rendered from the fix table (07 now plain Starlight) and the master rebuilt. Checked
  frame for frame: the alley turn, B26 and the five far-figure shots are identical to the trials you approved; against
  the 28 Oct master, part 08 changed only in the alley turn (6318-6380, 6445-6482) and part 09 only in HF1-HF7.
- 29 Oct, after the rebuild: with SAM 2 and CoTracker3 (see the README), the alley turn (clips 17+18) became one word
  bent along a tracked mesh through the whole turn, no fade or blur (rows B09m-out, B09m-back; the 28 Oct rows kept,
  commented out), and B26 became the 11:35 print carried along a tracked mesh instead of the 1.5 px blur (row B26m).
  Both your picks. B14 was tried tracked too; you kept its 5 px blur. Master rebuilt and checked again.

## Episode 103: your notes (29 Oct)

Times are in the part (`13 aoe103b`).

- 0:26, Ross small at his desk: wrong face and hair, and the face and hands deform midway. **R1**: head and hands
  held as they are at the shot's start, hair recoloured grey (your pick).
- 0:48-1:05, Ross standing at his desk: his hand glows, then he turns into a tower. **R2**: held as he is at 1470
  (approved).
- 1:13-1:24, Ross walking to the window: a face on the back of his skull. **R3**: darkened inside an oval that follows
  his head, as 101 U17 (your pick).
- 1:34, Ross from a new angle: his blond hair glitches for one frame (2833), in the original too. **R4**: a
  motion-compensated in-between of the frames either side, over his head (your pick).
- 1:35.5-1:40, the camera pulls back from Radiman and Ross at the window: phantom faces on the backs of both heads.
  **R5r**: the real backs of their heads, from shots where Starlight drew them right (Radiman at 1930, Ross at 1470),
  at one size on a steady path, toned to your notes (your idea and pick, 29 Oct, late). It replaced **R5**, Proteus
  (detail 50) laid into both heads, picked earlier that night after three rounds of made-up silhouettes; R5 is kept
  commented out in the table to go back to.
- 2:02.8-2:04 and about 0:13, the building with the blue sign: Starlight tries and fails to write letters on it.
  **R6a/R6b**: the panel blurred 2 px inside its mask, the same in both shots (your idea).
- 2:06, Radiman at the chess table seems to have a beard. **R7**: his jaw blurred slightly within his own head (your
  idea and pick).
- 2:21, 2:47-2:48, 3:14: Radiman's hands sit oddly in the corner of the frame (you can hardly tell his arms are there). **R8a-c**: painted
  out of the corner of all three chessboard shots from the dark around them (your idea and pick).

That was all your notes for 103. Master built and checked (29 Oct, night).

Reopened the same night:
- The pull-back's heads: R5r, above.
- 5:27-5:33 in the master (part 13 frames 6925-7092), the bald man lying in the corridor: the pattern on his sleeve
  crawls as the camera pulls back and comes into focus, in the original too. Tried: holding him as he is at 7060,
  carried along with the camera (trial R9, `review/trial_r9_lyinghold.tsv`). Your call: Starlight kept.

## Episode 104: your notes (30 Oct)

Times are in the part (`15 aoe104a (titles cut)`).

- 0:09-0:32, Eleena on the table with her mouth open: the black inside her mouth is shiny (in the original too).
  **M1a/M1b**: the shine inside the opening cut to 30% (your pick over half).
- 0:22-0:27, the woman in red in profile: her ear shows through her hair in detail, in the hair's colour. **E1**: the ear
  filled from the hair around it (your pick).

Your nine notes of 30 Oct (night), each prepared as a trial for review (none in the table yet):
1. 16 aoe104b 0:44, her teeth broken up (in the original too). **T1**, three options: A real teeth from 4:03, B gaps
   closed, C shaded. Your call: the close-up cut short and replaced by the wide shot of the bar (1015-1108); two cut points,
   A at 1291 (its own speed), B at 1255 (slowed to 72%). A picked; in fixes_104.tsv.
2. 16 aoe104b 1:08.5-1:14 and 1:18, gaps in her hair. **G1, G2**: filled with hair colour. Your note: G1 missed big
   pockets at the top right; now filled too, and the three you circled (**G1f** for the fleck). Your OK; in the table.
3. 16 aoe104b 2:12, the blue sign on the tower. **S1**: blurred, as 103's R6 (your OK; in the table).
4. 16 aoe104b 3:17, a face on the back of Radiman's head. **RH**, two options: his first frame held and softened, or
   the back of his head from the next look-out shot. Your note: B, with the whole frame held (his torso moved against
   the head); now B held as at 5897. Also, your idea: the first frame held with the head blurred. **RH**: that one (your pick).
5. 16 aoe104b 3:39 and 3:51, more hair gaps. **G3, G4a, G4b**. Redone after note 2's lessons: lit pockets at the top
   filled, the whisker square you pointed out left open. Then your note that it flickered: now only holes in the main
   mass of her hair, each fill held steady over several frames. That didn't work; your call: the previous version
   (G3, G4a, G4b), in the table.
6. 16 aoe104b 3:51, her teeth again. **T2**, the same three options. Your call: kept as Starlight.
7. 17 aoe104c 2:15-2:18, 3:00, 3:20 and 3:25, BABOONS misspelled. **BB1-BB4**: the correct word laid in, following her. 3:20 made 12% bigger on request (the smaller one kept; your OK). 2:15: the word now in from the start of the turn (4048), placed on the measured print, then 10% bigger at the start and following the shirt over 4077-4100 (BB1 v3, baboons-WA3); your OK. BB1, BB1s and BB3 in fixes_104.tsv; BB2/BB2s and BB4 then OK'd too: all in fixes_104.tsv, part 17 rendered. a focus pull (BB1f) came first and is kept commented out.
8. 18 aoe104d 0:50, the misspelled sign over the door in the rock. **D1**: washed out, two strengths; blur 3 picked, in fixes_104.tsv.
9. 18 aoe104d 0:56-1:07.5, the housing project sign's lower-left box and the entrance sign. **H1**: both washed out. 8 and 9 joined through the dissolve between them (**DH**, 1630-1690: both signs washed out), since a swap for one sign alone left the other unfixed there. In fixes_104.tsv; part 18 rendered.
10. 16 aoe104b 1109-1243 (1:29.3 in the master), the neon "&" behind Mack reads as a 6 when its tail drops out. **NS**: the tail held from 1196-1204. Your OK; in fixes_104.tsv.
11. 16 aoe104b 4754-4909 (3:31), the hologram Radiman's beard too strong. **BD1**: edge-preserving blur inside its mask. Your OK; in fixes_104.tsv.
12. 16 aoe104b 4910-5012 (3:36), his hands by the chessboard. **HH**: painted out, as 103's R8. Your OK; in fixes_104.tsv.
13. 16 aoe104b 5237-5340 (3:47), his beard again. **BD2**: blurred inside its mask; your note: extended back to the jump where he turns (5246). Your OK; in fixes_104.tsv. Part 16 re-rendered, master rebuilt.
