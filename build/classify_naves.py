"""
classify_naves.py

Classifies every Nave's Topical Bible topic into buckets:
  visible       - matches a theological keyword (display = 1)
  name          - matches a Hitchcock Bible name (display = 0)
  too_narrow    - fewer than 3 verse references (display = 0)
  too_broad     - more than 300 verse references (display = 0, flag for review)
  needs_review  - everything else

Rules are applied in order; first match wins.
"""

import csv
import os
import re

NAVES_PATH      = "build/sources/NavesTopicalDictionary.csv"
HITCHCOCK_PATH  = "build/sources/HitchcocksBibleNamesDictionary.csv"
KEYWORDS_PATH   = "build/sources/theological_keywords.txt"
OUTPUT_DIR      = "build/output"
FULL_OUTPUT     = os.path.join(OUTPUT_DIR, "naves_classification.csv")
REVIEW_OUTPUT   = os.path.join(OUTPUT_DIR, "naves_needs_review.csv")

VERSE_REF_PATTERN = re.compile(r"\b[A-Z1-3]{2,3}\s+\d+:\d+")
MIN_REFS = 20
MAX_REFS = 300


def load_naves(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({k.lstrip("\ufeff"): v for k, v in row.items()})
    return rows


def load_hitchcock(path):
    names = set()
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            clean = {k.lstrip("\ufeff"): v for k, v in row.items()}
            names.add(clean["Name"].strip().lower())
    return names


def load_keywords(path):
    with open(path, encoding="utf-8") as f:
        return {line.strip().lower() for line in f if line.strip()}


def count_verse_refs(text):
    return len(VERSE_REF_PATTERN.findall(text))


def classify(nave_rows, keywords, hitchcock_names):
    results = []
    for row in nave_rows:
        subject = row["subject"].strip()
        entry   = row["entry"].strip()
        key     = subject.lower()
        refs    = count_verse_refs(entry)

        if key in keywords:
            classification = "visible"
            rule = "rule1_keyword"
        elif key in hitchcock_names:
            classification = "name"
            rule = "rule2_hitchcock"
        elif refs < MIN_REFS:
            classification = "too_narrow"
            rule = "rule3_too_narrow"
        elif refs > MAX_REFS:
            classification = "too_broad"
            rule = "rule3_too_broad"
        else:
            classification = "needs_review"
            rule = "rule4_needs_review"

        results.append({
            "topic_name":     subject,
            "verse_count":    refs,
            "classification": classification,
            "rule_applied":   rule,
        })
    return results


def write_csv(path, rows, fieldnames):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def print_report(results):
    counts = {}
    for r in results:
        counts[r["classification"]] = counts.get(r["classification"], 0) + 1

    total = len(results)
    print("=" * 50)
    print("CLASSIFICATION REPORT")
    print("=" * 50)
    order = ["visible", "name", "too_narrow", "too_broad", "needs_review"]
    for bucket in order:
        n = counts.get(bucket, 0)
        print(f"  {bucket:<16} {n:>5}  ({n / total * 100:.1f}%)")
    print(f"  {'TOTAL':<16} {total:>5}")
    print()

    broad = [r for r in results if r["classification"] == "too_broad"]
    if broad:
        print("TOO_BROAD topics flagged for manual review:")
        for r in sorted(broad, key=lambda x: -x["verse_count"]):
            print(f"  {r['topic_name']:<40} {r['verse_count']} refs")
    print()

    review = [r for r in results if r["classification"] == "needs_review"]
    print(f"NEEDS_REVIEW sample (first 20 of {len(review)}):")
    for r in sorted(review, key=lambda x: -x["verse_count"])[:20]:
        print(f"  {r['topic_name']:<40} {r['verse_count']} refs")


def main():
    print("Loading sources...")
    nave_rows      = load_naves(NAVES_PATH)
    hitchcock      = load_hitchcock(HITCHCOCK_PATH)
    keywords       = load_keywords(KEYWORDS_PATH)

    print(f"  Nave topics:      {len(nave_rows)}")
    print(f"  Hitchcock names:  {len(hitchcock)}")
    print(f"  Keywords:         {len(keywords)}")
    print()

    results = classify(nave_rows, keywords, hitchcock)

    write_csv(FULL_OUTPUT, results,
              ["topic_name", "verse_count", "classification", "rule_applied"])

    review_rows = [r for r in results if r["classification"] == "needs_review"]
    write_csv(REVIEW_OUTPUT, review_rows,
              ["topic_name", "verse_count", "classification", "rule_applied"])

    print_report(results)

    print(f"Full classification -> {FULL_OUTPUT}")
    print(f"Needs review        -> {REVIEW_OUTPUT}")


if __name__ == "__main__":
    main()
