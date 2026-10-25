#!/usr/bin/env bash
# fetch_sources.sh — Fetch build_language.py's STEPBible-Data source files at a
# pinned commit, under the names the build expects, and print each file's sha256
# and whether it matches the given comparison commits.
#
# Usage:
#   git clone --filter=blob:none --no-checkout https://github.com/STEPBible/STEPBible-Data.git STEP_CLONE
#   scripts/analysis/hebrew_anatomy/fetch_sources.sh STEP_CLONE PIN OUT_DIR [COMPARE_COMMIT ...]
#
# Example (the Hebrew Word Anatomy rebuild):
#   fetch_sources.sh step be4191f raw-be4191f ed476a8 faf6a35
#
# Then: python3 scripts/build_language.py --raw-dir OUT_DIR
# Files come from `git show PIN:path`, never from a moving branch URL.
set -euo pipefail
[ $# -ge 3 ] || { sed -n '2,14p' "$0"; exit 1; }
CLONE=$1; PIN=$2; OUT=$3; shift 3
mkdir -p "$OUT"
g() { git -C "$CLONE" "$@"; }

declare -A UPSTREAM=(
 [TAHOT_Gen-Deu.txt]="Translators Amalgamated OT+NT/TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
 [TAHOT_Jos-Est.txt]="Translators Amalgamated OT+NT/TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
 [TAHOT_Job-Sng.txt]="Translators Amalgamated OT+NT/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
 [TAHOT_Isa-Mal.txt]="Translators Amalgamated OT+NT/TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
 [TAGNT_Mat-Jhn.txt]="Translators Amalgamated OT+NT/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt"
 [TAGNT_Act-Rev.txt]="Translators Amalgamated OT+NT/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt"
 [TBESG.txt]="Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt"
 [TEGMC.txt]="Morphology codes/TEGMC - Translators Expansion of Greek Morphhology Codes - STEPBible.org CC BY.txt"
 [TEHMC.txt]="Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt"
)

echo "pinned: $(g rev-parse "$PIN") ($(g log -1 --format=%cs "$PIN"))"
printf "file\tsha256\tbytes\tlast_changed"
for c in "$@"; do printf "\tsame_as_%s" "$c"; done
printf "\n"
for name in $(printf "%s\n" "${!UPSTREAM[@]}" | sort); do
  path="${UPSTREAM[$name]}"
  g show "$PIN:$path" > "$OUT/$name"
  hash=$(sha256sum "$OUT/$name" | cut -c1-64)
  printf "%s\t%s\t%s\t%s" "$name" "$hash" "$(stat -c%s "$OUT/$name")" "$(g log -1 --format='%h %cs' "$PIN" -- "$path")"
  for c in "$@"; do
    other=$(g show "$c:$path" 2>/dev/null | sha256sum | cut -c1-64)
    [ "$hash" = "$other" ] && printf "\tY" || printf "\tN"
  done
  printf "\n"
done
