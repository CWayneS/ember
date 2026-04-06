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
| `db.js:300` | `getUserTagsForVerse()` |
| `db.js:384` | `getNotesForVerse()` |
| `reader.js:123` | Note indicator dots (inherits via `getNotesForVerse`) |
