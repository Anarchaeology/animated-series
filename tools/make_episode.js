// Joins one episode's parts into a master file without re-encoding the picture: each part's fixed version
// (FIXED_DIR/<part>_fixed.mov) or, where there is none, its Starlight render, copied frame for frame, with the
// original sound from the upload files (PCM; each part's sound trimmed to exactly its picture's length, because the
// original MPEGs' sound runs 2-25 ms long, which laid end to end would drift out of sync part by part), chapter marks
// (Teaser, Act 1-3, Tag, the parts Funcom released) and BT.709 colour tags (header only: Topaz and the fix tools leave
// the primaries and transfer unmarked). Writes OUT (ProRes 422 HQ + PCM in .mov). Then checks itself: every decoded
// frame of OUT against the parts (MD5 per frame), and the sound's samples against the trimmed originals. It builds into
// "OUT (building).mov" and only replaces OUT once every check has passed, so a build that's stopped or fails leaves
// the existing master as it was (an interrupted build once left 101's master half-written, 29 Oct).
// EPISODE "all" joins the whole series, 101-104 in Funcom's order, for the YouTube video: --cuts="PART@LAST@FADE;..."
// ends a part at frame LAST (the black before 101-103's end credits, so the credits come only once, after 104), its
// sound faded out from frame FADE. Its chapters are named by episode, and it writes OUT's YouTube timestamps (by
// episode and by part) to "OUT - chapters.txt".
// usage: node make_episode.js FFMPEG_BIN UPLOAD_DIR FIXED_DIR EPISODE OUT.mov [--nocheck] [--cuts=...]
//        (EPISODE: 101..104, or all)
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [bin, dir, fixedDir, episode, outFile] = args.filter(a => !a.startsWith('--'));
const building = outFile.replace(/\.mov$/i, '') + ' (building).mov';
const TITLES = { 101: 'Tricks and Treats', 102: 'Burning Bridges', 103: 'Reversal', 104: 'Dust to Dust' };
const CHAPTER = { a: 'Teaser', b: 'Act 1', c: 'Act 2', d: 'Act 3', e: 'Tag' };
const SAMPLES_PER_FRAME = 44100 * 1001 / 30000;
const ff = (argv, opts = {}) => new Promise((res, rej) => {
  const p = spawn(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', ...argv], { stdio: ['ignore', opts.capture ? 'pipe' : 'ignore', 'inherit'] });
  let out = ''; if (opts.capture) p.stdout.on('data', d => (out += d));
  p.on('close', c => (c ? rej(new Error(`ffmpeg failed: ${argv.join(' ').slice(0, 200)}`)) : res(out)));
});

(async () => {
  // the episode's parts, in order, from the upload manifest
  const ALL = episode === 'all';
  const parts = fs.readFileSync(path.join(dir, 'upload_manifest.tsv'), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'))
    .filter(r => r[1].startsWith(ALL ? 'aoe10' : `aoe${episode}`)).map(r => ({ name: r[0].replace(/\.mov$/, ''), ep: r[1].slice(3, 6), letter: r[1][6], frames: +r[4] }));
  if (!parts.length) throw new Error(`no parts for episode ${episode}`);
  const cuts = new Map((opt.cuts || '').split(';').filter(Boolean).map(s => { const [n, last, fade] = s.split('@'); return [n, { last: +last, fade: +fade }]; }));
  for (const [n, c] of cuts) { const p = parts.find(q => q.name === n); if (!p) throw new Error(`--cuts: no part ${n}`); p.frames = c.last + 1; p.fade = c.fade; }
  let at = 0;
  for (const p of parts) {
    p.start = at; at += p.frames;
    const fixed = path.join(fixedDir, `${p.name}_fixed.mov`);
    p.video = fs.existsSync(fixed) ? fixed : path.join(dir, `${p.name}_starlight.mov`);
    // sound: whole samples, rounded on the running total so the rounding never adds up
    p.samples = Math.round(at * SAMPLES_PER_FRAME) - Math.round(p.start * SAMPLES_PER_FRAME);
    console.log(`${p.name}: frames ${p.start}-${at - 1} from ${path.basename(p.video)}, ${p.samples} sound samples` +
      (p.fade != null ? ` (cut after its frame ${p.frames - 1}, sound faded from ${p.fade})` : ''));
  }
  const total = at, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'episode-'));
  const list = path.join(tmp, 'video.txt');
  // (full paths: ffmpeg reads paths in the list relative to the list's own folder; each part's length given from its
  // frame count, since the join otherwise trusts the file's stated duration, and 10 aoe102d's Starlight render states
  // 567 ticks more than its frames last, which left a 19 ms gap before the next part)
  // (a cut part ends at an outpoint half a frame past its last frame: ProRes is all keyframes, so the copy stops there)
  fs.writeFileSync(list, parts.map(p => `file '${path.resolve(p.video).replace(/\\/g, '/').replace(/'/g, "'\\''")}'\n` +
    (p.fade != null ? `outpoint ${((p.frames - 0.5) * 1001 / 30000).toFixed(6)}\n` : '') +
    `duration ${(p.frames * 1001 / 30000).toFixed(6)}`).join('\n') + '\n');
  // chapters: one per released part (101c's two upload pieces are one chapter)
  const chapters = [];
  for (const p of parts) { const last = chapters[chapters.length - 1]; if (!last || last.letter !== p.letter || last.ep !== p.ep) chapters.push({ ep: p.ep, letter: p.letter, start: p.start }); }
  // (the series: Funcom's 103 has no Tag, its Act 2 is its last part)
  const chapterName = c => ALL ? `${c.ep} ${TITLES[c.ep]}: ${CHAPTER[c.letter] || c.letter}` : CHAPTER[c.letter] || c.letter;
  const title = ALL ? 'The Anarchy Online Animated Series' : `The Anarchy Online Animated Series - Episode ${episode}${TITLES[episode] ? ` - ${TITLES[episode]}` : ''}`;
  const meta = path.join(tmp, 'chapters.txt');
  fs.writeFileSync(meta, `;FFMETADATA1\ntitle=${title}\n` + chapters.map((c, i) =>
    `[CHAPTER]\nTIMEBASE=1/30000\nSTART=${c.start * 1001}\nEND=${(i + 1 < chapters.length ? chapters[i + 1].start : total) * 1001}\ntitle=${chapterName(c)}\n`).join(''));
  if (ALL) {   // (YouTube timestamps, as make_joined.js writes them: by episode, then by part)
    const stamp = f => { const s = Math.floor(f * 1001 / 30000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s % 60).padStart(2, '0')}`; };
    fs.writeFileSync(outFile.replace(/\.mov$/i, '') + ' - chapters.txt',
      `By episode:\n${chapters.filter(c => c.letter === 'a').map(c => `${stamp(c.start)} Episode ${c.ep}: ${TITLES[c.ep]}`).join('\n')}\n\n` +
      `By part:\n${chapters.map(c => `${stamp(c.start)} ${chapterName(c)}`).join('\n')}\n\nTotal ${stamp(total)}\n`);
  }
  const audioIn = parts.flatMap(p => ['-i', path.join(dir, `${p.name}.mov`)]);
  // (a cut part's sound fades out from its FADE frame to the cut)
  const audioChain = parts.map((p, i) => `[${i + 1}:a]atrim=end_sample=${p.samples},asetpts=PTS-STARTPTS` +
    (p.fade != null ? `,afade=t=out:ss=${Math.round(p.fade * SAMPLES_PER_FRAME)}:ns=${p.samples - Math.round(p.fade * SAMPLES_PER_FRAME)}` : '') + `[a${i}]`).join(';') +
    `;${parts.map((_, i) => `[a${i}]`).join('')}concat=n=${parts.length}:v=0:a=1[a]`;

  await ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, ...audioIn, '-f', 'ffmetadata', '-i', meta,
    '-filter_complex', audioChain, '-map', '0:v', '-map', '[a]', '-map_metadata', `${parts.length + 1}`, '-map_chapters', `${parts.length + 1}`,
    '-c:v', 'copy', '-bsf:v', 'prores_metadata=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    // (movie timescale 30000, the frame clock: by default the chapter track gets a clock so fine, 4.41 MHz, that an
    // episode's length overflows QuickTime's 32-bit durations)
    '-c:a', 'pcm_s16le', '-movie_timescale', '30000', '-movflags', '+write_colr', building]);
  console.log(`${path.basename(outFile)}: ${total} frames, ${chapters.length} chapters (${chapters.map(chapterName).join(', ')})`);
  if ('nocheck' in opt) { fs.renameSync(building, outFile); return; }

  // check: every frame decoded from OUT matches the parts' frames (per-frame MD5 of the decoded picture), and the
  // sound is sample for sample the trimmed originals
  const frameHashes = async (inArgs, map) => (await ff([...inArgs, '-map', map, '-f', 'framemd5', '-'], { capture: true }))
    .split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(',').pop().trim());
  const [got, want] = await Promise.all([frameHashes(['-i', building], '0:v'), frameHashes(['-f', 'concat', '-safe', '0', '-i', list], '0:v')]);
  const bad = got.findIndex((h, i) => h !== want[i]);
  // (and as many as the parts and cuts add up to, so a cut that didn't take can't pass by being in both)
  console.log(`picture: ${got.length} frames in the master, ${want.length} in the parts, ${total} expected; ` +
    (got.length === want.length && got.length === total && bad < 0 ? 'every frame identical' : `MISMATCH at frame ${bad}`));
  const pts = require('child_process').execFileSync(path.join(bin, 'ffprobe'), ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts',
    '-of', 'csv=p=0', building], { maxBuffer: 2 ** 28 }).toString().trim().split(/\s+/).map(Number).sort((x, y) => x - y);
  const uneven = pts.filter((t, i) => t !== i * 1001).length;
  console.log(`timing: ${uneven ? `${uneven} frames off the 1001-tick grid (first at frame ${pts.findIndex((t, i) => t !== i * 1001)})` : 'every frame on the 1001-tick grid'}`);
  const audioHash = async inArgs => (await ff([...inArgs, '-f', 'md5', '-'], { capture: true })).trim();
  const [ga, wa] = await Promise.all([
    audioHash(['-i', building, '-map', '0:a', '-c:a', 'pcm_s16le']),
    audioHash([...audioIn.map(a => a), '-filter_complex', audioChain.replace(/\[(\d+):a\]/g, (_, n) => `[${+n - 1}:a]`), '-map', '[a]', '-c:a', 'pcm_s16le'])]);
  console.log(`sound: ${ga === wa ? 'identical to the trimmed originals' : `MISMATCH (${ga} vs ${wa})`}`);
  fs.rmSync(tmp, { recursive: true });
  if (got.length === want.length && got.length === total && bad < 0 && !uneven && ga === wa) { fs.renameSync(building, outFile); console.log(`checks passed: ${path.basename(outFile)} replaced`); }
  else { console.log(`checks FAILED: ${path.basename(outFile)} left as it was; the new build is in ${path.basename(building)}`); process.exitCode = 1; }
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
