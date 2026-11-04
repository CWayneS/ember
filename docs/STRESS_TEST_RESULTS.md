# Longevity Stress Test — Results

Spec: `Offline_Language_And_Stress_Test_Spec.md`, Item 2. **Question:** if one person uses Ember seriously for 40 years, does it stay fast and stable? Where does it start to hurt, and why?

Measurement only. No app code was changed for this item, and nothing here has been fixed. The thresholds are the spec's proposed starting points, for you to adjust.

---

## The short answer

**Ember stays stable, and most of it stays fast, through 40 years of heavy use.** Nothing crashed, lost data, or logged a console error at any profile. Boot and search are in the spec's "Good" band even at 40 years on a throttled CPU.

Three things degrade, all gradually:

1. **Very long lists.** A 500-note study takes 628 ms to open and a 2,000-note study 2.6 s. Cost follows the size of the list, about 1.3 ms per note, not the age of the data. A study passes the 200 ms threshold at roughly 150 notes (my extrapolation from that rate).
2. **Autosave stutter.** Each save blocks the main thread for 60 ms at 10 years and 168 ms at 40. That crosses the "typing feels sticky" line (150 ms) only near year 40 on this machine, but already at year 10 on a CPU 4× slower.
3. **Memory peaks while writing.** Whole-file exports pile up as garbage, so RSS reached 1.3–1.5 GB during autosaves from 10 years up, before settling back to 464 MB at 40 years. This isn't a leak, but it could matter on a low-memory machine.

**The spec's leading suspect is only part of the story.** Today, 98% of what every write re-exports is reference data. At 40 years it's 19%, because by then your own notes are the bulk of the file. Splitting the databases helps most in the years when it's needed least.

**A separate bug turned up, and it affects every install today, not just old ones:** any note edit leaves the search index inconsistent with the notes. Your note text is safe, and the bug is cheap to fix. See "Found along the way".

---

## Results

**Test machine:** Intel i5-7200U (2 cores, 4 threads, 2.5 GHz), 15 GB RAM, Fedora Linux with kernel 7.2.11, encrypted `/home` volume; headless Chromium 151, sql.js with SQLite 3.49.1. A modest baseline, so a current laptop should do better on the 1× rows.

**Profiles** are at the spec's rates. "0y" is a control I added: the app's own database with no user data. "4×" is `Emulation.setCPUThrottlingRate`. Boot figures are the median of 3 cold boots; renders and searches of 3 repeats; autosaves of 20 saves. "(Good)", "(Watch)" and "(Problem)" apply the spec's thresholds. A block of **0** means no long task: the browser only reports tasks over 50 ms, so anything under that shows as 0.

| Years | Notes | Anchors | Tags / assignments | Studies | Markups | Bookmarks | Completed plans | John 3:16 notes | Hot-study notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 780 | 1,565 | 219 / 2,340 | 26 | 520 | 24 | 1 | 8 | 50 |
| 10 | 7,800 | 15,638 | 871 / 23,400 | 260 | 5,200 | 240 | 10 | 75 | 500 |
| 25 | 19,500 | 39,163 | 1,509 / 58,500 | 650 | 13,000 | 600 | 25 | 188 | 1,250 |
| 40 | 31,200 | 62,385 | 2,000 / 93,600 | 1,040 | 20,800 | 960 | 40 | 300 | 2,000 |

### Boot, writes, restore, backup

| Profile | core.db MB | Boot to live ms | export() ms | Block per autosave ms (median / max) | Worker write ms | Restore ms | Backup ms | Backup MB | Storage MB |
|---|---|---|---|---|---|---|---|---|---|
| 0y 1× | 24.4 | 410 (Good) | 14 | 0 (Good) / 0 | 104 | 531 | 61 | 24.4 | 135.9 |
| 0y 4× | 24.4 | 1,121 (Good) | 59 | 104 (Watch) / 117 | 113 | 1,451 | 150 | 24.4 | 135.9 |
| 1y 1× | 27.0 | 436 (Good) | 15 | 0 (Good) / 57 | 114 | 555 | 68 | 27.7 | 138.5 |
| 1y 4× | 27.0 | 1,218 (Good) | 64 | 128 (Watch) / 261 | 123 | 1,473 | 179 | 27.7 | 138.5 |
| 10y 1× | 49.9 | 497 (Good) | 31 | 60 (Watch) / 255 | 222 | 742 | 139 | 56.3 | 161.4 |
| 10y 4× | 49.9 | 1,455 (Good) | 131 | 324 (Problem) / 1,160 | 238 | 1,748 | 379 | 56.3 | 161.4 |
| 25y 1× | 88.2 | 581 (Good) | 52 | 108 (Watch) / 251 | 382 | 980 | 218 | 92.8 | 199.7 |
| 25y 4× | 88.2 | 1,865 (Good) | 208 | 619 (Problem) / 1,282 | 414 | 2,494 | 515 | 92.8 | 199.7 |
| 40y 1× | 126.5 | 671 (Good) | 70 | 168 (Problem) / 303 | 495 | 1,515 | 303 | 127.8 | 238.0 |
| 40y 4× | 126.5 | 2,136 (Good) | 289 | 903 (Problem) / 1,482 | 623 | 3,086 | 793 | 127.8 | 238.0 |

### Memory (MB)

| Profile | RSS after boot | JS heap after boot | RSS after autosaves | Peak RSS during autosaves | RSS after forced GC | Fresh tab, verse selected: RSS | After language.db opens: RSS | Language tab adds | Open tab ms |
|---|---|---|---|---|---|---|---|---|---|
| 0y 1× | 270 (Good) | 148 | 859 | 859 | 797 | 279 | 340 | 61 | 153 |
| 0y 4× | 270 (Good) | 148 | 910 | 910 | 798 | 279 | 340 | 61 | 475 |
| 1y 1× | 283 (Good) | 153 | 952 | 952 | 879 | 290 | 346 | 56 | 150 |
| 1y 4× | 283 (Good) | 153 | 912 | 940 | 879 | 289 | 346 | 57 | 474 |
| 10y 1× | 242 (Good) | 197 | 751 | 1306 | 576 | 250 | 378 | 128 | 149 |
| 10y 4× | 241 (Good) | 197 | 577 | 1308 | 576 | 251 | 379 | 128 | 455 |
| 25y 1× | 286 (Good) | 274 | 839 | 1546 | 557 | 294 | 360 | 66 | 170 |
| 25y 4× | 286 (Good) | 274 | 470 | 1341 | 468 | 294 | 422 | 128 | 501 |
| 40y 1× | 331 (Watch) | 351 | 1080 | 1475 | 692 | 336 | 464 | 128 | 179 |
| 40y 4× | 331 (Watch) | 351 | 587 | 1444 | 570 | 336 | 464 | 128 | 562 |

As you asked, `language.db`'s cost is measured separately, in a fresh tab with no writes behind it: the last three data columns. It adds about 128 MB of JS heap at every profile, and 56–128 MB of RSS. That cost doesn't grow with the notes.

### RSS during the autosave run (MB, every 5 saves)

| Profile | Series |
|---|---|
| 0y 1× | 327 → 449 → 499 → 614 → 731 |
| 0y 4× | 327 → 449 → 568 → 684 → 803 |
| 1y 1× | 272 → 406 → 540 → 672 → 804 |
| 1y 4× | 273 → 406 → 540 → 671 → 804 |
| 10y 1× | 443 → 662 → 927 → 1142 → 422 |
| 10y 4× | 344 → 607 → 874 → 1144 → 416 |
| 25y 1× | 634 → 897 → 391 → 834 → 1276 |
| 25y 4× | 634 → 897 → 392 → 835 → 381 |
| 40y 1× | 826 → 1187 → 464 → 463 → 464 |
| 40y 4× | 826 → 1189 → 465 → 464 → 464 |

### Where the time goes (ms)

| Profile | updateNote() | of which export() | Refresh queries | John 3:16 query / total | Hot study query / total | All Studies query / total |
|---|---|---|---|---|---|---|
| 0y 1× | 17 | 14 | 2 | 0 / 32 |  /  | 0 / 32 |
| 0y 4× | 87 | 59 | 4 | 1 / 29 |  /  | 1 / 28 |
| 1y 1× | 22 | 15 | 3 | 2 / 32 | 7 / 75 | 0 / 27 |
| 1y 4× | 85 | 64 | 16 | 9 / 75 | 30 / 321 | 2 / 35 |
| 10y 1× | 34 | 31 | 25 | 16 / 105 | 60 / 628 | 3 / 40 |
| 10y 4× | 170 | 131 | 95 | 101 / 472 | 293 / 3,090 | 14 / 177 |
| 25y 1× | 56 | 52 | 56 | 40 / 264 | 144 / 1,817 | 8 / 117 |
| 25y 4× | 261 | 208 | 227 | 269 / 1,222 | 739 / 7,588 | 33 / 444 |
| 40y 1× | 86 | 70 | 90 | 63 / 396 | 216 / 2,578 | 12 / 153 |
| 40y 4× | 377 | 289 | 325 | 307 / 1,933 | 1,073 / 12,752 | 75 / 699 |

### Search

Whole `db.search()`, then the notes query alone. Scripture search is the unchanged LIKE path, as a baseline.

| Profile | Common | Common, notes only | Rare | Rare, notes only | Planted | Planted, notes only | Scripture LIKE, common | Scripture LIKE, no match |
|---|---|---|---|---|---|---|---|---|
| 0y 1× | 5 (Good) | 0 |  |  |  |  | 1 | 12 |
| 0y 4× | 24 (Good) | 3 |  |  |  |  | 2 | 64 |
| 1y 1× | 12 (Good) | 1 | 20 (Good) | 1 | 12 (Good) | 0 | 0 | 12 |
| 1y 4× | 68 (Good) | 3 | 97 (Good) | 3 | 62 (Good) | 2 | 2 | 66 |
| 10y 1× | 15 (Good) | 1 | 23 (Good) | 0 | 12 (Good) | 0 | 1 | 11 |
| 10y 4× | 69 (Good) | 3 | 108 (Good) | 3 | 51 (Good) | 2 | 2 | 53 |
| 25y 1× | 13 (Good) | 1 | 27 (Good) | 1 | 12 (Good) | 1 | 1 | 11 |
| 25y 4× | 66 (Good) | 3 | 139 (Good) | 3 | 64 (Good) | 2 | 2 | 60 |
| 40y 1× | 13 (Good) | 1 | 28 (Good) | 1 | 12 (Good) | 1 | 0 | 11 |
| 40y 4× | 73 (Good) | 3 | 117 (Good) | 3 | 68 (Good) | 2 | 3 | 54 |

### Hot-spot rendering (ms to painted; [count rendered])

| Profile | John 3:16 (cards) | Psalm 119 (marked verses) | Hot study (notes) | All Studies |
|---|---|---|---|---|
| 0y 1× | 32 (Good) [0] | 31 (Good) [0] |  [] | 32 (Good) |
| 0y 4× | 29 (Good) [0] | 69 (Good) [0] |  [] | 28 (Good) |
| 1y 1× | 32 (Good) [8] | 31 (Good) [158] | 75 (Good) [50] | 27 (Good) |
| 1y 4× | 75 (Good) [8] | 91 (Good) [158] | 321 (Watch) [50] | 35 (Good) |
| 10y 1× | 105 (Good) [77] | 33 (Good) [162] | 628 (Problem) [500] | 40 (Good) |
| 10y 4× | 472 (Watch) [77] | 194 (Good) [162] | 3,090 (Problem) [500] | 177 (Good) |
| 25y 1× | 264 (Watch) [192] | 55 (Good) [165] | 1,817 (Problem) [1250] | 117 (Good) |
| 25y 4× | 1,222 (Problem) [192] | 223 (Watch) [165] | 7,588 (Problem) [1250] | 444 (Watch) |
| 40y 1× | 396 (Watch) [303] | 134 (Good) [171] | 2,578 (Problem) [2000] | 153 (Good) |
| 40y 4× | 1,933 (Problem) [303] | 354 (Watch) [171] | 12,752 (Problem) [2000] | 699 (Problem) |

---

## How much of what every write exports is reference data?

This is the breakdown the spec asked for, from `dbstat` on bytes the app itself exported, which are exactly what each write re-serializes.

| Profile | Reference | Seeded plans + templates | User tables | FTS shadow | SQLite internal | Free pages | Total |
|---|---|---|---|---|---|---|---|
| 0y | 24.0 | 0.3 | 0.1 | 0.0 | 0.0 | 0.0 | 24.4 |
| 1y | 24.0 | 0.4 | 1.9 | 0.8 | 0.0 | 0.7 | 27.7 |
| 10y | 24.0 | 1.1 | 17.7 | 6.5 | 0.0 | 7.0 | 56.3 |
| 25y | 24.0 | 2.3 | 45.0 | 16.4 | 0.0 | 5.1 | 92.8 |
| 40y | 24.0 | 3.5 | 71.6 | 26.0 | 0.0 | 2.7 | 127.8 |

| Years | Reference share of each export |
|---|---|
| 0 (today) | **98%** |
| 1 | 87% |
| 10 | 43% |
| 25 | 26% |
| 40 | **19%** |

The 24.0 MB of reference data is `cross_references` (14.0 MB), `topic_verses` (8.1 MB), and `topics` (1.9 MB). At 40 years the largest tables are `notes` (63.8 MB) and the search index, `notes_fts_segments` (25.6 MB). The free pages come mostly from the generator's bulk load, so treat them as noise.

---

## When each measurement first leaves "Good"

| Measurement | At 1× | At 4× |
|---|---|---|
| Boot to live | Never | Never |
| Block per autosave | 10y Watch, 40y Problem | 0y Watch, 10y Problem |
| Notes search | Never | Never |
| John 3:16 render | 25y Watch | 10y Watch, 25y Problem |
| Psalm 119 render | Never | 25y Watch |
| Hot-study render | 10y Problem | 1y Watch, 10y Problem |
| All Studies render | Never | 25y Watch, 40y Problem |
| RSS after boot | 40y Watch | 40y Watch |

---

## What's causing the cost

**Long lists are almost entirely DOM, not SQL.** Opening the 2,000-note study takes 2,578 ms, of which `getNotesForStudy()` is 216 ms (8%). All Studies at 40 years: 153 ms total, 12 ms query. Every note in a study is built as an editable block up front, so cost rises linearly with list size: 1.3–1.5 ms per note at every profile. Note the hot study scales with the profile, so its row shows size more than age. At the generator's rates a typical study holds about 30 notes.

**Autosave is two roughly equal costs.** At 40 years, 168 ms of blocking is about 86 ms in `updateNote()` (70 ms of that `export()`) and about 90 ms in the refresh queries that follow. `export()` is close to linear, at about 0.55 ms per MB. The write itself stays off the main thread: 104 ms at 0y, 495 ms at 40y, which is still shorter than the 800 ms debounce.

**The refresh queries are slow because anchor lookups scan.** `EXPLAIN QUERY PLAN` in sql.js shows the anchor queries starting from `idx_notes_parent`: `parent_note_id IS NULL` matches every note, so the planner visits all 31,200 notes and looks up each one's anchors. In isolation each lookup takes about 25–30 ms at 40 years, for any verse. Steering the planner away helps only early books (Genesis 25 ms → 0.1 ms, but John and Revelation stay at 30 ms), because `verse_start <= X` then walks most of the anchors instead. The refresh also measured more (90 ms) than two isolated lookups account for (about 50 ms); I didn't separate the remainder.

**John 3:16** spends 63 ms of 396 ms in `getNotesForVerse()`. I didn't separate the rest, which is the other tabs' queries and building 303 cards.

**Peak memory is export buffers waiting for garbage collection.** Each save allocates a whole-file buffer and transfers it to the storage worker, and RSS climbs by about one file size per save until a collection runs. The sawtooth in the table is that cycle. Three pieces of evidence, the last two from a separate 30-save probe of the app with none of these hooks:

- Forcing GC on the page often barely moves RSS (0y: 859→797), and the transferred buffers live in the worker, which that doesn't reach.
- The unhooked app shows the same climb and then settles flat (40y sampled peak 1,186 MB → 463 MB; 0y 614 → 239), so this isn't my instrumentation, and it isn't a leak.
- Having the worker call `gc()` after each write removed the climb altogether at 40y: 771 MB before the first autosave (left over from the setup writes), then a flat 462 MB, with no sample above that. That supports the worker-heap explanation, though `gc()` was only available through a test flag.

The 0y and 1y runs were still climbing when their 20 saves ended, so their "after autosaves" figures aren't peaks.

**Disk writes:** each autosave rewrites the whole file, so 128 MB per save at 40 years, or 2.6 GB across this 20-save run.

---

## Found along the way

**Bug: every note edit leaves the search index inconsistent (not fixed; the spec keeps Item 2 to measurement).** `updateNote()` runs `UPDATE notes` first, then `DELETE FROM notes_fts`. `notes_fts` is an FTS4 external-content table, so that delete works out which words to remove by reading the row's *current* text, which by then is the new text. The old words are never removed.

Tested through `db.js` in the running app, on a fresh profile with sql.js:

| Step | Search for the old word | Search for the new word | `PRAGMA integrity_check` | Note text |
|---|---|---|---|---|
| Before any edit | | | `ok` | intact |
| After one edit, as shipped | **still finds the note** | finds it | **`malformed inverted index for FTS4 table main.notes_fts`** | intact |
| After `INSERT INTO notes_fts(notes_fts) VALUES('rebuild')` | no match | finds it | `ok` | intact |
| Then an edit with the delete moved before the update | no match | finds it | `ok` | intact |

- **What it means for you:** no note text is lost or damaged, because `notes` is the source of truth and only the index is wrong. Search for current words kept working, including after 20 further edits. But search can find a note for a word it no longer contains, autosave leaves every intermediate word behind, and SQLite's own integrity check now reports a problem on any install where a note has ever been edited. That includes yours, and it will carry through backups.
- **Likely fix, tested above:** delete from `notes_fts` before updating `notes`, the order `deleteNoteRows()` already uses, plus one `rebuild` to repair existing installs. The rebuild's cost at 31,200 notes wasn't measured, so it should run once rather than on every boot.
- **Effect on these results:** the generator inserts each note once, so its index is consistent, and this test doesn't capture index growth from edits. Real FTS sizes may run larger.

---

## Candidate remedies, ranked by expected benefit against disruption

None implemented. The benefit estimates come from the numbers above, not from trying the remedies, except where noted.

| # | Remedy | Expected benefit | Disruption |
|---|---|---|---|
| 1 | **Bound anchor lookups on both sides**, with a query or index change to replace the scan. Needs some design, because anchor ranges can span chapters and books, and a planner hint alone isn't enough (tested above). | About half of the ~90 ms refresh at 40y (the ~50 ms the isolated lookups account for), so autosave likely falls from Problem to Watch. Helps every selection, for every user. | Small. `db.js` queries, verified with `dbsnapshot`/`dbcompare` against `docs/ANCHOR_QUERIES.md`. |
| 2 | **Release export buffers sooner**, for example by recycling the storage worker periodically. | In the `gc()` probe, 40y autosaves added no peak at all: 771 MB before the first save, then a flat 462 MB, against a climb to 1,186 MB as shipped. A production mechanism is untested, since `gc()` needs a test flag. | Small. `storage-worker.js` and `saveToStorage()`. |
| 3 | **Render long lists incrementally** (study documents, All Studies, Info cards). | The largest visible gain: a 2.6 s study open becomes roughly constant. Only matters past about 150 notes in one list. | Moderate. `notes.js` has to keep editing, scrolling to a note, and in-page find working. |
| 4 | **Save less often while typing**: a longer debounce, or saving on idle or blur. | Fewer saves, so less disk writing and less memory churn. Doesn't shrink each save's block, so typing still stutters, just less often. | Small, with a trade-off: a little more unsaved text is at risk in a crash. |
| 5 | **Split user data into its own database file**, so writes stop re-exporting reference data. | Large early, small late: each export shrinks 87% at 1y, 43% at 10y, 19% at 40y. That saves only about 13 ms of the 168 ms block at 40y, though on a slow CPU it could bring the early years' block near Good. | Moderate to high. Backup and restore format with compatibility for old backups, a migration of every install, and queries that join across the two (`bookmarks` to `books`, tag search to `topics`). |
| 6 | **Page-level storage**, such as wa-sqlite's OPFS mode. | The only remedy that removes whole-file export: autosave blocking, disk volume and peak memory all drop, and boot may too. | Highest. Replaces sql.js, a vendored-dependency change against the zero-dependency rule. Such storage typically runs in a worker, which would make the queries async and touch every caller of `db.js`. |

**My read:** none of these remedies is urgent, and the search-index bug above should come before all of them. On capable hardware the first threshold crossings come around year 10, at a heavy 15 notes a week. Remedies 1 and 2 are cheap and worth doing whenever convenient. Remedy 3 is worth doing if you expect studies past a couple of hundred notes. I wouldn't take on 5 or 6 on these numbers alone. If whole-file export ever becomes the real limit, 6 addresses it, whereas 5 mostly doesn't by the time it would matter.

---

## Other results

- **Realism checks passed at every profile:** Restore's `looksLikeCoreDb()` accepted each file; `PRAGMA integrity_check` is `ok`, and FTS4's own integrity-check ran without error at generation; All Studies listed every study; the planted token found exactly its one note, through sql.js.
- **Restore at scale:** 1.5 s at 40 years, 3.1 s throttled.
- **Write ordering:** `storage-worker.js` handles messages concurrently with no queue, so overlapping writes could in principle finish out of order. Bursts of 5 rapid writes, 3 bursts per run, reloaded and checked: the last write survived every time (0 lost in 30 bursts across all runs). That's reassuring, not proof.
- **Storage:** 238 MB at 40 years, including `language.db` and translations, against a 3.4 GB quota in this headless profile.
- **CPU throttling mostly misses the worker:** `export()` slows about 4× (70→289 ms) as expected, but worker writes barely change (495→623 ms). So 4× rows overstate nothing on the main thread but understate a slow machine's disk writes.

---

## Method, and how it differs from the spec

- **Generator starts from an app-created database, not `data/core.db`.** The shipped file has no user tables and its header says WAL. `python3 tests/stress.py base` saves a real first-boot database through the app's Backup export, which gives the exact schema, seeded plans and templates, and the `meta` row with no DDL retyped in Python.
- **Hot spots scale with the profile**, since a 2,000-note study can't exist in a 780-note year. John 3:16 and the hot study scale by years/40 (minimum 8 notes); Psalm 119's markups stay constant. Hot-spot notes count toward the note totals. Anchors from ordinary notes can also land on John 3:16, so its counts run slightly over.
- **"40 plans of progress"** is one completed `plans` row per year, cloned with its days and scripture, because the schema stores progress per plan rather than per run. This is the upper bound on what plans could cost.
- **Note bodies** are sampled KJV phrases averaging about 1,560 chars. The target was about 1,500.
- **The FTS index is bulk-built** in one pass rather than through years of incremental edits, so its segment layout differs from a real one and it misses the edit growth described under "Found along the way".
- **Memory thresholds are judged against renderer RSS, not `performance.memory`.** The two don't track each other: the JS heap read 131 MB when RSS was 507 MB early on, and 351 MB against 331 MB RSS at 40 years. Both are reported. The spec's threshold applies only "after boot", so the much higher write-time peaks don't appear in the "Good" table above; they're flagged here instead.
- **No app instrumentation.** `storage-worker.js` reports nothing back, so the harness serves a patched copy that posts when a write closes. An init script wraps `initSqlJs` and `Worker` from outside. No debug flag was needed. It boots via `localhost` so no service worker can serve the unpatched worker.
- **Autosave** means 20 single keystrokes, each followed by waiting for the debounced write to finish.
- **Separate one-off probes** (not in `tests/stress.py`) produced the unhooked and worker-`gc()` memory figures, the `EXPLAIN QUERY PLAN` results, and the FTS bug table.

**To reproduce:**

```bash
python3 tests/stress.py base
python3 scripts/gen_stress_data.py
python3 tests/stress.py all      # about 20 minutes on this machine
python3 tests/stress.py report
```

Generated databases and raw JSON results are in `tests/stress-data/`, which is gitignored.
