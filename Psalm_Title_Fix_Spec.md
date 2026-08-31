# Ember Bible Study — Psalm Title Data Completeness Fix

**Type:** Small, standalone data/schema patch. Not a numbered Build — narrower in scope, no reference panel or reader UI redesign involved. Should ship before or alongside Build 6, since Build 6's TAHOT integration surfaced this gap.

**Status:** Scoped and decided, including the sourcing question (resolved: not pursued for now). Ready for implementation planning.

---

## The Problem

Ember's bundled KJV, ASV, and Darby translations are missing psalm superscriptions/titles entirely (e.g. Psalm 3's "A Psalm of David, when he fled from Absalom his son."). WEB, YLT, and BSB already carry these titles correctly in Ember's current bundled data.

**Root cause (verified 2026-08-30):** this is a source-data gap, not an Ember import bug. The original `scrollmapper` KJV.db that Ember's `build/build_db.py` copied from never had psalm titles as extractable data in its `KJV_verses` schema (no verse-0 concept, no separate title field) — where a title existed at all in that source, it was either absent or merged as an untitled text prefix onto verse 1, and the copy Ember drew from happened to have the title-free variant. Nothing was stripped by Ember's own code; `insert_verses()` is an unconditional pass-through with no filter or strip step. ASV and Darby's gaps are presumed to share a similar root cause (unverified per-translation, but the pattern is consistent).

**Scope, fully verified — bounded to exactly this:**

- **116 of 150 Psalms** carry a genuine superscription/title in standard KJV. Confirmed two independent ways (STEPBible's TAHOT `Psa.N.0` rows, and a direct diff against fresh `scrollmapper` source data) — both methods agree on the same 116 psalms.
- **Psalm 119 is excluded from this fix** — it doesn't have a chapter-opening title. Its 22 acrostic stanzas are marked with inline Hebrew letter-name headings (ALEPH, BETH, GIMEL...) at verses 1, 9, 17, 25, etc. — a structurally different data-modeling problem (recurring in-chapter markers, not a single verse-0 heading), out of scope for this fix.
- **Habakkuk 3 is not affected** — checked directly against Ember's own bundled `KJV.db`: "A prayer of Habakkuk the prophet upon Shigionoth" is already present as the normally-numbered verse 1 (prayer content starts at verse 2). This is already correct standard KJV versification, not a gap.
- **No other KJV book/chapter is affected.** All 66 books were swept for the same signal used to find the Psalm titles; five other hits (Mark 13:1, John 19:1, John 21:1, Acts 10:1, James 5:1) were inspected and are trailing-whitespace noise, not titles.

---

## Decisions Made

### Sourcing — investigated, deferred; titles not pursued for now

Multiple candidate public-domain KJV digital sources were checked directly (not assumed from descriptions), specifically for whether they preserve psalm superscriptions/titles:

- **`scrollmapper/bible_databases` KJV.db** (Ember's current source) — no titles.
- **Project Gutenberg's standard KJV etext** (`gutenberg.org/ebooks/8019`, the Psalms book) — checked directly; Psalm 3 has no title, same gap as Ember's current text.
- Wayne independently spot-checked additional sources; titles were consistently absent there as well.

**Finding:** psalm title omission appears to be common, not unique to Ember's specific source -- most casual/volunteer-transcribed digital KJV texts drop them, likely because they're typeset differently (unnumbered, often in italics or brackets) in printed Bibles and don't survive naive digitization. The correct textual authority for what the titles *should* say is the Blayney 1769 Oxford edition (the standard source nearly all modern KJV publishers use), but available digital copies of it found so far are scanned facsimile images, not machine-readable text -- not usable as an import source without a separate transcription effort.

**Decision: do not pursue sourcing title text for KJV/ASV/Darby at this time.** Given how consistently absent titles are across readily-available digital sources, treat their omission as the working standard for Ember's bundled text for now, matching what KJV/ASV/Darby already do. This is a deliberate, revisitable decision, not a dead end -- if a clean, properly-licensed digital source with verified titles surfaces later (e.g. a careful transcription project, or manual entry from a print Blayney edition), this can be revisited.

**This changes the shape of the fix.** Since title text isn't being sourced from anywhere new, this is no longer a "backfill KJV/ASV/Darby with correct title text" task. What remains relevant from this investigation:

- The **verse=0 schema design, addressability, and hardcoded-`+1` patches** (below) are still worth doing -- they're needed regardless of title text, because Build 6's TAHOT data (`Psa.X.0` rows) still needs a home. TAHOT's own English-aligned title glosses can populate the Language tab's interlinear view for psalm titles even without fixing KJV/ASV/Darby's base text.
- **WEB/YLT/BSB keep their titles as-is** -- nothing about this decision touches translations that already have them.
- **KJV/ASV/Darby remain without titles** in their base text, consistent with their current state and with most other available digital KJV sources.

### Representation — verse=0, own row, distinct styling

A title is stored as a real row in `verses` with `verse=0`, not prepended into verse 1's text. This was chosen because:

- It keeps verse 1's text authentically matching the source translation (no synthetic concatenation)
- It gives the title a real `verse_id`, which makes it addressable for free — no schema changes needed for notes/bookmarks to attach to it, since they already anchor to `verse_id` generically

**Rendering:** distinct title styling in the reader (no verse number displayed) — not rendered as "verse 0," which would be confusing. Exact visual treatment (font, spacing, italics, etc.) to be decided during implementation.

### Addressability — titles are first-class, not decorative

Because the verse=0 design already gives titles a real `verse_id`, the simpler path is to let them behave like any other verse for notes, tags, and bookmarks — actively suppressing that would be extra work (hiding the note-anchor affordance specifically for verse=0), not less. Decision: **titles are addressable** — notes, tags, and bookmarks may attach to a title the same way they attach to any verse.

### Whole-chapter range behavior — split by data ownership, not treated uniformly

Two hardcoded `+1`-style gaps exist in the codebase where "start of chapter" assumes verse ≥ 1:

- **`js/db.js:1242`, `getBookmarksForChapter()`** — `chapterStart = bookId*1000000 + chapter*1000 + 1`. **Decision: patch to include verse=0.** A bookmark the person places on a title is their own data; excluding it from "what's bookmarked in this chapter" is a bug from their point of view, not a feature.
- **`build/build_db.py:288` and `scripts/build_crossrefs.py:111`, `split_range()`** — `seg_start_verse = ... else 1` when a cross-reference or Nave's Topical range spans a full intermediate chapter. **Decision: leave as-is, do not include verse=0.** This logic processes external curated data (OpenBible.info cross-references, Nave's Topical Bible) written by people referencing standard printed verse numbering, which has no concept of an addressable title. A cross-reference or topic entry spanning "Psalm 3" means the numbered verses; auto-including the title would be Ember deciding what that external data meant on the curator's behalf, not honoring what was actually curated.

This is a deliberate asymmetry: Ember's own user-generated data (bookmarks) treats titles as real content; externally-curated reference data (cross-refs, Nave's) treats titles as outside its original scope. Both are correct for what they are.

---

## Definition of Done

- [x] Sourcing investigated: multiple candidate sources checked directly, titles consistently absent; decision made not to pursue new title text for KJV/ASV/Darby at this time (revisitable)
- [ ] `verses` table gains verse=0 rows for the 116 affected psalms, populated from TAHOT's own English-aligned title data (via Build 6), not from a separate KJV/ASV/Darby-specific source
- [ ] Reader renders verse=0 rows with distinct title styling, no verse number shown
- [ ] Notes/tags/bookmarks can attach to a verse=0 title row (should work with no schema change, given existing `verse_id`-based anchoring — confirm, don't assume)
- [ ] `getBookmarksForChapter()` (`js/db.js:1242`) patched to include verse=0 in its chapter-start calculation
- [ ] `split_range()` in `build/build_db.py` and `scripts/build_crossrefs.py` explicitly left unchanged (verse 1 start) — confirm this is a deliberate no-op, not accidentally "fixed" during unrelated future work
- [ ] Psalm 119's acrostic headings explicitly confirmed out of scope for this fix (separate problem, not addressed here)
- [ ] Habakkuk 3 confirmed to need no changes (already correct)
- [ ] `getChapterVerseCount()` (`js/reference.js:78-89`) reviewed — currently would count a title as an extra verse in "N verses" display; decide during implementation whether to exclude verse=0 from that count for accurate display
- [ ] Clarify in-app: since KJV/ASV/Darby's own base text has no title wording, decide whether the verse=0 row for those translations shows TAHOT's English gloss as a substitute, shows nothing until a real source is found, or some other treatment — this needs its own small decision once Build 6's TAHOT integration is further along

---

## Relationship to Build 6

This fix is a prerequisite for clean TAHOT integration, not a blocker in the sense of preventing Build 6 from starting — but it should land before Build 6's import script is written, so that script can treat `Psa.X.0` rows as a normal case (a verse like any other) rather than needing its own special-case branch for a row with nowhere to go.
