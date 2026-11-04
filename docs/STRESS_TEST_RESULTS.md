# Longevity Stress Test — Results

Spec: `Offline_Language_And_Stress_Test_Spec.md`, Item 2. **Question:** if one person uses Ember seriously for 40 years, does it stay fast and stable? Where does it start to hurt, and why?

The measurement itself changed no app code. The fixes you chose afterward are recorded under "After the fixes". The thresholds are the spec's proposed starting points, for you to adjust.

---

## The short answer

**Ember stays stable, and most of it stays fast, through 40 years of heavy use.** Nothing crashed, lost data, or logged a console error at any profile. Boot and search are in the spec's "Good" band even at 40 years on a throttled CPU.

As first measured, three things degraded, all gradually. All three are now much improved; see "After the fixes" and "Long lists, fixed":

1. **Very long lists.** A 500-note study takes 628 ms to open and a 2,000-note study 2.6 s. Cost follows the size of the list, about 1.3 ms per note, not the age of the data. A study passes the 200 ms threshold at roughly 150 notes (my extrapolation from that rate).
2. **Autosave stutter.** Each save blocks the main thread for 60 ms at 10 years and 168 ms at 40. That crosses the "typing feels sticky" line (150 ms) only near year 40 on this machine, but already at year 10 on a CPU 4× slower.
3. **Memory peaks while writing.** Whole-file exports pile up as garbage, so RSS reached 1.3–1.5 GB during autosaves from 10 years up, before settling back to 464 MB at 40 years. This isn't a leak, but it could matter on a low-memory machine.

**The spec's leading suspect is only part of the story.** Today, 98% of what every write re-exports is reference data. At 40 years it's 19%, because by then your own notes are the bulk of the file. Splitting the databases helps most in the years when it's needed least.

**A separate bug turned up and is now fixed:** any note edit left the search index inconsistent with the notes. See "Found along the way".

---

## After the fixes

Two of the remedies below (1 and 2) and the search-index bug are fixed in this section's numbers, and remedy 3 follows in "Long lists, fixed". Everything from "Results" down to "Candidate remedies" describes Ember **before** those fixes, because that's what the diagnosis was based on. These are the same measurements re-run on the fixed code, with the data regenerated from a fresh base. `python3 tests/stress.py all` now reproduces these numbers apart from what "Long lists, fixed" changes: list rendering and the query timers.

| Profile | Block per autosave, before (ms) | After | Refresh queries, before (ms) | After | Highest RSS during autosaves, before (MB) | After |
|---|---|---|---|---|---|---|
| 0y 1× | 0 (Good) | 0 (Good) | 2 | 1 | 731 | 358 |
| 0y 4× | 104 (Watch) | 111 (Watch) | 4 | 4 | 803 | 242 |
| 1y 1× | 0 (Good) | 0 (Good) | 3 | 1 | 804 | 280 |
| 1y 4× | 128 (Watch) | 128 (Watch) | 16 | 8 | 804 | 279 |
| 10y 1× | 60 (Watch) | 0 (Good) | 25 | 2 | 1,142 | 421 |
| 10y 4× | 324 (Problem) | 212 (Problem) | 95 | 24 | 1,144 | 421 |
| 25y 1× | 108 (Watch) | 72 (Watch) | 56 | 2 | 1,276 | 392 |
| 25y 4× | 619 (Problem) | 304 (Problem) | 227 | 12 | 897 | 479 |
| 40y 1× | 168 (Problem) | 84 (Watch) | 90 | 2 | 1,187 | 586 |
| 40y 4× | 903 (Problem) | 361 (Problem) | 325 | 5 | 1,189 | 585 |

Block is the median per save. RSS is the highest of the samples taken every 5 saves, leaving out the first, which is taken before any autosave.

- **Typing is better at every age from 10 years up.** The "typing feels sticky" line is no longer crossed at 1× at any age: 40 years is now Watch, not Problem, and 10 years is back to Good. On a 4× slower CPU, 10 years and up stay in Problem, but with far lower numbers (40y: 903 → 361 ms). What's left is mostly `export()`, which these fixes don't touch. These are medians, and an occasional save still blocks longer (slowest at 40y: 206 ms; at 10y: 326 ms).
- **The anchor fix did better than I predicted.** I estimated it would save about half of the refresh cost. It took the 40-year refresh from 90 ms to 2 ms. The old 90 ms was already more than the two isolated lookups accounted for, and I didn't separate why, but all of it went.
- **Memory no longer climbs by a file's worth per save.** At 40 years the sampled RSS now stays around 465–586 MB, where it used to reach 1,189 MB before settling. A buffer is still in memory while its write is in flight, so writes in quick succession can still stack up briefly, and the "Peak" column below reflects that: the harness fires 2 setup writes and 3 rapid timing writes on purpose, in both the before and after runs, so that column overstates ordinary typing.
- **Unchanged, as expected:** long-list rendering (the 2,000-note study still takes about 2.5 s), `export()` time, and boot. Single-sample figures like Restore vary between runs (40y 1×: 1,515 → 2,230 ms, but 4×: 3,086 → 2,899 ms), so I wouldn't read anything into that difference.
- **Stability:** no console errors at any profile, every autosave's text intact, and 0 of 30 write bursts lost their last write.

### Long lists, fixed

This came after the section above, so the tables above and below still show the old long-list figures. I re-ran only the 10-year and 40-year profiles.

| Profile | Hot study, before (ms) | After | John 3:16, before (ms) | After | All Studies, before (ms) | After |
|---|---|---|---|---|---|---|
| 10y 1× (500 notes) | 723 (Problem) | 82 (Good) | 114 (Good) | 54 (Good) | 50 (Good) | 30 (Good) |
| 10y 4× | 3,798 (Problem) | 382 (Watch) | 538 (Watch) | 229 (Watch) | 232 (Watch) | 144 (Good) |
| 40y 1× (2,000 notes) | 2,476 (Problem) | 406 (Watch) | 342 (Watch) | 163 (Good) | 153 (Good) | 105 (Good) |
| 40y 4× | 12,298 (Problem) | 1,907 (Problem) | 1,668 (Problem) | 759 (Problem) | 723 (Problem) | 525 (Watch) |

A study now passes the 200 ms threshold at roughly 1,000 notes, interpolated from those two sizes, where before it was roughly 150.

**The diagnosis below was wrong, and so remedy 3 wasn't what got built.** "What's causing the cost" says long lists are almost entirely DOM, with `getNotesForStudy()` at 216 ms of 2,578. The harness timed that query from inside `page.evaluate`, where a statement costs about 0.05 ms. From any real task, such as a click or a timer, the same statement costs about 0.25 ms. Timing the real render path of the 2,000-note study at 40 years gave:

| Step | Time |
|---|---|
| `getNotesForStudy()`: two queries per note, about 4,000 statements | about 1,170 ms |
| Building the blocks | about 95 ms |
| Layout | about 1,180 ms |
| Paint | about 180 ms |

Chunked rendering would have left most of that in place and put editing, scroll-to-note and in-page find at risk. Three changes went in instead:

- **`attachTagsAndAnchors()` runs one tags query and one anchors query for the whole list.** Checked against the old per-note queries for all 31,200 notes at 40 years: identical rows in identical order. This also speeds up the Info tab, the tag view and search.
- **`.note-block` has `content-visibility: auto`,** so the browser lays out and paints only what's on screen. Every block stays in the DOM. A block with focus is exempt, because this CSS clips overflow, which would cut off the tag autocomplete. `innerText` also returns an empty string in a skipped block, which would have made a save blank the note, so autosave now reads the text as you type.
- **Delete, attach, remove-anchor and Add Note update one block in place.** A full rebuild would reset every block to its estimated height and move the scroll position to a different note.

**Info cards don't use `content-visibility`.** The Info tab rebuilds on every autosave, so its cards would lose their measured heights each time and the tab would jump while scrolled. That's why John 3:16 improved less, and it's the main cost left there at 4×.

**The query timers are fixed.** `query_*_ms` and `refresh_queries_ms` now run in a task of their own. Those figures elsewhere in this report, including the "Refresh queries" columns above and the query columns below, were measured the old way and understate the real cost, by up to about 5× where the time is mostly statement overhead. Timed the new way, 40y 1× refresh queries take 3.5 ms, not 2. This also explains the earlier gap between the 90 ms refresh and the two isolated lookups: those lookups weren't timed in a task. Render and block figures were never affected, because they time the app itself.

**`PRAGMA locking_mode=EXCLUSIVE`: tested, not adopted.** The extra cost per statement seems to come from SQLite's check for a leftover journal file. This pragma skips that check, and a single statement fell from 0.25 ms to 0.02 ms, which looked like a gain for every query. On real operations it barely shows, because batching has already removed most of the statements and what's left is mostly layout, paint and `export()`. Measured in Chromium, alternating with and without the pragma on the same page, with it reapplied after every export and to every open database. Figures are medians in ms:

| Operation | 40y at 1× | 40y at 4× | 10y at 4× |
|---|---|---|---|
| `search()` query | 29.5 → 15.5 | 143 → 75 | 148 → 69 |
| Refresh queries | 2.0 → 1.0 | 8.5 → 3.4 | 8.2 → 2.2 |
| `updateNote()`, including export | 108 → 96 | 402 → 386 | 184 → 176 |
| John 3:16 render | 152 → 149 | 687 → 673 | 207 → 187 |
| Hot-study render | 244 → 244 | 1,138 → 1,139 | 292 → 289 |
| All Studies render | 82 → 79 | 380 → 365 | 106 → 104 |
| Cold boot to live | 616 → 606 | 2,026 → 2,044 | 1,439 → 1,410 |

Only the search and refresh rows are clearly separated. The other differences are within the spread between rounds, except the John 3:16 render at 10y 4×. Search gains the most, but about 70 ms at 4× wouldn't change how it feels. Against that, `export()` closes and reopens the connection (see `sql-wasm.js`), so the pragma is lost on every save and would have to be reapplied after each one, on the path that protects user data. Worth revisiting only if a statement-heavy feature appears.

### Thresholds after the fixes

| Measurement | At 1× | At 4× |
|---|---|---|
| Block per autosave | 25y Watch, never Problem | 0y Watch, 10y Problem |
| Hot-study render | 10y Problem | 1y Watch, 10y Problem |
| John 3:16 render | 25y Watch | 10y Watch, 25y Problem |
| RSS after boot | 40y Watch | 40y Watch |
| Boot, notes search | Never | Never |

This table predates "Long lists, fixed", which changes the Hot-study, John 3:16 and All Studies rows.

Psalm 119 and All Studies stay Good at every age at 1×. At 4×, Psalm 119 moves between Good and Watch from 10y, and All Studies reaches Watch at 10y and Problem at 40y.

### Full tables, fixed code

**Boot, writes, restore, backup**

| Profile | core.db MB | Boot to live ms | export() ms | Block per autosave ms (median / max) | Worker write ms | Restore ms | Backup ms | Backup MB | Storage MB |
|---|---|---|---|---|---|---|---|---|---|
| 0y 1× | 24.4 | 366 (Good) | 14 | 0 (Good) / 0 | 103 | 441 | 61 | 24.4 | 135.9 |
| 0y 4× | 24.4 | 1,087 (Good) | 59 | 111 (Watch) / 121 | 113 | 1,374 | 165 | 24.4 | 135.9 |
| 1y 1× | 27.0 | 386 (Good) | 16 | 0 (Good) / 68 | 126 | 467 | 73 | 27.7 | 138.5 |
| 1y 4× | 27.0 | 1,416 (Good) | 69 | 128 (Watch) / 276 | 175 | 1,566 | 175 | 27.7 | 138.5 |
| 10y 1× | 49.9 | 586 (Good) | 34 | 0 (Good) / 326 | 261 | 806 | 137 | 56.3 | 161.4 |
| 10y 4× | 49.9 | 1,621 (Good) | 140 | 212 (Problem) / 1,223 | 336 | 1,915 | 464 | 56.3 | 161.4 |
| 25y 1× | 88.2 | 617 (Good) | 54 | 72 (Watch) / 223 | 407 | 1,389 | 250 | 92.8 | 199.7 |
| 25y 4× | 88.2 | 2,026 (Good) | 232 | 304 (Problem) / 1,099 | 556 | 2,683 | 659 | 92.8 | 199.7 |
| 40y 1× | 126.5 | 604 (Good) | 70 | 84 (Watch) / 206 | 486 | 2,230 | 278 | 127.8 | 238.0 |
| 40y 4× | 126.5 | 1,977 (Good) | 296 | 361 (Problem) / 946 | 550 | 2,899 | 723 | 127.8 | 238.0 |

**Memory (MB)**

| Profile | RSS after boot | JS heap after boot | RSS after autosaves | Peak RSS during autosaves | RSS after forced GC | Fresh tab, verse selected: RSS | After language.db opens: RSS | Language tab adds | Open tab ms |
|---|---|---|---|---|---|---|---|---|---|
| 0y 1× | 271 (Good) | 148 | 409 | 409 | 261 | 280 | 341 | 61 | 169 |
| 0y 4× | 270 (Good) | 148 | 360 | 383 | 238 | 280 | 341 | 61 | 450 |
| 1y 1× | 284 (Good) | 153 | 388 | 388 | 277 | 290 | 347 | 57 | 217 |
| 1y 4× | 284 (Good) | 153 | 390 | 416 | 250 | 291 | 347 | 56 | 498 |
| 10y 1× | 243 (Good) | 197 | 648 | 648 | 363 | 252 | 379 | 127 | 217 |
| 10y 4× | 242 (Good) | 197 | 640 | 655 | 362 | 251 | 379 | 128 | 582 |
| 25y 1× | 288 (Good) | 274 | 742 | 810 | 648 | 296 | 422 | 126 | 224 |
| 25y 4× | 287 (Good) | 274 | 869 | 956 | 467 | 295 | 422 | 127 | 580 |
| 40y 1× | 332 (Watch) | 351 | 974 | 1199 | 571 | 336 | 465 | 129 | 176 |
| 40y 4× | 332 (Watch) | 351 | 953 | 1023 | 449 | 337 | 403 | 66 | 591 |

**RSS during the autosave run (MB, every 5 saves)**

| Profile | Series |
|---|---|
| 0y 1× | 236 → 358 → 241 → 264 → 288 |
| 0y 4× | 236 → 240 → 240 → 241 → 242 |
| 1y 1× | 248 → 251 → 253 → 280 → 254 |
| 1y 4× | 273 → 251 → 252 → 279 → 253 |
| 10y 1× | 445 → 370 → 313 → 421 → 368 |
| 10y 4× | 444 → 369 → 312 → 421 → 367 |
| 25y 1× | 635 → 392 → 390 → 390 → 390 |
| 25y 4× | 635 → 390 → 479 → 389 → 478 |
| 40y 1× | 827 → 583 → 586 → 465 → 586 |
| 40y 4× | 827 → 584 → 464 → 585 → 463 |

**Where the time goes (ms)**

| Profile | updateNote() | of which export() | Refresh queries | John 3:16 query / total | Hot study query / total | All Studies query / total |
|---|---|---|---|---|---|---|
| 0y 1× | 17 | 14 | 1 | 0 / 32 |  /  | 0 / 32 |
| 0y 4× | 74 | 59 | 4 | 1 / 32 |  /  | 1 / 27 |
| 1y 1× | 20 | 16 | 1 | 2 / 32 | 7 / 89 | 1 / 27 |
| 1y 4× | 91 | 69 | 8 | 9 / 90 | 49 / 374 | 4 / 41 |
| 10y 1× | 51 | 34 | 2 | 11 / 114 | 83 / 723 | 4 / 50 |
| 10y 4× | 229 | 140 | 24 | 80 / 538 | 403 / 3,798 | 17 / 232 |
| 25y 1× | 55 | 54 | 2 | 24 / 247 | 156 / 1,631 | 8 / 104 |
| 25y 4× | 286 | 232 | 12 | 161 / 1,442 | 791 / 9,633 | 34 / 540 |
| 40y 1× | 81 | 70 | 2 | 40 / 342 | 216 / 2,476 | 12 / 153 |
| 40y 4× | 365 | 296 | 5 | 154 / 1,668 | 1,106 / 12,298 | 67 / 723 |

**Hot-spot rendering (ms to painted; [count rendered])**

| Profile | John 3:16 (cards) | Psalm 119 (marked verses) | Hot study (notes) | All Studies |
|---|---|---|---|---|
| 0y 1× | 32 (Good) [0] | 32 (Good) [0] |  [] | 32 (Good) |
| 0y 4× | 32 (Good) [0] | 68 (Good) [0] |  [] | 27 (Good) |
| 1y 1× | 32 (Good) [8] | 31 (Good) [158] | 89 (Good) [50] | 27 (Good) |
| 1y 4× | 90 (Good) [8] | 102 (Good) [158] | 374 (Watch) [50] | 41 (Good) |
| 10y 1× | 114 (Good) [77] | 32 (Good) [162] | 723 (Problem) [500] | 50 (Good) |
| 10y 4× | 538 (Watch) [77] | 204 (Watch) [162] | 3,798 (Problem) [500] | 232 (Watch) |
| 25y 1× | 247 (Watch) [192] | 41 (Good) [165] | 1,631 (Problem) [1250] | 104 (Good) |
| 25y 4× | 1,442 (Problem) [192] | 186 (Good) [165] | 9,633 (Problem) [1250] | 540 (Watch) |
| 40y 1× | 342 (Watch) [303] | 93 (Good) [171] | 2,476 (Problem) [2000] | 153 (Good) |
| 40y 4× | 1,668 (Problem) [303] | 250 (Watch) [171] | 12,298 (Problem) [2000] | 723 (Problem) |

The search figures and the size breakdown didn't change meaningfully. The new `idx_anchors_long` index holds only long anchors, and the generator makes none, so its cost here is close to nothing.

---

## Results (before the fixes)

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

**Corrected in "Long lists, fixed":** the next paragraph is wrong about SQL, because the query time it quotes wasn't measured from a real task.

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

**Bug, now fixed: every note edit left the search index inconsistent.** `updateNote()` ran `UPDATE notes` first, then `DELETE FROM notes_fts`. `notes_fts` is an FTS4 external-content table, so that delete works out which words to remove by reading the row's *current* text, which by then was the new text. The old words were never removed.

Tested through `db.js` in the running app, on a fresh profile with sql.js:

| Step | Search for the old word | Search for the new word | `PRAGMA integrity_check` | Note text |
|---|---|---|---|---|
| Before any edit | | | `ok` | intact |
| After one edit, as shipped | **still finds the note** | finds it | **`malformed inverted index for FTS4 table main.notes_fts`** | intact |
| After `INSERT INTO notes_fts(notes_fts) VALUES('rebuild')` | no match | finds it | `ok` | intact |
| Then an edit with the delete moved before the update | no match | finds it | `ok` | intact |

- **What it meant:** no note text was lost or damaged, because `notes` is the source of truth and only the index was wrong. Search for current words kept working. But search could find a note for a word it no longer contained, autosave left every intermediate word behind, and SQLite's own integrity check reported a problem on any install where a note had ever been edited.
- **The fix:** `updateNote()` now deletes from `notes_fts` first, the order `deleteNoteRows()` already used. Existing data is repaired by one `rebuild` at the next boot, which took about 2.2 s at 31,200 notes. The "done" marker lives inside `core.db`, so restoring a backup made before the fix repairs that file too. `tests/verify.py storage` covers all of this.
- **Effect on these results:** the generator inserts each note once, so its index was consistent throughout, and this test doesn't capture index growth from the old behaviour. Real pre-fix indexes may have run larger.

**Fixed: `core.db` had the same empty-file hole on a first boot.** An empty `core.db` in OPFS stopped the app at "Failed to load: no such table: translations", on every boot from then on. `createWritable` only leaves that empty file if the tab closes during the very first save, when there are no notes to lose, so a 0-byte file now simply starts over as a first run. This deliberately doesn't use `isCompleteSqliteFile()`, the check `language.db` and the translations use: `initDatabase()` replaces whatever `loadFromStorage()` doesn't return, so a wrong answer there would overwrite someone's notes. A damaged file with anything in it is left on disk and fails visibly (`tests/verify.py storage` checks both).

---

## Candidate remedies, ranked by expected benefit against disruption

**Remedies 1 to 3 are done** (see "After the fixes" and "Long lists, fixed"); 4 to 6 aren't. The table keeps the estimates as written before any of this was tried.

| # | Remedy | Expected benefit | Disruption |
|---|---|---|---|
| 1 ✓ | **Bound anchor lookups on both sides**, with a query or index change to replace the scan. Needs some design, because anchor ranges can span chapters and books, and a planner hint alone isn't enough (tested above). | About half of the ~90 ms refresh at 40y (the ~50 ms the isolated lookups account for), so autosave likely falls from Problem to Watch. Helps every selection, for every user. | Small. `db.js` queries, verified with `dbsnapshot`/`dbcompare` against `docs/ANCHOR_QUERIES.md`. |
| 2 ✓ | **Release export buffers sooner**, for example by recycling the storage worker periodically. (Done differently: the worker transfers each buffer back to the main thread, which removes the climb and, unlike recycling, never reloads the worker script, so it can't lose a write that way.) | In the `gc()` probe, 40y autosaves added no peak at all: 771 MB before the first save, then a flat 462 MB, against a climb to 1,186 MB as shipped. A production mechanism is untested, since `gc()` needs a test flag. | Small. `storage-worker.js` and `saveToStorage()`. |
| 3 ✓ | **Render long lists incrementally** (study documents, All Studies, Info cards). (Done differently: batched queries, `content-visibility`, and in-place edits. Blocks aren't built in chunks.) | The largest visible gain: a 2.6 s study open becomes roughly constant. Only matters past about 150 notes in one list. | Moderate. `notes.js` has to keep editing, scrolling to a note, and in-page find working. |
| 4 | **Save less often while typing**: a longer debounce, or saving on idle or blur. | Fewer saves, so less disk writing and less memory churn. Doesn't shrink each save's block, so typing still stutters, just less often. | Small, with a trade-off: a little more unsaved text is at risk in a crash. |
| 5 | **Split user data into its own database file**, so writes stop re-exporting reference data. | Large early, small late: each export shrinks 87% at 1y, 43% at 10y, 19% at 40y. That saves only about 13 ms of the 168 ms block at 40y, though on a slow CPU it could bring the early years' block near Good. | Moderate to high. Backup and restore format with compatibility for old backups, a migration of every install, and queries that join across the two (`bookmarks` to `books`, tag search to `topics`). |
| 6 | **Page-level storage**, such as wa-sqlite's OPFS mode. | The only remedy that removes whole-file export: autosave blocking, disk volume and peak memory all drop, and boot may too. | Highest. Replaces sql.js, a vendored-dependency change against the zero-dependency rule. Such storage typically runs in a worker, which would make the queries async and touch every caller of `db.js`. |

**My read now that 1 to 3 are done:** nothing left is urgent. I wouldn't take on 5 or 6 on these numbers alone. If whole-file export ever becomes the real limit, 6 addresses it, whereas 5 mostly doesn't by the time it would matter.

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
- **No app instrumentation.** An init script wraps `initSqlJs` and `Worker` from outside, and no debug flag was needed. For the "before" runs `storage-worker.js` reported nothing back, so the harness served a patched copy that posted when a write closed. Since the buffer fix, the worker's own returned buffer is the signal and the patch is gone. The harness boots via `localhost`, so no service worker is involved.
- **"RSS after autosaves" and "Peak" include 3 rapid timing writes** made right after the 20 saves, and the first RSS sample follows 2 setup writes, in both the before and after runs. The every-5-saves series is the cleaner view of ordinary typing.
- **Autosave** means 20 single keystrokes, each followed by waiting for the debounced write to finish.
- **Separate one-off probes** (not in `tests/stress.py`) produced the unhooked and worker-`gc()` memory figures, the `EXPLAIN QUERY PLAN` results, the FTS bug table, and the comparison below.
- **The new anchor query was compared row for row with the old one** on the 40-year file with sql.js, after adding whole-Bible, whole-book and cross-book anchors: identical results across 782 verses and 691 chapters. A permanent version is in `tests/verify.py storage`, which compares against a plain scan on random anchors of every shape, including spans right at `LONG_ANCHOR_SPAN`.

**To reproduce:**

```bash
python3 tests/stress.py base
python3 scripts/gen_stress_data.py
python3 tests/stress.py all      # about 20 minutes on this machine
python3 tests/stress.py report
```

Generated databases and raw JSON results are in `tests/stress-data/`, which is gitignored.
