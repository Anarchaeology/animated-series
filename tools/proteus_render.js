// Renders Proteus 4 upscales of frame ranges of the upload files with Topaz's own ffmpeg (the filter and settings
// the Topaz Video app uses: auto mode, everything else at 0), made to drop in beside the Starlight renders:
// 1284x752 square pixels (squeezed to 321x188 first, as Starlight does), BT.709, ProRes 422 HQ 10-bit, 29.97 fps,
// no audio. The source range and settings are written into the file's tags.
// JOBS.tsv rows: part (upload file name without .mov), first frame, last frame, recover original detail (0-100),
// output file name.
// usage: node proteus_render.js UPLOAD_DIR JOBS.tsv OUT_DIR
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [dir, jobsFile, out] = process.argv.slice(2);
const topaz = 'C:/Program Files/Topaz Labs LLC/Topaz Video';
const models = 'C:\\ProgramData\\Topaz Labs LLC\\Topaz Video\\models';
const env = { ...process.env, TVAI_MODEL_DIR: models, TVAI_MODEL_DATA_DIR: models };
fs.mkdirSync(out, { recursive: true });
for (const line of fs.readFileSync(jobsFile, 'utf8').trim().split('\n')) {
  const [part, first, last, detail, name] = line.split('\t');
  const blend = (detail / 100).toFixed(2);
  const filter = `trim=start_frame=${first}:end_frame=${+last + 1},setpts=PTS-STARTPTS,scale=w=321:h=188,setsar=1,` +
    `tvai_up=model=prob-4:scale=0:w=1284:h=752:preblur=0:noise=0:details=0:halo=0:blur=0:compression=0:estimate=8:` +
    `blend=${blend}:device=0:vram=1:instances=1,` +
    `scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,format=yuv422p10le`;
  const t0 = Date.now();
  execFileSync(path.join(topaz, 'ffmpeg.exe'), ['-hide_banner', '-nostdin', '-y', '-v', 'error',
    '-i', path.join(dir, `${part}.mov`), '-sws_flags', 'spline+accurate_rnd+full_chroma_int', '-filter_complex', filter,
    '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-quant_mat', 'hq', '-bits_per_mb', '1350',
    '-colorspace', 'bt709', '-color_range', 'tv', '-an', '-map_metadata', '-1', '-movflags', 'use_metadata_tags',
    '-metadata', `videoai=Enhanced using prob-4; mode: auto; recover original detail at ${detail}; all other settings 0. Changed resolution to 1284x752`,
    '-metadata', `comment=${part}.mov frames ${first}-${last}`,
    path.join(out, name)], { cwd: topaz, env, stdio: ['ignore', 'ignore', 'pipe'] });
  console.log(`${name}: ${part} frames ${first}-${last}, detail ${detail}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
