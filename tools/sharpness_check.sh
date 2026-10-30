# Checks which Starlight sharpness a full render used, by comparing it with test renders whose setting is known.
# Edge strength = mean Sobel edge level of the luma, every 15th frame; "vs bicubic" divides by the same measure on a
# plain bicubic upscale of the input, so different footage can be compared.
B=PATH/TO/ffmpeg/bin
R=PATH/TO/test_renders   # (the sharpness test renders)
U=PROJECT/upload   # (the folder of Starlight renders)

# edge FILE START COUNT [PREFILTER]
edge() {
  "$B/ffmpeg" -nostdin -v error -i "$1" -vf "trim=start_frame=$2:end_frame=$(($2 + $3)),select='not(mod(n\,15))',${4:+$4,}format=gray,sobel,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - 2>&1 |
    awk -F= '/YAVG/ {s += $2; n++} END {printf "%.3f", s / n}'
}
# psnr A ASTART B COUNT
psnr() {
  "$B/ffmpeg" -nostdin -v error -i "$1" -i "$3" -lavfi "[0:v]trim=start_frame=$2:end_frame=$(($2 + $4)),setpts=PTS-STARTPTS,select='not(mod(n\,15))'[a];[1:v]trim=end_frame=$4,setpts=PTS-STARTPTS,select='not(mod(n\,15))'[b];[a][b]psnr=stats_file=-" -f null - 2>&1 |
    awk '{for (i = 1; i <= NF; i++) if ($i ~ /^psnr_avg:/) {split($i, p, ":"); s += p[2]; n++}} END {printf "%.1f dB", s / n}'
}
ratio() { awk -v a="$1" -v b="$2" 'BEGIN {printf "%.2f", a / b}'; }
UP="scale=1284:752:flags=bicubic"

D1="$R/outputs/dark/02_dark - Starlight Precise 2.6 (cloud), sharpness 1.mov"
D3="$R/outputs/dark/02_dark - Starlight Precise 2.6 (cloud), sharpness 3.mov"
DIN="$1"   # the dark clip's input
n=$("$B/ffprobe" -v error -select_streams v -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$D1")
b=$(edge "$DIN" 0 $n "$UP"); e1=$(edge "$D1" 0 $n); e3=$(edge "$D3" 0 $n)
echo "dark clip ($n frames): sharpness 1 edges $e1 ($(ratio $e1 $b)x bicubic), sharpness 3 edges $e3 ($(ratio $e3 $b)x bicubic); s1 vs s3 match $(psnr "$D1" 0 "$D3" $n)"

T="$R/input_prores/05_ep101 0055-0205 (70s)_starlight.mov"
TIN="$R/input_prores/05_ep101 0055-0205 (70s).mov"
NEW="$U/01 aoe101a_starlight.mov"
n=2098
b=$(edge "$TIN" 0 $n "$UP"); et=$(edge "$T" 0 $n); en=$(edge "$NEW" 1648 $n)
echo "Ep 101 0:55-2:05 ($n frames): test render edges $et ($(ratio $et $b)x bicubic), new render edges $en ($(ratio $en $b)x bicubic); new vs test match $(psnr "$NEW" 1648 "$T" $n)"
