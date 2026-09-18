# TEGMC Value Domain — `step_morphology_greek`

Raw query output from `data/language.db` (9,214 rows across 1,644 codes — matches `FEATURE_INVENTORY.md:303`). No interpretation, for handoff to a content-authoring AI populating `js/grammar-decode.js`'s `TEGMC_VALUE_PHRASES` / `TENSE_WITH_TIME_PHRASES` / `TENSE_ASPECT_ONLY_PHRASES` tables.

Query used:

```sql
SELECT category, raw_value, COUNT(*) as n
FROM step_morphology_greek
GROUP BY category, raw_value
ORDER BY category, n DESC;
```

---

## Full domain, by category

### Adj.Numb.

| raw_value | n |
|---|---:|
| Indeclinable Numeral | 5 |

### Case

| raw_value | n |
|---|---:|
| Nominative | 310 |
| Accusative | 284 |
| Genitive | 259 |
| Dative | 236 |
| Vocative | 60 |

### Extra

| raw_value | n |
|---|---:|
| Attic Greek form | 42 |
| Comparative | 27 |
| Contracted form | 26 |
| Superlative | 17 |
| Numeral | 13 |
| Negative | 13 |
| Interrogative | 2 |
| Indeclinable Letter | 2 |
| Abbreviated | 2 |
| Transitive | 1 |
| IRRegular or impure form | 1 |
| Apocopated form | 1 |
| Aeolic | 1 |
| Abbreviated Numeral | 1 |

### Form

| raw_value | n |
|---|---:|
| Participle | 456 |
| Infinitive | 29 |

### Function

| raw_value | n |
|---|---:|
| Verb | 919 |
| Adjective | 185 |
| Noun | 144 |
| Possessive pronoun | 89 |
| Reflexive pronoun | 52 |
| Personal pronoun | 46 |
| Demonstrative pronoun | 30 |
| Definite article | 30 |
| Relative pronoun | 25 |
| Interrogative pronoun | 24 |
| Indefinite pronoun | 24 |
| Correlative pronoun | 19 |
| Correlative or Interrogative pronoun | 15 |
| Reciprocal pronoun | 9 |
| Adverb | 8 |
| Demonstrative pronoun+Conjunction | 7 |
| Conjunction | 5 |
| Adverb or adverb and particle combined | 3 |
| Particle or Disjunctive | 2 |
| Interjection | 2 |
| Preposition | 1 |
| Negative Particle | 1 |
| Interrogative Particle | 1 |
| Indeclinable Proper Noun | 1 |
| Indeclinable Noun of Other type | 1 |
| Aramaic transliterated word | 1 |

### Gender

| raw_value | n |
|---|---:|
| Masculine | 417 |
| Feminine | 359 |
| Neuter | 351 |

### Indeclinable

| raw_value | n |
|---|---:|
| *(empty string)* | 2 |

### Mood

| raw_value | n |
|---|---:|
| Indicative | 260 |
| Subjunctive | 88 |
| Imperative | 63 |
| Optative | 23 |

### Name in Original language

| raw_value | n |
|---|---:|
| Title Transcribed from Hebrew | 1 |
| Title Transcribed from Aramaic | 1 |

### Name type

| raw_value | n |
|---|---:|
| Location Gentilic | 44 |
| Person Gentilic | 42 |
| Location | 34 |
| Individual | 27 |
| Title | 18 |
| Gentilic | 10 |
| Title Gentilic | 4 |
| Individual Gentilic | 4 |
| *(empty string)* | 4 |
| Type | 1 |
| Person name Transcribed from Aramaic | 1 |

### Number

| raw_value | n |
|---|---:|
| Singular | 817 |
| Plural | 767 |

### Original language

| raw_value | n |
|---|---:|
| Transcribed from Hebrew | 4 |
| Transcribed from Aramaic | 3 |
| Title Transcribed from Aramaic | 2 |

### Person

| raw_value | n |
|---|---:|
| 3rd | 193 |
| 2nd | 176 |
| 1st | 139 |
| 1st Person | 46 |
| 2nd Person | 24 |
| 2nd Singular | 10 |
| 2nd Plural | 9 |

### Tense

| raw_value | n |
|---|---:|
| Present | 266 |
| Aorist | 208 |
| 2nd Aorist | 147 |
| Perfect | 131 |
| Future | 66 |
| Imperfect | 37 |
| 2nd Perfect | 29 |
| Pluperfect | 16 |
| 2nd Future | 15 |
| indefinite tense | 2 |
| 2nd Present | 1 |
| 2nd Pluperfect | 1 |

### Voice

| raw_value | n |
|---|---:|
| Active | 265 |
| Passive | 174 |
| Middle | 149 |
| Middle Deponent | 95 |
| Middle or Passive Deponent | 80 |
| indefinite voice | 66 |
| Passive Deponent | 59 |
| Middle or Passive | 25 |
| impersonal active | 6 |

---

## Tense × Mood cross-tabulation

`decodeMorphCode`/`phraseTense` in `js/grammar-decode.js` branches on whether a code's `Mood` value is `Indicative` (time reference) vs. anything else (aspect only). The following is every Tense value crossed against every Mood value that actually co-occurs with it on the same `code` in the data.

Query used:

```sql
SELECT t.raw_value AS tense, m.raw_value AS mood, COUNT(DISTINCT t.code) AS n_codes
FROM step_morphology_greek t
JOIN step_morphology_greek m ON m.code = t.code AND m.category = 'Mood'
WHERE t.category = 'Tense'
GROUP BY t.raw_value, m.raw_value
ORDER BY t.raw_value, n_codes DESC;
```

| tense | mood | n_codes |
|---|---|---:|
| 2nd Aorist | Indicative | 29 |
| 2nd Aorist | Subjunctive | 23 |
| 2nd Aorist | Imperative | 16 |
| 2nd Aorist | Optative | 4 |
| 2nd Future | Indicative | 15 |
| 2nd Perfect | Indicative | 11 |
| 2nd Pluperfect | Indicative | 1 |
| Aorist | Indicative | 38 |
| Aorist | Subjunctive | 30 |
| Aorist | Imperative | 20 |
| Aorist | Optative | 8 |
| Future | Indicative | 41 |
| Future | Subjunctive | 1 |
| Imperfect | Indicative | 37 |
| Perfect | Indicative | 29 |
| Perfect | Subjunctive | 4 |
| Perfect | Imperative | 3 |
| Pluperfect | Indicative | 16 |
| Present | Indicative | 43 |
| Present | Subjunctive | 30 |
| Present | Imperative | 22 |
| Present | Optative | 11 |
| indefinite tense | Imperative | 2 |

**Coverage note:** counts above are distinct-`code` counts, joined on `code` matching between the Tense row and a Mood row for that same code. Total distinct codes carrying a Tense value: 919. Of those, 434 have a matching Mood row (the sum of the table above) and 485 do not.

### Supplementary: the 485 Tense codes with no Mood row, cross-tabbed against Form instead

Query used:

```sql
SELECT t.raw_value AS tense, COALESCE(f.raw_value,'(no Form row)') AS form, COUNT(DISTINCT t.code) AS n_codes
FROM step_morphology_greek t
LEFT JOIN step_morphology_greek f ON f.code = t.code AND f.category = 'Form'
WHERE t.category = 'Tense'
  AND NOT EXISTS (SELECT 1 FROM step_morphology_greek m WHERE m.code = t.code AND m.category = 'Mood')
GROUP BY t.raw_value, form
ORDER BY t.raw_value, n_codes DESC;
```

| tense | form | n_codes |
|---|---|---:|
| 2nd Aorist | Participle | 70 |
| 2nd Aorist | Infinitive | 5 |
| 2nd Perfect | Participle | 17 |
| 2nd Perfect | Infinitive | 1 |
| 2nd Present | Participle | 1 |
| Aorist | Participle | 107 |
| Aorist | Infinitive | 5 |
| Future | Participle | 20 |
| Future | Infinitive | 4 |
| Perfect | Participle | 90 |
| Perfect | Infinitive | 5 |
| Present | Participle | 151 |
| Present | Infinitive | 9 |

Every one of these 485 codes carries `Form = Participle` or `Form = Infinitive` in place of a `Mood` value — no Tense-tagged code in the current data lacks both a Mood and a Form value.
