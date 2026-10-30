// Makes a review reel of listed shots: each shot whole, with the original (plainly enlarged) beside Starlight on top
// and a zoom that follows the shirt logo (with room below it for the picture and text) underneath, original beside
// Starlight. The logo is found per frame by its green in the original (as in the fix tool's key), smoothed, and held
// through frames where it isn't found. A short black slate with the shot's number comes before each shot.
// Original sound. LIST.tsv columns: id, part, first, last, box (unused fallback), note. With FIXED_DIR, a third
// column shows the fixed version (FIXED_DIR/<part>_fixed.mov). An optional 7th column names a logo_composite.js
// track.tsv covering the shot; the zoom then follows that tracking instead of looking for the green itself.
// usage: node make_logo_reel.js FFMPEG_BIN UPLOAD_DIR LIST.tsv OUT.mp4 [FIXED_DIR]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const QW = 321, QH = 188;
const isLogo = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx !== g || !d || d / mx <= 0.35 || mx / 255 <= 0.2) return false;
  const h = ((b - r) / d + 2) * 60;
  return h >= 125 && h <= 150;
};
// per-frame logo boxes (1284x752 coordinates) for frames first..last, smoothed, gaps filled
function track(bin, file, first, last) {
  const n = last - first + 1;
  const buf = execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-i', file, '-vf',
    `trim=start_frame=${first}:end_frame=${last + 1},setpts=PTS-STARTPTS,scale=${QW}:${QH}:in_color_matrix=bt601:in_range=tv,format=rgb24`, '-f', 'rawvideo', '-'],
    { maxBuffer: (n + 60) * QW * QH * 3 });
  const raw = [];
  for (let k = 0; k < n; k++) {
    const xs = [], ys = [], o = k * QW * QH * 3;
    for (let y = 0; y < QH; y++) for (let x = 0; x < QW; x++) {
      const i = o + 3 * (y * QW + x);
      if (isLogo(buf[i], buf[i + 1], buf[i + 2])) { xs.push(x); ys.push(y); }
    }
    if (xs.length < 12) { raw.push(null); continue; }
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] * 4;
    raw.push([q(xs, 0.05), q(ys, 0.05), q(xs, 0.95), q(ys, 0.95)]);
  }
  const med = (arr, i) => { const v = arr.map(b => b[i]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const out = raw.map((_, k) => { const near = raw.slice(Math.max(0, k - 6), k + 7).filter(Boolean); return near.length >= 3 ? [0, 1, 2, 3].map(i => med(near, i)) : null; });
  let lastBox = out.find(Boolean);
  return out.map(b => (b ? (lastBox = b) : lastBox));
}
const [bin, dir, listFile, outFile, fixedDir] = process.argv.slice(2);
const fps = 30000 / 1001, SLATE = 15, PW = 1284, PH = 752;
const t = f => { const x = f / fps; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/,/g, '\\,').replace(/%/g, '\\%');
const shots = fs.readFileSync(listFile, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'))
  .map(([id, part, first, last, box, note, trackFile]) => ({ id, part, first: +first, last: +last, box: box.split(',').map(Number), note, trackFile }));
// logo boxes from a composite's track: the reference logo's box (521,561-879,729 in the reference frame) carried
// into each frame through that frame's fit
function fromTrack(file, first, last) {
  const rows = new Map(fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).map(l => l.split('\t')).map(r => [+r[0], r]));
  const out = [];
  for (let f = first; f <= last; f++) {
    const r = rows.get(f);
    if (!r) { out.push(out[out.length - 1] || null); continue; }
    const [a, b, c, d, ex2, ey2] = r.slice(2, 8).map(Number), ex = 2 * ex2 + 0.5 - 0.5 * (a + b), ey = 2 * ey2 + 0.5 - 0.5 * (c + d), det = a * d - b * c;
    const pts = [[521, 561], [879, 561], [521, 729], [879, 729]].map(([x, y]) => [(d * (x - ex) - b * (y - ey)) / det, (-c * (x - ex) + a * (y - ey)) / det]);
    out.push([Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]);
  }
  return out;
}
const tmp = path.join(path.dirname(outFile), 'logo_reel_tmp');
fs.mkdirSync(tmp, { recursive: true });
const clips = shots.map((s, k) => {
  // zoom: a fixed-size window (sized from the logo's median size) that follows the logo's box, extended below for the
  // picture and text, at the frame's shape, kept inside the frame; positions go to the crops through sendcmd
  const boxes = s.trackFile ? fromTrack(s.trackFile, s.first, s.last) : track(bin, path.join(dir, `${s.part}.mov`), s.first, s.last);
  const med = i => { const v = boxes.filter(Boolean).map(b => b[i]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const lw = med(2) - med(0), lh = med(3) - med(1);
  let w = Math.max(1.7 * lw, 3.4 * lh * PW / PH, 300);
  w = Math.min(PW, Math.round(w / 2) * 2);
  const zh = Math.min(PH, Math.round(w * PH / PW / 2) * 2);
  const pos = boxes.map(b => {
    const cxl = (b[0] + b[2]) / 2, cyl = b[1] + 1.3 * (b[3] - b[1]);
    return [Math.round(Math.max(0, Math.min(PW - w, cxl - w / 2))), Math.round(Math.max(0, Math.min(PH - zh, cyl - zh / 2)))];
  });
  const cmdFile = `cmd${String(k).padStart(2, '0')}.txt`;
  const zs = fixedDir ? ['zo', 'zs', 'zf'] : ['zo', 'zs'];
  fs.writeFileSync(path.join(tmp, cmdFile), pos.map(([x, y], i) => `${(i / fps).toFixed(4)} ${zs.map(z => `crop@${z} x ${x}, crop@${z} y ${y}`).join(', ')};`).join('\n') + '\n');
  // panes: two columns at full size, or three (with the fixed version) at two thirds
  const C = fixedDir ? 3 : 2, VW = fixedDir ? 856 : PW, VH = fixedDir ? 502 : PH, fit = `scale=${VW}:${VH}`;
  const zoomO = `sendcmd=f=${cmdFile},crop@zo=${w}:${zh}:${pos[0][0]}:${pos[0][1]},scale=${VW}:${VH}:flags=lanczos`;
  const zoomS = `crop@zs=${w}:${zh}:${pos[0][0]}:${pos[0][1]},scale=${VW}:${VH}:flags=lanczos`;
  const zoomF = `crop@zf=${w}:${zh}:${pos[0][0]}:${pos[0][1]},scale=${VW}:${VH}:flags=lanczos`;
  const trim = `trim=start_frame=${s.first}:end_frame=${s.last + 1},setpts=PTS-STARTPTS`;
  const title = esc(`${s.id}   ${s.part.replace(/[()]/g, '')}   ${t(s.first)}-${t(s.last)}   ${s.note}`);
  const lab = txt => `drawtext=${font}:text='${txt}':x=14:y=12:fontsize=30:fontcolor=yellow:box=1:boxcolor=black@0.55:boxborderw=6`;
  const clip = path.join(tmp, `c${String(k).padStart(2, '0')}.mp4`);
  execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y',
    '-i', path.join(dir, `${s.part}.mov`), '-i', path.join(dir, `${s.part}_starlight.mov`), ...(fixedDir ? ['-i', path.join(fixedDir, `${s.part}_fixed.mov`)] : []),
    '-filter_complex',
    `[0:v]${trim},scale=${PW}:${PH}:flags=bicubic:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,setsar=1,split[o][oz];` +
    `[1:v]${trim},setsar=1,split[s][sz];[oz]${zoomO},${lab('Original - zoom')}[o2];[sz]${zoomS},${lab('Starlight - zoom')}[s2];` +
    `[o]${fit},${lab('Original')}[o1];[s]${fit},${lab('Starlight')}[s1];` +
    (fixedDir ? `[2:v]${trim},setsar=1,split[f][fz];[f]${fit},${lab('Fixed')}[f1];[fz]${zoomF},${lab('Fixed - zoom')}[f2];` +
      `[o1][s1][f1][o2][s2][f2]xstack=inputs=6:layout=0_0|${VW}_0|${2 * VW}_0|0_${VH}|${VW}_${VH}|${2 * VW}_${VH},`
      : `[o1][s1][o2][s2]xstack=inputs=4:layout=0_0|${VW}_0|0_${VH}|${VW}_${VH},`) +
    `pad=${C * VW}:${2 * VH + 56}:0:56:black,` +
    `drawtext=${font}:text='${title}':x=16:y=12:fontsize=32:fontcolor=white,` +
    `drawtext=${font}:text='frame %{eif\\:n+${s.first}\\:d}':x=w-text_w-16:y=12:fontsize=32:fontcolor=yellow,format=yuv420p,` +
    `tpad=start=${SLATE}:color=black[v0];` +
    `[v0]drawtext=${font}:text='${s.id}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=140:fontcolor=white:enable='lt(n,${SLATE})'[v];` +
    `[0:a]atrim=start=${(s.first / fps).toFixed(6)}:end=${((s.last + 1) / fps).toFixed(6)},asetpts=PTS-STARTPTS,adelay=${Math.round(SLATE / fps * 1000)}:all=1[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', clip],
    { cwd: tmp, stdio: ['ignore', 'inherit', 'inherit'] });
  console.log(`${s.id}: ${s.part} ${s.first}-${s.last}, zoom window ${w}x${zh}, logo found in ${boxes.filter(Boolean).length}/${boxes.length} frames`);
  return clip;
});
fs.writeFileSync(path.join(tmp, 'list.txt'), clips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n') + '\n');
execFileSync(path.join(bin, 'ffmpeg'), ['-nostdin', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'),
  '-c', 'copy', '-movflags', '+faststart', outFile], { stdio: ['ignore', 'inherit', 'inherit'] });
fs.rmSync(tmp, { recursive: true });
console.log(`${outFile}: ${clips.length} shots`);
