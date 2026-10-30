#!/bin/sh
# Composites the BABOONS shirt text onto every shot in tools/data/baboons_runs.tsv (or just the parts/ids given), from
# the clean word in 09 aoe102c frame 6701 (its box 600-900 x 600-720), each with its own search box and options.
# usage (from the project folder): sh tools/run_baboons.sh FFMPEG_BIN [PART_OR_ID ...]
FF="$1"; shift
tail -n +2 tools/data/baboons_runs.tsv | while IFS="$(printf '\t')" read -r id part first last opts; do
  if [ $# -gt 0 ]; then ok=; for w in "$@"; do [ "$w" = "$id" ] || [ "$w" = "$part" ] && ok=1; done; [ -n "$ok" ] || continue; fi
  echo "== $id $part $first-$last"
  # shellcheck disable=SC2086
  node --max-old-space-size=8192 tools/logo_composite.js "$FF" upload "09 aoe102c" 6701 "$part" "$first" "$last" "tools/data/logo/$id" \
    --color=orange --refbox=600,600,900,720 --name="baboons-$id" $opts 2>&1 | grep -E "found in|aligned|pinned|placed|frames; tracked|rror"
done
