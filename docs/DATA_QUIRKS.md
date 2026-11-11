# Data Quirks in Upstream Sources

Things found in the data Ember uses that look like slips, or that a re-user has to know about. Each item names the source, the exact entries, a count, and the raw text, so it can be checked and passed to the maintainers. It is written to be shared: the sections stand on their own.

These are small next to what the sources get right, and Ember is grateful for both projects' work. Where an item may be deliberate, it says so.

**Add to this file** whenever a quirk turns up: what, where (entry ids or verse references), how many, the raw text, the likely cause, and how Ember handles it. Mark each one *probably a slip* or *possibly intentional*. Keep the counts reproducible against the pinned commits below.

| Source | Pinned at |
|---|---|
| STEPBible-Data (TAHOT, TAGNT, TBESG) | commit `be4191f0082aeedddb0eff0c02c966292b2bd641` (2026-10-24) |
| Open Scriptures HebrewLexicon (BDB, Strong's) | commit `21c9add13bc727d3a951361778e97e3ff7afd1ce` |
| Open Scriptures morphhb | commit `3d15126fb1ef74867fc1434be1942e837932691f` |

Created 2026-11-10.

---

## STEPBible-Data: TBESG (Greek lexicon, Abbott-Smith)

The `meaning` column of `TBESG.txt`. Entry ids are TBESG's extended Strong's numbers (`dStrong`).

### 1. The outline letter "(c)" became "(with)" — *probably a slip*

Abbott-Smith abbreviates *cum*, "with", as "c." ("c. acc."). The digital text spells these out, which reads well in running text ("with accusative", 1,039 times). The outline letter "(c)" seems to have been caught by the same replacement:

- `__(c)` never occurs as an outline marker. `__(a)` occurs 707 times, `__(b)` 723, `__(d)` 80, `__(e)` 25.
- `__(with)` occurs 191 times, every time as the next letter after a `(b)` in its section, and 79 times followed by `__(d)`.
- G2193 shows both expansions in one line: `__(with) with indic., present (Burton, §328; …)`, which was "(c) c. indic.".
- First example, G0015 ἀγαθοποιέω: `__(a) univ.: … __(b) for another's benefit: … __(with) accusative of person(s), Luk.6:33, 35`.

Ember shows these as "(c)".

### 2. A reference inside a reference — *probably a slip*

Six entries open a `<ref>` before the previous one closes: G0025, G3873, G4413G, G4413H, G4413I, G4413J.

- G0025: `<ref='2Ti.4.8, 10'>II <ref='Tim.4.8'>Tim 4:8</ref>, 10</ref>`
- G3873: `<ref='Bel.1.14, 2,3'>Dan LXX <ref='Bel.1.14'>Bel 1:14</ref>…`
- G4413G: `<ref='Jhn.8:7; 20:4, 8'>Jhn.8:[<ref='7].20.4'>…` (the inner attribute is also malformed)

### 3. References to verses that don't exist — *probably slips*

23 New Testament references name a chapter or verse that isn't in the book. Several look like 1 John written as John ("Jhn.2.28; 3.2"); the others may be typing slips.

| Entry | Attribute |
|---|---|
| G0032G, G0032H | `Jas.22.25` |
| G0046 | `Mat.92.6` |
| G0071 | `Mat.2.46` |
| G0079 | `Jas.21.15` |
| G0281 | `Jhn.1.52; 3.3; 5.19` |
| G1074 | `Luk.34.17` |
| G1096, G20196 | `Jhn.22.29` |
| G1437, G2532 | `Jhn.2.28; 3.2` |
| G3173, G3176, G3186, G3187 | `Mat.2.60` |
| G3739, G3746 | `2Co.2.18` |
| G4105 | `Jhn.2.26` |
| G4172 | `Rev.20.19` |
| G4561 | `1Co.5.50` |
| G5040 | `Jhn.2.28` |
| G5207 | `Jhn.1.52` |
| G5545 | `Jhn.2.27` |

### 4. A following reference merged into the previous one — *probably a slip*

G0015 ἀγαθοποιέω: `<ref='1Pe.2.15, 20; 3.6, 17, 3'>1Pe.2:15, 20, 3:6, 17, 3</ref>Jo.11;` The last "3" and the "Jo.11" after the tag are Abbott-Smith's "III Jo 11" (3 John 11), so the attribute's final `3` reads as 1 Peter 3:3.

### 5. Attributes in irregular forms — *possibly intentional*

131 `<ref>` attributes don't follow the usual `Book.C.V` / `Book.C.V, V` / `Book.C.V; C.V` / `Book.C.V-V` forms: a trailing `;`, `,` or space (`Psa.150.1-6;`, `3Mac.5.12 `), a colon in place of the dot (`Rev.1.20-2:1`, `1Jo.1.5, 3:11 (`), or `ff` (`Jhn.9:1ff; 10.21, 11:37ff`). They're readable, but a parser has to allow for them.

### 6. Book codes in more than one spelling — *possibly intentional*

Most attributes use STEP's three-letter codes, but some use others for the same book: `Jude` (197, against `Jud`), `2Mac`/`3Mac`/`1Mac` (135/45/21, against `2Ma`/`3Ma`/`1Ma`), `1Jo` (4), `Luke` (4), `Mark` (3), `1Cor` (3), `John` (2), `1Tim` (2), `Pss`/`PSS` (3), `1Pet`, `Matt`, `Phil`, `Acts` (1 each).

### 7. References written without a tag — *probably a slip*

61 references in 22 entries are plain text with an underscore, not `<ref>` tags: `Act_2:19` (G0507), `Act_13:25` (G0514), `Heb_9:26-27` (G0530), `Heb_7:7` and `1Ti_5:9` (G1640), `Psa_109:10` and `Sir_40:28` (G1871), `Wis_3:10` (G2009), …

### 8. An escaped entity in unescaped markup — *probably a slip*

G0048, G0049 and G0050 write `(&gt; ἁγνίζω)`, while everything else in the column is raw markup with no entities. Read as markup, it shows a literal `&gt;`.

### 9. A stray brace or a doubled marker before an outline marker — *probably slips*

- G1437 and G2532: `<BR />{ __(b) aor. (= Lat. fut. pf.)…` (the `{` has no partner).
- G2596: `<BR />   __     __2. C. genitive of…` and `<BR /> __       __(with) in adverbial…`.

### 10. Underscores inside Greek words — *unclear*

16 underscores in 14 entries, all numbered G6000 and up (G6323 to G20548), the range added after Abbott-Smith's own entries: `ἀμ-πέφυ_κα` (G6323), `ἵδρυ_μαι` (G7711), `ἰλυ_ος` (G7720), `κηλί_ς` (G8006), `ἔκυ_σα` (G8137), … Perhaps a long-vowel mark. Ember shows them as written.

### 11. Website links in the data — *possibly intentional*

33 entries (34 links: G6164, G6220, G6376, G6523, G6629, …) contain `<a href="javascript:void(0)" title="Aristotle Philosopher">Refs 4th c.BC</a>`-style tooltips, presumably for STEP's own site. Other re-users will want only the text.

### 12. Old Testament references cite the Septuagint — *intentional, worth a note*

Not a slip, since Abbott-Smith cites the LXX, but the attributes use the same codes as English-Bible books, so nothing marks them as LXX: `1Ki.28` is 1 Kingdoms (1 Samuel) 28, LXX Psalm 48 is English 49, and there are `Psa.151.7`, `Psa.48.15` and `Psa.70.20`. 6,647 `<ref>` elements are Old Testament or Apocrypha. Ember leaves them unlinked.

---

## STEPBible-Data: TAHOT (Hebrew Old Testament)

Detail in `docs/HEBREW_ANATOMY_DATA_REPORT.md` (D1, D2, D4).

### 13. Instance numbers inside column 12 tags — *possibly intentional*

Five rows write `#N` inside each tag of column 12 ("Expanded Strong tags"), a form the file's header doesn't describe: 1Ch 18:10 #09 `H9005#1=ל=to/{H9033#6=Os3m=him}`, and the four rows of Psa 44:14, 57:9, 108:3 and 149:7 that became one word at `be4191f` (`H9003#1=ב=in/{H3816#4=לְאֹם=people}\H9016#7=׃=verseEnd`).

### 14. A column holding only a space — *probably a slip*

Psa 42:4 #08: column 7 (meaning variants) changed from empty to a single space at `be4191f`; no other column changed.

### 15. Glosses missing a closing bracket — *probably slips*

`ministry[for_God` (87 rows) and `service[as_servant` (25 rows).

### 16. A feminine gloss on masculine forms — *possibly a slip*

H9032 is `Os2f` "you" (feminine) in column 12, but 153 of its 333 occurrences as a root have the masculine morphology code `Sp2ms`.

### 17. The ":" form of column 12 reverses the header's order — *documentation*

The header says column 12 carries "an English gloss, and its sub-meaning after » where appropriate". In 71,182 rows (667 Strong's numbers) the gloss slot starts with ":" and reads the other way: the sense's own gloss first, the base word's gloss after `»` (`{H6440J=פָּנֶה=: surface»face:4_surface;_land}`). Consistent, but not what the header says.

### 18. One word's suffix written in the subject form — *possibly intentional*

לְבַד "alone" + suffix (87 occurrences: Gen 2:18, Exo 18:14, Deu 4:35, Job 1:15, …) writes its pronoun suffix in the subject form (`Ss3m` "he") or, three times, the possessive (`Pp3m`/`Pp3f`), where every other word has the object form (`Os3m` "him"). It is consistent within the word.

---

## Open Scriptures HebrewLexicon: BrownDriverBriggs.xml

The `r` attribute of `<ref>` elements in BDB entries, against the reference printed beside it. Entry ids are BDB ids. `r` follows BDB's Hebrew verse numbering, which is right and intended (Joel 4:6, Mal 3:21); the items below are the exceptions. 3,928 of the 3,952 references are fine.

### 19. Book names outside OSIS — *probably slips*

| `r` | Printed | Entry | Meant |
|---|---|---|---|
| `iKgs.15.18`, `iKgs.7.30` | 1 K 15:18, 1 K 7:30 | i.ag.ac, o.cn.af | `1Kgs` |
| `1cHR.2.26` | 1 Ch 2:26 | p.ch.ac | `1Chr` |
| `Erz.10.40` | Ezr 10:40 | m.bx.aj | `Ezra` |
| `Ez.19.2` | Ez 19:2 | l.ah.ac | `Ezek` |
| `Ho.13.3` | Ho 13:3 | m.ba.ab | `Hos` |
| `Hosea.4.3`, `Hosea.12.7` | Ho 4:3, Ho 12:7 | b.ab.aa | `Hos` |
| `Is.29.5`, `Is.17.13`, `Is.41.15` | Is 29:5, … | m.ba.ab | `Isa` |
| `Jb.21.18` | Jb 21:18 | m.ba.ab | `Job` |
| `Jugd.16.26` | Ju 16:26 | j.bu.aa | `Judg` |
| `Zec.11.14` | Zc 11:14 | a.ck.be | `Zech` |
| `Zp.2.2` | Zp 2:2 | m.ba.ab | `Zeph` |
| `Jos.21.23` | **Jb** 21:23 | v.dg.ae | `Job` (the printed book is Job) |

### 20. Separators — *probably slips*

`Exod24.17` (b.ab.aa, no dot after the book), `Ezra,6,15` (xv.am.aa, commas), `Job.37:23` (u.ag.ab, colon), `Ezra.814` (g.ad.ae, printed Ezr 8:14: the dot between 8 and 14 is missing).

### 21. `r` disagrees with the printed reference — *probably slips*

| `r` | Printed | Entry |
|---|---|---|
| `Ezek.28.13` | Ez 18:13 | a.bd.ad |
| `Isa.27.18` | Is 28:17 | j.cc.aa |
| `Num.11.7` | Nu 11:17 | b.ab.aa |
| `Josh.22.24` | Jos 22:22 | m.dj.ab |
| `1Chr.26.2` | 1 Ch 26:6 | w.bb.ac |

### 22. Verses that don't exist — *probably slips*

`Judg.8.52` (a.ae.au, printed only "8:52"; 1 Kings 8:52 exists, so the book may have been inferred from context), `Judg.8.57` (b.ab.aa), `Isa.4.18` (a.dc.ah, printed "18"), `Num.30.31` (a.ew.aj, printed "31"), `Prov.29.30`, `Lev.26.89`, `Lev.13.62` (b.ab.aa), `Lev.7.51` (h.bq.ab), `Jer.44.50` (h.et.ab), `Ezra.13.17` (j.bx.ac), `Num.11.44` (p.ef.aa).

### 23. References with no `r` — *probably slips*

Six `<ref>` elements have an empty `r`: e.bm.aa (Ez 36:35), g.bg.ac (Jb 28:17), h.gr.al (Ne 8:4), j.bd.ab (Ez 44:18), l.br.aa (2 Ch 36:16) and q.cb.ac (ψ 72:16).

---

## How Ember handles these

- **TBESG** (`js/greek-lexicon.js`): items 1, 7, 8, 9 and 11 are repaired for display; item 2's outer reference is kept as text and the inner one used; items 3 and 12 stay unlinked; item 4 links as its attribute says, so its last "3" opens 1 Peter 3:3; items 5 and 6 are read as written.
- **BDB** (`js/hebrew-lexicon.js`): item 19's book names are read as the printed book, except `Jos.21.23`, which stays text; in item 20, `Exod24.17`, `Ezra,6,15` and `Job.37:23` are read anyway and `Ezra.814` stays text; items 21–23 stay text.
- **TAHOT**: items 13–15 are handled in `scripts/build_language.py` (`docs/HEBREW_ANATOMY_DATA_REPORT.md`); 16–18 are shown as written.
