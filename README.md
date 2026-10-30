# Anarchy Online: The Animated Series, restored

Funcom made *Anarchy Online: The Animated Series* in 2001, alongside the game's live story: four episodes, released
online in 17 short parts from 31 October to 18 December 2001. The only copies left are Funcom's own release files, at
352×240. The best of them, Funcom's MPEG files, came from [Timba's Anarchy Online collection](https://drive.google.com/drive/folders/0BxuVjelTHvdWRFQ1eE1WQmNkYXc?resourcekey=0-_ioV-8mB3r1TwCgzzbNinw) on Google
Drive, which has held a copy of Funcom's FTP server, fetched by Yumehime, since 2016.

This is a restoration of all four episodes in 4K, made with an AI video model and then fixed by hand. The AI tools
cost about $190: about $170 for Topaz's software and a month of its cloud credits, and $20 for a month of Claude Pro,
the AI coding assistant that wrote the scripts ([breakdown here](EFFORT.md#the-machine-work)). The hand work took
about 45 hours of one person's time, over five days in October 2026 ([how that was counted](EFFORT.md#the-human-work)).
This repository documents how it was done: the settings, the scripts, every fix, every decision, and how much of the
result is the AI's work and how much is a person's.

**Watch it on YouTube:** *link to come*

![Eleena's BABOONS shirt in Episode 104: blurry in Funcom's file, misspelled by the AI, and the restored word](stills/baboons_104.jpg)

<sub>Episode 104. Left: Funcom's 2001 file, enlarged. Middle: the AI upscale, which misspells the shirt. Right: the
restoration, with the right word tracked onto the shirt.</sub>

## How it was done

The episodes were enlarged four times with **Starlight**, a generative AI video model made by Topaz Labs. It doesn't
just sharpen. It redraws every frame at the new size, which is why the result looks far better than older upscaling,
and also why it gets things wrong: it misspelled words, turned a distant truck into a rock, drew faces on the backs of
heads.

So every shot was reviewed by eye against the original, and everything that came out wrong was fixed, one by one:
**114 fixes**, each one tried, compared and approved. The exact settings and steps are in [METHOD.md](METHOD.md).

Before any of that, several models were tested on clips from the series. The one that won, Starlight *Precise*, is
the one Topaz itself says isn't meant for footage this small ([what was tried](METHOD.md#choosing-the-model)).

![A truck in Episode 101 that the AI turned into a rock with two figures on it, and the restored truck](stills/truck_101.jpg)

![Radiman in Episode 104, seen from behind: the AI drew a face with glasses and a beard on the back of his head](stills/radiman_head_104.jpg)

## Corrections, compromises and changes

Most fixes undo the AI's mistakes. A few go further, and change what Funcom made. They are aesthetic calls, and they
are listed separately in [DECISIONS.md](DECISIONS.md) so they can be judged on their own:

- **93 corrections**: the AI drew something the original doesn't show, and the fix puts back what it does.
- **12 compromises**: what the original shows couldn't be recovered at the new size, so the shot plays a little
  differently (a frame held still, a shot swapped, something painted out).
- **9 changes to the original**: the flaw is in Funcom's own animation, and it was changed anyway.

![Eleena's broken teeth in a close-up in Episode 104, in the original and the AI upscale; the restoration cuts to the bar's wide shot instead](stills/teeth_104.jpg)

<sub>A change to the original: Eleena's teeth are broken in Funcom's close-up too. The restoration cuts away to the
bar's wide shot before they show.</sub>

## Who did what

The AI drew the picture: about **99% of the pixels** in the final video are exactly Starlight's. The fixes changed
the other 1%, in 19% of the frames. A person watched every shot, decided what was wrong and what right looks like,
and chose every fix, over about 45 hours of working sessions. An AI coding assistant (Claude, by Anthropic) wrote the
scripts and ran the renders at that person's direction. The numbers, and how they were measured, are in
[EFFORT.md](EFFORT.md).

## What's here

| | |
|---|---|
| [METHOD.md](METHOD.md) | What Starlight is, the source files, the exact settings, and every step from the 2001 files to the YouTube video |
| [DECISIONS.md](DECISIONS.md) | Every fix and why, with its time in the video; the changes to the original first |
| [EFFORT.md](EFFORT.md) | How much is the AI's and how much is human work |
| [SOURCES.md](SOURCES.md) | When each episode came out, forum threads and press from 2001–2002, Funcom's pages, where the files came from |
| [fixes/](fixes/) | The fix tables: every fix, with its frames, its kind and what it draws from |
| [tools/](tools/) | The scripts (Node.js and Python) that made and applied the fixes and built the masters, with the commands in [tools/README.md](tools/README.md) |
| [log/](log/) | The working log of the whole restoration, the review notes, and checksums of Funcom's files |
| [stills/](stills/) | The before-and-after comparisons |

No video is included: [SOURCES.md](SOURCES.md) says where Funcom's original files can be found.

## Thanks

- **The people at Funcom who made the series**, as the episodes credit them on screen:
  - **Visual production unit:** Christian Morgan Enger, Hans Jørgen Kjærnet, Øyvind Jernskau, Kjetil Hjeldnes,
    Christer Sveen and Tom Tømmervåg Gjerde, the animators. By Ragnar Tørnquist's account, the artists, animators
    and audio staff made [almost an hour of CGI in two months](https://anarchaeology.github.io/forums/thread/8205.html#post384370), and the animation team
    worked [16–18-hour days, plus weekends](https://anarchaeology.github.io/forums/thread/39274.html#post573038), to get the four episodes out.
  - **Series created by** Ragnar Tørnquist and Didrik Tollefsen. **Original concept** Gaute Godager and Ragnar
    Tørnquist.
  - **Art director** Didrik Tollefsen. **Producer** Tore Blystad. **Audio director** Bjørn Arve Lagim. **Sound unit**
    Tor Linløkken and Morten Sørlie. **Flash trailers** Thomas Sundfær. **Casting** Elin Mosnesset.
  - **Starring** Paige Price (Eleena Oak), Todd Crain (Joshua Kahn), Alex Kroll (Philip Ross) and David Smyrl
    (Henry Radiman).
  - Funcom's episode pages add: written by Ragnar Tørnquist (103–104 with Aaron de Orive); directed by Tørnquist,
    Tollefsen and Blystad (103–104 also de Orive); Tercio Bretas (the Stranger), Stacey Leigh Ivey (Eva Pourais) and
    Chris Armond in the cast; Vebjørn Strømmen in 101's art and animation; the illustrated scripts by Dag Scheve; and
    story contributions from Gaute Godager, Thomas Howalt, Sverre Kvernmo and Jarl Schjerverud.
- **Timba**, for the [Anarchy Online collection](https://drive.google.com/drive/folders/0BxuVjelTHvdWRFQ1eE1WQmNkYXc?resourcekey=0-_ioV-8mB3r1TwCgzzbNinw) on Google Drive
  ([its thread on Funcom's forum](https://forums.funcom.com/t/anarchy-online-concept-art-collection-looking-for-more-missing-items/6653)): concept art, game discs, and a copy of Funcom's FTP server, where we found
  the best copies of the episodes. Thanks too to **Yumehime**, credited with fetching the contents of Funcom's FTP servers in
  [AO Vault's README](https://gitlab.com/AOvault/aovault#contributors), and thanked for them in Timba's [changelog](https://forums.funcom.com/t/anarchy-online-concept-art-collection-looking-for-more-missing-items/6653/2).
- The Internet Archive's [Wayback Machine](https://web.archive.org/), which saved Funcom's episode pages and forums
  from 2001–2002.

## About

A fan restoration, made for preservation, alongside the [Anarchaeology](https://anarchaeology.github.io/) screenshot
gallery and [forum archive](https://anarchaeology.github.io/forums/).

Not affiliated with or endorsed by Funcom or Topaz Labs. Anarchy Online and its animated series are © Funcom.
