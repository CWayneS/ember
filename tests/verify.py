#!/usr/bin/env python3
"""Live verification of the running app in headless Chromium.

Serves the repo root on a local port, boots Ember with a fresh browser
profile (fresh OPFS, so first run seeds core.db + translations), drives it
with Playwright, and reports pass/fail per check plus any console errors.

Usage (from the repo root):
   python3 tests/verify.py popovers      # every ?/⚙ popover + bookmark prompt/dropdown
   python3 tests/verify.py smoke         # notes, tags, bookmarks, markups, all reference
                                         #   tabs, search, plans, template bar, templates,
                                         #   translation switch, split view, global settings
   python3 tests/verify.py indicators    # note/bookmark dots on a titled Psalm (verse=0 row)
   python3 tests/verify.py dbsnapshot out.json          # results of ~36 db.js calls as JSON
   python3 tests/verify.py dbcompare before.json after.json

Use dbsnapshot before and after a db.js change and dbcompare the two files:
every key should be identical except the creation timestamps on seeded
user rows, which differ between runs.

Requires: python3, playwright (pip install playwright && playwright install chromium).
"""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
URL  = f'http://localhost:{PORT}/'

# Pre-existing, documented: sql.js WASM lacks FTS5 → LIKE fallback logs an error.
KNOWN_ERRORS = ('FTS verse search failed',)


def start_server():
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
                         cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    return p


class App:
    def __init__(self, page):
        self.page = page
        self.errors = []
        page.on('pageerror', lambda e: self.errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: self.errors.append(f'console.error: {m.text}')
                if m.type == 'error' and not any(k in m.text for k in KNOWN_ERRORS) else None)

    def boot(self):
        self.page.goto(URL)
        self.page.wait_for_selector('#loading.hidden', state='attached', timeout=180_000)
        self.page.wait_for_selector('#reader-pane-a .verse', timeout=30_000)

    def visible(self, sel):
        return self.page.evaluate(f"!document.querySelector('{sel}').classList.contains('hidden')")

    def open_popovers(self):
        return self.page.evaluate(
            "[...document.querySelectorAll('.help-popover')].filter(p => !p.classList.contains('hidden')).map(p => p.id)")

    def select_verse(self, verse_id):
        self.page.click(f'.verse[data-verse-id="{verse_id}"]')
        self.page.wait_for_timeout(100)

    def navigate(self, book, chapter):
        self.page.evaluate(f"import('./js/reader.js').then(m => m.navigateTo({book}, {chapter}))")
        self.page.wait_for_timeout(300)


FAILURES = []

def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond:
        FAILURES.append(msg)


# ---------------------------------------------------------------- popovers
def scenario_popovers(app):
    p = app.page
    pairs = [
        ('#reader-help-btn', 'reader-help-popover'),
        ('#notes-panel .panel-help-btn', 'notes-help-popover'),
        ('#reference-panel .panel-help-btn', 'reference-help-popover'),
        ('#global-help-btn', 'global-help-popover'),
        ('#reader-settings-btn', 'reader-settings-popover'),
        ('#notes-panel .panel-settings-btn', 'notes-settings-popover'),
        ('#reference-panel .panel-settings-btn', 'reference-settings-popover'),
        ('#global-settings-btn', 'global-settings-popover'),
    ]
    for btn, pop in pairs:
        p.click(btn)
        check(app.open_popovers() == [pop], f'{btn} opens only {pop}')
        # positioned
        top = p.evaluate(f"document.getElementById('{pop}').style.top")
        check(top.endswith('px') and float(top[:-2]) > 0, f'{pop} positioned (top={top})')
        # click inside keeps it open
        p.click(f'#{pop}', position={'x': 5, 'y': 5})
        check(app.open_popovers() == [pop], f'click inside {pop} keeps it open')
        # toggle closes
        p.click(btn)
        check(app.open_popovers() == [], f'{btn} again closes {pop}')
    # opening one then another
    p.click('#reader-help-btn'); p.click('#global-settings-btn')
    check(app.open_popovers() == ['global-settings-popover'], 'opening a second popover closes the first')
    # outside click closes
    p.click('#global-header', position={'x': 2, 'y': 2})
    check(app.open_popovers() == [], 'outside click closes')
    # escape closes
    p.click('#notes-panel .panel-settings-btn')
    p.keyboard.press('Escape')
    check(app.open_popovers() == [], 'Escape closes')
    # settings controls still work
    p.click('#reader-settings-btn')
    before = p.evaluate("document.getElementById('font-size-display').textContent")
    p.click('#font-size-increase')
    after = p.evaluate("document.getElementById('font-size-display').textContent")
    check(before != after and app.open_popovers() == ['reader-settings-popover'], f'font +1 works inside popover ({before}->{after})')
    p.click('#font-size-reset')
    p.click('#reader-settings-btn')
    # reference default tab: choose Related, select a verse, tab should switch
    p.click('#reference-panel .panel-settings-btn')
    p.click('#reference-settings-popover [data-tab="related"]')
    p.keyboard.press('Escape')
    app.select_verse(1001001)
    active = p.evaluate("document.querySelector('#reference-tabs .tab-btn.active').dataset.tab")
    check(active == 'related', f'default reference tab applied on selection (got {active})')
    p.click('#reference-panel .panel-settings-btn'); p.click('#ref-tab-reset'); p.keyboard.press('Escape')
    # bookmark prompt: click inside input must keep it open; Escape closes; opening help closes prompt
    app.select_verse(1001002)
    p.click('#bookmark-btn')
    check(app.visible('#bookmark-prompt'), 'bookmark prompt opens')
    p.click('#bookmark-comment')
    check(app.visible('#bookmark-prompt'), 'click inside bookmark prompt keeps it open')
    p.click('#reader-help-btn')
    check(not app.visible('#bookmark-prompt') and app.open_popovers() == ['reader-help-popover'], 'opening help closes bookmark prompt')
    p.keyboard.press('Escape')
    # bookmark dropdown with no selection
    p.click('#reader-pane-a .pane-content', position={'x': 5, 'y': 5})
    p.click('#bookmark-btn')
    check(app.visible('#bookmark-dropdown'), 'bookmark dropdown opens with no selection')
    p.click('#global-help-btn')
    check(not app.visible('#bookmark-dropdown'), 'opening help closes bookmark dropdown')
    p.keyboard.press('Escape')
    return FAILURES


# ---------------------------------------------------------------- db snapshot
DB_EVAL = r"""
async () => {
  const db = await import('./js/db.js');
  const out = {};
  out.books = db.getBooks();
  out.book19 = db.getBook(19);
  out.translations = db.getTranslations();
  out.chapter = db.getChapter(1, 1, 1);
  out.chapterPs3 = db.getChapter(1, 19, 3).slice(0, 3);
  out.chapterASV = db.getChapter(2, 43, 3).slice(0, 2);
  out.verseCount = [db.getChapterVerseCount(19, 3), db.getChapterVerseCount(19, 119)];
  out.topics = db.getTopicsForVerse(1001001);
  out.topicVerses = db.getVersesForTopic(out.topics[0]?.name ?? 'god', 1, 5, 0);
  out.topicVerseCount = db.getTopicVerseCount(out.topics[0]?.name ?? 'god');
  out.crossrefs = db.getCrossReferencesForVerse(1001001);
  out.crossrefsAll = db.getCrossReferencesForVerse(1001001, { showAll: true }).length;
  out.search = db.search('beginning', 1);
  out.searchNotesShape = Object.keys(out.search);
  out.plans = db.getPlans();
  out.planDetail = (() => { const d = db.getPlanDetail(out.plans[0].id); return { ...d, days: d.days.slice(0, 3), dayCount: d.days.length }; })();
  out.plan = db.getPlan(out.plans[0].id);
  out.planDay = db.getPlanDayScripture(out.plans[0].id, 1);
  out.templates = db.getStudyTemplates();
  out.tags = db.getAllTags();
  out.bookmarks = db.getAllBookmarks().map(b => ({ ...b, created_at: null }));
  out.bookmarkChapter = [...db.getBookmarksForChapter(1, 1).entries()];
  out.bookmarkForVerse = db.getBookmarkForVerse(1001001);
  out.markupsChapter = db.getMarkupsForChapter(1001).map(m => ({ ...m, created_at: null, id: null }));
  out.existingMarkup = !!db.getExistingMarkup(1001001, null, 'highlight');
  out.notesForVerse = db.getNotesForVerse(1001001).map(n => ({ body: n.body, tags: n.tags.map(t => t.name), anchors: n.anchors.map(a => [a.verse_start, a.verse_end]), study_name: n.study_name }));
  out.userTags = db.getUserTagsForVerse(1001001);
  out.studies = db.getStudies().map(s => ({ name: s.name, note_count: s.note_count, status: s.status }));
  out.notesForTag = db.getNotesForTag('faith').map(n => ({ body: n.body, study_name: n.study_name, tags: n.tags.map(t => t.name) }));
  out.state = [db.getState('scripture_font_size'), db.getState('nonexistent_key')];
  out.words = await db.getOriginalWordsForVerses([1001001, 43001001]);
  out.wordsEmpty = await db.getOriginalWordsForVerses([]);
  out.lexicon = await db.getGreekLexiconEntry('G3056');
  out.lexiconNull = await db.getGreekLexiconEntry('NOPE');
  out.morph = await db.getGreekMorphCategories('V-PAP-NSM');
  out.morphEmpty = await db.getGreekMorphCategories('ZZZ');
  return out;
}
"""


def seed_user_data(app):
    """Create a study, a note with a tag on Gen 1:1, a bookmark, and a markup so
    the snapshot exercises user-table queries too."""
    p = app.page
    app.select_verse(1001001)
    p.click('#notes-tab-add')
    p.click('.add-note-btn')
    p.wait_for_selector('.note-block-body')
    p.click('.note-block-body')
    p.keyboard.type('In the beginning note')
    p.wait_for_timeout(1000)
    p.click('.note-block-tag-input')
    p.keyboard.type('faith')
    p.keyboard.press('Enter')
    p.wait_for_timeout(200)
    p.click('#bookmark-btn')
    p.fill('#bookmark-comment', 'first bookmark')
    p.click('#bookmark-save')
    p.wait_for_timeout(200)
    p.click('#markup-btn')
    p.click('.markup-tool')
    p.wait_for_timeout(200)


def scenario_dbsnapshot(app, out_path):
    seed_user_data(app)
    data = app.page.evaluate(DB_EVAL)
    with open(out_path, 'w') as fh:
        json.dump(data, fh, indent=1, sort_keys=True)
    print(f'  wrote {out_path} ({len(json.dumps(data))} bytes)')
    return FAILURES


def scenario_dbcompare(a, b):
    with open(a) as fa, open(b) as fb:
        da, db_ = json.load(fa), json.load(fb)
    for key in sorted(set(da) | set(db_)):
        same = json.dumps(da.get(key), sort_keys=True) == json.dumps(db_.get(key), sort_keys=True)
        check(same, f'{key} identical')
    return FAILURES


# ---------------------------------------------------------------- smoke
def scenario_smoke(app):
    p = app.page
    seed_user_data(app)
    check(p.evaluate("document.querySelectorAll('.note-indicator').length") >= 1, 'note indicator rendered')
    check(p.evaluate("document.querySelectorAll('.bookmark-indicator').length") >= 1, 'bookmark indicator rendered')
    check(p.evaluate("!!document.querySelector('.verse[data-verse-id=\"1001001\"][class*=markup-]')"), 'markup class applied')
    check(p.evaluate("document.querySelectorAll('#notes-active-view .tag-chip').length") == 1, 'tag chip on note')
    # reference tabs
    p.click('#reference-tabs [data-tab="info"]')
    check(p.evaluate("document.querySelectorAll('#info-tab .ref-note-card').length") == 1, 'info tab shows note')
    p.click('#reference-tabs [data-tab="tags"]')
    check(p.evaluate("document.querySelectorAll('#tags-tab .tag-chip').length") >= 2, 'tags tab has topics + user tag')
    p.click('#reference-tabs [data-tab="related"]')
    n = p.evaluate("document.querySelectorAll('#related-tab .ref-crossref-btn').length")
    check(n > 0, f'related tab has cross-refs ({n})')
    p.click('#related-tab .ref-crossref-btn')
    p.wait_for_timeout(300)
    check(p.evaluate("document.querySelectorAll('.verse.selected').length") >= 1, 'cross-ref navigation selects target')
    # language tab
    app.navigate(43, 1)
    app.select_verse(43001001)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row', timeout=120_000)
    p.click('.language-word-row')
    p.wait_for_selector('.language-word-card')
    p.click('.language-card-more-btn')
    p.wait_for_selector('.language-card-tier2')
    check(p.evaluate("document.querySelectorAll('.language-morph-decode-line').length") > 0, 'morph decode lines render')
    lex_btn = p.query_selector('.language-card-lexicon-btn')
    if lex_btn:
        lex_btn.click(); p.wait_for_selector('.language-card-lexicon')
        check(True, 'lexicon tier renders')
    # tag view
    p.click('#notes-active-view .tag-chip')
    p.wait_for_timeout(300)
    check(p.evaluate("document.querySelectorAll('#notes-active-view .note-block').length") >= 1, 'tag view renders')
    # all studies
    p.click('#notes-tabs [data-study-id="all"]')
    check(p.evaluate("document.querySelectorAll('.study-list-item').length") == 1, 'all studies lists the study')
    # search
    p.fill('#search-input', 'beginning')
    p.wait_for_timeout(500)
    check(p.evaluate("document.querySelectorAll('.search-result-item').length") > 0, 'search returns results')
    p.fill('#search-input', 'k:first')
    p.wait_for_timeout(500)
    check(p.evaluate("document.querySelectorAll('.search-result-item').length") == 1, 'bookmark prefix search')
    p.keyboard.press('Escape')
    # plans
    p.click('#reference-tabs [data-tab="plans"]')
    check(p.evaluate("document.querySelectorAll('.plan-card').length") == 3, 'three bundled plans')
    p.click('.plan-card-info')
    p.wait_for_selector('.plan-detail-dialog')
    check(p.evaluate("document.querySelectorAll('.plan-detail-day-row').length") > 300, 'plan detail day list')
    p.click('.plan-detail-continue')
    p.wait_for_timeout(300)
    check(not app.visible('#template-bar'), 'template bar shown') if False else check(app.visible('#template-bar'), 'template bar shown')
    p.click('#template-bar-next'); p.wait_for_timeout(200)
    p.click('#template-bar-close')
    p.click('#reference-tabs [data-tab="plans"]')  # plan navigation selected a verse, which switched the tab back to Info
    p.click('.plans-subtab-btn[data-subtab="study-templates"]')
    check(p.evaluate("document.querySelectorAll('.template-card').length") == 3, 'three templates')
    p.click('.template-card')
    p.wait_for_selector('.plan-metadata-dialog')
    p.click('.plan-metadata-confirm')
    p.wait_for_timeout(300)
    check(p.evaluate("document.querySelectorAll('#notes-active-view .note-block').length") >= 4, 'template generated study')
    # translation switch + split
    p.click('#reader-pane-a .pane-book-btn')
    p.click('.translation-btn:has-text("ASV")')
    p.keyboard.press('Escape')
    check(p.evaluate("document.querySelector('#reader-pane-a .translation-label').textContent") == 'ASV', 'translation switch')
    p.click('#split-toggle-btn')
    check(p.evaluate("document.querySelectorAll('#reader-pane-b .verse').length") > 0, 'split pane renders')
    p.click('#split-toggle-btn')
    # global settings sections
    p.click('#global-settings-btn')
    check(p.evaluate("document.querySelectorAll('#global-settings-popover .settings-section').length") == 2, 'global settings sections')
    p.keyboard.press('Escape')
    # delete note + study
    p.click('#notes-tabs [data-study-id="all"]')
    p.once('dialog', lambda d: d.accept())
    p.click('.study-list-delete')
    p.wait_for_timeout(300)
    check(p.evaluate("document.querySelectorAll('.study-list-item').length") == 1, 'study deleted (template study remains)')
    return FAILURES


# ---------------------------------------------------------------- indicators
def scenario_indicators(app):
    p = app.page
    app.navigate(19, 3)
    p.wait_for_timeout(1500)  # language.db lazy load for the title gloss
    check(p.evaluate("!!document.querySelector('.verse.verse-title')"), 'Psalm 3 title row present')
    app.select_verse(19003001)
    p.click('#bookmark-btn')
    p.fill('#bookmark-comment', 'psalm')
    p.click('#bookmark-save')
    p.wait_for_timeout(300)
    check(p.evaluate("!!document.querySelector('.verse[data-verse-id=\"19003001\"] .bookmark-indicator')"), 'bookmark indicator after save on titled psalm')
    # note on the title row itself
    app.select_verse(19003000)
    p.click('#notes-tab-add')
    p.click('.add-note-btn')
    p.wait_for_timeout(300)
    check(p.evaluate("!!document.querySelector('.verse-title .note-indicator')"), 'note indicator on title row')
    p.click('.note-block-body'); p.keyboard.type('title note'); p.wait_for_timeout(1200)
    check(p.evaluate("!!document.querySelector('.verse-title .note-indicator')"), 'title-row indicator survives autosave refresh')
    check(p.evaluate("document.querySelectorAll('#info-tab .ref-note-card').length") == 1, 'info tab refreshed after write')
    # remove bookmark → indicator gone
    app.select_verse(19003001)
    p.click('#bookmark-btn'); p.wait_for_timeout(200)
    check(not p.evaluate("!!document.querySelector('.verse[data-verse-id=\"19003001\"] .bookmark-indicator')"), 'bookmark indicator removed')
    return FAILURES


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(2)
    if args[0] == 'dbcompare':
        failures = scenario_dbcompare(args[1], args[2])
        print(f'\n{len(failures)} failure(s)'); sys.exit(1 if failures else 0)

    server = start_server()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={'width': 1600, 'height': 1000})
            app = App(ctx.new_page())
            app.boot()
            print(f'== {args[0]}')
            if args[0] == 'popovers':   failures = scenario_popovers(app)
            elif args[0] == 'smoke':    failures = scenario_smoke(app)
            elif args[0] == 'indicators': failures = scenario_indicators(app)
            elif args[0] == 'dbsnapshot': failures = scenario_dbsnapshot(app, args[1])
            else: print('unknown scenario'); sys.exit(2)
            for e in app.errors:
                print('  ERROR ' + e)
            failures += app.errors
            browser.close()
    finally:
        server.terminate()
    print(f'\n{len(failures)} failure(s)')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
