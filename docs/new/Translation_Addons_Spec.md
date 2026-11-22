# Ember Bible Study — Translation Add-Ons Spec

**Status:** Draft, 2026-11-22.
**Ground rule:** the code wins where it and this spec disagree. Every "current state" claim below was checked against `js/db.js`, `js/reader.js`, `sw.js` and `build/build_db.py` as of November 2026. Re-check before building.

---

## Summary

Every translation except KJV becomes removable and downloadable. Darby leaves the default set and becomes the first add-on translation.

| Translation | ID | Tier | First run | Can remove |
|---|---|---|---|---|
| KJV | 1 | `locked` | Installed | No. It's the fallback. |
| ASV | 2 | `default` | Installed | Yes |
| WEB | 3 | `default` | Installed | Yes |
| YLT | 4 | `default` | Installed | Yes |
| Darby | 5 | `available` | Not installed | Yes, once added |
| BSB | 6 | `default` | Installed | Yes |

**Why Darby:** unused in practice. Each of the others has a clear role: KJV is the traditional text, ASV is the 1901 scholarly revision in the KJV line, YLT is hyper-literal for word study, and WEB and BSB are modern. Darby's main strength (care with Greek tense and article) is covered by the Language tab. It stays one click away as the first add-on, which also gives the add/remove workflow a real test case.

---

## Locked Decisions

- **KJV is locked.** It's always installed, has no Remove action, and is the fallback for any pane whose translation goes away. It's the only locked translation.
- **Removed stays removed.** No boot, reseed or update brings a removed translation back. Only Add, "Restore default translations", or restoring a backup that lists it does.
- **Translation IDs are permanent.** Darby keeps ID 5 and BSB keeps ID 6. A removed ID is never reused, and new translations get the next unused ID. The same ID means the same translation on every machine, which is what makes moving a backup between machines safe.
- **Downloading needs a connection. Reading doesn't.** Installed translations work offline exactly as they do today. Adding one needs a connection once.
- **User data is untouched.** Notes, markups, bookmarks, tags and plans are keyed by verse ID, not by translation. Adding or removing a translation never touches them. (Item 8 includes a schema test that holds this true.)
- **Restoring a backup never removes a translation from the machine it's restored onto.** The machine ends up with everything it already had plus everything the backup lists (Item 5a).

---

## Current State (verified Nov 2026)

- `build/build_db.py` seeds the `translations` manifest in `core.db` with fixed IDs 1–6, all `is_bundled = 1`.
- The shipped `core.db` is copied into storage on first boot and never refreshed from the server afterward. **The saved manifest is per-device state.** Changing `build_db.py` only affects fresh installs.
- `seedTranslations()` runs on every boot. For each `is_bundled = 1` row it fetches `./data/translations/{filename}` if the OPFS copy is missing or incomplete (`isCompleteSqliteFile`). It is driven entirely by the manifest rows.
- `openTranslationHandles()` opens a sql.js handle for each `is_bundled = 1` row into `_translationDbs`.
- `getChapter()` falls back to KJV (ID 1) when a handle is missing. `DEFAULT_PANE_STATE.translationId` is 1.
- `reader.js` caches the translation list once per session (`_translationsCache`, commented "never changes during a session"). This needs a way to refresh.
- `updateTranslationLabel()` shows the manifest abbreviation even when no handle is open. A pane can show "Darby" while rendering KJV text.
- Pane state (which translation each pane shows) lives in localStorage (`ember.pane.left.state`, `ember.pane.right.state`), not in `core.db`. It is per machine and is not part of a backup.
- `sw.js` passes everything under `data/` straight through and never caches it. **Removing a file from OPFS actually frees the space.** No service worker changes are needed.
- `bundled_installs` (plans and templates only, enforced by a `CHECK` on `kind`) implements "deleted stays deleted" for plans. Translations don't need it (see Item 2).
- **Backup** exports the whole `core.db`, including the manifest, but not the translation files. **Restore** (`backup.js` → `looksLikeCoreDb()` → `restoreCoreDb()`) replaces `core.db` and reloads.

---

## Item 1: Translation Catalog

A new file, `data/translations/catalog.json`, lists every translation Ember offers, installed or not.

```json
{
  "schema_version": 1,
  "translations": [
    {
      "id": 1,
      "filename": "kjv.db",
      "name": "King James Version",
      "abbreviation": "KJV",
      "year": "1611",
      "license": "Public Domain",
      "tier": "locked",
      "size_bytes": 0,
      "description": "The historic standard. Archaic, familiar, widely cross-referenced."
    }
  ]
}
```

- `tier` is `locked`, `default` or `available`.
- `size_bytes` comes from the real file in `data/translations/`. Fill it from the build script or by hand, but never estimate it.
- `description` is one line for the shelf. Draft lines (Wayne to edit):
  - **KJV:** The historic standard. Archaic, familiar, widely cross-referenced.
  - **ASV:** The 1901 scholarly revision in the KJV line.
  - **WEB:** Modern English, public domain, actively maintained.
  - **YLT:** Hyper-literal. Follows the original word order and tenses closely; built for word study.
  - **Darby:** 1890, literal-leaning, careful with Greek tense and the article.
  - **BSB:** Modern and essentially literal; public domain since 2023.
- The catalog is fetched only when online (Translations shelf, Restore defaults). Nothing offline depends on it: metadata for installed translations lives in the manifest.
- `darby.db` stays in `data/translations/`. It is hosted, just not installed by default.
- Add `LOCKED_TRANSLATION_ID = 1` as a constant in `db.js`, so the offline UI knows KJV is locked without the catalog. The catalog's `tier` for KJV must agree.

---

## Item 2: The Manifest Means "Installed on This Device"

- A row in `core.db`'s `translations` table means **this translation is installed here**. Add inserts a row. Remove deletes it.
- **Stop reading `is_bundled`.** `seedTranslations()` and `openTranslationHandles()` use every manifest row. Leave the column in place (no schema change) and write `0` for new rows.
- **Why this gives "removed stays removed" for free:** the saved `core.db` is never replaced from the server, and seeding only restores files for rows in the manifest. Once Remove deletes the row, nothing brings it back. No `bundled_installs` entry is needed.
- **Fresh installs:** in `build_db.py`, the shipped manifest contains KJV, ASV, WEB, YLT and BSB (IDs 1, 2, 3, 4, 6). Darby (ID 5) is in the catalog only. The existing first-run seeding then installs exactly the default set.
- **Existing installs (Wayne's):** the saved manifest still lists Darby, and `darby.db` is in OPFS. No migration. Darby simply becomes an installed translation that can now be removed. Removing it through the shelf is the first real test.

---

## Item 3: Add a Translation

`addTranslation(catalogEntry)` in `db.js`:

1. If offline, stop and say so. Nothing is written.
2. Fetch `./data/translations/{filename}`. Show progress if `Content-Length` is present ("Downloading Darby… 3.1 of 5.2 MB"); otherwise show an indeterminate "Downloading…".
3. Write it to OPFS `translations/{filename}` with `createWritable()`, the same pattern `seedTranslations()` uses.
4. **Check before registering it.** Open it with sql.js and confirm:
   - `meta.abbreviation` matches the catalog entry
   - `SELECT COUNT(*) FROM verses WHERE verse > 0` is 31,102. Count `verse > 0` only: KJV, ASV and Darby carry 116 `verse = 0` Psalm title rows, so a plain count is wrong for those three.
5. If anything fails, `removeEntry()` the file, show a clear message, and leave the manifest untouched.
6. On success, insert the manifest row (catalog metadata, `installed_at` = now), keep the open handle in `_translationDbs`, and save `core.db`.
7. Tell the UI the list changed (see Item 6).

The install-and-check steps should be a reusable function, so a future "import your own translation file" path can call it with a local file instead of a fetch.

---

## Item 4: Remove a Translation

`removeTranslation(id)` in `db.js`:

1. Refuse if `id === LOCKED_TRANSLATION_ID`, both in the UI (no button) and in the function (throw).
2. Confirm with the shared dialog (`dialogs.js`):
   > **Remove Darby Translation?**
   > You can download it again later. Your notes, highlights and bookmarks are not affected.
   > [Cancel] [Remove]
3. Any pane on that translation switches to KJV at the same book and chapter (`switchPaneTranslation`), and its pane state is saved.
4. Close the sql.js handle and delete it from `_translationDbs`.
5. Delete the manifest row and save `core.db`.
6. `removeEntry()` the OPFS file.
7. Tell the UI the list changed.

**Order matters:** the manifest row goes before the file. If the tab closes between steps 5 and 6, the leftover file is an orphan that the next boot cleans up (Item 5). The reverse order would leave a manifest row pointing at a missing file, and the next online boot would download it again.

Removing works offline.

---

## Item 5: Boot Reconcile

In `initDatabase()`, around the existing seeding:

- **`ensureLockedTranslation()`:** `INSERT OR IGNORE` the KJV row. This guards against a restored or damaged `core.db` without one.
- **`seedTranslations()`:** unchanged behavior, but for every manifest row. A row whose file is missing or incomplete is downloaded when online. This is also how translations listed in a restored backup arrive on a machine that lacks them: on its next online boot. An offline failure logs a `console.warn`, not an error, the same way the plan seeders use `logSeedLoadFailure`.
- **`removeOrphanTranslationFiles()`:** any `.db` file in OPFS `translations/` with no manifest row is deleted. Ignore other names (such as `.crswap`). Because of the restore merge (Item 5a), the only orphans left are true leftovers, such as a Remove interrupted between its manifest and file steps.
- **`openTranslationHandles()`:** every manifest row.

**What the UI lists:** only translations with an open handle. A manifest row whose file couldn't be loaded (offline, right after a restore) is hidden from the translation row until its download succeeds.

**Saved pane state:** on load, a pane whose `translationId` has no open handle resets to KJV. This fixes the existing case where the label says one translation and the text is KJV, and it covers moving a backup to a machine whose pane state points at a translation that isn't there.

### Item 5a: Restore Merges, Never Removes

**The problem without this:** a backup carries its machine's manifest. Restoring it on another machine replaces that machine's manifest, and the orphan cleanup would then delete every translation the other machine had that the backup didn't list. Nothing is permanently lost (it can be downloaded again), but it's a quiet side effect of restoring study data, and it costs bandwidth both ways.

**The rule:** after a restore, the machine has the union of what it already had and what the backup lists.

**Where it happens:** in the restore path, before the destructive write. Not at boot.

1. `backup.js` reads and validates the selected file as today (`looksLikeCoreDb()`), then shows the confirm dialog.
2. On confirm, a new `mergeInstalledTranslations(bytes)` in `db.js`:
   - opens the restored bytes as a throwaway sql.js database (the same pattern as `looksLikeCoreDb()`)
   - for each row in the **live** manifest, `INSERT OR IGNORE` it into the restored manifest. A row with the same ID is already there and is identical, because IDs are permanent. The `UNIQUE` on `filename` makes `OR IGNORE` skip anything inconsistent instead of failing. Log a `console.warn` for any live row skipped on a conflict.
   - exports the merged bytes and closes the throwaway database
3. `restoreCoreDb(mergedBytes)` writes as today, then the app reloads.
4. On the next boot, the existing reconcile finishes the job: rows from the backup whose files are missing download when online, and nothing the machine already had is an orphan.

**Why at restore time:** the live manifest is the record of what this machine has installed, and it's only available before the write replaces it. Merging at boot instead would need to tell "a file left from an interrupted Remove" apart from "a file this machine had before the restore," and it can't.

**This works offline.** The merge uses only the live manifest and the backup, not the catalog. Translations the backup adds stay hidden until the machine is next online.

**Removed stays removed still holds on each machine.** A translation removed on machine A but installed on machine B stays installed on B after B restores A's backup. That's intended: a restore brings your study data across; it doesn't make B's shelf match A's.

**Failure:** if the merge throws, show the same error as a failed restore and leave the current `core.db` untouched. Don't fall back to an unmerged restore.

---

## Item 6: The Translations Shelf (UI)

**Translation row (book picker):** lists installed translations with open handles, in ID order. A quiet **+** button sits at the end of the row (title "Translations").

**The shelf:** clicking **+** opens a Translations popover, using the same popover pattern as the panel settings. One line per catalog translation:

- **Installed:** abbreviation, name, year, description, size, and a plain **Remove** text button. KJV shows "Always installed" instead.
- **Not installed:** the same information, plus an **Add** button. Progress shows inline while downloading.
- **Footer:** "Restore default translations", shown only when a `default` translation is missing. It runs Add for each one.

**Offline:** if the catalog can't be fetched, list installed translations from the manifest, disable Add, and show one line: "Connect to the internet to add translations." Remove still works.

**Remove lives only in the shelf,** not on the row buttons, so a stray click in the book picker can't remove anything.

**Refreshing the list:** replace `reader.js`'s once-per-session `_translationsCache` with a refresh. Either export `refreshTranslations()` or fire a `translations-changed` event, following the existing `selection-changed` / `pane-changed` pattern. The translation row and both pane labels re-render on it.

**Metaphor check:** the reader is your Bible, and the shelf is where you keep your other Bibles. You take one down or put one away. No settings page.

**Help:** add one or two sentences about adding and removing translations to the reader's help popover.

---

## Item 7: Build and Data

- **`build_db.py`:** the shipped manifest drops Darby. KJV, ASV, WEB, YLT and BSB keep IDs 1, 2, 3, 4 and 6. Add a comment that ID 5 is reserved for Darby in the catalog.
- **`build_translation.py`:** unchanged. Darby is still built, with its Psalm title placeholder rows.
- **`catalog.json`:** new, under `data/translations/`, with `size_bytes` taken from the real files.
- **`sw.js`:** no change. `data/` is already pass-through. Confirm `catalog.json` is never cached (it sits under `data/`, so it shouldn't be).

---

## Item 8: Tests (`tests/verify.py`, new `translations` scenario)

**Add and remove**
- Fresh install: manifest and OPFS hold KJV, ASV, WEB, YLT and BSB. No Darby. The row shows those five.
- Add Darby online: file in OPFS, manifest row added, appears in the row, John 3:16 renders in Darby.
- Remove Darby while a pane shows it: that pane switches to KJV at the same chapter, the label reads KJV, and the file and row are gone. Reload online: still gone.
- Remove ASV, reload online: stays removed. Restore defaults: ASV is back.
- KJV: no Remove button, and `removeTranslation(1)` refuses.
- Failed or bad download (HTTP error, or a file whose `meta` doesn't match): no manifest row and no file left behind.
- Offline: shelf lists installed translations, Add is disabled, Remove works, installed translations render.
- Orphan file in OPFS with no manifest row: gone after the next boot.
- Pane state pointing at a removed ID: KJV after reload, with the correct label.

**Moving a backup between machines**
- **Different sets, online.** Make a backup on an install with KJV, ASV and Darby only (WEB, YLT and BSB removed), with a note, a highlight and a bookmark on John 3:16. Restore it onto a fresh install (KJV, ASV, WEB, YLT, BSB). After the reload and an online boot:
  - all six translations are installed; Darby was downloaded; WEB, YLT and BSB were **not** deleted
  - the note, highlight and bookmark appear on John 3:16 in every installed translation
- **Different sets, offline.** Same restore with the network off: the five existing translations still work, Darby is listed in the manifest but hidden from the row, and a pane saved as Darby shows KJV with a KJV label. Back online and reload: Darby downloads and appears.
- **Same set.** Restore a backup listing exactly what the machine has: nothing downloads, nothing is deleted.
- **Merge failure.** Force `mergeInstalledTranslations()` to throw: the restore shows an error, no reload happens, and the current `core.db` is unchanged.
- **User data has no translation column.** `PRAGMA table_info` on `notes`, `note_anchors`, `markups`, `bookmarks`, `tags`, `tag_assignments`, `studies` and the plan tables shows no translation ID column. This is the check that keeps the "user data is untouched" decision true as the schema grows.

- No console errors in any of the above.

---

## Item 9: Docs

- `README.md`: the `data/translations/` line and file tree (five default plus Darby on the shelf, and `catalog.json`).
- `USER_MANUAL.md`: translation section, including that restoring a backup on another machine keeps that machine's translations and downloads any the backup adds.
- `FEATURE_INVENTORY.md`.
- `BUILD_*_ACTUAL_STATE.md` for this build, written after implementation.
- `docs/Build_2_Spec.md` is a historical spec. Add a one-line "superseded by Translation_Addons_Spec.md" note at the top of its multi-translation section rather than rewriting it.

---

## Definition of Done

- [ ] Fresh install has five translations installed; Darby is on the shelf, not installed.
- [ ] Any translation but KJV can be removed, and stays removed through reloads and online boots.
- [ ] Any catalog translation can be added online, and is checked before it is registered.
- [ ] KJV cannot be removed by UI or by function call.
- [ ] Removing a translation moves affected panes to KJV at the same reference.
- [ ] Removing a translation frees its OPFS storage.
- [ ] A failed download leaves nothing behind.
- [ ] Orphan files are cleaned up at boot.
- [ ] Restoring a backup on another machine keeps every translation that machine had, and downloads the backup's others on the next online boot.
- [ ] Notes, highlights and bookmarks restored from another machine appear on the same verses in every installed translation.
- [ ] No user-data table has a translation ID column (schema test).
- [ ] Offline: reading and Remove work; Add explains why it can't.
- [ ] Existing install keeps Darby installed, and Darby can be removed through the shelf.
- [ ] `tests/verify.py translations` passes with no console errors.

---

## Out of Scope

- **Importing your own translation file.** The install-and-check function is written to be reused for it later. **ID note for that work:** imported translations can't take IDs from the catalog, or two machines could give the same ID to different translations and a moved backup would point at the wrong one. Give imports their own ID range (for example, 10000 and up, assigned per install) and match them across machines by content (`meta` plus a file hash), not by ID alone.
- **Updating an installed translation's text in place.** Still not a supported operation (see `OPFS_Reseed_Gap.md`).
- **Non-English versification.** All catalog translations share English versification.
- **Cross-translation search.**
- **New add-on translations beyond Darby.** The catalog makes adding one a data change, decided separately.
