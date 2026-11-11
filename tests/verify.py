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
   python3 tests/verify.py notes         # removing tags and verse anchors from a note, long anchors,
                                         #   a 300-note study: scrolling, find, autocomplete, in-place edits
   python3 tests/verify.py sw            # service worker installs and precaches every js/ file
   python3 tests/verify.py hebrew        # Hebrew word anatomy: TEHMC decode, pieces, affixes, Ketiv
   python3 tests/verify.py export        # readable export: one study and all studies, verse quotes,
                                         #   note text kept as text, unsaved typing included
   python3 tests/verify.py lexicon       # Hebrew lexicon: the spec's test words, safe rendering, every stored
                                         #   entry rendered, lazy open, offline message, single download
   python3 tests/verify.py offline       # language.db background download, offline use, failure and
                                         #   recovery states, single request, interrupted downloads
   python3 tests/verify.py storage       # search index after edits and its one-time repair, anchor lookups
                                         #   against a plain scan, empty and damaged core.db, persistent
                                         #   storage request and settings line
   python3 tests/verify.py boots         # warm-boot time to "app live": prints samples and the median
   python3 tests/verify.py dbsnapshot out.json          # results of ~36 db.js calls as JSON
   python3 tests/verify.py dbcompare before.json after.json

Use dbsnapshot before and after a db.js change and dbcompare the two files:
every key should be identical except the creation timestamps on seeded
user rows, which differ between runs.

Requires: python3, playwright (pip install playwright && playwright install chromium).
"""
import json, os, random, re, sqlite3, statistics, struct, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
URL  = f'http://localhost:{PORT}/'
SW_URL = URL.replace('localhost', '127.0.0.1')  # app.js registers the worker everywhere but 'localhost'

# Console errors matching any of these are not failures. (The FTS5→LIKE
# fallback used to log an error per search; it is a one-time warning now,
# and warnings are never collected — kept here in case an old build is run.)
KNOWN_ERRORS = ('FTS verse search failed',)


def start_server():
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
                         cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    return p


class App:
    def __init__(self, page, ignore=lambda message: False):
        self.page = page
        self.errors = []
        page.on('pageerror', lambda e: self.errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: self.errors.append(f'console.error: {m.text}')
                if m.type == 'error' and not ignore(m) and not any(k in m.text for k in KNOWN_ERRORS) else None)

    def boot(self, url=URL):
        self.page.goto(url)
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


def check_grammar_decode(app):
    """Greek decode across every code in language.db, a compound code in the
    word card, and Hebrew's TEHMC decode lines and no-lexicon gap. Leaves John 1:1 selected
    with the Language tab open, as the smoke scenario had it."""
    p = app.page
    db = sqlite3.connect(f"file:{os.path.join(ROOT, 'data', 'language.db')}?mode=ro", uri=True)
    codes = [r[0] for r in db.execute(
        "SELECT DISTINCT morph_code FROM original_words WHERE language = 'greek' AND morph_code != ''")]
    # A term with no authored phrase renders as the bare term (or bare
    # category name, for an empty value) — see glossaryLine() in grammar-decode.js.
    bare_terms = [r[0] for r in db.execute(
        'SELECT raw_value FROM step_morphology_greek UNION SELECT category FROM step_morphology_greek')]
    db.close()
    res = p.evaluate("""async ([codes, bareTerms]) => {
        const g = await import('./js/grammar-decode.js');
        const bare = new Set([...bareTerms, '1st', '2nd', '3rd']);
        const undecoded = [], unphrased = [];
        for (const code of codes) {
            const parts = await g.decodeMorphCode(code);
            if (parts.length !== g.splitMorphCode(code).length) undecoded.push(code);
            for (const part of parts) for (const line of part.lines)
                if (line.split(' / ').some(term => bare.has(term))) unphrased.push(`${code}: ${line}`);
        }
        return { undecoded, unphrased };
    }""", [codes, bare_terms])
    check(not res['undecoded'], f"all {len(codes)} Greek morph codes decode every part {res['undecoded'][:5]}")
    check(not res['unphrased'], f"every decoded term has authored wording {res['unphrased'][:5]}")

    # compound code in the word card: Matthew 2:8 κἀγὼ = P-1NS + G2532=CONJ
    app.navigate(40, 2)
    app.select_verse(40002008)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row', timeout=30_000)
    p.locator('.language-word-row', has_text='κἀγὼ').click()
    p.wait_for_selector('.language-word-card')
    p.locator('.language-card-member', has_text='κἀγὼ').locator('.language-card-more-btn').click()
    p.wait_for_selector('.language-card-tier2')
    tier2 = p.locator('.language-card-member', has_text='κἀγὼ').locator('.language-card-tier2')
    check(tier2.locator('.language-morph-decode-part-heading').count() == 2, 'compound code shows both parts')
    check('G2532' in tier2.locator('.language-morph-decode-crossref').inner_text(), 'compound code shows cross-reference line')

    # Hebrew: TEHMC decode lines (Hebrew Word Anatomy spec), and a Lexicon link (Hebrew_Lexicon_Spec)
    app.navigate(1, 1)
    app.select_verse(1001001)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row .language-hebrew', timeout=30_000)
    p.locator('.language-word-row').first.click()
    p.locator('.language-card-more-btn').first.click()
    p.wait_for_selector('.language-card-tier2')
    check(p.evaluate("document.querySelectorAll('.language-card-tier2 .language-morph-decode-line').length") > 0, 'Hebrew shows decode lines')
    check(p.evaluate("document.querySelectorAll('.language-card-lexicon-btn').length") == 1, 'Hebrew shows a Lexicon button')

    app.navigate(43, 1)
    app.select_verse(43001001)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row .language-greek', timeout=30_000)


# ---------------------------------------------------------------- smoke
def scenario_smoke(app):
    p = app.page
    seed_user_data(app)
    check(p.evaluate("document.querySelectorAll('.note-indicator').length") >= 1, 'note indicator rendered')
    check(p.evaluate("document.querySelectorAll('.bookmark-indicator').length") >= 1, 'bookmark indicator rendered')
    check(p.evaluate("!!document.querySelector('.verse[data-verse-id=\"1001001\"][class*=markup-]')"), 'markup class applied')
    # markup survives a re-render (initial-render path) and clears via toggle (refresh path)
    p.click('#reader-pane-a .pane-next'); p.wait_for_timeout(150); p.click('#reader-pane-a .pane-prev'); p.wait_for_timeout(150)
    check(p.evaluate("!!document.querySelector('.verse[data-verse-id=\"1001001\"][class*=markup-]')"), 'markup class re-applied after chapter re-render')
    app.select_verse(1001001)
    p.click('.markup-tool'); p.wait_for_timeout(150)
    check(not p.evaluate("!!document.querySelector('.verse[data-verse-id=\"1001001\"][class*=markup-]')"), 'same tool again removes the markup class')
    p.click('.markup-tool'); p.wait_for_timeout(150)
    # range markup: shift-select 1:2-1:4 then apply → three verses classed; both edges and middle
    p.click('.verse[data-verse-id="1001004"]', modifiers=['Shift']); p.wait_for_timeout(100)
    check(p.evaluate("document.querySelectorAll('.verse.selected').length") == 4, 'shift-click range selects 1:1-1:4')
    # programmatic range selection (cross-ref path) mirrors click selection
    sel = p.evaluate("""import('./js/selection.js').then(m => { m.selectVerseRange(1001006, 1001008); return [document.querySelectorAll('.verse.selected').length, m.getSelectedVerses()]; })""")
    check(sel == [3, [1001006, 1001007, 1001008]], f'selectVerseRange selects 1:6-1:8 ({sel})')
    sel = p.evaluate("""import('./js/selection.js').then(m => { m.selectVerseRange(1001010); return [document.querySelectorAll('.verse.selected').length, m.getSelectedVerses(), document.querySelector('.verse.selected').classList.contains('glow')]; })""")
    check(sel == [1, [1001010], True], f'selectVerseRange single verse glows ({sel})')
    app.select_verse(1001001)
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
    check_grammar_decode(app)
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
    # shared confirm dialog: Restart → Escape cancels; Delete → Cancel button cancels
    p.click('.plan-detail-restart')
    p.wait_for_selector('.plan-confirm-line')
    check(p.evaluate("document.querySelector('.plan-metadata-dialog h2').textContent").startswith('Restart'), 'restart confirm dialog opens')
    p.keyboard.press('Escape')
    check(p.evaluate("!document.querySelector('.plan-confirm-line') && !!document.querySelector('.plan-detail-dialog')"), 'Escape cancels confirm, detail popover stays')
    p.click('.plan-detail-delete')
    p.wait_for_selector('.plan-metadata-confirm.danger')
    p.click('.plan-metadata-cancel')
    check(p.evaluate("document.querySelectorAll('.plan-card').length") == 3, 'Cancel leaves all three plans')
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
    # restore flow up to the confirm dialog, then cancel — feeds the real core.db so validation passes
    with p.expect_file_chooser() as chooser_info:
        p.click('#global-settings-popover .settings-action-btn.danger')
    chooser_info.value.set_files(os.path.join(ROOT, 'data', 'core.db'))
    p.wait_for_selector('.plan-metadata-confirm.danger', timeout=60_000)
    check(p.evaluate("document.querySelector('.plan-metadata-dialog h2').textContent") == 'Restore from backup?', 'restore confirm dialog opens')
    p.click('.plan-metadata-overlay', position={'x': 3, 'y': 3})  # backdrop click cancels
    p.wait_for_timeout(300)
    check(p.evaluate("!document.querySelector('.plan-metadata-overlay')"), 'backdrop click cancels restore')
    check(p.evaluate("document.querySelectorAll('.study-list-item, #notes-active-view .note-block').length") > 0, 'nothing reloaded after cancel')
    p.keyboard.press('Escape')
    # delete note + study
    p.click('#notes-tabs [data-study-id="all"]')
    p.once('dialog', lambda d: d.accept())
    p.click('.study-list-delete')
    p.wait_for_timeout(300)
    check(p.evaluate("document.querySelectorAll('.study-list-item').length") == 1, 'study deleted (template study remains)')
    return FAILURES


# ---------------------------------------------------------------- notes
def scenario_notes(app):
    """Removing a tag and removing a verse anchor from a note, and the
    reference panel / reader indicators following each write."""
    p = app.page
    labels = p.evaluate("""import('./js/db.js').then(db => [
        db.formatReference(1001001), db.formatReference(1001001, 1001001), db.formatReference(1001001, 1001003),
        db.formatReference(1001030, 1002005), db.formatReference(1050026, 2001001), db.formatReference(99001001)])""")
    check(labels == ['Genesis 1:1', 'Genesis 1:1', 'Genesis 1:1–3', 'Genesis 1:30–2:5', 'Genesis 50:26–Exodus 1:1', 'Book 99 1:1'],
          f'formatReference shapes ({labels})')
    seed_user_data(app)  # study + note on Gen 1:1 tagged 'faith', bookmark, markup
    check(p.evaluate("document.querySelectorAll('#notes-active-view .tag-chip-editable').length") == 1, 'editable tag chip present')
    check(p.evaluate("document.querySelectorAll('#tags-tab .tag-chip:not(.system-tag)').length") == 1, 'Tags tab shows the user tag after Enter-key add')
    # autocomplete must still exclude the applied tag despite the ✕ in chip text
    p.click('.note-block-tag-input'); p.keyboard.type('fai')
    check(p.evaluate("document.querySelectorAll('.tag-suggestion-item').length") == 0, 'autocomplete excludes already-applied tag')
    p.keyboard.press('Escape'); p.fill('.note-block-tag-input', '')
    # remove the tag
    p.click('.tag-chip-remove')
    p.wait_for_timeout(200)
    check(p.evaluate("document.querySelectorAll('#notes-active-view .tag-chip').length") == 0, 'tag chip removed from note')
    check(p.evaluate("document.querySelectorAll('#tags-tab .tag-chip:not(.system-tag)').length") == 0, 'Tags tab no longer lists the removed tag')
    tags_in_db = p.evaluate("import('./js/db.js').then(db => db.getUserTagsForVerse(1001001))")
    check(tags_in_db == [], f'tag assignment gone from db ({tags_in_db})')
    # attach a second verse, then remove the first
    app.select_verse(1001003)
    p.click('.note-block-attach-btn')
    p.wait_for_timeout(200)
    check(p.evaluate("document.querySelectorAll('#notes-active-view .note-block-anchor').length") == 2, 'second anchor attached')
    p.click('.note-block-anchor-remove')  # first chip = Gen 1:1
    p.wait_for_timeout(300)
    anchors = p.evaluate("[...document.querySelectorAll('#notes-active-view .note-block-anchor-link')].map(a => a.textContent)")
    check(anchors == ['Genesis 1:3'], f'first anchor removed, second kept ({anchors})')
    check(not p.evaluate("!!document.querySelector('.verse[data-verse-id=\"1001001\"] .note-indicator')"), 'reader dot gone from Gen 1:1')
    check(p.evaluate("!!document.querySelector('.verse[data-verse-id=\"1001003\"] .note-indicator')"), 'reader dot present on Gen 1:3')
    # range anchor coalesced from two rows removes as one chip
    app.select_verse(1001004)
    p.click('.note-block-attach-btn'); p.wait_for_timeout(200)
    anchors = p.evaluate("[...document.querySelectorAll('#notes-active-view .note-block-anchor-link')].map(a => a.textContent)")
    check(anchors == ['Genesis 1:3–4'], f'contiguous anchors coalesce into one chip ({anchors})')
    p.click('.note-block-anchor-remove'); p.wait_for_timeout(300)
    rows = p.evaluate("import('./js/db.js').then(db => db.getNotesForVerse(1001003).length + db.getNotesForVerse(1001004).length)")
    check(rows == 0 and p.evaluate("document.querySelectorAll('#notes-active-view .note-block-anchor').length") == 0, f'coalesced chip removal deletes both rows ({rows})')
    check_long_anchors(p)
    check_note_lists(p)
    check_long_study(p)
    check_save_after_leaving(p)
    return FAILURES


def check_save_after_leaving(p):
    """A save can fire after its study stopped showing. The view is hidden for All Studies
    and rebuilt for another study, and innerText loses line breaks in both, so the text
    has to be read while the block is still on screen."""
    body_of = lambda study: p.evaluate(f"import('./js/db.js').then(db => db.getNotesForStudy({study})[0].body)")
    p.click('#notes-tab-add')
    study = p.evaluate("import('./js/panels.js').then(m => m.getActiveStudyId())")
    p.click('.add-note-btn'); p.wait_for_timeout(150)

    p.click('.note-block-body'); p.keyboard.type('one'); p.keyboard.press('Enter'); p.keyboard.type('two')
    p.click('#notes-tabs [data-study-id="all"]')
    p.wait_for_timeout(1100)
    body = body_of(study)
    check(body == 'one\ntwo', f"switching to All Studies before the save keeps line breaks ({body!r})")

    p.click(f'#notes-tabs [data-study-id="{study}"]'); p.wait_for_timeout(150)
    shown = p.evaluate("document.querySelector('#notes-active-view .note-block-body').innerText")
    check(shown == 'one\ntwo', f"reopened note shows its line breaks ({shown!r})")

    p.click('.note-block-body'); p.keyboard.press('Control+End'); p.keyboard.press('Enter'); p.keyboard.type('three')
    p.click('#notes-tab-add')
    p.wait_for_timeout(1100)
    body = body_of(study)
    check(body == 'one\ntwo\nthree', f"switching to another study before the save keeps line breaks ({body!r})")

    # leaving and straight back: the rebuilt block has to show what was just typed
    note = lambda: p.evaluate(f"import('./js/db.js').then(db => db.getNotesForStudy({study})[0])")
    p.click(f'#notes-tabs [data-study-id="{study}"]'); p.wait_for_timeout(150)
    p.click('.note-block-body'); p.keyboard.press('Control+End'); p.keyboard.type(' four')
    p.evaluate(f"""(() => {{
        document.querySelector('#notes-tabs [data-study-id="all"]').click();
        document.querySelector('#notes-tabs [data-study-id="{study}"]').click();
    }})()""")
    shown = p.evaluate("document.querySelector('#notes-active-view .note-block-body').textContent")
    check(shown == 'one\ntwo\nthree four', f"returning before the save shows the new text ({shown!r})")
    written = note()
    check(written['body'] == shown, f"leaving the study writes the save straight away ({written['body']!r})")
    p.wait_for_timeout(1100)
    check(note()['modified_at'] == written['modified_at'], 'the timer does not write it a second time')
    p.click('.note-block-body'); p.keyboard.press('Control+End'); p.keyboard.type(' five')
    p.wait_for_timeout(1100)
    body = note()['body']
    check(body == 'one\ntwo\nthree four five', f"typing after returning keeps the earlier words ({body!r})")

    # deleting still cancels a pending save
    p.click('.note-block-body'); p.keyboard.press('Control+End'); p.keyboard.type(' six')
    p.once('dialog', lambda dialog: dialog.accept())
    p.click('.note-block-delete')
    p.click('#notes-tabs [data-study-id="all"]')
    p.wait_for_timeout(1100)
    left = p.evaluate(f"import('./js/db.js').then(db => db.getNotesForStudy({study}).length)")
    check(left == 0, f"deleting a note with a pending save leaves it deleted ({left})")


def check_note_lists(p):
    """attachTagsAndAnchors() fetches for the whole list at once: each note must
    still get its own rows, in insertion order, and notes with none get empty lists."""
    res = p.evaluate("""async () => {
        const db = await import('./js/db.js');
        const a = db.saveNote('list a', [{ verseStart: 2001003, verseEnd: null }, { verseStart: 2001001, verseEnd: 2001002 }], ['zebra', 'apple', 'mango'], null);
        const b = db.saveNote('list b', [{ verseStart: 2001001, verseEnd: null }], [], null);
        const notes = db.getNotesForVerse(2001001);
        const shape = id => { const n = notes.find(n => n.id === id); return { tags: n.tags.map(t => t.name), anchors: n.anchors.map(x => [x.note_id, x.verse_start, x.verse_end]), tagKeys: Object.keys(n.tags[0] ?? {}) }; };
        return { a, b, noteA: shape(a), noteB: shape(b), noStudy: db.getNotesForStudy(-1), noTag: db.getNotesForTag('no-such-tag') };
    }""")
    check(res['noteA']['tags'] == ['zebra', 'apple', 'mango'], f"tags keep insertion order ({res['noteA']['tags']})")
    check(res['noteA']['tagKeys'] == ['id', 'name', 'type'], f"tag rows keep their shape ({res['noteA']['tagKeys']})")
    check(res['noteA']['anchors'] == [[res['a'], 2001003, None], [res['a'], 2001001, 2001002]], f"anchors keep insertion order ({res['noteA']['anchors']})")
    check(res['noteB']['tags'] == [] and res['noteB']['anchors'] == [[res['b'], 2001001, None]], f"a note without tags gets an empty list ({res['noteB']})")
    check(res['noStudy'] == [] and res['noTag'] == [], 'no matching notes returns an empty list')


LONG_STUDY_NOTES = 300

def check_long_study(p):
    """Off-screen blocks skip layout and paint (content-visibility) and edits update one
    block in place: everything that needs a block must still work, and the view must not jump."""
    study_id = p.evaluate(f"""async () => {{
        const db = await import('./js/db.js');
        const panels = await import('./js/panels.js');
        document.querySelector('#notes-tab-add').click();
        const studyId = panels.getActiveStudyId();
        // Every saveNote() exports the whole database (about 24 MB) for the storage
        // worker. 300 in one loop held 9 GB at once and sometimes crashed the page
        // ("Target crashed"); no user can save that fast. So the loop's saves each
        // write a placeholder, and one real save follows. initSqlJs() hands back
        // the app's own module, so this is the prototype its Database uses.
        const prototype = (await window.initSqlJs({{ locateFile: file => `./js/vendor/${{file}}` }})).Database.prototype;
        const realExport = prototype.export;
        prototype.export = () => new Uint8Array(0);
        try {{
            for (let i = 0; i < {LONG_STUDY_NOTES}; i++) {{
                // Heights vary, so they differ from the estimate the browser starts from.
                const body = i === {LONG_STUDY_NOTES - 20} ? 'needle-far-down' : `long study note ${{i}} ` + 'word '.repeat(i % 7 * 40);
                db.saveNote(body, [{{ verseStart: 1001001 + (i % 30), verseEnd: null }}], i % 3 ? [] : [`long-study-tag-${{i % 8}}`], studyId);
            }}
        }} finally {{
            prototype.export = realExport;
        }}
        db.setState('long_study_seeded', '1');  // the one real save
        document.querySelector('#notes-tabs [data-study-id="all"]').click();
        panels.openStudy(studyId, 'Long study');
        return studyId;
    }}""")
    p.wait_for_timeout(300)
    view = "document.querySelector('#notes-active-view')"
    top_note = f"""(() => {{
        const top = {view}.getBoundingClientRect().top;
        const block = [...{view}.querySelectorAll('.note-block')].find(b => b.getBoundingClientRect().bottom > top);
        return {{ id: Number(block.dataset.noteId), offset: block.getBoundingClientRect().top - top }};
    }})()"""
    scroll_to_middle = f"""async () => {{
        const view = {view};
        view.scrollTop = view.scrollHeight / 2;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }}"""

    states = p.evaluate(f"""(() => {{
        const blocks = [...{view}.querySelectorAll('.note-block')];
        const painted = b => b.checkVisibility({{ contentVisibilityAuto: true }});
        const inner = b => b.querySelector('.note-block-body');
        return {{ blocks: blocks.length, first: painted(inner(blocks[0])), last: painted(inner(blocks.at(-1))) }};
    }})()""")
    check(states['blocks'] == LONG_STUDY_NOTES, f"every note has a block in the DOM ({states['blocks']})")
    check(states['first'] and not states['last'], f"on-screen block rendered, far-off block skipped ({states})")
    check(p.evaluate("window.find('needle-far-down')"), 'find reaches text in a block that was skipped')
    p.evaluate("getSelection().removeAllRanges()")

    # scrolling up through blocks whose real height differs from the estimate
    p.evaluate(scroll_to_middle)
    p.wait_for_timeout(100)
    before = p.evaluate(top_note)
    p.evaluate(f"{view}.scrollBy(0, -300)")
    p.wait_for_timeout(200)
    after = p.evaluate(top_note)
    check(0 <= before['id'] - after['id'] <= 3, f"scrolling up 300 px moves a few notes, not a long way ({before['id']} → {after['id']})")

    # tag autocomplete overflows its block: it has to stay visible
    p.evaluate(scroll_to_middle)
    p.wait_for_timeout(100)
    target = p.evaluate(top_note)['id']
    input_sel = f'[data-note-id="{target}"] .note-block-tag-input'
    p.click(input_sel); p.keyboard.type('long-st')
    p.wait_for_selector(f'[data-note-id="{target}"] .tag-suggestion-item')
    clipped = p.evaluate(f"""(() => {{
        const block = document.querySelector('[data-note-id="{target}"]');
        const list = block.querySelector('.note-block-tag-suggestions').getBoundingClientRect();
        const centre = item => {{ const r = item.getBoundingClientRect(); return {{ x: r.left + r.width / 2, y: r.top + r.height / 2 }}; }};
        // An item whose centre is past the block's edge: the part clipping would cut off.
        const item = [...block.querySelectorAll('.tag-suggestion-item')].find(item => {{
            const y = centre(item).y;
            return y > block.getBoundingClientRect().bottom && y < list.bottom;
        }});
        if (!item) return {{ overflows: false, visible: false }};
        const point = centre(item);
        return {{ overflows: true, visible: document.elementFromPoint(point.x, point.y) === item }};
    }})()""")
    check(clipped['overflows'], f"autocomplete list extends past its block ({clipped})")
    check(clipped['visible'], f"the part past the block can be hit, not clipped ({clipped})")
    p.keyboard.press('Escape'); p.fill(input_sel, '')

    # autosave after scrolling the edited block out of view keeps its line breaks
    note_sel = f'[data-note-id="{target}"] .note-block-body'
    p.click(note_sel); p.keyboard.press('Control+End')
    p.keyboard.type('edited'); p.keyboard.press('Enter'); p.keyboard.type('second line')
    p.evaluate(f"document.activeElement.blur(); getSelection().removeAllRanges(); {view}.scrollTop = 0;")
    p.wait_for_timeout(100)
    check(p.evaluate(f"!document.querySelector('{note_sel}').checkVisibility({{ contentVisibilityAuto: true }})"), 'edited block is skipped while its save is pending')
    p.wait_for_timeout(1000)
    body = p.evaluate(f"import('./js/db.js').then(db => db.getNotesForStudy({study_id}).find(n => n.id === {target}).body)")
    check(body.endswith('edited\nsecond line'), f"autosave of a skipped block keeps line breaks ({body[-24:]!r})")

    # attaching a verse keeps the scroll position and unsaved typing
    p.evaluate(scroll_to_middle)
    p.wait_for_timeout(100)
    app_select = '.verse[data-verse-id="1001005"]'
    p.click(app_select); p.wait_for_timeout(100)
    before = p.evaluate(top_note)
    second = p.evaluate(f"""(() => {{
        const top = {view}.getBoundingClientRect().top;
        return Number([...{view}.querySelectorAll('.note-block')].filter(b => b.getBoundingClientRect().bottom > top)[1].dataset.noteId);
    }})()""")
    typed_sel = f'[data-note-id="{second}"] .note-block-body'
    p.evaluate(f"""(() => {{ const body = document.querySelector('{typed_sel}'); body.textContent = 'unsaved typing'; body.dispatchEvent(new Event('input')); }})()""")
    p.click(f'[data-note-id="{second}"] .note-block-attach-btn')
    p.wait_for_timeout(150)
    after = p.evaluate(top_note)
    check(after['id'] == before['id'] and abs(after['offset'] - before['offset']) < 2, f"attach keeps the scroll position ({before} → {after})")
    check(p.evaluate(f"document.querySelector('{typed_sel}').textContent") == 'unsaved typing', 'attach keeps unsaved typing in that note')
    p.wait_for_timeout(1000)
    saved = p.evaluate(f"import('./js/db.js').then(db => db.getNotesForStudy({study_id}).find(n => n.id === {second}))")
    check(saved['body'] == 'unsaved typing' and any(a['verse_start'] == 1001005 for a in saved['anchors']), 'that note saves both the typing and the verse')

    # deleting keeps the scroll position
    before = p.evaluate(top_note)
    p.once('dialog', lambda dialog: dialog.accept())
    p.click(f'[data-note-id="{second}"] .note-block-delete')
    p.wait_for_timeout(150)
    after = p.evaluate(top_note)
    check(p.evaluate(f"!document.querySelector('[data-note-id=\"{second}\"]')"), 'deleted block is gone')
    check(after['id'] == before['id'] and abs(after['offset'] - before['offset']) < 2, f"delete keeps the scroll position ({before} → {after})")

    # adding at the end of a long list lands on the new, focused block
    p.click('.add-note-btn')
    p.wait_for_timeout(1200)
    added = p.evaluate(f"""(() => {{
        const view = {view};
        const block = document.activeElement.closest('.note-block');
        const rect = block?.getBoundingClientRect(), box = view.getBoundingClientRect();
        return {{ focused: !!block && block === [...view.querySelectorAll('.note-block')].at(-1), inView: !!rect && rect.top >= box.top && rect.top < box.bottom }};
    }})()""")
    check(added == {'focused': True, 'inView': True}, f"Add Note focuses a new last block, in view ({added})")

    # the empty state comes and goes without a full re-render being needed
    p.evaluate("""async () => {
        document.querySelector('#notes-tab-add').click();
        await new Promise(r => setTimeout(r, 50));
    }""")
    check(p.evaluate(f"!!{view}.querySelector('.notes-empty')"), 'new study shows the empty state')
    p.click('.add-note-btn'); p.wait_for_timeout(150)
    check(p.evaluate(f"!{view}.querySelector('.notes-empty') && {view}.querySelectorAll('.note-block').length === 1"), 'first note replaces the empty state')
    p.once('dialog', lambda dialog: dialog.accept())
    p.click('.note-block-delete'); p.wait_for_timeout(150)
    check(p.evaluate(f"!!{view}.querySelector('.notes-empty') && {view}.querySelectorAll('.note-block').length === 0"), 'deleting the last note brings the empty state back')
    check(p.evaluate(f"!!{view}.querySelector('.study-title') && !!{view}.querySelector('.add-note-btn')"), 'title and Add Note button remain after that')


def check_long_anchors(p):
    """anchorsOverlapping() searches short anchors in a window and long ones through
    their own index: both sides of that line must find every overlap, and no more."""
    res = p.evaluate("""async () => {
        const db = await import('./js/db.js');
        const finds = (noteId, verseId) => db.getNotesForVerse(verseId).some(n => n.id === noteId);
        const whole = db.saveNote('whole Bible', [{ verseStart: 1001001, verseEnd: 66022021 }], ['spanning'], null);
        const atLimit = db.saveNote('span exactly at the limit', [{ verseStart: 5001001, verseEnd: 5006001 }], [], null);
        const pastLimit = db.saveNote('span one past the limit', [{ verseStart: 6001001, verseEnd: 6006002 }], [], null);
        const crossBook = db.saveNote('across a book boundary', [{ verseStart: 1050026, verseEnd: 2001001 }], [], null);
        return {
            whole: [finds(whole, 1001001), finds(whole, 43003016), finds(whole, 66022021)],
            wholeTag: db.getUserTagsForVerse(43003016),
            wholeCount: db.getNoteCountsForChapter(43, 3).get(43003016),
            atLimit: [finds(atLimit, 5001001), finds(atLimit, 5003010), finds(atLimit, 5006001), finds(atLimit, 5006002), finds(atLimit, 5001000)],
            pastLimit: [finds(pastLimit, 6001001), finds(pastLimit, 6003010), finds(pastLimit, 6006002), finds(pastLimit, 6006003), finds(pastLimit, 6001000)],
            crossBook: [finds(crossBook, 1050026), finds(crossBook, 2001001), finds(crossBook, 1050025), finds(crossBook, 2001002)],
            atLimitChapter: db.getNoteCountsForChapter(5, 6).get(5006001),
        };
    }""")
    check(res['whole'] == [True, True, True], f"whole-Bible anchor found from first, middle and last verse ({res['whole']})")
    check('spanning' in res['wholeTag'], f"its tag shows on a verse it spans ({res['wholeTag']})")
    check(res['wholeCount'] == 1, f"its dot counts in a chapter it spans ({res['wholeCount']})")
    check(res['atLimit'] == [True, True, True, False, False], f"anchor exactly at the long-anchor limit ({res['atLimit']})")
    check(res['pastLimit'] == [True, True, True, False, False], f"anchor one past the long-anchor limit ({res['pastLimit']})")
    check(res['crossBook'] == [True, True, False, False], f"anchor across a book boundary ({res['crossBook']})")
    check(res['atLimitChapter'] == 2, f"chapter count reaches an anchor's last verse, plus the whole-Bible note ({res['atLimitChapter']})")


# ---------------------------------------------------------------- service worker
def scenario_sw(app):
    """app.js skips service-worker registration only for hostname 'localhost',
    so booting via 127.0.0.1 registers it for real. Precache install is
    all-or-nothing, so a wrong path would leave the cache empty."""
    p = app.page
    p.evaluate("navigator.serviceWorker.ready")
    p.wait_for_timeout(1500)
    info = p.evaluate("""async () => {
        const names = await caches.keys();
        const out = {};
        for (const n of names) out[n] = (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname);
        return out;
    }""")
    names = list(info)
    check(len(names) == 1, f'exactly one cache after install ({names})')
    cached = set(info[names[0]]) if names else set()
    js_on_disk = sorted('/' + os.path.relpath(os.path.join(d, f), ROOT)
                        for d, _, fs in os.walk(os.path.join(ROOT, 'js')) for f in fs if f.endswith(('.js', '.wasm')))
    missing = [f for f in js_on_disk if f not in cached]
    check(missing == [], f'every file under js/ is precached (missing: {missing})')
    for must in ('/', '/index.html', '/css/style.css', '/fonts/SILEOT.woff', '/manifest.json'):
        check(must in cached, f'{must} precached')
    # PRECACHE list in sw.js vs js/ on disk — catches a stale list even if the
    # cache happened to be populated by earlier fetches
    sw_src = open(os.path.join(ROOT, 'sw.js')).read()
    listed = set('/' + m for m in __import__('re').findall(r"'\./(js/[^']+)'", sw_src))
    unlisted = [f for f in js_on_disk if f not in listed]
    check(unlisted == [], f'sw.js PRECACHE lists every js/ file (unlisted: {unlisted})')
    stale = [f for f in listed if not os.path.exists(os.path.join(ROOT, f.lstrip('/')))]
    check(stale == [], f'sw.js PRECACHE has no entries for deleted files (stale: {stale})')
    # data/ must never be copied into Cache Storage: db.js keeps those files in
    # OPFS. The background download may already have finished before the worker
    # took control, so fetch from data/ directly with the worker in control, then
    # check nothing under /data/ is in any cache.
    check(p.evaluate("!!navigator.serviceWorker.controller"), 'worker controls the page')
    p.evaluate("Promise.all(['language.db', 'plans/mcheyne-1year.json'].map(f => fetch(`./data/${f}`).then(r => r.arrayBuffer())))")
    app.select_verse(1001001)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row', timeout=120_000)
    p.wait_for_timeout(1000)
    data_cached = p.evaluate("""async () => {
        const out = [];
        for (const n of await caches.keys())
            for (const r of await (await caches.open(n)).keys())
                if (new URL(r.url).pathname.includes('/data/')) out.push(new URL(r.url).pathname);
        return out;
    }""")
    check(data_cached == [], f'no data/ files duplicated into Cache Storage ({data_cached})')
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
    # range anchor: a note on verses 2-4 must dot all three
    app.select_verse(19003002)
    p.click('.verse[data-verse-id="19003004"]', modifiers=['Shift'])
    p.click('.add-note-btn')
    p.wait_for_timeout(300)
    dotted = p.evaluate("[...document.querySelectorAll('#reader-pane-a .verse .note-indicator')].map(d => d.closest('.verse').dataset.verseId)")
    check(all(str(v) in dotted for v in (19003002, 19003003, 19003004)), f'range note dots verses 2-4 (dotted: {dotted})')
    # second note on verse 3 alone → its dot reads "2 notes", neighbours still "1 note"
    app.select_verse(19003003)
    p.click('.add-note-btn')
    p.wait_for_timeout(300)
    titles = p.evaluate("[2,3,4].map(v => document.querySelector(`.verse[data-verse-id=\"1900300${v}\"] .note-indicator`)?.title)")
    check(titles == ['1 note', '2 notes', '1 note'], f'note counts per verse ({titles})')
    # batched chapter counts must equal the per-verse query for every rendered verse
    mismatches = p.evaluate("""async () => {
        const db = await import('./js/db.js');
        const counts = db.getNoteCountsForChapter(19, 3);
        const out = [];
        for (const el of document.querySelectorAll('#reader-pane-a .verse')) {
            const id = parseInt(el.dataset.verseId);
            const perVerse = db.getNotesForVerse(id).length;
            const batched  = counts.get(id) ?? 0;
            if (perVerse !== batched) out.push([id, perVerse, batched]);
        }
        return out;
    }""")
    check(mismatches == [], f'batched counts equal per-verse counts (mismatches: {mismatches})')
    return FAILURES


# ---------------------------------------------------------------- hebrew
def hebrew_word_id(db, verse_id, word_position):
    return db.execute("SELECT id FROM original_words WHERE language = 'hebrew' AND verse_id = ? AND word_position = ?",
                      (verse_id, word_position)).fetchone()[0]


def hebrew_surface_pieces(db, verse_id, word_position):
    """A word's pieces as stored — expected Hebrew comes from the data, not
    typed literals, whose combining marks may be ordered differently (the data
    has shin dot before hiriq in רֵאשִׁית)."""
    surface = db.execute("SELECT surface_text FROM original_words WHERE language = 'hebrew' AND verse_id = ? "
                         "AND word_position = ?", (verse_id, word_position)).fetchone()[0]
    return surface.split('\\')[0].split('/')


# Reads one word card member's tier 1 + tier 2 into plain data (Hebrew word
# anatomy): pieces with Hebrew/role/gloss/general/lines, subword headings,
# Ketiv, the Aramaic label, and the plain decode lines of a one-piece word.
READ_MEMBER_JS = """(member) => {
    const text = (el) => el ? el.textContent.trim() : null;
    const t2 = member.querySelector('.language-card-tier2');
    const pieces = [...member.querySelectorAll('.language-piece')].map(p => ({
        hebrew: text(p.querySelector('.language-piece-hebrew')),
        role: text(p.querySelector('.language-piece-role')),
        gloss: text(p.querySelector('.language-piece-gloss')),
        general: text(p.querySelector('.language-piece-general')),
        lines: [...p.querySelectorAll('.language-morph-decode-line')].map(text),
    }));
    const field = (label) => {
        const f = [...member.querySelectorAll('.language-detail-field')]
            .find(f => text(f.querySelector('.language-detail-label')) === label);
        return f ? text(f.querySelector('.language-detail-value')) : null;
    };
    return {
        aramaic: !!member.querySelector('.language-card-language'),
        pieces,
        subwords: [...member.querySelectorAll('.language-anatomy-subword-heading')].map(text),
        plainLines: t2 ? [...t2.querySelectorAll('.language-morph-decode-body .language-morph-decode-line')].map(text) : [],
        ketiv: field('Written (Ketiv)'),
        readings: [...member.querySelectorAll('.language-manuscripts .language-detail-field')]
            .map(f => [text(f.querySelector('.language-detail-label')), text(f.querySelector('.language-detail-value')),
                       text(f.querySelector('.language-manuscript-gloss'))]),
        added: text(member.querySelector('.language-manuscript-added')),
        ketivNote: text(member.querySelector('.language-ketiv-note')),
        general: field('General usage'),
        lexiconButton: !!member.querySelector('.language-card-lexicon-btn'),
    };
}"""


ROW_MARKS_JS = """(verseId) => [...document.querySelectorAll('.language-verse-block')]
    .find(b => Number(b.querySelector('.language-verse-heading').dataset.verseId) === verseId)
    .querySelectorAll('.language-word-row').values().map(row => ({
        mark: !!row.querySelector('.language-word-mark'),
        added: !!row.querySelector('.language-word-added') })).toArray()"""


def manuscript_variants(app, db):
    """Other sources' readings, words not in the Hebrew manuscripts, and the row mark."""
    p = app.page
    reading = lambda verse, position: db.execute(
        'SELECT v.meaning_variants FROM original_word_variants v JOIN original_words w ON w.id = v.word_id '
        'WHERE w.verse_id = ? AND w.word_position = ?', (verse, position)).fetchone()[0]

    card = read_word_card(app, db, 19022016, 6)  # Psa 22:16 #07 כָּאֲרִי, Dead Sea Scrolls כָּאֲרוּ
    hebrew = re.search(r'\(([^)]*)\)', reading(19022016, 6))[1]
    check(card['readings'] == [['Dead Sea Scrolls', hebrew, '“they dug”']],
          f"Psa 22:16 #07: the Dead Sea Scrolls reading, its Hebrew and gloss ({card['readings']})")
    marks = p.evaluate(ROW_MARKS_JS, 19022016)
    check(marks[6]['mark'] and not marks[6]['added'] and sum(m['mark'] for m in marks) == 1,
          f"Psa 22:16: only that word's row is marked ({[i for i, m in enumerate(marks) if m['mark']]})")

    card = read_word_card(app, db, 1018022, 5)  # Gen 18:22 #06, the scribes' "Yahweh"
    check(len(card['readings']) == 1 and card['readings'][0][0] == 'Scribal tradition' and card['readings'][0][2] == '“and Yahweh”',
          f"Gen 18:22 #06: the scribal tradition's reading ({card['readings']})")

    card = read_word_card(app, db, 4007059, 16)  # Num 7:59 #17 Pedahzur: two readings
    check([r[0] for r in card['readings']] == ['Aleppo Codex, Ben Chaim edition', 'BHS'], f"Num 7:59 #17: one line per source ({card['readings']})")

    card = read_word_card(app, db, 16002013, 16)  # Neh 2:13 #17: a Ketiv and BHS's reading
    check(card['ketiv'] and [r[0] for r in card['readings']] == ['Written (Ketiv)', 'BHS'],
          f"Neh 2:13 #17: the Ketiv line and BHS's reading together ({card['readings']})")

    card = read_word_card(app, db, 1004008, 5)  # Gen 4:8 #06 נֵלְכָה, from the Septuagint
    check((card['added'] or '').startswith('Not in the Hebrew manuscripts: supplied from the Greek Septuagint') and not card['readings'],
          f"Gen 4:8 #06: supplied from the Septuagint ({card['added']})")
    marks = p.evaluate(ROW_MARKS_JS, 1004008)
    lxx = [i for i, m in enumerate(marks) if m['added']]
    check(lxx == [5, 6] and all(marks[i]['mark'] for i in lxx), f"Gen 4:8: the two supplied words are marked and in italics ({lxx})")

    card = read_word_card(app, db, 6021036, 0)  # Josh 21:36 #01, restored
    check('1 Chronicles 6:63–64' in (card['added'] or ''), f"Josh 21:36: restored from 1 Chronicles ({card['added']})")

    card = read_word_card(app, db, 1002008, 4)  # Gen 2:8 #05: spelling variants only (Aleppo, BHS, Ben Chaim)
    check(not card['readings'] and not card['added'] and not p.evaluate(ROW_MARKS_JS, 1002008)[4]['mark'],
          'Gen 2:8 #05: a spelling-only difference has no note and no mark')

    card = read_word_card(app, db, 27004032, 21)  # Dan 4:32 #22: its Ketiv repeats the printed word
    check(not card['ketiv'] and not p.evaluate(ROW_MARKS_JS, 27004032)[21]['mark'], 'Dan 4:32 #22: no Ketiv line, no mark')

    card = read_word_card(app, db, 1008017, 13)  # Gen 8:17 #14: a Ketiv is marked too
    check(p.evaluate(ROW_MARKS_JS, 1008017)[13]['mark'], 'Gen 8:17 #14: a Ketiv word is marked')


def word_surface(db, verse_id, word_position):
    return db.execute("SELECT surface_text FROM original_words WHERE verse_id = ? AND word_position = ?",
                      (verse_id, word_position)).fetchone()[0]


def read_word_card(app, db, verse_id, word_position, tier2=True):
    """Open the card for one word (its row may be a group) and read that member."""
    p = app.page
    book, chapter = verse_id // 1_000_000, verse_id // 1000 % 1000
    app.navigate(book, chapter)
    app.select_verse(verse_id)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row', timeout=60_000)
    surface = word_surface(db, verse_id, word_position)
    p.locator('.language-word-row', has_text=surface).first.click()
    p.wait_for_selector('.language-word-card')
    member = p.locator('.language-card-member').filter(
        has=p.locator('.language-card-original', has_text=surface)).first
    if tier2:
        member.locator('.language-card-more-btn').click()
        p.wait_for_timeout(200)
        member = p.locator('.language-card-member').filter(
            has=p.locator('.language-card-original', has_text=surface)).first
    return member.evaluate(READ_MEMBER_JS)


def scenario_hebrew(app):
    """Hebrew Word Anatomy spec: the db.js queries and the Hebrew decode path
    against the live database (U1), then the word card checks of Item 9."""
    p = app.page
    db = sqlite3.connect(f"file:{os.path.join(ROOT, 'data', 'language.db')}?mode=ro", uri=True)
    codes = [r[0] for r in db.execute(
        "SELECT DISTINCT morph_code FROM original_words WHERE language = 'hebrew' AND morph_code != ''")]
    gen_1_1 = [hebrew_word_id(db, 1001001, i) for i in range(7)]
    ketiv_ids = {'Gen 9:21 #07': hebrew_word_id(db, 1009021, 6), 'Gen 8:17 #14': hebrew_word_id(db, 1008017, 13)}
    psalm_119 = [r[0] for r in db.execute(
        "SELECT id FROM original_words WHERE verse_id BETWEEN 19119001 AND 19119176")]
    expected_ketiv = {k: [db.execute('SELECT ketiv_hebrew FROM original_word_variants WHERE word_id = ?', (i,)).fetchone()[0], kind]
                      for (k, i), kind in zip(ketiv_ids.items(), ('meaning', 'spelling'))}
    gen_1_1_first, gen_1_1_seventh = hebrew_surface_pieces(db, 1001001, 0), hebrew_surface_pieces(db, 1001001, 6)
    psalm_119_pieces = db.execute(
        "SELECT COUNT(*) FROM original_word_pieces WHERE word_id IN (SELECT id FROM original_words "
        "WHERE verse_id BETWEEN 19119001 AND 19119176)").fetchone()[0]
    db.close()

    res = p.evaluate("""async ([codes, gen11, ketivIds, psalm119]) => {
        const g = await import('./js/grammar-decode.js');
        const db = await import('./js/db.js');
        const undecoded = [], bare = [];
        for (const code of codes) {
            const parts = await g.decodeMorphCode(code);
            for (const part of parts) for (const line of part.lines) if (!line.includes(' - ')) bare.push(`${part.code}: ${line}`);
            const pieces = g.splitHebrewMorphCode(code);
            const expected = pieces.flatMap((subword, s) => subword.map(c => [c, s]));
            if (parts.length !== expected.length
                || parts.some((part, i) => part.code !== expected[i][0] || part.subwordIndex !== expected[i][1]
                                           || part.lines.length === 0)) undecoded.push(code);
        }
        const affixes = await db.getHebrewAffixes();
        const again = await db.getHebrewAffixes();
        const words = await db.getOriginalWordsForVerses([1001001]);
        const pieces = await db.getPiecesForWords(gen11);
        const split = splitWord => splitWord && splitWord.flatMap(s => s.pieces.map(p =>
            [p.surface, p.morphCode, p.role, p.dictionaryGloss]));
        const variants = await db.getVariantsForWords(Object.values(ketivIds));
        const manyPieces = await db.getPiecesForWords(psalm119);
        return {
            undecoded, bare,
            affixCount: affixes.size, cached: affixes === again,
            h9001: [affixes.get('H9001').form, affixes.get('H9001').gloss],
            h9033: [affixes.get('H9033').form, affixes.get('H9033').glossByForm.get('Ss3m')],
            gen11Pieces: gen11.map(id => pieces.get(id)?.pieceStrongs ?? null),
            first: split(g.splitHebrewWord(words[0], pieces.get(words[0].id), affixes)),
            seventh: split(g.splitHebrewWord(words[6], pieces.get(words[6].id), affixes)),
            oneWord: g.splitHebrewWord(words[1], pieces.get(words[1].id), affixes),
            ketiv: Object.fromEntries(Object.entries(ketivIds).map(([k, id]) =>
                [k, [variants.get(id)?.ketivHebrew, variants.get(id)?.ketivKind]])),
            manyPieces: manyPieces.size,
        };
    }""", [codes, gen_1_1, ketiv_ids, psalm_119])

    check(not res['undecoded'], f"all {len(codes)} Hebrew morph codes decode: one entry per piece, "
          f"in order, each with lines {res['undecoded'][:5]}")
    check(not res['bare'], f"every Hebrew decode line has authored wording {res['bare'][:5]}")
    check(res['affixCount'] == 43 and res['cached'], f"getHebrewAffixes: 43 numbers, cached ({res['affixCount']})")
    check(res['h9001'] == ['ו', '&'], f"H9001 usual form/gloss ({res['h9001']})")
    check(res['h9033'] == ['Os3m', 'he'], f"H9033 usual form Os3m, other form Ss3m 'he' ({res['h9033']})")
    check(res['gen11Pieces'] == ['H9003/{H7225G}', None, None, None, 'H9009/{H8064}', 'H9002/{H0853}', 'H9009/{H0776G}'],
          f"getPiecesForWords Gen 1:1 ({res['gen11Pieces']})")
    check(res['first'] == [[gen_1_1_first[0], 'HR', 'prefix', 'in'], [gen_1_1_first[1], 'HNcfsa', 'root', 'first: beginning']],
          f"splitHebrewWord Gen 1:1 #01 ({res['first']})")
    check(res['seventh'] == [[gen_1_1_seventh[0], 'HTd', 'prefix', 'the'], [gen_1_1_seventh[1], 'HNcfsa', 'root', 'land: country; planet']],
          f"splitHebrewWord Gen 1:1 #07: sof pasuq stripped, gloss fixed ({res['seventh']})")
    check(res['oneWord'] is None, 'splitHebrewWord: one-piece word returns null')
    check(res['ketiv'] == expected_ketiv and all(v[0] for v in expected_ketiv.values()),
          f"getVariantsForWords Ketiv ({res['ketiv']})")
    check(res['manyPieces'] == psalm_119_pieces,
          f"getPiecesForWords over {len(psalm_119)} words (chunked) finds all {psalm_119_pieces} ({res['manyPieces']})")

    # ---- Item 9: the word card
    db = sqlite3.connect(f"file:{os.path.join(ROOT, 'data', 'language.db')}?mode=ro", uri=True)
    has_lines = lambda card: all(piece['lines'] for piece in card['pieces'])

    card = read_word_card(app, db, 1001001, 0)
    check([(x['role'], x['gloss']) for x in card['pieces']] == [('Prefix', '“in”'), ('Word', '“beginning”')] and has_lines(card),
          f"Gen 1:1 #01: Prefix \"in\" + Word \"beginning\", each with decoded lines ({card['pieces']})")

    card = read_word_card(app, db, 1001001, 6)
    check(card['general'] == 'land: country; planet', f"Gen 1:1 #07: General usage reads 'land: country; planet' ({card['general']})")
    check(len(card['pieces']) == 2 and '׃' not in ''.join(x['hebrew'] for x in card['pieces']),
          f"Gen 1:1 #07: 2 pieces, sof pasuq not a piece ({[x['hebrew'] for x in card['pieces']]})")

    card = read_word_card(app, db, 1001003, 0)
    prefix_lines = card['pieces'][0]['lines'] if card['pieces'] else []
    verb_form = [l for l in (card['pieces'][1]['lines'] if len(card['pieces']) > 1 else []) if l.startswith('Consecutive Imperfect')]
    check(card['pieces'] and card['pieces'][0]['role'] == 'Prefix' and any(l.startswith('Consecutive - ') for l in prefix_lines),
          f"Gen 1:3 #01: the Hc prefix decodes ({prefix_lines})")
    check(len(verb_form) == 1 and ' - Usually ' in verb_form[0] and 'will' not in verb_form[0],
          f"Gen 1:3 #01: verb form wording is hedged, no certain time ({verb_form})")

    card = read_word_card(app, db, 1002002, 4)
    check(card['pieces'] and (card['pieces'][-1]['role'], card['pieces'][-1]['gloss']) == ('Suffix', '“his”'),
          f"Gen 2:2 #05: Suffix piece \"his\" ({card['pieces']})")

    for verse, position, kind, note in ((1008017, 13, 'spelling', 'Spelling difference only.'),
                                        (1009021, 6, 'meaning', 'The text is read as shown above (Qere)')):
        expected = db.execute('SELECT ketiv_hebrew FROM original_word_variants v JOIN original_words w ON w.id = v.word_id '
                              'WHERE w.verse_id = ? AND w.word_position = ?', (verse, position)).fetchone()[0]
        card = read_word_card(app, db, verse, position)
        check(card['ketiv'] == expected and (card['ketivNote'] or '').startswith(note),
              f"{'Gen 8:17' if verse == 1008017 else 'Gen 9:21'}: Ketiv line, {kind} note ({card['ketiv']}, {card['ketivNote']})")

    manuscript_variants(app, db)

    card = read_word_card(app, db, 12019037, 7)
    check(len(card['subwords']) == 2 and len(card['pieces']) == 4,
          f"2Ki 19:37 #08: two written words, each a group of pieces ({card['subwords']}, {len(card['pieces'])} pieces)")

    card = read_word_card(app, db, 13027012, 5)
    surface = word_surface(db, 13027012, 5)
    expected = [piece for subword in surface.replace('\\׀', '').split('/ /') for piece in subword.split('/')]
    check([x['hebrew'] for x in card['pieces']] == expected and [x['role'] for x in card['pieces']] == ['Prefix', 'Word', 'Word']
          and len(card['subwords']) == 2,
          f"1Ch 27:12 #06: paseq row aligns, pieces correct ({[(x['hebrew'], x['role']) for x in card['pieces']]})")

    words_2_4 = db.execute("SELECT word_position FROM original_words WHERE verse_id = 27002004 ORDER BY 1").fetchall()
    labels = [read_word_card(app, db, 27002004, w, tier2=False)['aramaic'] for (w,) in words_2_4]
    check(labels[:4] == [False] * 4 and all(labels[4:]), f"Dan 2:4: no Aramaic label on words 1-4, label on the rest ({labels})")

    verb = db.execute("SELECT word_position FROM original_words WHERE verse_id = 27003001 AND morph_code GLOB 'AV[qh]*' "
                      "ORDER BY 1").fetchone()[0]
    card = read_word_card(app, db, 27003001, verb)
    lines = card['plainLines'] + [l for x in card['pieces'] for l in x['lines']]
    check(card['aramaic'] and any(l.startswith(('Peal - ', 'Haphel - ')) for l in lines),
          f"Dan 3:1: Aramaic label, Aramaic stem wording ({card['aramaic']}, {lines[:3]})")

    card = read_word_card(app, db, 19044014, 5)
    check([(x['role'], x['gloss']) for x in card['pieces']] == [('Prefix', '“among the”'), ('Word', '“peoples”')] and has_lines(card),
          f"Psa 44:14 #06: the upstream V row renders ({card['pieces']})")

    card = read_word_card(app, db, 1001001, 1)
    check(not card['pieces'] and card['plainLines'], f"one-piece word (Gen 1:1 #02): Greek-style lines, no piece blocks ({card['plainLines'][:2]})")

    card = read_word_card(app, db, 43001001, 0)
    check(not card['pieces'] and card['plainLines'] and card['lexiconButton'] and not card['aramaic'],
          f"John 1:1: Greek tier 2 unchanged ({card['plainLines'][:2]})")
    db.close()

    p.click('#global-settings-btn')
    credits = p.evaluate("document.querySelector('#global-settings-popover .settings-credits-list')?.textContent || ''")
    check('TEHMC' in credits and 'TEGMC' in credits, 'TEHMC credited next to TEGMC in Data & Attribution')
    return FAILURES


# ---------------------------------------------------------------- offline
LANGUAGE_DB_PATH = os.path.join(ROOT, 'data', 'language.db')
LANGUAGE_DB_SIZE = os.path.getsize(LANGUAGE_DB_PATH)
UNAVAILABLE_TEXT = 'downloads the first time Ember is online'
DOWNLOADING_TEXT = 'Downloading original-language data'

# Records every sql.js Database the app opens and its byte length, without any
# hook in the app: sql-wasm.js assigns the initSqlJs global, so an accessor on
# window can wrap what it returns. language.db is the only 64 MB one.
SQL_HOOK_JS = """
window.__emberTest = { databaseSizes: [], databases: [] };
(() => {
    let realInit;
    Object.defineProperty(window, 'initSqlJs', {
        configurable: true,
        set(value) { realInit = value; },
        get() {
            return realInit && (async (config) => {
                const SQL = await realInit(config);
                const Original = SQL.Database;
                SQL.Database = function (data) {
                    const database = new Original(data);
                    window.__emberTest.databaseSizes.push(data ? data.length : 0);
                    window.__emberTest.databases.push(database);
                    return database;
                };
                SQL.Database.prototype = Original.prototype;
                return SQL;
            });
        },
    });
})();
"""


def is_expected_network_line(message):
    """The browser's own line for a failed request under data/. JS can't suppress
    it, and these scenarios fail those requests on purpose."""
    return (message.text.startswith('Failed to load resource')
            and '/data/' in (message.location or {}).get('url', ''))


class OfflineRun:
    """One fresh profile: a new context with the Database hook and a request log."""

    def __init__(self, browser):
        self.ctx = browser.new_context(viewport={'width': 1600, 'height': 1000})
        self.ctx.add_init_script(SQL_HOOK_JS)
        self.requests = []
        self.lexicon_requests = []
        self.new_page()

    def new_page(self):
        page = self.ctx.new_page()
        page.on('request', lambda r: self.requests.append(r.url) if r.url.endswith('/data/language.db') else None)
        page.on('request', lambda r: self.lexicon_requests.append(r.url) if r.url.endswith('/data/lexicon-hebrew.db') else None)
        self.app = App(page, ignore=is_expected_network_line)
        self.page = page
        return page

    def boot(self):
        self.app.boot(SW_URL)

    def reload(self):
        self.page.reload()
        self.page.wait_for_selector('#loading.hidden', state='attached', timeout=60_000)
        self.page.wait_for_selector('#reader-pane-a .verse', timeout=30_000)

    def worker_ready(self):
        self.page.evaluate('navigator.serviceWorker.ready')
        self.page.wait_for_timeout(1500)

    def opfs_size(self):
        return self.page.evaluate("""async () => {
            const root = await navigator.storage.getDirectory();
            try { return (await (await root.getFileHandle('language.db')).getFile()).size; }
            catch (_) { return null; }
        }""")

    def wait_for_download(self, timeout_ms=30_000):
        """Polls the size, not existence: an empty file sits at the real name for
        the whole download."""
        waited = 0
        while self.opfs_size() != LANGUAGE_DB_SIZE and waited < timeout_ms:
            self.page.wait_for_timeout(100)
            waited += 100
        return self.opfs_size() == LANGUAGE_DB_SIZE

    def language_db_opened(self):
        return LANGUAGE_DB_SIZE in self.page.evaluate('window.__emberTest.databaseSizes')

    def language_text(self):
        return self.page.evaluate("document.getElementById('language-tab').textContent")

    def open_language(self, book, chapter, verse_id):
        self.app.navigate(book, chapter)
        self.app.select_verse(verse_id)
        self.page.click('#reference-tabs [data-tab="language"]')

    def verse_rows_render(self, book, chapter, verse_id, script):
        self.open_language(book, chapter, verse_id)
        self.page.wait_for_selector(f'.language-word-row .language-{script}', timeout=30_000)
        return True

    def wait_for_message(self, text):
        self.page.wait_for_function('(text) => document.getElementById("language-tab").textContent.includes(text)',
                                    arg=text, timeout=15_000)
        return True

    def check_no_errors(self, label):
        check(self.app.errors == [], f'{label}: no app console errors {self.app.errors[:3]}')

    def close(self):
        self.ctx.close()


def offline_happy_path(browser):
    run = OfflineRun(browser)
    p = run.page
    run.boot()
    run.worker_ready()
    check(run.wait_for_download(), 'language.db reaches OPFS without the Language tab being opened')
    check(len(run.requests) == 1, f'one request for language.db ({len(run.requests)})')
    check(not run.language_db_opened(), 'downloading did not open a Database')
    run.app.select_verse(1001001)
    p.wait_for_timeout(500)
    active = p.evaluate("document.querySelector('#reference-tabs .tab-btn.active').dataset.tab")
    check(active == 'info' and not run.language_db_opened(), f'a verse click on the {active} tab does not open it either')

    run.ctx.set_offline(True)
    run.reload()
    check(run.verse_rows_render(43, 1, 43001001, 'greek'), 'offline: John 1:1 renders Greek')
    check(run.verse_rows_render(1, 1, 1001001, 'hebrew'), 'offline: Genesis 1:1 renders Hebrew')
    run.app.navigate(19, 3)
    p.wait_for_function("document.querySelector('.verse.verse-title')?.textContent.includes('David')", timeout=15_000)
    check(True, 'offline: KJV Psalm 3 shows its gloss title')
    run.check_no_errors('happy path')
    run.close()


def retry_by_returning_to_tab(run):
    run.page.click('#reference-tabs [data-tab="info"]')
    run.page.click('#reference-tabs [data-tab="language"]')
    run.page.wait_for_selector('.language-word-row .language-greek', timeout=30_000)
    return True


def offline_never_downloaded_and_recovery(browser):
    run = OfflineRun(browser)
    p = run.page
    p.route('**/data/language.db', lambda route: route.abort())
    run.boot()
    run.worker_ready()
    p.wait_for_timeout(2500)  # the background attempt has failed by now
    run.open_language(43, 1, 43001001)
    check(run.wait_for_message(UNAVAILABLE_TEXT), 'never downloaded: the Language tab shows the message')
    run.app.navigate(19, 3)
    p.wait_for_timeout(500)
    verses = p.evaluate("document.querySelectorAll('#reader-pane-a .verse').length")
    title = p.evaluate("!!document.querySelector('.verse.verse-title')")
    check(verses == 8 and not title, f'never downloaded: Psalm 3 renders, no title row ({verses} verses)')
    run.check_no_errors('never downloaded')

    # A warm HTTP cache hides the plan/template seeders from an offline boot.
    # Cleared, they really fail, and still may only warn.
    run.ctx.set_offline(True)
    run.ctx.new_cdp_session(p).send('Network.clearBrowserCache')
    run.reload()
    p.wait_for_timeout(2500)
    run.open_language(43, 1, 43001001)
    check(run.wait_for_message(UNAVAILABLE_TEXT), 'offline boot, cold HTTP cache: message shows')
    run.check_no_errors('offline boot, cold HTTP cache')

    run.ctx.set_offline(False)
    p.wait_for_timeout(500)  # still blocked: this attempt fails too, and re-arms
    time_origin = p.evaluate('performance.timeOrigin')
    p.unroute('**/data/language.db')
    p.evaluate("window.dispatchEvent(new Event('online'))")
    check(run.wait_for_download(), 'recovery: the online path downloads the file')
    p.wait_for_selector('.language-word-row .language-greek', timeout=30_000)
    check(True, 'recovery: the tab showing the message renders by itself once the download starts')
    check(run.verse_rows_render(43, 1, 43001002, 'greek'), 'recovery: next selection renders')
    check(p.evaluate('performance.timeOrigin') == time_origin, 'recovery: no reload happened')
    run.check_no_errors('recovery')
    run.close()

    # Retry on next use, with no online event at all. Each waits out the background
    # attempt first, so only the retry under test can load the file afterwards.
    for label, retry in (('next selection', lambda run: run.verse_rows_render(43, 1, 43001002, 'greek')),
                         ('returning to the tab', retry_by_returning_to_tab)):
        run = OfflineRun(browser)
        p = run.page
        p.route('**/data/language.db', lambda route: route.abort())
        run.boot()
        p.wait_for_timeout(2500)
        run.open_language(43, 1, 43001001)
        check(run.wait_for_message(UNAVAILABLE_TEXT), f'retry on {label}: first use fails with the message')
        p.unroute('**/data/language.db')
        check(retry(run), f'retry on {label}: renders without an online event')
        run.check_no_errors(f'retry on {label}')
        run.close()

    # Offline at boot, online later
    run = OfflineRun(browser)
    p = run.page
    p.route('**/data/language.db', lambda route: route.abort())
    run.boot()
    run.worker_ready()
    p.unroute('**/data/language.db')
    run.ctx.set_offline(True)
    run.reload()
    p.wait_for_timeout(2500)
    check(run.opfs_size() != LANGUAGE_DB_SIZE, 'offline at boot: nothing downloaded yet')
    run.ctx.set_offline(False)
    p.wait_for_timeout(500)
    p.evaluate("window.dispatchEvent(new Event('online'))")  # navigator.onLine is unreliable across an offline reload here
    check(run.wait_for_download(), 'offline at boot: going online later downloads it without a reload')
    run.check_no_errors('offline at boot')
    run.close()


def offline_single_download(browser):
    held = []
    for order in ('tab first', 'background first'):
        held.clear()
        run = OfflineRun(browser)
        p = run.page
        p.route('**/data/language.db', lambda route: held.append(route))
        run.boot()
        if order == 'background first':
            p.wait_for_timeout(2500)
            check(len(held) == 1, 'background first: the background download has started')
        run.app.select_verse(1001001)
        p.click('#reference-tabs [data-tab="language"]')
        check(run.wait_for_message(DOWNLOADING_TEXT), f'{order}: the downloading state shows')
        p.wait_for_timeout(2500)  # past the background timer, whichever came first
        check(DOWNLOADING_TEXT in run.language_text(), f'{order}: still showing it while the download is held')
        held[0].continue_()
        p.wait_for_selector('.language-word-row .language-hebrew', timeout=30_000)
        check(len(run.requests) == 1, f'{order}: exactly one request for language.db ({len(run.requests)})')
        run.check_no_errors(order)
        run.close()


def offline_interrupted(browser):
    # A real interruption: tab closed mid-download
    run = OfflineRun(browser)
    p = run.page
    run.boot()
    cdp = run.ctx.new_cdp_session(p)
    cdp.send('Network.enable')
    cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 0,
                                                  'downloadThroughput': 4 * 1024 * 1024, 'uploadThroughput': 4 * 1024 * 1024})
    p.wait_for_timeout(4000)  # timer fired, a few MB in
    check(run.opfs_size() == 0, f'mid-download the real name is an empty file ({run.opfs_size()})')
    run.new_page()
    p.close()
    run.page.goto(SW_URL + 'manifest.json')
    run.page.wait_for_timeout(500)
    check(run.opfs_size() == 0, f'closing the tab leaves that empty file ({run.opfs_size()})')
    run.boot()
    check(run.wait_for_download(), 'tab closed mid-download: the next boot re-downloads it')
    check(run.verse_rows_render(43, 1, 43001001, 'greek'), 'tab closed mid-download: Language tab works')
    run.check_no_errors('tab closed')
    run.close()

    # The same empty-file hole in a translation, and an offline boot that can't repair it yet
    run = OfflineRun(browser)
    p = run.page
    run.boot()
    run.worker_ready()
    empty_asv = """async () => {
        const root = await navigator.storage.getDirectory();
        const translations = await root.getDirectoryHandle('translations');
        const writable = await (await translations.getFileHandle('asv.db')).createWritable();
        await writable.close();
    }"""
    asv_size = """async () => {
        const root = await navigator.storage.getDirectory();
        const translations = await root.getDirectoryHandle('translations');
        return (await (await translations.getFileHandle('asv.db')).getFile()).size;
    }"""
    asv_size_on_disk = os.path.getsize(os.path.join(ROOT, 'data', 'translations', 'asv.db'))
    p.evaluate(empty_asv)
    check(p.evaluate(asv_size) == 0, 'translation file emptied, as a tab closed mid-seed would leave it')
    # Offline, it can't be repaired yet: seeding logs its failure, and the app must still come up
    run.ctx.set_offline(True)
    run.ctx.new_cdp_session(p).send('Network.clearBrowserCache')
    run.reload()
    verses = p.evaluate("import('./js/db.js').then(db => db.getChapter(2, 43, 3).length)")
    check(verses == 36, f'empty translation file, offline: the app boots and falls back to KJV ({verses} verses in John 3)')
    run.app.errors.clear()  # the failed re-seed and open are real errors, reported on purpose
    run.ctx.set_offline(False)
    run.reload()
    check(p.evaluate(asv_size) == asv_size_on_disk, 'empty translation file: seeded again on the next boot')
    verses = p.evaluate("import('./js/db.js').then(db => db.getChapter(2, 43, 3).length)")
    check(verses == 36, f'empty translation file: ASV works after the repair ({verses} verses in John 3)')
    run.check_no_errors('empty translation')
    run.close()

    # An empty file already there, as older builds could leave behind
    run = OfflineRun(browser)
    p = run.page
    p.route('**/data/language.db', lambda route: route.abort())
    run.boot()
    p.unroute('**/data/language.db')
    p.evaluate("navigator.storage.getDirectory().then(root => root.getFileHandle('language.db', { create: true }))")
    run.reload()
    check(run.wait_for_download(), 'existing 0-byte file: replaced on the next boot')
    check(run.verse_rows_render(1, 1, 1001001, 'hebrew'), 'existing 0-byte file: Language tab works')
    run.check_no_errors('0-byte file')
    run.close()

    # A response that ends cleanly but short: only the header check can catch it
    with open(LANGUAGE_DB_PATH, 'rb') as fh:
        truncated = fh.read(1_000_000)
    run = OfflineRun(browser)
    p = run.page
    p.route('**/data/language.db', lambda route: route.fulfill(status=200, body=truncated, content_type='application/octet-stream'))
    run.boot()
    p.wait_for_timeout(3000)
    check(run.opfs_size() == len(truncated), f'truncated body: stored short ({run.opfs_size()})')
    run.open_language(43, 1, 43001001)
    check(run.wait_for_message(UNAVAILABLE_TEXT), 'truncated body: treated as unavailable, not opened')
    check(not run.language_db_opened(), 'truncated body: no Database made from it')
    p.unroute('**/data/language.db')
    run.reload()
    check(run.wait_for_download(), 'truncated file: replaced on the next boot')
    check(run.verse_rows_render(43, 1, 43001001, 'greek'), 'truncated file: Language tab works')
    run.check_no_errors('truncated body')
    run.close()


def offline_tab_switch(browser):
    run = OfflineRun(browser)
    p = run.page
    run.boot()
    run.wait_for_download()
    run.app.select_verse(1001001)
    p.wait_for_timeout(300)
    check(not run.language_db_opened() and run.language_text() == '', 'selecting on Info leaves the Language tab unrendered')
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row .language-hebrew', timeout=30_000)
    check(run.language_db_opened(), 'switching to the tab renders the selected verse with no second click')
    p.locator('.language-word-row').first.click()
    p.wait_for_selector('.language-word-card')
    p.click('#reference-tabs [data-tab="info"]')
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_timeout(300)
    check(p.locator('.language-word-card').count() == 1, 'an open word card survives switching away and back')

    p.click('#reference-tabs [data-tab="info"]')
    run.app.select_verse(1001002)
    p.wait_for_timeout(200)
    check(p.locator('.language-word-row').count() == 0, 'a selection made while hidden clears the old rows')
    p.click('#reader-pane-a .pane-content', position={'x': 5, 'y': 5})
    p.wait_for_timeout(200)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_timeout(300)
    check('Select a verse' in run.language_text(), 'clearing the selection while hidden shows the empty state, not a stale verse')
    run.check_no_errors('tab switch')
    run.close()


def passes_header_check(path):
    """db.js:isCompleteSqliteFile's real branch: page size x page count is the file size,
    and the page count is valid (version-valid-for equals the change counter)."""
    with open(path, 'rb') as fh:
        header = fh.read(100)
    page_size = struct.unpack('>H', header[16:18])[0]
    page_count, change_counter, valid_for = (struct.unpack('>I', header[o:o + 4])[0] for o in (28, 24, 92))
    return change_counter == valid_for and page_size * page_count == os.path.getsize(path)


def scenario_offline(browser):
    """Offline_Language_And_Stress_Test_Spec Item 1d. Each part needs its own
    fresh profile, so this takes the browser rather than one booted app."""
    for path in (LANGUAGE_DB_PATH, LEXICON_DB_PATH):
        check(passes_header_check(path),
              f'shipped {os.path.basename(path)} passes the real header check, not the "unverifiable" branch')
    offline_happy_path(browser)
    offline_never_downloaded_and_recovery(browser)
    offline_single_download(browser)
    offline_interrupted(browser)
    offline_tab_switch(browser)
    return FAILURES


# ---------------------------------------------------------------- lexicon
LEXICON_DB_PATH = os.path.join(ROOT, 'data', 'lexicon-hebrew.db')
LEXICON_DB_SIZE = os.path.getsize(LEXICON_DB_PATH)
LEXICON_UNAVAILABLE_TEXT = 'The Hebrew lexicon downloads the first time Ember is online'
LEXICON_LINK = '.language-card-tier2 > .language-card-lexicon-btn'

# Reads one word card member's Hebrew tier 3 into plain data.
READ_LEXICON_JS = """(member) => {
    const text = (el) => el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
    const tier3 = member.querySelector('.language-card-lexicon');
    const strongs = tier3 && tier3.querySelector('.language-lexicon-strongs');
    const bdb = tier3 && tier3.querySelector('.language-lexicon-bdb');
    const field = (label) => {
        const f = strongs && [...strongs.querySelectorAll('.language-detail-field')]
            .find(f => text(f.querySelector('.language-detail-label')) === label);
        return f ? text(f.querySelector('.language-detail-value')) : null;
    };
    const entries = bdb ? [...bdb.querySelectorAll(':scope > .language-lexicon-bdb-entry')] : [];
    return {
        links: [...member.querySelectorAll('.language-card-tier2 > .language-card-lexicon-btn')].map(text),
        message: tier3 && !strongs ? text(tier3) : null,
        headword: text(strongs && strongs.querySelector('.language-lexicon-headword')),
        strongsAramaic: !!(strongs && strongs.querySelector(':scope > .language-card-language')),
        meaning: field('Meaning'),
        kjv: field('KJV translates as'),
        intro: bdb ? [...bdb.querySelectorAll(':scope > .language-lexicon-quiet')].map(text) : [],
        entries: entries.map(e => ({
            id: e.dataset.bdbId,
            text: text(e.querySelector('.language-detail-lexicon')),
            aramaic: !!e.querySelector(':scope > .language-card-language'),
            abridged: !!e.querySelector(':scope > .language-lexicon-quiet'),
            topSenses: [...e.querySelectorAll('.language-detail-lexicon > .language-lexicon-sense > .language-lexicon-sense-label')].map(text),
        })),
        collapsed: bdb ? [...bdb.querySelectorAll('.language-lexicon-entry-btn')].map(b => ({ text: text(b), open: b.classList.contains('open') })) : [],
        placeholders: tier3 ? [...tier3.querySelectorAll('.language-lexicon-placeholder')].map(text) : [],
        tier2Lines: member.querySelectorAll('.language-card-tier2 .language-morph-decode-line').length,
    };
}"""

LEXICON_SETTLED_JS = """() => { const t = document.querySelector('.language-card-lexicon');
    return !!t && !t.dataset.loading; }"""


def open_tier2(app, db, verse_id, word_position):
    """Open one word's card and its tier 2; returns a locator for that member."""
    p = app.page
    app.navigate(verse_id // 1_000_000, verse_id // 1000 % 1000)
    app.select_verse(verse_id)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row', timeout=60_000)
    surface = word_surface(db, verse_id, word_position)
    p.locator('.language-word-row', has_text=surface).first.click()
    p.wait_for_selector('.language-word-card')
    member = p.locator('.language-card-member').filter(has=p.locator('.language-card-original', has_text=surface)).first
    member.locator('.language-card-more-btn').click()
    p.wait_for_selector('.language-card-tier2')
    return member


def open_lexicon(app, db, verse_id, word_position, link=0):
    """Open one word's Hebrew Lexicon and read it once it has loaded (or failed)."""
    member = open_tier2(app, db, verse_id, word_position)
    member.locator(LEXICON_LINK).nth(link).click()
    app.page.wait_for_function(LEXICON_SETTLED_JS, timeout=60_000)
    app.page.wait_for_timeout(100)
    return member, member.evaluate(READ_LEXICON_JS)


def lexicon_words(app, db, lexicon):
    """Item 8's table, word by word, against the live app."""
    p = app.page
    strongs_headword = lambda base: lexicon.execute(
        'SELECT headword FROM lexicon_strongs_hebrew WHERE strongs_base = ?', (base,)).fetchone()[0]

    member, card = open_lexicon(app, db, 1001001, 1)  # Gen 1:1 #02 בָּרָא, H1254A
    check(card['links'] == ['Hide Lexicon'], f"Gen 1:1 #02: one Lexicon link ({card['links']})")
    check('create' in (card['meaning'] or ''), "Gen 1:1 #02: Strong's meaning shows \"create\"")
    check(any('covers 2 entries' in line for line in card['intro']), 'Gen 1:1 #02: the "covers 2 entries" line shows')
    check(len(card['entries']) == 1 and 'shape' in card['entries'][0]['text'] and 'create' in card['entries'][0]['text'],
          'Gen 1:1 #02: "shape, create" is open')
    check(len(card['collapsed']) == 1 and 'be fat' in card['collapsed'][0]['text'] and not card['collapsed'][0]['open'],
          f"Gen 1:1 #02: \"be fat\" collapsed below it ({card['collapsed']})")
    member.locator('.language-lexicon-entry-btn').click()
    p.wait_for_timeout(300)
    card = member.evaluate(READ_LEXICON_JS)
    check(len(card['entries']) == 2 and 'be fat' in card['entries'][1]['text'] and card['collapsed'][0]['open'],
          'Gen 1:1 #02: tapping "be fat" expands it in place')

    member, card = open_lexicon(app, db, 1001002, 8)  # Gen 1:2 #09 וְרוּחַ, H7307G
    check(card['links'] == ['Hide Lexicon'] and card['headword'] == strongs_headword(7307),
          f"Gen 1:2 #09: one link, for the root רוּחַ, not the ו prefix ({card['links']}, {card['headword']})")
    check(card['entries'] and card['entries'][0]['topSenses'] == [str(n) for n in range(1, 10)],
          f"Gen 1:2 #09: BDB senses 1–9 render as an outline ({card['entries'][0]['topSenses'] if card['entries'] else None})")
    check(card['entries'] and card['entries'][0]['abridged'], 'Gen 1:2 #09: a base entry shows the abridged note')

    member, card = open_lexicon(app, db, 2034006, 13)  # Exo 34:6 #14 חֶסֶד, H2617A
    check(card['entries'] and 'goodness' in card['entries'][0]['text'] and 'kindness' in card['entries'][0]['text'],
          'Exo 34:6 #14: "goodness, kindness" entry first')
    check(len(card['collapsed']) == 1 and 'shame' in card['collapsed'][0]['text'] and not card['collapsed'][0]['open'],
          'Exo 34:6 #14: "shame, reproach" second and collapsed')

    member, card = open_lexicon(app, db, 1001001, 6)  # Gen 1:1 #07 הָאָרֶץ, H0776G
    check(card['headword'] == strongs_headword(776), f"Gen 1:1 #07: Lexicon for אֶרֶץ ({card['headword']})")
    check(bool(card['kjv']), 'Gen 1:1 #07: KJV renderings labeled "KJV translates as"')

    member, card = open_lexicon(app, db, 27002018, 4)  # Dan 2:18 #05 אֱלָהּ, H0426
    check(card['strongsAramaic'] and card['entries'] and card['entries'][0]['aramaic'],
          'Dan 2:18 #05: Aramaic label in both sections')
    check(card['entries'] and 'god, God' in card['entries'][0]['text'], 'Dan 2:18 #05: the Aramaic BDB entry ("god, God")')

    member = open_tier2(app, db, 1001011, 15)  # Gen 1:11 #16 בּוֹ, root H9033
    check(member.locator(LEXICON_LINK).count() == 0, 'Gen 1:11 #16: no Lexicon link for a STEP-only root')

    member, card = open_lexicon(app, db, 2013004, 4)  # Exo 13:4 #05 הָאָבִיב, H0024
    statuses = {r[0] for r in lexicon.execute(
        'SELECT b.status FROM lexicon_hebrew_links l JOIN lexicon_bdb_hebrew b USING (bdb_id) WHERE l.strongs_base = 24')}
    check(statuses == {'done'} and card['entries'] and not any(e['abridged'] for e in card['entries']),
          f'Exo 13:4 #05: a done entry has no abridged note ({statuses})')

    member, card = open_lexicon(app, db, 2032020, 11)  # Exo 32:20 #12 וַיִּזֶר, H2219
    check(card['placeholders'] == ['[Arabic]', '[Syriac]', '[Ethiopic]'],
          f"untyped foreign words show in brackets ({card['placeholders']})")
    neh = db.execute("SELECT verse_id, word_position FROM original_words WHERE strongs_number GLOB 'H0114*' "
                     "ORDER BY verse_id, word_position LIMIT 1").fetchone()
    member, card = open_lexicon(app, db, *neh)  # Neh 7:61 אַדּוֹן, H0114: "id. [a.be.ad]"
    target = lexicon.execute("SELECT headword FROM lexicon_bdb_hebrew WHERE bdb_id = 'a.be.ad'").fetchone()[0]
    check(card['entries'] and 'a.be.ad' not in card['entries'][0]['text'] and f'[{target}]' in card['entries'][0]['text'],
          f"an entry pointing at another by id shows that entry's headword ({card['entries'][0]['text'] if card['entries'] else None})")
    member = open_tier2(app, db, 1030011, 2)  # Gen 30:11 #03 בָּא//גָד: two roots
    links = member.locator(LEXICON_LINK).all_inner_texts()
    check(links == ['Show Lexicon (H0935G)', 'Show Lexicon (H1409)'], f'a two-root row gets a link per root ({links})')

    app.navigate(43, 1)
    app.select_verse(43001001)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row .language-greek', timeout=30_000)
    p.locator('.language-word-row').first.click()
    p.locator('.language-card-more-btn').first.click()
    p.locator('.language-card-lexicon-btn').first.click()
    p.wait_for_selector('.language-card-lexicon .language-detail-lexicon')
    greek = p.evaluate("""() => ({ heading: document.querySelector('.language-card-lexicon .language-detail-heading').textContent,
        body: document.querySelector('.language-card-lexicon .language-detail-lexicon').textContent.length,
        hebrew: !!document.querySelector('.language-lexicon-strongs') })""")
    check(greek['heading'] == 'Lexicon (TBESG)' and greek['body'] > 100 and not greek['hebrew'], 'John 1:1: Greek tier 3 unchanged (TBESG)')


def lexicon_rendering(app, lexicon):
    """The renderer against hostile markup (Item 8's safety check) and against every stored string."""
    p = app.page
    res = p.evaluate("""async () => {
        const m = await import('./js/hebrew-lexicon.js');
        const host = document.createElement('div');
        host.appendChild(m.renderHebrewLexiconMarkup('<script>window.__lexiconRan = 1</script><w>x</w>'));
        host.appendChild(m.renderHebrewLexiconMarkup(
            '<w onclick="window.__lexiconRan = 2">x</w><img src="x" onerror="window.__lexiconRan = 3"/>'
            + '<script xmlns="http://www.w3.org/1999/xhtml">window.__lexiconRan = 4</script><ref r="Gen.1.1" onmouseover="1">Gn 1:1</ref>'));
        document.body.appendChild(host);
        await new Promise(r => setTimeout(r, 100));
        const out = { blocked: host.querySelectorAll('script, img, iframe, a, object').length,
            attributes: [...new Set([...host.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.name)))],
            ran: window.__lexiconRan ?? null };
        host.remove();
        return out;
    }""")
    check(res['blocked'] == 0 and res['ran'] is None and not any(a.startswith('on') for a in res['attributes']),
          f"renderHebrewLexiconMarkup: no script element, no event handlers ({res})")

    strings = [row[0] for table, columns in (
        ('lexicon_strongs_hebrew', ('source_markup', 'meaning_markup', 'usage_markup', 'note_markup')),
        ('lexicon_bdb_hebrew', ('body_markup',))) for column in columns
        for row in lexicon.execute(f"SELECT {column} FROM {table} WHERE {column} IS NOT NULL AND {column} != ''")]
    res = p.evaluate("""async (strings) => {
        const m = await import('./js/hebrew-lexicon.js');
        const parser = new DOMParser();
        const warnings = [];
        const warn = console.warn;
        console.warn = (...args) => warnings.push(String(args[0]));
        let unparsed = 0;
        try {
            for (const s of strings) {
                if (parser.parseFromString(`<root>${s}</root>`, 'application/xml').querySelector('parsererror')) unparsed++;
                m.renderHebrewLexiconMarkup(s);
            }
        } finally { console.warn = warn; }
        return { unparsed, warnings };
    }""", strings)
    check(res['unparsed'] == 0 and res['warnings'] == [],
          f"every stored markup string ({len(strings)}) parses and renders from the allowed list ({res['unparsed']}, {res['warnings'][:3]})")


def lexicon_glide(app, db, verse_id=1001001, word_position=2, label='Hebrew (Gen 1:1 #03 אֱלֹהִים)'):
    """A Lexicon opened at the panel's bottom edge comes into view without the tapped link leaving the top."""
    p = app.page
    member = open_tier2(app, db, verse_id, word_position)
    p.evaluate("""() => { const t = document.getElementById('language-tab');
        const link = document.querySelector('.language-card-tier2 > .language-card-lexicon-btn');
        t.scrollTop += link.getBoundingClientRect().bottom - (t.getBoundingClientRect().bottom - 30); }""")
    p.wait_for_timeout(200)
    member.locator(LEXICON_LINK).click()
    p.wait_for_function(LEXICON_SETTLED_JS, timeout=60_000)
    p.wait_for_timeout(1200)
    seen = p.evaluate("""() => { const t = document.getElementById('language-tab').getBoundingClientRect();
        const link = document.querySelector('.language-card-tier2 > .language-card-lexicon-btn').getBoundingClientRect();
        const tier3 = document.querySelector('.language-card-lexicon').getBoundingClientRect();
        return { linkVisible: link.top >= t.top && link.bottom <= t.bottom,
                 tier3Shown: Math.round(Math.min(tier3.bottom, t.bottom) - tier3.top) }; }""")
    check(seen['linkVisible'] and seen['tier3Shown'] > 200,
          f"{label}: a Lexicon opened at the panel's edge glides into view, the link still showing ({seen})")


READ_OCCURRENCES_JS = """() => {
    const text = el => el.textContent.replace(/\\s+/g, ' ').trim();
    const link = document.querySelector('.language-occurrences-btn');
    return {
        link: link ? text(link) : null,
        books: [...document.querySelectorAll('.language-occurrences-book')].map(b => [text(b.firstChild), text(b.lastChild)]),
        rows: [...document.querySelectorAll('.language-occurrence')].map(r => ({
            verseId: Number(r.dataset.verseId),
            times: r.querySelector('.language-occurrence-times') ? Number(text(r.querySelector('.language-occurrence-times')).slice(1)) : 1,
            current: r.classList.contains('current') && !!r.querySelector('.language-occurrence-here'),
            gloss: text(r.querySelector('.language-occurrence-gloss')) })),
        more: document.querySelector('.language-occurrences-more') ? text(document.querySelector('.language-occurrences-more')) : null,
    };
}"""


def open_occurrences(app, db, verse_id, word_position):
    member = open_tier2(app, db, verse_id, word_position)
    member.locator('.language-occurrences-btn').click()
    app.page.wait_for_selector('.language-occurrences-book', timeout=30_000)
    app.page.wait_for_timeout(100)
    return member


def open_occurrence_book(app, name):
    p = app.page
    p.locator('.language-occurrences-book', has=p.locator('span', has_text=name)).first.click()
    p.wait_for_selector('.language-occurrence', timeout=30_000)
    p.wait_for_timeout(100)
    return p.evaluate(READ_OCCURRENCES_JS)


def language_occurrences(app, db):
    """All occurrences of a word: book counts from its STEP number, verses per book, taps that keep the card."""
    p = app.page
    book_names = {row[0]: row[1] for row in sqlite3.connect(os.path.join(ROOT, 'data', 'core.db')).execute('SELECT id, name FROM books')}
    by_book = lambda strongs: db.execute(
        'SELECT verse_id / 1000000, COUNT(*) FROM original_words WHERE strongs_number = ? GROUP BY 1 ORDER BY 1', (strongs,)).fetchall()

    open_occurrences(app, db, 1001001, 1)  # Gen 1:1 #02 בָּרָא, H1254A
    expected = by_book('H1254A')
    total = sum(count for _, count in expected)
    seen = p.evaluate(READ_OCCURRENCES_JS)
    check(seen['link'] == f'All occurrences ({total:,})', f"H1254A: the link counts every occurrence of the sense ({seen['link']}, {total})")
    check(seen['books'] == [[book_names[book], f'{count:,}'] for book, count in expected], f"H1254A: books in canon order with counts ({seen['books'][:3]}…)")
    seen = open_occurrence_book(app, 'Genesis')
    genesis = [row[0] for row in db.execute(
        "SELECT DISTINCT verse_id FROM original_words WHERE strongs_number = 'H1254A' AND verse_id < 2000000 ORDER BY verse_id")]
    check([row['verseId'] for row in seen['rows']] == genesis, f"H1254A: Genesis lists its verses in order ({len(seen['rows'])} rows)")
    check(sum(row['times'] for row in seen['rows']) == dict(expected)[1], 'H1254A: the ×N marks add up to the book count')
    check([row['verseId'] for row in seen['rows'] if row['current']] == [1001001], 'H1254A: this verse is marked, once')
    check(all('/' not in row['gloss'] for row in seen['rows']) and seen['rows'][1]['gloss'] == 'and he created',
          f"glosses read without STEP's '/' marks ({seen['rows'][1]['gloss']!r})")

    res = p.evaluate(REFERENCE_TAP_JS.replace('.language-lexicon-ref', '.language-occurrence').replace('element.dataset.ref === osisRef', 'element.dataset.verseId === osisRef'), '1001021')
    check(res is not None and res['shownVerse'] == 1001021 and res['selectedInPane'] == 1 and res['languageTabActive']
          and p.evaluate("!!document.querySelector('.language-occurrences .language-occurrence')"),
          f'tapping Genesis 1:21 shows it in the reader and leaves the card, its list and the selection as they were ({res})')

    open_occurrences(app, db, 1001001, 2)  # Gen 1:1 #03 אֱלֹהִים, H0430G
    total = sum(count for _, count in by_book('H0430G'))
    seen = p.evaluate(READ_OCCURRENCES_JS)
    check(seen['link'] == f'All occurrences ({total:,})', f"H0430G counts only its own sense, not H0430J ({seen['link']})")

    open_occurrences(app, db, 43001001, 3)  # John 1:1 #04 ὁ, G3588: Luke has 1,033 verses
    seen = open_occurrence_book(app, 'Luke')
    luke_verses = db.execute("SELECT COUNT(DISTINCT verse_id) FROM original_words WHERE strongs_number = 'G3588' AND verse_id / 1000000 = 42").fetchone()[0]
    check(len(seen['rows']) == 100 and seen['more'] == f'Show 100 more of {luke_verses:,} verses', f"a long book shows 100 verses at a time ({len(seen['rows'])}, {seen['more']})")
    p.click('.language-occurrences-more'); p.wait_for_timeout(200)
    check(len(p.evaluate(READ_OCCURRENCES_JS)['rows']) == 200, 'Show more adds the next 100')
    ms = p.evaluate("""async () => { const t = performance.now();
        document.querySelector('.language-occurrences-book:not(.open)').click();
        await new Promise(r => setTimeout(r, 0)); return performance.now() - t; }""")
    print(f'  (a tap with 200 rows open: {ms:.0f} ms)')

    p.locator('.language-word-row.active').click(); p.wait_for_timeout(200)  # close the card
    p.locator('.language-word-row', has_text=word_surface(db, 43001001, 3)).first.click()
    p.wait_for_selector('.language-word-card')
    check(p.evaluate("!document.querySelector('.language-occurrences')"), 'closing the card closes its occurrences')


REFERENCE_TAP_JS = """(osisRef) => {
    const ref = [...document.querySelectorAll('.language-lexicon-ref')].find(element => element.dataset.ref === osisRef);
    if (!ref) return null;
    ref.click();
    const shown = document.querySelector('#reader-pane-a .verse.shown');
    return { shownVerse: shown ? Number(shown.dataset.verseId) : null,
             location: document.querySelector('#reader-pane-a .pane-location').textContent,
             entryStillOpen: !!document.querySelector('#language-tab .language-lexicon-bdb-entry'),
             languageTabActive: document.getElementById('language-tab').classList.contains('active'),
             selectedInPane: document.querySelectorAll('#reader-pane-a .verse.selected').length };
}"""


def lexicon_references(app, db):
    """A BDB scripture reference opens its verse, renumbered from Hebrew, and leaves the entry open."""
    p = app.page
    res = p.evaluate("""async () => {
        const m = await import('./js/hebrew-lexicon.js');
        const cases = [['Exod.9.31', 'Ex 9:31'], ['Ps.56.9', 'ψ 56:9'], ['Joel.4.6', 'Jo 4:6'], ['Mal.3.21', 'Mal 3:21'],
            ['Ps.7.1', 'ψ 7:1'], ['Ps.33', 'ψ 33'], ['iKgs.7.30', '1 K 7:30'], ['Luke.1.42', 'Luke 1:42'],
            ['Lev.26.89', 'Lv 26:89'], ['Ezek.28.13', 'Ez 18:13'], ['', 'Ne 8:4'], ['Jos.21.23', 'Jb 21:23']];
        return cases.map(([r, printed]) => { const t = m.resolveBdbReference(r, printed);
            return t ? (t.verseId ?? `${t.book}:${t.chapter}`) : null; });
    }""")
    expected = [2009031, 19056008, 29003006, 39004003, 19007000, '19:33', 11007030, 42001042, None, None, None, None]
    check(res == expected, f'BDB references resolve, renumbered from Hebrew, and doubtful ones stay plain ({res})')

    member, card = open_lexicon(app, db, 2013004, 4)  # Exo 13:4 #05 הָאָבִיב: Ex 9:31, numbered alike
    p.wait_for_timeout(200)
    res = p.evaluate(REFERENCE_TAP_JS, 'Exod.13.4')  # the verse being studied, already selected
    check(res is not None and res['shownVerse'] is None and res['selectedInPane'] == 1,
          f'tapping the selected verse\'s own reference adds no outline over the selection ({res})')
    res = p.evaluate(REFERENCE_TAP_JS, 'Exod.9.31')
    check(res is not None and res['shownVerse'] == 2009031 and res['location'] == 'Exodus 9',
          f'tapping "Ex 9:31" opens Exodus 9 at verse 31 ({res})')
    check(res is not None and res['entryStillOpen'] and res['languageTabActive'] and res['selectedInPane'] == 0,
          'the tap selects nothing: the Language tab and its BDB entry stay as they were')
    p.click('.language-verse-heading')
    p.wait_for_timeout(200)
    back = p.evaluate("""() => ({
        location: document.querySelector('#reader-pane-a .pane-location').textContent,
        selected: [...document.querySelectorAll('#reader-pane-a .verse.selected')].map(v => Number(v.dataset.verseId)),
        inView: (() => { const v = document.querySelector('#reader-pane-a [data-verse-id="2013004"]').getBoundingClientRect();
                         const c = document.querySelector('#reader-pane-a .pane-content').getBoundingClientRect();
                         return v.top >= c.top && v.bottom <= c.bottom; })(),
        entryStillOpen: !!document.querySelector('#language-tab .language-lexicon-bdb-entry'),
        languageTabActive: document.getElementById('language-tab').classList.contains('active') })""")
    check(back == {'location': 'Exodus 13', 'selected': [2013004], 'inView': True, 'entryStillOpen': True, 'languageTabActive': True},
          f'the verse heading leads back: Exodus 13:4 in view and still outlined as selected, the entry still open ({back})')

    member, card = open_lexicon(app, db, 1005001, 1)  # Gen 5:1 #02 סֵפֶר: its second entry's ψ 56:9 is English Ps 56:8
    member.locator('.language-lexicon-entry-btn').click()
    p.wait_for_timeout(300)
    res = p.evaluate(REFERENCE_TAP_JS, 'Ps.56.9')
    check(res is not None and res['shownVerse'] == 19056008 and res['location'] == 'Psalms 56',
          f'tapping "ψ 56:9" opens Psalm 56:8, its English number ({res})')
    plain = p.evaluate("[...document.querySelectorAll('#language-tab [data-ref]')].filter(e => e.tagName !== 'BUTTON').length")
    check(plain == 0, f'every reference in these entries is a link ({plain} plain)')

    # Selecting the verse mid-fade cancels the animation; the class must still come off.
    app.select_verse(19056008)
    p.wait_for_timeout(100)
    app.select_verse(19056009)
    p.wait_for_timeout(200)  # well inside a replayed 1.6 s fade
    shown = p.evaluate("document.querySelectorAll('#reader-pane-a .verse.shown').length")
    check(shown == 0, f'selecting a verse mid-fade leaves no outline to replay later ({shown})')


def greek_lexicon(app, db):
    """TBESG: outline markers become nested senses, New Testament references link, nothing is lost."""
    p = app.page
    res = p.evaluate("""async () => {
        const m = await import('./js/greek-lexicon.js');
        const cases = [['Mat.27.46', 'Mat.27:46;'], ['Heb.11.4; 12.24', 'Heb.11:4, 12:24'], ['Rom.15.5, 13, 33', 'Rom.15:5, 13, 33'],
            ['3Jn.11', 'III Jo 11'], ['Luk.4.34.', 'Luk.4:34.'], ['Mat.8.30-32', 'Mat.8:30-32'], ['Luke.20.37', 'Luk.20:37'],
            ['Deu.3.24', 'Deu.3:24'], ['Act.5.39', 'Act.5:39'], ['Jhn.2.28', 'Jhn.2:28'], ['Luk.1.5', 'Luk.1:6'], ['1Ma.11.33', '1Ma.11:33']];
        return cases.map(([attribute, label]) => m.resolveGreekReference(attribute, label)
            .map(part => part.target ? [part.text, part.target.book * 1000000 + part.target.chapter * 1000 + part.target.verse] : part.text));
    }""")
    expected = [[['Mat.27:46', 40027046], ';'], [['Heb.11:4', 58011004], ', ', ['12:24', 58012024]],
                [['Rom.15:5', 45015005], ', ', ['13', 45015013], ', ', ['33', 45015033]], [['III Jo 11', 64001011]],
                [['Luk.4:34', 42004034], '.'], [['Mat.8:30-32', 40008030]], [['Luk.20:37', 42020037]],
                ['Deu.3:24'], ['Act.5:39'], ['Jhn.2:28'], ['Luk.1:6'], ['1Ma.11:33']]
    check(res == expected, f'Greek references: New Testament verses link, one link per verse; the Septuagint, a differently numbered verse, '
          f'a missing verse and a mismatched label stay text ({[r for r, e in zip(res, expected) if r != e]})')

    res = p.evaluate("""async () => {
        const m = await import('./js/greek-lexicon.js');
        const host = document.createElement('div');
        host.appendChild(m.renderGreekLexiconMeaning(
            "<script>window.__greekRan = 1</script><img src=x onerror='window.__greekRan = 2'>&lt;b&gt;bold?&lt;/b&gt; "
            + "<ref='Mat.1.1' onclick='window.__greekRan = 3'>Mat.1:1</ref><a href=\\"javascript:void(0)\\" title='t'>era</a>"));
        document.body.appendChild(host);
        await new Promise(r => setTimeout(r, 100));
        const out = { elements: [...host.querySelectorAll('*')].map(e => e.tagName),
            attributes: [...new Set([...host.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.name)))],
            text: host.textContent, ran: window.__greekRan ?? null };
        host.remove();
        return out;
    }""")
    check(res['ran'] is None and not set(res['elements']) - {'DIV', 'BUTTON'} and not any(a.startswith('on') or a == 'href' for a in res['attributes'])
          and '<b>bold?</b>' in res['text'], f'hostile Greek markup: text only, no handlers, no live tags ({res})')

    entries = [(row[0], row[1]) for row in db.execute("SELECT strongs_number, meaning FROM step_lexicon_greek WHERE meaning IS NOT NULL AND meaning != ''")]
    res = p.evaluate("""async (entries) => {
        const m = await import('./js/greek-lexicon.js');
        // A stray "{" before a marker ends up after its label.
        const squash = text => text.replace(/\\s+/g, '').replace(/\\(with\\)/g, '(c)').replace(/[{}]/g, '');
        const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        const bad = { visible: [], lost: [], elements: 0 };
        for (const [strongs, meaning] of entries) {
            const host = document.createElement('div');
            host.appendChild(m.renderGreekLexiconMeaning(meaning));
            const text = host.textContent;
            if (/__|<date|<a |<ref|&gt;|&amp;|javascript:/.test(text) && bad.visible.length < 5) bad.visible.push(strongs);
            bad.elements += host.querySelectorAll('script, img, a, iframe, [href], [onclick], [onerror]').length;
            const source = decode(meaning.replace(/<\\/?[A-Za-z]+(?:\\s*=\\s*'[^']*'[^>]*?|\\s+[^>]*?)?\\s*\\/?>/g, '')).replace(/__/g, '').replace(/([A-Za-z])_(\\d)/g, '$1$2');
            if (squash(text) !== squash(source) && bad.lost.length < 5) bad.lost.push(strongs);
        }
        return bad;
    }""", entries)
    check(res == {'visible': [], 'lost': [], 'elements': 0},
          f"every Greek entry ({len(entries)}) renders with no markup or markers showing and no text lost ({res})")

    g2316 = p.evaluate("""async () => {
        const m = await import('./js/greek-lexicon.js');
        const host = document.createElement('div');
        host.appendChild(m.renderGreekLexiconMeaning(await (await import('./js/db.js')).getGreekLexiconEntry('G2316').then(e => e.meaning)));
        const labels = parent => [...parent.querySelectorAll(':scope > .language-lexicon-sense')].map(s => s.querySelector('.language-lexicon-sense-label').textContent);
        const second = host.querySelectorAll(':scope > .language-lexicon-sense')[1];
        return { top: labels(host), nested: labels(second.querySelector('.language-lexicon-sense-body')) };
    }""")
    check(g2316['top'] == ['1.', '2.'] and g2316['nested'][:2] == ['(a)', '(b)'], f'θεός: 1. and 2. at the top, (a) and (b) inside 2. ({g2316})')

    with_entry = next(strongs for strongs, meaning in entries if re.search(r'__\(b\)(?:(?!__).)*__\(with\)', meaning))
    labels = p.evaluate("""async (strongs) => {
        const m = await import('./js/greek-lexicon.js');
        const host = document.createElement('div');
        host.appendChild(m.renderGreekLexiconMeaning(await (await import('./js/db.js')).getGreekLexiconEntry(strongs).then(e => e.meaning)));
        return [...host.querySelectorAll('.language-lexicon-sense-label')].map(l => l.textContent);
    }""", with_entry)
    check('(c)' in labels and '(with)' not in labels, f'{with_entry}: "__(with)" after (b) reads "(c)" ({labels})')
    labels = p.evaluate("""async () => {
        const m = await import('./js/greek-lexicon.js');
        const host = document.createElement('div');
        host.appendChild(m.renderGreekLexiconMeaning(await (await import('./js/db.js')).getGreekLexiconEntry('G2106').then(e => e.meaning)));
        return [...host.querySelectorAll('.language-lexicon-sense-label')].map(l => l.textContent);
    }""")
    check(labels[-1] == '(c)', f'G2106: "(with)" after (b) and its α, β sub-points still reads "(c)" ({labels})')

    member = open_tier2(app, db, 43001001, 11)  # John 1:1 #12 θεόν, G2316
    member.locator(LEXICON_LINK).click()
    p.wait_for_selector('.language-card-lexicon .language-lexicon-sense')
    res = p.evaluate(REFERENCE_TAP_JS.replace('element.dataset.ref === osisRef', 'element.dataset.verseId === osisRef'), '40027046')
    check(res is not None and res['shownVerse'] == 40027046 and res['location'] == 'Matthew 27' and res['entryStillOpen'] is False
          and res['languageTabActive'] and p.evaluate("!!document.querySelector('.language-card-lexicon .language-lexicon-sense')"),
          f'tapping "Mat.27:46" in θεός opens Matthew 27:46 and leaves the Greek entry open ({res})')


def lexicon_loading(browser):
    """Item 4: opened on the first Lexicon tap, never at boot; exactly one download; friendly when missing."""
    run = OfflineRun(browser)
    p = run.page
    db = sqlite3.connect(f"file:{LANGUAGE_DB_PATH}?mode=ro", uri=True)
    held = []
    p.route('**/data/lexicon-hebrew.db', lambda route: held.append(route))
    run.boot()
    member = open_tier2(run.app, db, 1001001, 1)
    opened = lambda: p.evaluate('window.__emberTest.databaseSizes').count(LEXICON_DB_SIZE)
    check(opened() == 0, 'boot and tier 2 do not open the lexicon')
    member.locator(LEXICON_LINK).click()
    p.wait_for_timeout(150)
    check('Loading the Hebrew lexicon' in member.locator('.language-card-lexicon').inner_text(),
          'a first tap shows the loading line at once')
    for _ in range(2):
        member.locator(LEXICON_LINK).click()
        p.wait_for_timeout(100)
    p.wait_for_timeout(2500)  # past the background download's start
    check(len(held) == 1, f'quick taps plus the background download: one request ({len(held)})')
    for route in held:
        route.continue_()
    p.wait_for_function(LEXICON_SETTLED_JS, timeout=30_000)
    p.wait_for_selector('.language-lexicon-strongs', timeout=30_000)
    check(len(run.lexicon_requests) == 1 and opened() == 1,
          f'filled in after one download and one Database ({len(run.lexicon_requests)}, {opened()})')
    run.check_no_errors('lexicon single download')
    run.close()

    run = OfflineRun(browser)
    p = run.page
    p.route('**/data/lexicon-hebrew.db', lambda route: route.abort())
    run.boot()
    member, card = open_lexicon(run.app, db, 1001001, 1)
    check(LEXICON_UNAVAILABLE_TEXT in (card['message'] or ''), f"never downloaded and blocked: friendly message ({card['message']})")
    check(card['tier2Lines'] > 0, 'never downloaded: tiers 1–2 still work')
    p.unroute('**/data/lexicon-hebrew.db')
    member.locator(LEXICON_LINK).click()
    p.wait_for_timeout(100)
    member.locator(LEXICON_LINK).click()
    p.wait_for_selector('.language-lexicon-strongs', timeout=30_000)
    check(True, 'the next tap recovers once the file can be fetched')
    run.check_no_errors('lexicon never downloaded')
    run.close()

    run = OfflineRun(browser)
    p = run.page
    p.route('**/data/lexicon-hebrew.db', lambda route: route.abort())
    run.boot()
    run.wait_for_download(60_000)  # language.db, so the Language tab works offline
    run.ctx.set_offline(True)
    member, card = open_lexicon(run.app, db, 1001001, 1)
    check(LEXICON_UNAVAILABLE_TEXT in (card['message'] or ''), 'offline, never downloaded: friendly message')
    p.unroute('**/data/lexicon-hebrew.db')
    run.ctx.set_offline(False)
    p.wait_for_selector('.language-lexicon-strongs', timeout=30_000)
    check(True, 'coming back online fills it in without a tap')
    run.check_no_errors('lexicon offline')
    run.close()
    db.close()


def scenario_lexicon(browser):
    """Hebrew_Lexicon_Spec Item 8. The word checks share one profile; loading needs fresh ones."""
    check(passes_header_check(LEXICON_DB_PATH), 'shipped lexicon-hebrew.db passes the real header check')
    ctx = browser.new_context(viewport={'width': 1600, 'height': 1000})
    app = App(ctx.new_page())
    app.boot()
    db = sqlite3.connect(f"file:{LANGUAGE_DB_PATH}?mode=ro", uri=True)
    lexicon = sqlite3.connect(f"file:{LEXICON_DB_PATH}?mode=ro", uri=True)
    lexicon_words(app, db, lexicon)
    lexicon_rendering(app, lexicon)
    lexicon_glide(app, db)
    lexicon_glide(app, db, 43001001, 11, 'Greek (John 1:1 #12 θεόν)')
    lexicon_references(app, db)
    language_occurrences(app, db)
    greek_lexicon(app, db)
    check(app.errors == [], f'lexicon words: no console errors {app.errors[:3]}')
    ctx.close()
    db.close()
    lexicon.close()
    lexicon_loading(browser)
    return FAILURES


# ---------------------------------------------------------------- storage
INTEGRITY_JS = "window.__emberTest.databases[0].exec('PRAGMA integrity_check')[0].values[0][0]"
SEARCH_NOTES_JS = "async (word) => (await import('./js/db.js')).search(word, 1).notes.map(n => n.id)"


def storage_search_index(browser):
    """updateNote() must take a note's old words out of the index, and a database
    from before that was true gets repaired once."""
    run = OfflineRun(browser)
    p = run.page
    run.boot()
    note_id = p.evaluate("""async () => {
        const db = await import('./js/db.js');
        const noteId = db.saveNote('zzoldword kept', [{ verseStart: 1001001 }], [], null);
        db.updateNote(noteId, 'zznewword kept');
        return noteId;
    }""")
    check(p.evaluate(SEARCH_NOTES_JS, 'zzoldword') == [], 'edited note: its old word no longer finds it')
    check(p.evaluate(SEARCH_NOTES_JS, 'zznewword') == [note_id], 'edited note: its new word finds it')
    check(p.evaluate(SEARCH_NOTES_JS, 'kept') == [note_id], 'edited note: a word in both versions finds it')
    check(p.evaluate(INTEGRITY_JS) == 'ok', 'integrity_check is ok after an edit')
    p.evaluate("""async (noteId) => {
        const db = await import('./js/db.js');
        for (let i = 0; i < 20; i++) db.updateNote(noteId, `zznewword kept zzautosave${i}`);
        db.deleteNote(noteId);
    }""", note_id)
    check(p.evaluate(INTEGRITY_JS) == 'ok', 'integrity_check is ok after 20 more edits and a delete')

    # Recreate what the old statement order left behind, as an older install or backup has it
    note_id = p.evaluate("""async () => {
        const db = await import('./js/db.js');
        const core = window.__emberTest.databases[0];
        const noteId = db.saveNote('zzlegacyold kept', [{ verseStart: 1001001 }], [], null);
        core.run("UPDATE notes SET body = 'zzlegacynew kept' WHERE id = ?", [noteId]);
        core.run('DELETE FROM notes_fts WHERE rowid = ?', [noteId]);
        core.run("INSERT INTO notes_fts(rowid, body) VALUES (?, 'zzlegacynew kept')", [noteId]);
        core.run("DELETE FROM app_state WHERE key = 'notes_fts_repaired'");
        db.setState('force_a_save', '1');
        return noteId;
    }""")
    check('malformed' in p.evaluate(INTEGRITY_JS), 'old-order edit reproduces the malformed index')
    p.wait_for_timeout(500)
    run.reload()
    check(p.evaluate(INTEGRITY_JS) == 'ok', 'repair: integrity_check is ok after the next boot')
    check(p.evaluate(SEARCH_NOTES_JS, 'zzlegacyold') == [], 'repair: the old word no longer finds the note')
    check(p.evaluate(SEARCH_NOTES_JS, 'zzlegacynew') == [note_id], 'repair: the current word still finds it')
    check(p.evaluate("import('./js/db.js').then(db => db.getState('notes_fts_repaired'))") == '1', 'repair: marked done, so it only runs once')
    p.wait_for_timeout(500)
    run.reload()
    body = p.evaluate("window.__emberTest.databases[0].exec('SELECT body FROM notes')[0].values[0][0]")
    check(body == 'zzlegacynew kept', f'repair: the note text is untouched, and it persisted ({body})')
    run.check_no_errors('search index')
    run.close()


BUNDLED_STATE_JS = """() => {
    const core = window.__emberTest.databases[0];
    const column = sql => (core.exec(sql)[0]?.values ?? []).map(row => row[0]);
    return {
        plans: column("SELECT plan_id FROM plans ORDER BY plan_id"),
        templates: column("SELECT name FROM study_templates ORDER BY name"),
        listed: column("SELECT kind || ':' || key FROM bundled_installs ORDER BY 1"),
    };
}"""


def storage_bundled_installs(browser):
    """A deleted bundled plan or template stays deleted: the seeders skip anything
    on the bundled_installs list. An install from before the list fills it from
    what it still holds."""
    run = OfflineRun(browser)
    p = run.page
    run.boot()
    state = p.evaluate(BUNDLED_STATE_JS)
    check(len(state['plans']) == 3 and len(state['templates']) == 3, f'fresh install: three plans, three templates ({state})')
    check(len(state['listed']) == 6, f'fresh install: all six listed ({state["listed"]})')

    p.evaluate("""async () => {
        const db = await import('./js/db.js');
        const core = window.__emberTest.databases[0];
        db.deletePlan(db.getPlans().find(plan => plan.plan_id === 'mcheyne-1year').id);
        const templateId = core.exec("SELECT id FROM study_templates WHERE name = 'Word Study'")[0].values[0][0];
        core.run('DELETE FROM template_steps WHERE template_id = ?', [templateId]);
        core.run('DELETE FROM study_templates WHERE id = ?', [templateId]);
        db.setState('force_a_save', '1');
    }""")
    p.wait_for_timeout(500)
    run.reload()
    state = p.evaluate(BUNDLED_STATE_JS)
    check('mcheyne-1year' not in state['plans'] and len(state['plans']) == 2, f'deleted plan stays deleted after an online boot ({state["plans"]})')
    check('Word Study' not in state['templates'] and len(state['templates']) == 2, f'deleted template stays deleted ({state["templates"]})')
    check(len(state['listed']) == 6, 'both are still listed')

    # An install from before the list: it fills from the two plans and two templates still present,
    # and the deleted ones, unknown to it, come back this once.
    p.evaluate("""async () => {
        const db = await import('./js/db.js');
        window.__emberTest.databases[0].run('DROP TABLE bundled_installs');
        db.setState('force_a_save', '1');
    }""")
    p.wait_for_timeout(500)
    run.reload()
    state = p.evaluate(BUNDLED_STATE_JS)
    check(len(state['plans']) == 3 and len(state['templates']) == 3 and len(state['listed']) == 6,
          f'pre-list install: filled from what it holds, the missing ones return once ({state})')
    run.check_no_errors('bundled installs')
    run.close()


# Counts persist() calls, and lets a run pretend the browser has granted persistence.
PERSIST_HOOK_JS = """
window.__persistCalls = 0;
StorageManager.prototype.persist = async function () { window.__persistCalls++; return false; };
if (localStorage.getItem('test.persisted') === 'yes') StorageManager.prototype.persisted = async () => true;
"""


def storage_persist(browser):
    run = OfflineRun(browser)
    run.ctx.add_init_script(PERSIST_HOOK_JS)
    p = run.new_page()
    calls = lambda: p.evaluate('window.__persistCalls')
    add_note = "import('./js/db.js').then(db => { db.saveNote('a note', [{ verseStart: 1001001 }], [], null); })"
    run.boot()
    p.wait_for_timeout(300)
    check(calls() == 0, 'persist: not requested at first boot, with no notes yet')
    p.evaluate(add_note)
    p.wait_for_timeout(200)
    check(calls() == 1, 'persist: requested when the first note is saved')
    p.evaluate(add_note)
    p.wait_for_timeout(200)
    check(calls() == 1, 'persist: a second note does not ask again')
    run.reload()
    p.wait_for_timeout(300)
    check(calls() == 0, 'persist: a reload inside 30 days does not ask again')
    p.evaluate("localStorage.setItem('ember.persist_requested_at', String(Date.now() - 31 * 24 * 60 * 60 * 1000))")
    run.reload()
    p.wait_for_timeout(300)
    check(calls() == 1, 'persist: asks again at boot after 30 days')

    p.click('#global-settings-btn')
    note = '#global-settings-popover .settings-storage-note'
    p.wait_for_timeout(100)
    check('may clear' in p.locator(note).inner_text(), f'Backup & Restore line when not persisted ({p.locator(note).inner_text()})')
    p.keyboard.press('Escape')

    p.evaluate("localStorage.setItem('test.persisted', 'yes'); localStorage.removeItem('ember.persist_requested_at')")
    run.reload()
    p.wait_for_timeout(300)
    check(calls() == 0, 'persist: never asks once already persisted')
    p.click('#global-settings-btn')
    p.wait_for_timeout(100)
    check('has agreed' in p.locator(note).inner_text(), f'Backup & Restore line when persisted ({p.locator(note).inner_text()})')
    run.check_no_errors('persist')
    run.close()


def storage_worker_hands_back(browser):
    """The worker returns each finished write's buffer: left in its heap, these piled up
    to 1.2 GB at 40 years of data. Peak memory itself is measured by tests/stress.py."""
    run = OfflineRun(browser)
    run.ctx.add_init_script("""
        window.__returned = [];
        const RealWorker = window.Worker;
        window.Worker = function (url, options) {
            const worker = new RealWorker(url, options);
            worker.addEventListener('message', (e) => window.__returned.push(e.data.length));
            return worker;
        };
    """)
    p = run.new_page()
    run.boot()
    p.wait_for_timeout(1000)
    p.evaluate("window.__returned.length = 0; import('./js/db.js').then(db => { for (let i = 0; i < 3; i++) db.setState('worker_probe', String(i)); })")
    p.wait_for_function('window.__returned.length >= 3', timeout=30_000)
    sizes = p.evaluate('window.__returned')
    check(len(sizes) == 3 and all(size > 20_000_000 for size in sizes), f'worker hands back each written buffer, whole ({sizes})')
    run.reload()
    check(p.evaluate("import('./js/db.js').then(db => db.getState('worker_probe'))") == '2', 'the last of those writes persisted')
    run.check_no_errors('worker')
    run.close()


def storage_core_db_files(browser):
    """An empty core.db is a first run that never finished saving, and starts over. A
    damaged one with anything in it must fail visibly and stay on disk: it may hold
    notes that could still be recovered."""
    core_size = """async () => {
        const root = await navigator.storage.getDirectory();
        return (await (await root.getFileHandle('core.db')).getFile()).size;
    }"""
    write_core = """async (length) => {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle('core.db');
        const kept = (await (await handle.getFile()).arrayBuffer()).slice(0, length);
        const writable = await handle.createWritable();
        await writable.write(kept);
        await writable.close();
    }"""
    run = OfflineRun(browser)
    p = run.page
    run.boot()
    p.wait_for_timeout(1000)
    p.evaluate(write_core, 0)
    check(p.evaluate(core_size) == 0, 'core.db emptied, as a tab closed during the first save would leave it')
    run.reload()
    p.wait_for_timeout(1000)
    books = p.evaluate("import('./js/db.js').then(db => db.getBooks().length)")
    check(books == 66, f'empty core.db: the app starts as a first run ({books} books)')
    check(p.evaluate(core_size) > 20_000_000, f'empty core.db: replaced by a whole one ({p.evaluate(core_size)} bytes)')
    run.check_no_errors('empty core.db')

    p.evaluate(write_core, 1_000_000)
    p.reload()
    p.wait_for_function("document.getElementById('loading').textContent.startsWith('Failed to load')", timeout=30_000)
    p.wait_for_timeout(500)
    check(p.evaluate(core_size) == 1_000_000, f'damaged core.db: not replaced, left on disk ({p.evaluate(core_size)} bytes)')
    run.close()


def random_anchors(rng, verses_by_chapter, count):
    """Every shape of anchor, weighted toward the sizes around LONG_ANCHOR_SPAN, where
    anchorsOverlapping() switches between its two searches."""
    chapters = sorted(verses_by_chapter)
    anchors = []
    for _ in range(count):
        chapter = rng.choice(chapters)
        start = rng.choice(verses_by_chapter[chapter])
        shape = rng.randrange(6)
        if shape == 0:
            anchors.append((start, None))
        elif shape == 1:
            anchors.append((start, start + rng.randint(1, 30)))     # within a chapter
        elif shape == 2:
            anchors.append((start, start + rng.choice((4999, 5000, 5001)))) # right at the limit
        elif shape == 3:
            anchors.append((start, start + rng.randint(1000, 40_000))) # several chapters
        elif shape == 4:
            anchors.append((start, start + rng.randint(1_000_000, 3_000_000))) # across books
        else:
            anchors.append((rng.choice(verses_by_chapter[chapters[0]]), 66022021)) # nearly everything
    return anchors


def storage_anchor_lookups(browser):
    """anchorsOverlapping() against the plain overlap test it stands in for. A wrong
    answer here silently hides notes, so random anchors of every shape are compared on
    both the verse and chapter lookups, at the edges of each anchor as well as inside."""
    rng = random.Random(1611)
    kjv = sqlite3.connect(f"file:{os.path.join(ROOT, 'data', 'translations', 'kjv.db')}?mode=ro", uri=True)
    verses_by_chapter = {}
    for book, chapter, verse in kjv.execute('SELECT book, chapter, verse FROM verses WHERE verse > 0'):
        verses_by_chapter.setdefault(book * 1000 + chapter, []).append(book * 1_000_000 + chapter * 1000 + verse)
    kjv.close()
    anchors = random_anchors(rng, verses_by_chapter, 400)
    probes = sorted({edge + delta for pair in anchors for edge in pair if edge for delta in (-1, 0, 1)})
    verse_ids = rng.sample(probes, 500) + [rng.choice(ids) for ids in rng.sample(list(verses_by_chapter.values()), 100)]
    chapter_keys = rng.sample(sorted(verses_by_chapter), 150)

    run = OfflineRun(browser)
    p = run.page
    run.boot()
    res = p.evaluate("""async ([anchors, verseIds, chapterKeys]) => {
        const db = await import('./js/db.js');
        const core = window.__emberTest.databases[0];
        const noteIds = [];
        for (let i = 0; i < 80; i++) {
            core.run("INSERT INTO notes (body) VALUES ('anchor probe')");
            noteIds.push(core.exec('SELECT last_insert_rowid()')[0].values[0][0]);
        }
        anchors.forEach(([start, end], i) => core.run(
            'INSERT INTO note_anchors (note_id, verse_start, verse_end) VALUES (?, ?, ?)', [noteIds[i % noteIds.length], start, end]));
        core.run("INSERT INTO tags (name) VALUES ('anchor-probe')");
        const tagId = core.exec('SELECT last_insert_rowid()')[0].values[0][0];
        core.run('INSERT INTO tag_assignments (tag_id, note_id) VALUES (?, ?)', [tagId, noteIds[0]]);

        const plain = (rangeStart, rangeEnd) => {
            const rows = core.exec(
                `SELECT note_id, verse_start, COALESCE(verse_end, verse_start) FROM note_anchors
                 WHERE verse_start <= ${rangeEnd} AND COALESCE(verse_end, verse_start) >= ${rangeStart}`);
            return rows.length ? rows[0].values : [];
        };
        const wrong = { verses: [], chapters: [], tags: [] };
        let hits = 0;
        for (const verseId of verseIds) {
            const expected = [...new Set(plain(verseId, verseId).map(row => row[0]))].sort((a, b) => a - b);
            const actual = db.getNotesForVerse(verseId).map(note => note.id).sort((a, b) => a - b);
            hits += expected.length;
            if (JSON.stringify(expected) !== JSON.stringify(actual)) wrong.verses.push(verseId);
            const expectTag = expected.includes(noteIds[0]);
            if (db.getUserTagsForVerse(verseId).includes('anchor-probe') !== expectTag) wrong.tags.push(verseId);
        }
        for (const key of chapterKeys) {
            const book = Math.floor(key / 1000), chapter = key % 1000;
            const start = key * 1000, end = key * 1000 + 999;
            const expected = new Map();
            for (const [noteId, from, to] of plain(start, end)) {
                for (let verse = Math.max(from, start); verse <= Math.min(to, end); verse++) {
                    if (!expected.has(verse)) expected.set(verse, new Set());
                    expected.get(verse).add(noteId);
                }
            }
            const actual = db.getNoteCountsForChapter(book, chapter);
            const same = actual.size === expected.size && [...expected].every(([verse, ids]) => actual.get(verse) === ids.size);
            if (!same) wrong.chapters.push(key);
        }
        return { wrong, hits };
    }""", [anchors, verse_ids, chapter_keys])
    wrong = res['wrong']
    check(res['hits'] > 1000, f"anchor lookups: the comparison found real overlaps to check ({res['hits']})")
    check(wrong['verses'] == [], f"getNotesForVerse matches a plain scan on {len(verse_ids)} verses {wrong['verses'][:5]}")
    check(wrong['tags'] == [], f"getUserTagsForVerse matches a plain scan on those verses {wrong['tags'][:5]}")
    check(wrong['chapters'] == [], f"getNoteCountsForChapter matches a plain scan on {len(chapter_keys)} chapters {wrong['chapters'][:5]}")
    run.check_no_errors('anchor lookups')
    run.close()


def scenario_storage(browser):
    storage_search_index(browser)
    storage_bundled_installs(browser)
    storage_anchor_lookups(browser)
    storage_worker_hands_back(browser)
    storage_core_db_files(browser)
    storage_persist(browser)
    return FAILURES


# ---------------------------------------------------------------- export
HOSTILE_BODY = '<script>window.__exportRan = 1</script> <img src=x onerror="window.__exportRan = 2"> Tom & Jerry\nsecond line'


def read_download(p, click):
    with p.expect_download() as download_info:
        click()
    download = download_info.value
    with open(download.path(), encoding='utf-8') as f:
        return download.suggested_filename, f.read()


def parse_export(p, html):
    """The exported page, parsed by the browser without running it."""
    return p.evaluate("""(html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const text = el => el.textContent.replace(/\\s+/g, ' ').trim();
        return {
            scripts: doc.querySelectorAll('script').length,
            images: doc.querySelectorAll('img').length,
            handlers: [...doc.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.name)).filter(n => n.startsWith('on')),
            external: [...doc.querySelectorAll('[src], link[href]')].length,
            charset: doc.querySelector('meta[charset]')?.getAttribute('charset'),
            meta: text(doc.querySelector('.meta')),
            title: text(doc.querySelector('h1')),
            studies: [...doc.querySelectorAll('section > h2')].map(text),
            contents: [...doc.querySelectorAll('nav a')].map(a => a.getAttribute('href')),
            notes: [...doc.querySelectorAll('.note')].map(note => ({
                references: [...note.querySelectorAll('.reference')].map(text),
                quotes: [...note.querySelectorAll('blockquote')].map(q => [...q.querySelectorAll('p')].map(text)),
                notQuoted: [...note.querySelectorAll('.not-quoted')].map(text),
                body: note.querySelector('.body')?.textContent ?? null,
                tags: note.querySelector('.tags') ? text(note.querySelector('.tags')) : null,
            })),
        };
    }""", html)


def scenario_export(app):
    """Readable export: one study from its view, all studies from Backup & Restore."""
    p = app.page
    studies = p.evaluate(f"""async () => {{
        const db = await import('./js/db.js');
        const first = db.createStudy('Creation & <Light>');
        db.saveNote({HOSTILE_BODY!r}, [{{ verseStart: 1001001 }}], ['faith', 'beginnings'], first);
        db.saveNote('across a chapter break', [{{ verseStart: 1001031, verseEnd: 1002002 }}], [], first);
        db.saveNote('the first three chapters', [{{ verseStart: 1001001, verseEnd: 1003024 }}], [], first);
        db.saveNote('to be typed into', [], [], first);
        const second = db.createStudy('Second study');
        db.saveNote('only in the full export', [{{ verseStart: 43001001 }}], [], second);
        db.saveNote('a note outside any study', [], [], null);
        return {{ first, second }};
    }}""")
    p.evaluate(f"import('./js/panels.js').then(panels => panels.openStudy({studies['first']}, 'Creation'))")
    p.wait_for_selector('.study-export-btn')

    # Typed just now, still waiting on its 800 ms autosave
    last_body = '#notes-active-view .note-block:last-of-type .note-block-body'
    p.click(last_body); p.keyboard.press('Control+End'); p.keyboard.type(' plus fresh typing')
    filename, html = read_download(p, lambda: p.click('.study-export-btn'))
    page = parse_export(p, html)
    check(re.fullmatch(r'ember-study-Creation-&-Light-\d{4}-\d\d-\d\d\.html', filename) is not None,
          f'one study: file named for the study, unsafe characters dropped ({filename})')
    check(page['title'] == 'Creation & <Light>' and page['studies'] == [] and page['contents'] == [] and len(page['notes']) == 4
          and not any(note['body'] == 'a note outside any study' for note in page['notes']),
          f"one study: titled by it, only its notes, no contents list ({page['title']}, {page['studies']}, {len(page['notes'])})")
    check(page['charset'] == 'utf-8' and page['scripts'] == 0 and page['images'] == 0 and page['handlers'] == [] and page['external'] == 0,
          f"one study: self-contained, no script, no handlers ({page['scripts']}, {page['images']}, {page['handlers']}, {page['external']})")
    check('King James Version (KJV)' in page['meta'], f"names the translation once in the header ({page['meta']})")
    hostile, across, long, typed = page['notes']
    check(hostile['body'] == HOSTILE_BODY, f"note text is kept as text, markup and line break included ({hostile['body']!r})")
    check(p.evaluate('window.__exportRan ?? null') is None, 'nothing in the note ran')
    check(hostile['references'] == ['Genesis 1:1 (KJV)'] and hostile['quotes'][0][0].startswith('1 In the beginning God created the heaven'),
          f"Gen 1:1 quoted in KJV ({hostile['quotes']})")
    check(hostile['tags'] == 'Tags: faith, beginnings', f"tags listed ({hostile['tags']})")
    check(across['references'] == ['Genesis 1:31–2:2 (KJV)'] and len(across['quotes'][0]) == 2
          and across['quotes'][0][0].startswith('31 ') and across['quotes'][0][1].startswith('1 ') and '2 And on the seventh day' in across['quotes'][0][1],
          f"a cross-chapter anchor quotes both chapters ({across['quotes']})")
    check(long['quotes'] == [] and long['notQuoted'] == ['80 verses, not quoted.'], f"a long anchor is named, not quoted ({long['notQuoted']})")
    check(typed['body'] == 'to be typed into plus fresh typing', f"text typed just before exporting is in the file ({typed['body']!r})")
    button = p.evaluate("(() => { const b = document.querySelector('.study-export-btn'); return [b.textContent, b.disabled]; })()")
    check(button == ['Export', False], f'the button is back to "Export" once the file is made ({button})')

    # Everything, after switching the reader to ASV
    p.click('#reader-pane-a .pane-book-btn')
    p.click('.translation-btn:has-text("ASV")')
    p.keyboard.press('Escape')
    p.click('#global-settings-btn')
    filename, html = read_download(p, lambda: p.click('#global-settings-popover .settings-action-btn:has-text("Export Readable Copy")'))
    p.keyboard.press('Escape')
    page = parse_export(p, html)
    check(re.fullmatch(r'ember-studies-\d{4}-\d\d-\d\d\.html', filename) is not None, f'all studies: file name ({filename})')
    p.click('#notes-tabs [data-study-id="all"]')
    listed = p.evaluate("[...document.querySelectorAll('.study-list-item .study-list-name')].map(e => e.textContent)")
    check(page['studies'][:-1] == listed and sorted(listed) == ['Creation & <Light>', 'Second study'] and len(page['contents']) == 3,
          f"all studies, in the All Studies list's order, with a contents list ({page['studies']}, {listed})")
    loose = [note['body'] for note in page['notes'] if note['body'] == 'a note outside any study']
    check(page['studies'][-1] == 'Notes not in a study' and loose == ['a note outside any study'],
          f"a note outside any study ends the full export in its own section ({page['studies']})")
    check('American Standard Version (ASV)' in page['meta'], f"the reader's translation, now ASV ({page['meta']})")
    hostile = next(note for note in page['notes'] if note['body'] == HOSTILE_BODY)
    check(hostile['references'] == ['Genesis 1:1 (ASV)'] and 'heavens' in hostile['quotes'][0][0],
          f"Gen 1:1 quoted in ASV ({hostile['quotes'][0]})")
    return FAILURES


# ---------------------------------------------------------------- boots
WARM_BOOTS = 5


def scenario_boots(browser):
    """Warm boots to "app live", with the service worker in play as for a real user.
    Reports rather than judges, since the numbers belong to this machine. To compare
    with an older commit, `git archive` it into a scratch directory, symlink data/ into
    that, and alternate runs with this one: a single run is too noisy to compare."""
    ctx = browser.new_context(viewport={'width': 1600, 'height': 1000})
    page = ctx.new_page()
    App(page).boot(SW_URL)
    page.wait_for_timeout(1500)
    page.close()
    samples = []
    for _ in range(WARM_BOOTS):
        page = ctx.new_page()
        App(page).boot(SW_URL)
        samples.append(page.evaluate('performance.now()'))
        page.close()
    ctx.close()
    print(f"  warm boots ms {[round(s) for s in samples]}, median {round(statistics.median(samples))}")
    return FAILURES


BROWSER_SCENARIOS = {'offline': scenario_offline, 'lexicon': scenario_lexicon,
                     'storage': scenario_storage, 'boots': scenario_boots}


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
            if args[0] in BROWSER_SCENARIOS:
                print(f'== {args[0]}')
                failures = BROWSER_SCENARIOS[args[0]](browser)
                browser.close()
                print(f'\n{len(failures)} failure(s)')
                sys.exit(1 if failures else 0)
            ctx = browser.new_context(viewport={'width': 1600, 'height': 1000})
            app = App(ctx.new_page())
            app.boot(SW_URL if args[0] == 'sw' else URL)
            print(f'== {args[0]}')
            if args[0] == 'sw':         failures = scenario_sw(app)
            elif args[0] == 'popovers': failures = scenario_popovers(app)
            elif args[0] == 'smoke':    failures = scenario_smoke(app)
            elif args[0] == 'indicators': failures = scenario_indicators(app)
            elif args[0] == 'notes':      failures = scenario_notes(app)
            elif args[0] == 'hebrew':     failures = scenario_hebrew(app)
            elif args[0] == 'export':     failures = scenario_export(app)
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
