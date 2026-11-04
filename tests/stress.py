#!/usr/bin/env python3
"""Longevity stress test: how Ember behaves as a user's data grows for decades.

Measurement only. Everything here hooks the app from outside (an init script
and a patched copy of storage-worker.js served by Playwright), so no app code
carries instrumentation. Results: docs/STRESS_TEST_RESULTS.md.

Usage (from the repo root):
   python3 tests/stress.py base                 # capture the app-created base.db
   python3 scripts/gen_stress_data.py           # generate the profiles from it
   python3 tests/stress.py run 40 [--throttled] # one profile, one speed
   python3 tests/stress.py all                  # 0/1/10/25/40 years, normal + 4x throttled
   python3 tests/stress.py report               # markdown tables from the saved results

Requires: python3, playwright. Linux for renderer RSS (/proc); Chromium only.
"""
import json, os, platform, sqlite3, statistics, sys, time
from playwright.sync_api import sync_playwright
from verify import App, ROOT, URL, start_server

DATA_DIR    = os.path.join(ROOT, 'tests', 'stress-data')
RESULTS_DIR = os.path.join(DATA_DIR, 'results')
BASE_DB     = os.path.join(DATA_DIR, 'base.db')
LANGUAGE_DB_SIZE = os.path.getsize(os.path.join(ROOT, 'data', 'language.db'))

PROFILES = (0, 1, 10, 25, 40)
THROTTLE_RATE = 4
COLD_BOOTS = 3
AUTOSAVES = 20
RSS_SAMPLE_EVERY = 5
REPEATS = 3            # for searches and hot-spot renders
WRITE_BURSTS = 3
WRITE_BURST_SIZE = 5
LONG_TIMEOUT = 600_000 # the slowest profile, throttled

# Reference data shipped in core.db; everything else that isn't an FTS shadow
# table or SQLite's own is created by the app.
REFERENCE_TABLES = {'books', 'cross_references', 'topic_verses', 'topics', 'translations'}
SEEDED_TABLES    = {'plans', 'plan_days', 'plan_day_scripture', 'study_templates', 'template_steps', 'meta'}

# Sees every Database the app opens and every export(), times what runs on the
# main thread, and records when the app went live: all from outside. sql-wasm.js
# assigns the initSqlJs global, so an accessor on window can wrap what it returns.
HOOK_JS = """
window.__stress = { handles: [], exports: [], longTasks: [], posted: [], done: [], liveAt: null };
(() => {
    const stress = window.__stress;
    let realInit;
    Object.defineProperty(window, 'initSqlJs', {
        configurable: true,
        set(value) { realInit = value; },
        get() {
            return realInit && (async (config) => {
                const SQL = await realInit(config);
                const Original = SQL.Database;
                const realExport = Original.prototype.export;
                Original.prototype.export = function () {
                    const start = performance.now();
                    const bytes = realExport.apply(this, arguments);
                    stress.exports.push({ at: start, ms: performance.now() - start, bytes: bytes.length });
                    return bytes;
                };
                SQL.Database = function (data) {
                    const handle = new Original(data);
                    stress.handles.push({ size: data ? data.length : 0, db: handle });
                    return handle;
                };
                SQL.Database.prototype = Original.prototype;
                return SQL;
            });
        },
    });

    const RealWorker = window.Worker;
    window.Worker = function (url, options) {
        const worker = new RealWorker(url, options);
        const realPost = worker.postMessage.bind(worker);
        worker.postMessage = (data, transfer) => { stress.posted.push(performance.now()); realPost(data, transfer); };
        worker.addEventListener('message', (e) => { if (e.data && e.data.writeDone) stress.done.push(performance.now()); });
        return worker;
    };

    new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) stress.longTasks.push({ at: entry.startTime, ms: entry.duration });
    }).observe({ entryTypes: ['longtask'] });

    document.addEventListener('DOMContentLoaded', () => {
        const loading = document.getElementById('loading');
        new MutationObserver(() => {
            if (!stress.liveAt && loading.classList.contains('hidden')) stress.liveAt = performance.now();
        }).observe(loading, { attributes: true });
    });

    window.__stressPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__stressCore = () => stress.handles[0].db;
    window.__stressScripture = () => stress.handles[1].db;
    window.__stressRun = (db, sql, params) => {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        let rows = 0;
        while (stmt.step()) rows++;
        stmt.free();
        return rows;
    };
})();
"""


def patched_storage_worker():
    """storage-worker.js as it ships, plus one line that reports the finished write."""
    with open(os.path.join(ROOT, 'js', 'storage-worker.js')) as fh:
        source = fh.read()
    marker = 'await writable.close();'
    assert source.count(marker) == 1, 'storage-worker.js changed: update the patch in tests/stress.py'
    return source.replace(marker, marker + ' self.postMessage({ writeDone: true });')


def median(samples):
    return round(statistics.median(samples), 1) if samples else None


class Run:
    """One fresh profile. Boots via localhost, where app.js skips the service
    worker, so nothing can serve an unpatched storage-worker.js."""

    def __init__(self, browser, throttled):
        self.browser = browser
        self.throttled = throttled
        self.browser_cdp = browser.new_browser_cdp_session()
        self.ctx = browser.new_context(viewport={'width': 1600, 'height': 1000}, accept_downloads=True)
        self.ctx.add_init_script(HOOK_JS)
        worker_source = patched_storage_worker()
        self.ctx.route('**/js/storage-worker.js', lambda route: route.fulfill(body=worker_source, content_type='text/javascript'))
        self.page = None
        self.app = None
        self.errors = []  # across every page of the run

    def new_page(self):
        """Exactly one renderer page at a time, so the RSS reading is this one."""
        if self.page:
            self.page.close()
            time.sleep(0.5)
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(LONG_TIMEOUT)
        self.app = App(self.page)
        self.app.errors = self.errors
        self.page_cdp = self.ctx.new_cdp_session(self.page)
        if self.throttled:
            self.page_cdp.send('Emulation.setCPUThrottlingRate', {'rate': THROTTLE_RATE})
        return self.page

    def wait_live(self):
        self.page.wait_for_selector('#loading.hidden', state='attached', timeout=LONG_TIMEOUT)
        self.page.wait_for_selector('#reader-pane-a .verse', timeout=LONG_TIMEOUT)

    def wait_for_language_download(self):
        size = """async () => {
            const root = await navigator.storage.getDirectory();
            try { return (await (await root.getFileHandle('language.db')).getFile()).size; } catch (_) { return null; }
        }"""
        deadline = time.monotonic() + 300
        while self.page.evaluate(size) != LANGUAGE_DB_SIZE:
            if time.monotonic() > deadline:
                raise SystemExit('language.db never finished downloading')
            self.page.wait_for_timeout(200)

    def memory(self):
        heap = self.page.evaluate('performance.memory.usedJSHeapSize')
        renderers = {}
        for process in self.browser_cdp.send('SystemInfo.getProcessInfo')['processInfo']:
            if process['type'] != 'renderer':
                continue
            try:
                with open(f"/proc/{process['id']}/status") as fh:
                    status = dict(line.split(':', 1) for line in fh if ':' in line)
                renderers[process['id']] = (int(status['VmRSS'].split()[0]) // 1024, int(status['VmHWM'].split()[0]) // 1024)
            except (OSError, KeyError):
                pass
        rss, peak = max(renderers.values(), default=(None, None))
        return {'js_heap_mb': round(heap / 1e6), 'rss_mb': rss, 'peak_rss_mb': peak}

    def memory_after_gc(self):
        """Forces a collection: RSS that falls here was garbage waiting for GC, not retained data."""
        self.page_cdp.send('HeapProfiler.collectGarbage')
        self.page.wait_for_timeout(1000)
        return self.memory()

    def timed_render(self, action_js):
        """ms from starting an action on the page to two frames later (painted)."""
        return self.page.evaluate(f"""async () => {{
            const start = performance.now();
            await ({action_js})();
            await window.__stressPaint();
            return performance.now() - start;
        }}""")

    # ---- flow
    def first_boot_and_restore(self, db_path):
        p = self.new_page()
        p.goto(URL)
        self.wait_live()
        self.wait_for_language_download()
        p.wait_for_timeout(1500)  # first-boot writes settle
        p.click('#global-settings-btn')
        with p.expect_file_chooser() as chooser:
            p.click('#global-settings-popover .settings-action-btn.danger')
        chooser.value.set_files(db_path)
        p.wait_for_selector('.plan-metadata-confirm.danger', timeout=LONG_TIMEOUT)  # looksLikeCoreDb accepted it
        start = time.monotonic()
        with p.expect_navigation(timeout=LONG_TIMEOUT):
            p.click('.plan-metadata-confirm.danger')
        self.wait_live()
        return round((time.monotonic() - start) * 1000)

    def realism(self, sidecar):
        p = self.page
        counts = sidecar['counts']
        result = {'integrity_check': sidecar['integrity_check']}
        result['notes_in_db'] = p.evaluate("__stressRun(__stressCore(), 'SELECT id FROM notes', [])")
        result['studies_listed'] = p.evaluate("document.querySelectorAll('.study-list-item').length")
        if counts['notes']:
            search = sidecar['search']
            result['planted_found'] = p.evaluate(
                "async (token) => (await import('./js/db.js')).search(token, 1).notes.length", search['planted'])
            assert result['notes_in_db'] == counts['notes'], result
            assert result['studies_listed'] == counts['studies'], result
            assert result['planted_found'] == 1, result
        return result

    def cold_boots(self):
        samples, long_task_totals = [], []
        for _ in range(COLD_BOOTS):
            p = self.new_page()
            p.goto(URL)
            self.wait_live()
            samples.append(p.evaluate('window.__stress.liveAt'))
            p.wait_for_timeout(300)
            long_task_totals.append(p.evaluate('window.__stress.longTasks.reduce((sum, t) => sum + t.ms, 0)'))
        return {'boot_to_live_ms': median(samples), 'boot_samples_ms': [round(s) for s in samples],
                'boot_long_task_total_ms': median(long_task_totals)}

    def sizes(self):
        return self.page.evaluate("""async () => {
            const root = await navigator.storage.getDirectory();
            const coreBytes = (await (await root.getFileHandle('core.db')).getFile()).size;
            const estimate = await navigator.storage.estimate();
            return { core_db_bytes: coreBytes, storage_usage_bytes: estimate.usage, storage_quota_bytes: estimate.quota };
        }""")

    def autosave_run(self):
        p = self.page
        note_id = p.evaluate("""async () => {
            const db = await import('./js/db.js');
            const panels = await import('./js/panels.js');
            const studyId = db.createStudy('Stress Autosave');
            const noteId = db.saveNote('start', [{ verseStart: 1001001 }], [], studyId);
            panels.openStudy(studyId, 'Stress Autosave');
            return noteId;
        }""")
        self.app.select_verse(1001001)
        p.click('.note-block-body')
        p.keyboard.press('End')
        saves, rss_series = [], []
        for i in range(AUTOSAVES):
            if i % RSS_SAMPLE_EVERY == 0:
                rss_series.append(self.memory()['rss_mb'])
            p.wait_for_function('() => window.__stress.done.length >= window.__stress.posted.length', timeout=LONG_TIMEOUT)
            before = p.evaluate('window.__stress.done.length')
            p.keyboard.type('x')
            p.wait_for_function('(count) => window.__stress.done.length > count', arg=before, timeout=LONG_TIMEOUT)
            p.wait_for_timeout(200)  # the long task entry for this save arrives
            saves.append(p.evaluate("""() => {
                const s = window.__stress;
                const exported = s.exports[s.exports.length - 1];
                const posted = s.posted[s.posted.length - 1];
                const done = s.done[s.done.length - 1];
                const tasks = s.longTasks.filter(t => t.at + t.ms >= exported.at && t.at <= posted + 50);
                return { export_ms: exported.ms, bytes: exported.bytes, write_ms: done - posted,
                         block_ms: tasks.reduce((longest, t) => Math.max(longest, t.ms), 0) };
            }"""))
        rss_series.append(self.memory()['rss_mb'])
        persisted = p.evaluate("document.querySelector('.note-block-body').innerText.trim()")
        # An autosave is updateNote() (SQL + export) then refreshAfterWrite() (these queries, then DOM).
        split = p.evaluate("""async ([noteId, text, repeats]) => {
            const db = await import('./js/db.js');
            const time = (fn) => {
                const samples = [];
                for (let i = 0; i < repeats; i++) { const start = performance.now(); fn(); samples.push(performance.now() - start); }
                return samples.sort((a, b) => a - b)[Math.floor(repeats / 2)];
            };
            return {
                update_note_ms: time(() => db.updateNote(noteId, text)),
                refresh_queries_ms: time(() => { db.getNoteCountsForChapter(1, 1); db.getNotesForVerse(1001001); }),
            };
        }""", [note_id, persisted, REPEATS])
        return {
            'update_note_ms': round(split['update_note_ms'], 1),
            'refresh_queries_ms': round(split['refresh_queries_ms'], 1),
            'export_ms': median([s['export_ms'] for s in saves]),
            'export_max_ms': round(max(s['export_ms'] for s in saves), 1),
            'export_bytes': saves[-1]['bytes'],
            'worker_write_ms': median([s['write_ms'] for s in saves]),
            'worker_write_max_ms': round(max(s['write_ms'] for s in saves), 1),
            'autosave_block_ms': median([s['block_ms'] for s in saves]),
            'autosave_block_max_ms': round(max(s['block_ms'] for s in saves), 1),
            'autosave_saves': len(saves),
            'autosave_rss_series_mb': rss_series,
            'autosave_text_ok': persisted == 'start' + 'x' * AUTOSAVES,
        }

    def searches(self, sidecar):
        p = self.page
        p.evaluate("import('./js/db.js').then(db => db.search('warmup', 1))")  # first search learns FTS5 is unavailable
        terms = {'common': sidecar['search']['common']}
        if sidecar['counts']['notes']:
            terms['rare'] = sidecar['search']['rare']
            terms['planted'] = sidecar['search']['planted']
        result = {}
        notes_sql = ('SELECT n.id, n.body, n.created_at, n.study_id, s.name AS study_name FROM notes_fts fts '
                     'JOIN notes n ON n.id = fts.rowid LEFT JOIN studies s ON s.id = n.study_id '
                     'WHERE notes_fts MATCH ? LIMIT 50')
        for label, term in terms.items():
            whole, notes_only = [], []
            for _ in range(REPEATS):
                whole.append(p.evaluate("""async (term) => {
                    const db = await import('./js/db.js');
                    const start = performance.now();
                    db.search(term, 1);
                    return performance.now() - start;
                }""", term))
                notes_only.append(p.evaluate("""([sql, term]) => {
                    const start = performance.now();
                    __stressRun(__stressCore(), sql, [term]);
                    return performance.now() - start;
                }""", [notes_sql, term]))
            result[f'search_{label}_ms'] = median(whole)
            result[f'search_{label}_notes_only_ms'] = median(notes_only)
        like_sql = 'SELECT book, chapter, verse FROM verses WHERE text LIKE ? LIMIT 50'
        for label, term in (('common', 'lord'), ('rare', 'zzzabsent')):
            result[f'scripture_like_{label}_ms'] = median([p.evaluate("""([sql, term]) => {
                const start = performance.now();
                __stressRun(__stressScripture(), sql, [`%${term}%`]);
                return performance.now() - start;
            }""", [like_sql, term]) for _ in range(REPEATS)])
        return result

    def hot_spots(self, sidecar):
        p = self.page
        result = {}

        def navigate(book, chapter):
            return f"() => import('./js/reader.js').then(m => m.navigateTo({book}, {chapter}))"

        john, psalm, study, studies = [], [], [], []
        for _ in range(REPEATS):
            self.timed_render(navigate(1, 1))
            self.timed_render(navigate(43, 3))
            john.append(self.timed_render("""() => document.querySelector('.verse[data-verse-id="43003016"]').click()"""))
            psalm.append(self.timed_render(navigate(19, 119)))
            if sidecar['hot_study']:
                self.page.click('#notes-tabs [data-study-id="all"]')
                hot = sidecar['hot_study']
                study.append(self.timed_render(
                    f"() => import('./js/panels.js').then(m => m.openStudy({hot['id']}, {json.dumps(hot['name'])}))"))
                result['hot_study_note_blocks'] = p.evaluate("document.querySelectorAll('#notes-active-view .note-block').length")
            studies.append(self.timed_render("""() => document.querySelector('#notes-tabs [data-study-id="all"]').click()"""))
        result['psalm_119_marked_verses'] = p.evaluate("""() => document.querySelectorAll('#reader-pane-a .verse[class*="markup-"]').length""")
        self.timed_render(navigate(43, 3))
        self.timed_render("""() => document.querySelector('.verse[data-verse-id="43003016"]').click()""")
        result['john_3_16_note_cards'] = p.evaluate("document.querySelectorAll('#info-tab .ref-note-card').length")
        hot_id = sidecar['hot_study']['id'] if sidecar['hot_study'] else 'null'
        result.update(p.evaluate(f"""async () => {{
            const db = await import('./js/db.js');
            const time = (fn) => {{
                const samples = [];
                for (let i = 0; i < {REPEATS}; i++) {{ const start = performance.now(); fn(); samples.push(performance.now() - start); }}
                return samples.sort((a, b) => a - b)[{REPEATS // 2}];
            }};
            return {{
                query_john_3_16_ms: time(() => db.getNotesForVerse(43003016)),
                query_hot_study_ms: {hot_id} === null ? null : time(() => db.getNotesForStudy({hot_id})),
                query_all_studies_ms: time(() => db.getStudies()),
            }};
        }}"""))
        result['render_john_3_16_ms'] = median(john)
        result['render_psalm_119_ms'] = median(psalm)
        result['render_hot_study_ms'] = median(study)
        result['render_all_studies_ms'] = median(studies)
        return result

    def language_memory(self):
        """Memory just before and after language.db opens, in a fresh tab with no writes
        behind it: export garbage from the autosave run would swamp the difference, and
        language.db's cost isn't the notes' cost."""
        p = self.new_page()
        p.goto(URL)
        self.wait_live()
        p.wait_for_timeout(1000)
        self.app.navigate(1, 1)  # the reader reopens wherever the last tab left it
        self.app.select_verse(1001001)
        p.wait_for_timeout(1000)
        before = self.memory()
        start = time.monotonic()
        p.click('#reference-tabs [data-tab="language"]')
        p.wait_for_selector('.language-word-row', timeout=LONG_TIMEOUT)
        elapsed = round((time.monotonic() - start) * 1000)
        p.wait_for_timeout(1000)
        return {'open_language_tab_ms': elapsed, 'memory_before_language': before, 'memory_after_language': self.memory()}

    def backup(self, keep_path=None):
        p = self.page
        start = time.monotonic()
        with p.expect_download(timeout=LONG_TIMEOUT) as download_info:
            call_ms = p.evaluate("""async () => {
                const db = await import('./js/db.js');
                const start = performance.now();
                db.exportBackup();
                return performance.now() - start;
            }""")
        download = download_info.value
        elapsed = round((time.monotonic() - start) * 1000)
        path = keep_path or download.path()
        if keep_path:
            download.save_as(keep_path)
        return {'backup_call_ms': round(call_ms, 1), 'backup_total_ms': elapsed, 'backup_bytes': os.path.getsize(path)}, path

    def write_ordering(self):
        """storage-worker.js handles each message as it arrives, with no queue, so
        writes that overlap could finish out of order. Report only."""
        p = self.page
        lost = 0
        for burst in range(WRITE_BURSTS):
            p.evaluate("""async ([burst, size]) => {
                const db = await import('./js/db.js');
                for (let i = 0; i < size; i++) db.setState('stress_burst', `${burst}:${i}`);
            }""", [burst, WRITE_BURST_SIZE])
            p.wait_for_function('() => window.__stress.done.length >= window.__stress.posted.length', timeout=LONG_TIMEOUT)
            p.wait_for_timeout(300)
            self.new_page().goto(URL)
            self.wait_live()
            p = self.page
            value = p.evaluate("import('./js/db.js').then(db => db.getState('stress_burst'))")
            if value != f'{burst}:{WRITE_BURST_SIZE - 1}':
                lost += 1
        return {'write_bursts': WRITE_BURSTS, 'write_bursts_size': WRITE_BURST_SIZE, 'write_bursts_lost_last_write': lost}

    def close(self):
        self.ctx.close()


def size_breakdown(path):
    """Per-table bytes from dbstat, on bytes the app itself exported: exactly what
    every write re-serializes."""
    db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    table_of = {name: table for name, table in db.execute('SELECT name, tbl_name FROM sqlite_master')}
    by_table = {}
    for name, size in db.execute('SELECT name, SUM(pgsize) FROM dbstat GROUP BY name'):
        table = table_of.get(name, name)
        by_table[table] = by_table.get(table, 0) + size
    page_size = db.execute('PRAGMA page_size').fetchone()[0]
    free_bytes = db.execute('PRAGMA freelist_count').fetchone()[0] * page_size
    db.close()

    groups = {'reference': 0, 'seeded_plans_templates': 0, 'user': 0, 'fts_shadow': 0, 'sqlite_internal': 0, 'free_pages': free_bytes}
    for table, size in by_table.items():
        if table.startswith('notes_fts'):
            groups['fts_shadow'] += size
        elif table.startswith('sqlite_'):
            groups['sqlite_internal'] += size
        elif table in REFERENCE_TABLES:
            groups['reference'] += size
        elif table in SEEDED_TABLES:
            groups['seeded_plans_templates'] += size
        else:
            groups['user'] += size
    return {'groups': groups, 'tables': dict(sorted(by_table.items(), key=lambda item: -item[1]))}


def run_profile(browser, years, throttled):
    with open(os.path.join(DATA_DIR, f'stress-{years}y.json')) as fh:
        sidecar = json.load(fh)
    db_path = os.path.join(DATA_DIR, f'stress-{years}y.db')
    run = Run(browser, throttled)
    result = {'years': years, 'throttled': throttled, 'cpu_throttle_rate': THROTTLE_RATE if throttled else 1, 'counts': sidecar['counts']}
    label = f"{years}y {'throttled' if throttled else 'normal'}"

    def step(name):
        print(f'  [{label}] {name}', flush=True)

    try:
        step('first boot + restore')
        result['restore_ms'] = run.first_boot_and_restore(db_path)
        result['realism'] = run.realism(sidecar)
        step('cold boots')
        result.update(run.cold_boots())
        result.update(run.sizes())
        result['memory_after_boot'] = run.memory()
        step('autosaves')
        result.update(run.autosave_run())
        result['memory_after_autosaves'] = run.memory()
        result['memory_after_autosaves_gc'] = run.memory_after_gc()
        step('searches')
        result.update(run.searches(sidecar))
        step('hot spots')
        result.update(run.hot_spots(sidecar))
        step('backup')
        backup, backup_path = run.backup()
        result.update(backup)
        result['breakdown'] = size_breakdown(str(backup_path))
        step('write ordering')
        result.update(run.write_ordering())
        step('language tab')
        result.update(run.language_memory())
        result['console_errors'] = run.errors
    finally:
        run.close()

    os.makedirs(RESULTS_DIR, exist_ok=True)
    name = f"{years}y-{'throttled' if throttled else 'normal'}.json"
    with open(os.path.join(RESULTS_DIR, name), 'w') as fh:
        json.dump(result, fh, indent=1)
    print(f'  wrote {name}', flush=True)


def capture_base(browser):
    run = Run(browser, False)
    p = run.new_page()
    p.goto(URL)
    run.wait_live()
    p.wait_for_timeout(1500)
    os.makedirs(DATA_DIR, exist_ok=True)
    info, _ = run.backup(BASE_DB)
    run.close()
    print(f"wrote {BASE_DB} ({info['backup_bytes']} bytes)")


# ---------------------------------------------------------------- report
THRESHOLDS = {  # good below the first, watch below the second, problem above (spec §2.4)
    'boot_to_live_ms': (3000, 8000),
    'autosave_block_ms': (50, 150),
    'search': (150, 500),
    'render': (200, 600),
    'rss_mb': (300, 600),
}


def verdict(value, kind):
    if value is None:
        return ''
    good, watch = THRESHOLDS[kind]
    return 'Good' if value < good else 'Watch' if value <= watch else 'Problem'


def load_results():
    results = []
    for years in PROFILES:
        for speed in ('normal', 'throttled'):
            path = os.path.join(RESULTS_DIR, f'{years}y-{speed}.json')
            if os.path.exists(path):
                with open(path) as fh:
                    results.append(json.load(fh))
    return results


def table(headers, rows):
    print('| ' + ' | '.join(headers) + ' |')
    print('|' + '---|' * len(headers))
    for row in rows:
        print('| ' + ' | '.join('' if v is None else str(v) for v in row) + ' |')
    print()


def fmt(value, kind=None):
    if value is None:
        return ''
    text = f'{value:,.0f}'
    return f'{text} ({verdict(value, kind)})' if kind else text


def mb(value):
    return f'{value / 1e6:.1f}'


def report():
    results = load_results()
    speed = lambda r: f"{r['years']}y {'4×' if r['throttled'] else '1×'}"
    print('### Boot, writes, memory\n')
    table(['Profile', 'core.db MB', 'Boot to live ms', 'export() ms', 'Block per autosave ms (median / max)',
           'Worker write ms', 'Restore ms', 'Backup ms', 'Backup MB', 'Storage MB'],
          [[speed(r), mb(r['core_db_bytes']), fmt(r['boot_to_live_ms'], 'boot_to_live_ms'), fmt(r['export_ms']),
            f"{fmt(r['autosave_block_ms'], 'autosave_block_ms')} / {fmt(r['autosave_block_max_ms'])}",
            fmt(r['worker_write_ms']), fmt(r['restore_ms']), fmt(r['backup_total_ms']), mb(r['backup_bytes']), mb(r['storage_usage_bytes'])]
           for r in results])
    print('### Memory (MB)\n')
    table(['Profile', 'RSS after boot', 'JS heap after boot', 'RSS after autosaves', 'Peak RSS during autosaves', 'RSS after forced GC',
           'Fresh tab, verse selected: RSS', 'After language.db opens: RSS', 'Language tab adds', 'Open tab ms'],
          [[speed(r), fmt(r['memory_after_boot']['rss_mb'], 'rss_mb'), r['memory_after_boot']['js_heap_mb'],
            r['memory_after_autosaves']['rss_mb'], r['memory_after_autosaves']['peak_rss_mb'], r['memory_after_autosaves_gc']['rss_mb'],
            r['memory_before_language']['rss_mb'], r['memory_after_language']['rss_mb'],
            r['memory_after_language']['rss_mb'] - r['memory_before_language']['rss_mb'], fmt(r['open_language_tab_ms'])]
           for r in results])
    print('### RSS during the autosave run (MB, every 5 saves)\n')
    table(['Profile', 'Series'], [[speed(r), ' → '.join(str(v) for v in r['autosave_rss_series_mb'])] for r in results])
    print('### Where the time goes (ms)\n')
    table(['Profile', 'updateNote()', 'of which export()', 'Refresh queries', 'John 3:16 query / total', 'Hot study query / total', 'All Studies query / total'],
          [[speed(r), fmt(r['update_note_ms']), fmt(r['export_ms']), fmt(r['refresh_queries_ms']),
            f"{fmt(r['query_john_3_16_ms'])} / {fmt(r['render_john_3_16_ms'])}",
            f"{fmt(r['query_hot_study_ms'])} / {fmt(r['render_hot_study_ms'])}",
            f"{fmt(r['query_all_studies_ms'])} / {fmt(r['render_all_studies_ms'])}"] for r in results])
    print('### Search (ms; whole `db.search()`, then the notes query alone)\n')
    table(['Profile', 'Common', 'Common, notes only', 'Rare', 'Rare, notes only', 'Planted', 'Planted, notes only', 'Scripture LIKE, common', 'Scripture LIKE, no match'],
          [[speed(r), fmt(r.get('search_common_ms'), 'search'), fmt(r.get('search_common_notes_only_ms')),
            fmt(r.get('search_rare_ms'), 'search'), fmt(r.get('search_rare_notes_only_ms')),
            fmt(r.get('search_planted_ms'), 'search'), fmt(r.get('search_planted_notes_only_ms')),
            fmt(r['scripture_like_common_ms']), fmt(r['scripture_like_rare_ms'])] for r in results])
    print('### Hot-spot rendering (ms to painted)\n')
    table(['Profile', 'John 3:16 (cards)', 'Psalm 119 (marked verses)', 'Hot study (notes)', 'All Studies'],
          [[speed(r), f"{fmt(r['render_john_3_16_ms'], 'render')} [{r['john_3_16_note_cards']}]",
            f"{fmt(r['render_psalm_119_ms'], 'render')} [{r['psalm_119_marked_verses']}]",
            f"{fmt(r['render_hot_study_ms'], 'render')} [{r.get('hot_study_note_blocks', '')}]",
            fmt(r['render_all_studies_ms'], 'render')] for r in results])
    print('### Size breakdown of the exported core.db (MB, normal runs)\n')
    table(['Profile', 'Reference', 'Seeded plans + templates', 'User tables', 'FTS shadow', 'SQLite internal', 'Free pages', 'Total'],
          [[f"{r['years']}y"] + [mb(r['breakdown']['groups'][g]) for g in
            ('reference', 'seeded_plans_templates', 'user', 'fts_shadow', 'sqlite_internal', 'free_pages')] + [mb(r['backup_bytes'])]
           for r in results if not r['throttled']])
    print('### Other\n')
    table(['Profile', 'Write bursts losing the last write', 'Autosave text intact', 'Console errors'],
          [[speed(r), f"{r['write_bursts_lost_last_write']} of {r['write_bursts']}", r['autosave_text_ok'], len(r['console_errors'])] for r in results])
    print(f'Machine: {platform.processor() or platform.machine()}, {os.cpu_count()} logical CPUs')


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(2)
    if args[0] == 'report':
        report()
        return
    server = start_server()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=['--enable-precise-memory-info'])
            if args[0] == 'base':
                capture_base(browser)
            elif args[0] == 'run':
                run_profile(browser, int(args[1]), '--throttled' in args)
            elif args[0] == 'all':
                for years in PROFILES:
                    for throttled in (False, True):
                        run_profile(browser, years, throttled)
            else:
                print(__doc__); sys.exit(2)
            browser.close()
    finally:
        server.terminate()


if __name__ == '__main__':
    main()
