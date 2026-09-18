# Anchor Query Convention

Single-verse anchors store `verse_end = NULL`. All queries against `note_anchors` must use range-aware lookup:

```sql
WHERE verse_start <= ? AND COALESCE(verse_end, verse_start) >= ?
```

This pattern correctly handles both cases:
- **Single-verse anchor** (`verse_end IS NULL`): COALESCE reduces to `verse_start`, making it an equality check.
- **Multi-verse range** (Build 2+): both bounds are compared normally.

Every new query touching `note_anchors` must follow this pattern.

---

## Audited queries (confirmed correct)

| Location | Function |
|----------|----------|
| `db.js` | `getUserTagsForVerse()` |
| `db.js` | `getNotesForVerse()` |
| `db.js` | `getNoteCountsForChapter()` — chapter-wide overlap query, then each anchor is expanded in JS to every verse it covers, clamped to the chapter |
| `reader.js` | Note indicator dots (inherit via `getNoteCountsForChapter`) |
