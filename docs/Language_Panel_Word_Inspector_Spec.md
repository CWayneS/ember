# Ember Bible Study — Language Panel Word Inspector Spec

**Purpose:** Rework the Build 6 Language tab's word detail view so a selected word's information appears *inline*, attached to the verse, instead of navigating the user away to a separate full-tab page. Introduces progressive disclosure (three tiers of detail) in place of the current single flat page.

**Prerequisite:** Build 6 shipped and stable (interlinear view, word detail view, `language.js`, `language.db`). This spec changes Build 6's word detail view; it does not touch the interlinear view's layout, grouping logic, or data model.

**Status:** Reviewed and finalized. Ready to hand to Claude Code.

---

## Problem Statement

The current word detail view (`openWordDetail()` / `renderWordDetail()` in `js/language.js`) replaces the entire Language tab content with a new page: back button, verse ref, word, then a flat stack of Lemma / Transliteration / Strong's / Morphology / "What does this mean?" accordion / TBESG lexicon entry.

Two problems:

1. **Leaving the verse.** Tapping a word transports the user away from the interlinear view they were just reading. The verse context is gone from view, even though it's the reason they clicked the word in the first place.
2. **Flat information density.** Lemma, transliteration, Strong's number, morphology code, contextual gloss, dictionary gloss, and a multi-paragraph lexicon entry all appear at once, at equal visual weight. The TBESG lexicon entry in particular can run to several hundred words — appropriate for deep study, wrong as the default view of a word someone just glanced at.

The underlying data is fine. This is a presentation-layer change only.

---

## Design Principle: Verse → Word → Lexical Detail

Not: verse → tap word → leave verse → dictionary page → back button.

Instead, three tiers, all reachable without losing the verse:

| Tier | Content | Trigger |
|---|---|---|
| 1. Word card | Original word, contextual gloss, morphology code, Strong's # (small/secondary) | Tap a gloss row in the interlinear view |
| 2. Click for more | Lemma, transliteration, parsed morphology breakdown, dictionary gloss | Tap "Click for more" for that member word |
| 3. Lexicon | Full TBESG article | Tap "Lexicon" inside the expanded tier 2 block |

The interlinear view (verse line + gloss list) stays visible above the word card at all times. Nothing about it changes from Build 6.

---

## Layout

The word card expands **in place, directly beneath the tapped gloss row** — not appended at the bottom of the gloss list, and not a tab swap. Rows below the tapped one shift down to make room, the same way the tapped row's own height grows. This matters specifically because the gloss list can run to 9+ rows (a full verse) — a card appended after the last row would be off-screen and invisible without scrolling, which defeats the point of keeping the verse in view.

```
┌──────────────────────────────────────────┐
│ Mark 8:4                                  │  ← existing: verse heading
│ Καὶ ἀπεκρίθησαν αὐτῷ ...                  │  ← existing: running verse line (RTL/LTR per language, unchanged)
├──────────────────────────────────────────┤
│ Καὶ                              And      │  ← existing: gloss list, row 1
├──────────────────────────────────────────┤
│ ἀπεκρίθησαν αὐτῷ ὅτι     answered Him...  │  ← tapped row (grouped, 3 members), marked active
│                                            │
│  ἀπεκρίθησαν              answered        │  ← NEW: word card, tier 1 — one mini-row per member
│  G0611                                     │  ← Strong's #, own line, small/secondary
│  V-ADI-3P                                  │  ← morphology code, own line
│  [Click for more]                          │  ← per-member trigger, not one link for the whole card
│  ────────────────────────────────────      │  ← visual divider between members
│  αὐτῷ                      Him             │
│  G0846                                     │
│  P-DSM                                     │
│  [Click for more]                          │
│  ────────────────────────────────────      │
│  ὅτι                       that            │
│  G3754                                     │
│  C                                         │
│  [Click for more]                          │
├──────────────────────────────────────────┤
│ οἱ μαθηταὶ αὐτοῦ           the disciples  │  ← existing rows continue below, pushed down
│ πόθεν                       From where    │
│ ...                                       │
└──────────────────────────────────────────┘
```

For a **single-word row** (not grouped, e.g. "τις" alone), the card has just one mini-row instead of a stack — same layout, one member instead of several.

**Fallback for a short/collapsed panel:** if the tapped row is near the bottom of the visible panel and the card would still render partly off-screen, auto-scroll just enough to bring the newly-opened card fully into view. This is a fallback, not the primary mechanism — in-place expansion is what makes the card visible in the normal case.

Tapping a different gloss row collapses the currently-open card and expands the newly-tapped row's card in its place — only one card open at a time. Tapping the same row again, or clearing the verse selection, collapses the card back to the plain interlinear view.

---

## Field Mapping — Nothing Silently Dropped

Build 6's existing word detail view shows seven fields per word: Lemma, Transliteration, Strong's number, Morphology, Contextual gloss, Dictionary gloss, Lexicon (TBESG) — plus the parsed-morphology accordion ("What does this mean?", Greek only) added just after Build 6. All eight are preserved — this spec only changes *when*/*how* each becomes visible, never removes one: the accordion's content survives, just unfolded into tier 2 with its toggle removed (see Tier 2 below).

| Field | Tier 1 (card, always visible once tapped) | Tier 2 ("Click for more") |
|---|---|---|
| Original word | ✅ primary | — |
| Contextual gloss | ✅ labeled "This occurrence" once tier 2 is open | repeated, labeled "General usage" |
| Morphology code (e.g. `V-ADI-3P`) | ✅ | parsed into readable lines, own subheading (see below) |
| Strong's number | ✅ shown small/secondary — kept present for users who rely on it, de-emphasized rather than headlined | — |
| Transliteration | — | ✅ |
| Lemma | — | ✅ |
| Dictionary gloss | — | ✅ |
| Lexicon (TBESG) | — | — (tier 3 only, via a "Lexicon" link at the bottom of tier 2) |

---

## Tier 1 — Word Card (always visible once a row is tapped)

Per member word (one mini-row if ungrouped, one per member if grouped), in order:

- Original-language word — primary, largest
- Contextual gloss (this occurrence)
- Strong's number — own line, small, secondary (not a headline field; tried on the same line as the word during implementation review and moved to its own line instead — reads cleaner)
- Morphology code (e.g. `V-ADI-3P`) — own line, below Strong's number

No lemma, no transliteration, no dictionary gloss, no lexicon text at this tier.

Below each member word's mini-row: its own **"Click for more"** link — one per member word, not one shared link for the whole card, since each member expands independently. Once expanded, that same link reads **"Click for less"** and collapses just that member's tier 2 block back down.

A visual divider (rule line, or equivalent spacing/indent per Ember's existing style conventions) separates each member's mini-row + link from the next, so a 3-member grouped card doesn't read as one undifferentiated block.

---

## Tier 2 — "Click for more" (expandable, per member word)

Tapping a member word's "Click for more" expands that word's tier 2 block further in place, directly beneath its tier 1 mini-row — still no navigation, no page swap. Other members in the same grouped card are unaffected; each expands/collapses independently. This matches Build 6's existing "one stacked section per member" grouped-detail behavior, just made independently expandable instead of all rendering at once.

Content per word, in order:

- **Lemma** (dictionary headword — distinct from the inflected word shown in tier 1)
- **Transliteration**
- **Morphology**, parsed into readable lines rather than shown only as the code, e.g.:
  ```
  V-ADI-3P
  Verb, aorist deponent indicative
  3rd person, plural
  ```
  This replaces Build 6's collapsed "What does this mean?" `<details>` accordion (`renderMorphDecodeAccordion()`) — the decoded lines render unfolded, directly in tier 2, with no separate toggle. For a multi-part compound code, keep the existing per-part headings, dividers, and "Also joined with G#### (gloss)" cross-reference lines; they just render inline instead of inside the old accordion body.

  **Hebrew:** `decodeMorphCode()` is Greek-only today (TEGMC-sourced; Hebrew's own decode is TEHMC, a documented separate follow-up per `Grammar_Decode_Spec_DRAFT.md` — and the TEHMC source file doesn't exist in the repo yet, so this isn't a v1 option). Call `decodeMorphCode()` unconditionally for both languages rather than gating it on language: it already returns `[]` for anything it can't decode, so Hebrew tier 2 naturally falls back to showing the raw morph code with no parsed lines beneath it, no `isHebrew` branch needed. When TEHMC decode lands later, Hebrew rows start producing parsed lines through this same unmodified branch.
- **Dictionary gloss** (general usage, distinct from the contextual gloss already shown in tier 1)

Both glosses get explicit on-screen labels once tier 2 is open, since tier 1's contextual gloss and tier 2's dictionary gloss are now visible at the same time: label tier 1's gloss **"This occurrence"** and tier 2's **"General usage"** (exact wording can be adjusted during implementation, but the two must read as distinct, labeled fields — not two unlabeled words sitting near each other).

Give the parsed morphology its own small subheading (e.g. "Morphology") within this expanded block, visually delineated from "Dictionary gloss" — the two shouldn't blend into one undifferentiated paragraph when a member's tier 2 unfolds.

At the bottom of each member's tier 2 block, for Greek words with a Strong's number: a **"Lexicon"** link/button (one per member word, since each member may have its own distinct lexicon entry).

---

## Tier 3 — Lexicon (deepest, explicit action required)

Tapping "Lexicon" for a given member word expands its TBESG entry — the same `getGreekLexiconEntry()` / `sanitizeLexiconMeaning()` content Build 6 already fetches and sanitizes, just gated behind an explicit tap instead of rendered unconditionally.

Hebrew words: no Lexicon link appears (matches Build 6's existing documented gap — TBESH was dropped, not a bug).

---

## What Does Not Change

- Interlinear view: verse line, gloss list, row grouping, RTL/Hebrew vs LTR/Greek handling — untouched.
- Data model: `original_words`, `step_lexicon_greek`, all existing columns and joins — untouched.
- `getOriginalWordsForVerses` / `getOriginalWordsForGroup` / `getOriginalWord` / `getGreekLexiconEntry` — untouched.
- `sanitizeLexiconMeaning()` — untouched, just called lazily (on Lexicon tap) instead of eagerly.
- `decodeMorphCode()` / `splitMorphCode()` (`js/grammar-decode.js`) — untouched, pure functions; only their caller changes (now invoked on tier 2 expansion, for both languages, instead of eagerly and Greek-only inside the old accordion).
- Hebrew grammar decode (TEHMC) — out of scope, same as it was for `Grammar_Decode_Spec_DRAFT.md`. This spec removes the `isHebrew` gate around *calling* `decodeMorphCode()` (see Tier 2), but adds no Hebrew decode data or logic. Hebrew tier 2 shows the raw morph code, unchanged from today, until a future TEHMC spec lands.
- No word-level click/drag selection added to the reader (Build 6's explicit non-goal, still holds).
- No panel-width-responsive disclosure tiers (considered and set aside for this pass — adds real complexity for a v1; the tap-tier model above gets most of the value without it. Revisit later if the tap-tiers feel insufficient on a wide panel).
- No floating overlay card. Ember's reference panel is tab/panel-based throughout, not floating-overlay-based — an inline card in the existing tab flow is more consistent with the rest of the app.

---

## Definition of Done

- [ ] Tapping a gloss row expands a word card **in place, directly below that row** — subsequent rows shift down; no tab/page swap; verse line and gloss list remain visible and unchanged
- [ ] Fallback: if the tapped row is near the bottom of a short/collapsed panel, auto-scroll enough to bring the newly-opened card fully into view
- [ ] Word card (tier 1) shows, per member word: original word, contextual gloss, Strong's number (small/secondary, own line), morphology code (own line) — nothing else
- [ ] Each member word has its own **"Click for more"** trigger (not one shared link for the whole card); tapping it expands that member's tier 2 in place: lemma, transliteration, parsed morphology (with its own subheading, unfolded — no "What does this mean?" toggle), dictionary gloss
- [ ] `decodeMorphCode()` is called for both languages on tier 2 expansion (no `isHebrew` gate); Hebrew rows show the raw morph code with no parsed lines beneath it, since `decodeMorphCode()` returns `[]` for Hebrew codes today — this is the existing documented TEHMC gap, not new behavior
- [ ] Once expanded, that same trigger reads **"Click for less"** and collapses only that member's tier 2 block
- [ ] A visual divider separates each member's tier 1 mini-row (and tier 2, if open) from the next member's, within a grouped card
- [ ] "Lexicon" (Greek only, per member word) expands tier 3 in place: full TBESG entry via existing `sanitizeLexiconMeaning()` output
- [ ] Grouped rows (e.g. "ἀπεκρίθησαν αὐτῷ ὅτι" or "ho logos") show **one card** with one stacked mini-row (tier 1) per member word, each independently expandable — a single tap on the gloss row opens all members' tier 1 together, but tier 2/3 expand per member, not per card
- [ ] Tapping a different row collapses the current card and expands the newly-tapped row's card; only one card open at a time
- [ ] Tapping the same row again, or clearing verse selection, collapses the card back to the plain interlinear view
- [ ] When tier 2 is open, tier 1's contextual gloss is labeled **"This occurrence"** and tier 2's dictionary gloss is labeled **"General usage"** — the two must read as distinct, labeled fields
- [ ] Hebrew words show tiers 1–2 only, no Lexicon link (unchanged documented gap)
- [ ] All seven existing fields (Lemma, Transliteration, Strong's, Morphology, Contextual gloss, Dictionary gloss, Lexicon) remain reachable — none removed, only redistributed across tiers per the Field Mapping table above
- [ ] No changes to interlinear view layout, grouping, or RTL/LTR handling
- [ ] No changes to `language.db` schema or query functions

---

## Open Questions for Implementation

1. Exact visual treatment for "the tapped gloss row is now active" and its expanded card — border, background tint, or indent — to be decided against Ember's existing style conventions in `css/style.css`.
2. Animation/transition on card expand, tier expand, and card collapse-on-row-switch (instant vs. slide/fade) — decide during implementation, not a UX-blocking question for this spec.
3. For a grouped row with many members (rare, but possible), does the in-place expansion ever get tall enough that the auto-scroll fallback should trigger even on a normal-height panel? Worth a quick check during implementation against the longest real grouped row in the data.
