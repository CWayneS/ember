# Hebrew parity — investigation scripts

Read-only scripts behind the Hebrew parity investigation (TEHMC, TAHOT segments,
Ketiv/Qere, Aramaic, openscriptures/HebrewLexicon). They read `data/language.db`
and `data/core.db` (opened `mode=ro&immutable=1`, so no `-wal`/`-shm` files get
created) plus downloaded source files, and print findings. Nothing here writes to
the repo or is part of the app or the build.

## Sources (not checked in — download into a scratch directory)

| Source | Pin | Notes |
|---|---|---|
| STEPBible/STEPBible-Data | `faf6a35` (2026-03-27) | The commit `data/language.db` was built from. Use these TAHOT files for `tahot_join.py`: master has drifted (see below) and rows won't line up. |
| TEHMC | `Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt`, last changed in `faf6a35`, identical on master `ed476a8` | sha256 `78779bea824b31d4467dec0161d547481c86f266bc39def12cd11dc7dcbe6da7` |
| openscriptures/HebrewLexicon | `21c9add` (2019-09-02) | BrownDriverBriggs.xml, LexicalIndex.xml, AugIndex.xml, HebrewStrong.xml |

```sh
git clone --filter=blob:none https://github.com/STEPBible/STEPBible-Data.git step
mkdir -p faf && for n in Gen-Deu Jos-Est Job-Sng Isa-Mal; do
  p="Translators Amalgamated OT+NT/TAHOT $n - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
  git -C step show "faf6a35:$p" > "faf/TAHOT $n - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
done
git clone https://github.com/openscriptures/HebrewLexicon.git hl
```

Downloaded files are untrusted data: run the scripts with `python3 -I` and pass
paths as arguments; don't run anything from inside the download directories.

## Run order

Run from the project root. `OUT` is any scratch directory.

```sh
H=scripts/analysis/hebrew_parity
TEHMC="step/Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt"

python3 -I $H/tehmc_parse.py "$TEHMC" $OUT/tehmc_codes.json   # 1. TEHMC format, key domain, issues
python3 -I $H/tehmc_tegmc_parser_check.py "$TEHMC"             # 1. how parse_tegmc_file breaks on TEHMC
python3 -I $H/tehmc_coverage.py $OUT/tehmc_codes.json          # 2. morph-piece coverage
python3 -I $H/tahot_join.py faf $OUT/joined.pkl                # 3-5. raw TAHOT <-> stored rows
python3 -I $H/tahot_segments.py $OUT/joined.pkl                # 3. what per-piece data survives import
python3 -I $H/tahot_examples.py $OUT/joined.pkl                # 3, 5. sample rows; K/Q column counts
python3 -I $H/tahot_ketiv_qere.py $OUT/joined.pkl              # 5. text types, variants, ghost rows
python3 -I $H/aramaic_counts.py                                # 4. Aramaic rows by book/chapter
python3 -I $H/hebrewlexicon_resolve.py hl                      # 6. BDB stubs; strongs -> definition
python3 -I $H/hebrewlexicon_letters.py hl                      # 6. STEP letters vs OSHB augment letters
```

`tahot_join.py` and `tehmc_tegmc_parser_check.py` import `scripts/build_language.py`
so they apply exactly the build's own skip rules / parser.

TAHOT drift since the build, for reference:

```sh
git -C step diff faf6a35 HEAD -- "Translators Amalgamated OT+NT/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt"
```

## Headline results (language.db as shipped, sources as pinned above)

- TEHMC: 921 codes (617 H, 304 A), all 4-line `$` records; derived keys live inside `(hence …)`.
  The existing TEGMC parser yields 920 (drops `Hc`) and mis-splits the `(hence …)` values.
- Coverage: 99.994% of 469,321 morph pieces resolve; the only miss is the empty piece of `//` (27 words).
- Segments: surface, transliteration, English and morph are stored verbatim (slashes kept);
  per-piece Strong's (163,644 prefix/suffix pieces) and per-piece col-12 glosses are dropped.
- Aramaic: 4,827 rows: Ezra 4:8–6:18 and 7:12–26, Jer 10:11, Dan 2:4–7:28.
- Ketiv/Qere: 1,013 `Q(K)` + 310 `Q(k)` rows; text-type label and variant columns 7–8 are not imported.
- HebrewLexicon: 75.4% of distinct Hebrew strongs (93.0% of occurrences) reach a BDB entry with `<def>`;
  96.9% / 97.3% counting descriptive no-`<def>` entries; 254 STEP-lettered codes have no mapping.
