# Who did what

AI restorations are easy to make carelessly and hard to judge from the outside. This page says what the AI did,
what the people did, and how much of each.

## The short version

- **Topaz's Starlight model drew every frame.** About **99% of the pixels** in the final video are exactly what it
  drew.
- **About 1% of the pixels**, across **19% of the frames**, were changed afterwards by hand-directed fixes: 114 of
  them, each one tried, compared and approved by eye.
- **A person watched every shot**, decided what was wrong and what right looks like, and chose between options for
  every fix. That took several long days, and hundreds of notes and decisions.
- **An AI coding assistant (Claude, by Anthropic)** wrote the scripts, ran the renders and measurements, proposed
  options and drafted these pages, at that person's direction.

## How much of the picture was changed

Every fixed frame was compared with Starlight's own. A pixel counts as changed where the brightness differs by 3
levels or more, averaged over 5×5 pixels so that re-encoding noise doesn't count.

| | Frames | Frames with any change | Share of all pixels changed |
|---|---|---|---|
| The whole series | 86,336 | 16,280 (18.9%) | **0.97%** |

Most of that 1% is a handful of whole-shot changes: the masked man in 101's tag (Proteus with grain, about 18% of
that part's pixels), Ross's desk shot replaced in 101 (about 7% of its part), the viewscreen still in 102 and the
cutaway in 104. Everything else is small and local: a word on a shirt, a sign, a few pockets in someone's hair. Per
part: [tools/data/w104/changed_share.tsv](tools/data/w104/changed_share.tsv); the script is
[changed_share.py](tools/data/w104/changed_share.py).

## The human work

What can be counted from the project's records:

| | |
|---|---|
| Fixes kept | 114 (93 corrections, 12 compromises, 9 changes to the original: [DECISIONS.md](DECISIONS.md)) |
| Review clips made and watched | 242 short clips, plus 120 stills and frame sheets |
| Versions tried | 67 trial fix tables; about 20 approaches recorded as tried and turned down |
| Decisions recorded in the fix tables | 72 picks, calls and notes ("your pick", "your call"…) |
| Working sessions | 26–30 Oct 2026: about 45 hours of session time over 27–30 Oct, plus part of the 26th |
| Messages from the reviewer | about 500 over those four days |

Session time counts the time a working session was active, with no gap over 20 minutes. Some of it is renders
running unattended; it doesn't include watching the review clips outside the sessions.

## The machine work

| | |
|---|---|
| Upscale | Topaz Video, Starlight Precise 2.6, in Topaz's cloud: about 1,550 cloud credits ([METHOD.md](METHOD.md)) |
| What Topaz cost | about $170: the Topaz software ($69) and a month of its cloud credits ($99.99) |
| What Claude cost | $20: a month of Claude Pro |
| Spot-fix sources | Topaz Proteus 4, Meta SAM 2.1 and CoTracker3, run locally on an RTX 2070 Super |
| Scripts | 66 scripts, about 5,200 lines (Node.js and Python), written for this project by Claude |
| Checks | Every master checks every frame and every sound sample against its parts; every fixed part was compared with Starlight frame by frame to make sure fixes changed only what they were meant to |

## Who is responsible

The decisions are the reviewer's: what counted as wrong, which fix to keep, and every change to the original. Where
this restoration departs from what Funcom made, that is a human choice, documented in [DECISIONS.md](DECISIONS.md),
not something the AI did on its own.
