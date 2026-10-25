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
   python3 tests/verify.py notes         # removing tags and verse anchors from a note
   python3 tests/verify.py sw            # service worker installs and precaches every js/ file
   python3 tests/verify.py hebrew        # Hebrew word anatomy: TEHMC decode, pieces, affixes, Ketiv
   python3 tests/verify.py dbsnapshot out.json          # results of ~36 db.js calls as JSON
   python3 tests/verify.py dbcompare before.json after.json

Use dbsnapshot before and after a db.js change and dbcompare the two files:
every key should be identical except the creation timestamps on seeded
user rows, which differ between runs.

Requires: python3, playwright (pip install playwright && playwright install chromium).
"""
import json, os, sqlite3, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
URL  = f'http://localhost:{PORT}/'

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
    def __init__(self, page):
        self.page = page
        self.errors = []
        page.on('pageerror', lambda e: self.errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: self.errors.append(f'console.error: {m.text}')
                if m.type == 'error' and not any(k in m.text for k in KNOWN_ERRORS) else None)

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

    # Hebrew: TEHMC decode lines (Hebrew Word Anatomy spec), no Lexicon link (TBESH gap)
    app.navigate(1, 1)
    app.select_verse(1001001)
    p.click('#reference-tabs [data-tab="language"]')
    p.wait_for_selector('.language-word-row .language-hebrew', timeout=30_000)
    p.locator('.language-word-row').first.click()
    p.locator('.language-card-more-btn').first.click()
    p.wait_for_selector('.language-card-tier2')
    check(p.evaluate("document.querySelectorAll('.language-card-tier2 .language-morph-decode-line').length") > 0, 'Hebrew shows decode lines')
    check(p.evaluate("document.querySelectorAll('.language-card-lexicon-btn').length") == 0, 'Hebrew shows no Lexicon button')

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
    return FAILURES


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
    # OPFS. Open the Language tab so language.db is fetched with the worker
    # in control, then check nothing under /data/ is in any cache.
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
        ketivNote: text(member.querySelector('.language-ketiv-note')),
        general: field('General usage'),
        lexiconButton: !!member.querySelector('.language-card-lexicon-btn'),
    };
}"""


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
            app.boot(URL.replace('localhost', '127.0.0.1') if args[0] == 'sw' else URL)
            print(f'== {args[0]}')
            if args[0] == 'sw':         failures = scenario_sw(app)
            elif args[0] == 'popovers': failures = scenario_popovers(app)
            elif args[0] == 'smoke':    failures = scenario_smoke(app)
            elif args[0] == 'indicators': failures = scenario_indicators(app)
            elif args[0] == 'notes':      failures = scenario_notes(app)
            elif args[0] == 'hebrew':     failures = scenario_hebrew(app)
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
