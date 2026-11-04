# Anchor Query Convention

Single-verse anchors store `verse_end = NULL`. An anchor overlaps a verse or range when:

```sql
verse_start <= rangeEnd AND COALESCE(verse_end, verse_start) >= rangeStart
```

This handles both cases:
- **Single-verse anchor** (`verse_end IS NULL`): COALESCE reduces to `verse_start`, making it an equality check.
- **Multi-verse range** (Build 2+): both bounds are compared normally.

**Don't write that test directly.** It is correct but can only narrow by one side, so it walks most of the table (about 25 ms per lookup at 40 years of notes). Every lookup goes through `anchorsOverlapping(rangeStart, rangeEnd)` in `db.js`, which returns the same rows bounded on both sides:

```js
const overlap = anchorsOverlapping(verseId, verseId);
queryAll(db, `SELECT ... FROM note_anchors a
              CROSS JOIN notes n ON n.id = a.note_id
              WHERE ${overlap.sql} AND n.parent_note_id IS NULL`, overlap.params);
```

- An anchor up to `LONG_ANCHOR_SPAN` long that overlaps must start within that distance of the range, so `idx_anchors_verse` finds it in a short window.
- Longer anchors (a whole book, a whole Testament) are found through the partial index `idx_anchors_long`.
- Keep `note_anchors` first, with `CROSS JOIN`. Otherwise the planner can start from `n.parent_note_id IS NULL`, which matches every note.

`anchorsOverlapping()` selects from the alias `a`, so the query must name `note_anchors` that way.

---

## Audited queries (confirmed correct)

| Location | Function |
|----------|----------|
| `db.js` | `getUserTagsForVerse()` |
| `db.js` | `getNotesForVerse()` |
| `db.js` | `getNoteCountsForChapter()` — chapter-wide overlap query, then each anchor is expanded in JS to every verse it covers, clamped to the chapter |
| `db.js` | `removeAnchorsFromNote()` — by containment for one note, deliberately not an overlap test, so it doesn't use the helper |
| `reader.js` | Note indicator dots (inherit via `getNoteCountsForChapter`) |
