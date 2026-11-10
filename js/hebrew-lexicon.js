// hebrew-lexicon.js — Hebrew tier 3 of the word card: Strong's and
// Brown-Driver-Briggs (Hebrew_Lexicon_Spec). Builds DOM only; what's open and
// when to fetch stays in language.js, with the rest of the card's state.
//
// The stored markup is third-party data, so it never reaches innerHTML: it is
// parsed as XML and rebuilt from the allowed list in renderElement below. No
// attribute is copied except the ones that list names.

const HEBREW_LETTER = /[֐-׿]/;

const ABRIDGED_NOTE = 'Abridged in this edition: references and etymology aren’t fully transcribed yet.';
const ABRIDGED_STATUSES = new Set(['base', 'ref']);

// Strong's pos attribute. A code not listed here shows as written (H3972's "x").
const PART_OF_SPEECH_LABELS = {
    'a': 'adjective', 'a-f': 'feminine adjective', 'a-m': 'masculine adjective',
    'a-gent': 'gentilic adjective', 'adv': 'adverb', 'conj': 'conjunction',
    'd': 'demonstrative', 'dp': 'demonstrative particle', 'i': 'interrogative',
    'inj': 'interjection', 'n': 'noun', 'n-f': 'feminine noun', 'n-m': 'masculine noun',
    'n-pr': 'proper name', 'n-pr-f': 'name of a woman', 'n-pr-loc': 'name of a place',
    'n-pr-m': 'name of a man', 'np': 'negative particle', 'p': 'pronoun',
    'prep': 'preposition', 'pron': 'pronoun', 'prt': 'particle', 'r': 'relative',
    'v': 'verb',
};

// ---- Which numbers get a Lexicon link ---------------------------------------

// The root pieces of a word that have a lexicon entry, one per distinct base
// number, in reading order: [{ strongs: 'H1254A', base: 1254 }]. Prefixes and
// suffixes are outside the braces in piece_strongs; the anatomy view glosses
// them. A one-piece word has no piece row, and its own number is its root.
// STEP-only numbers (>= 9000) have no lexicon entry. Every number below that
// which the text uses has a Strong's entry, so no lookup is needed here.
export function hebrewLexiconRoots(word, pieceRow) {
    const numbers = pieceRow
        ? [...pieceRow.pieceStrongs.matchAll(/\{([^}]*)\}/g)].map(match => match[1])
        : [word.strongs_number];
    const roots = new Map();
    for (const strongs of numbers) {
        const match = /^H(\d+)/.exec(strongs || '');
        if (!match) continue;
        const base = Number(match[1]);
        if (base < 9000 && !roots.has(base)) roots.set(base, { strongs, base });
    }
    return [...roots.values()];
}

// ---- Safe markup rendering --------------------------------------------------

const warnedElements = new Set();

function warnOnce(name) {
    if (warnedElements.has(name)) return;
    warnedElements.add(name);
    console.warn(`Hebrew lexicon: <${name}> is not on the allowed list; showing its text only.`);
}

function parseMarkup(markup) {
    const doc = new DOMParser().parseFromString(`<root>${markup}</root>`, 'application/xml');
    return doc.querySelector('parsererror') ? null : doc.documentElement;
}

// A fragment of DOM nodes for one stored *_markup string. Text the parser can't
// read stays visible as plain text. `context.bdbHeadwords` (from
// getHebrewLexiconEntry) names the entries a BDB body points at by id.
export function renderHebrewLexiconMarkup(markup, context = {}) {
    const fragment = document.createDocumentFragment();
    const root = parseMarkup(markup);
    if (root) {
        appendChildren(fragment, root, context);
    } else {
        warnOnce('unparsed markup');
        fragment.appendChild(document.createTextNode(markup));
    }
    return fragment;
}

function appendChildren(parent, source, context) {
    for (const node of source.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            parent.appendChild(document.createTextNode(node.nodeValue));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            renderElement(parent, node, context);
        }
    }
}

function spanWithChildren(parent, source, className, context) {
    const span = document.createElement('span');
    span.className = className;
    appendChildren(span, source, context);
    parent.appendChild(span);
    return span;
}

function renderElement(parent, element, context) {
    switch (element.localName) {
        case 'w':
            renderWord(parent, element, context);
            break;
        case 'def':
            spanWithChildren(parent, element, 'language-lexicon-def', context);
            break;
        case 'sense':
            renderSense(parent, element, context);
            break;
        case 'pos':
        case 'stem':
        case 'asp':
            spanWithChildren(parent, element, 'language-lexicon-grammar', context);
            break;
        case 'em': {
            const em = document.createElement('em');
            appendChildren(em, element, context);
            parent.appendChild(em);
            break;
        }
        case 'ref': {
            const ref = document.createElement('span');
            const verse = element.getAttribute('r');
            if (verse) ref.dataset.ref = verse;
            ref.textContent = element.textContent;
            parent.appendChild(ref);
            break;
        }
        case 'foreign':
            renderForeign(parent, element, context);
            break;
        case 'note':
            // Inline, inside a meaning or derivation (OSHB's editorial corrections
            // to Strong's). Strong's top-level note is its own field.
            parent.appendChild(document.createTextNode(' '));
            spanWithChildren(parent, element, 'language-lexicon-inline-note', context);
            break;
        case 'source':
        case 'meaning':
        case 'usage':
            appendChildren(parent, element, context);
            break;
        default:
            warnOnce(element.localName);
            parent.appendChild(document.createTextNode(element.textContent));
    }
}

// Hebrew or Aramaic in the verse-line font, isolated from the English around
// it. Strong's numbers ("7306") are <w> elements too, and read as the plain
// text they are. Where a BDB headword wasn't transcribed, the entry points at
// the one it shares that word with by its id ("id. [a.be.ad]"); that entry's
// headword is shown instead of the id.
function renderWord(parent, element, context) {
    const text = element.textContent;
    const pointsAt = element.getAttribute('src') === text ? context.bdbHeadwords?.get(text) : null;
    if (pointsAt) {
        parent.appendChild(hebrewSpan(pointsAt.headword, pointsAt.language));
        return;
    }
    if (!HEBREW_LETTER.test(text)) {
        parent.appendChild(document.createTextNode(text));
        return;
    }
    parent.appendChild(hebrewSpan(text, element.getAttribute('xml:lang')));
}

// BDB prints Arabic, Syriac and Ethiopic in their own scripts; where the
// transcription has only the language's name there, it shows in brackets as a
// placeholder ("Ar. [Arabic] cause to fly"), not as a word BDB wrote.
const PLACEHOLDER_LANGUAGES = { ara: 'Arabic', syr: 'Syriac', gez: 'Ethiopic', fas: 'Persian', peo: 'Persian' };

function renderForeign(parent, element, context) {
    const lang = element.getAttribute('xml:lang');
    if (lang && element.textContent === PLACEHOLDER_LANGUAGES[lang]) {
        const placeholder = document.createElement('span');
        placeholder.className = 'language-lexicon-placeholder';
        placeholder.textContent = `[${element.textContent}]`;
        parent.appendChild(placeholder);
        return;
    }
    const foreign = spanWithChildren(parent, element, 'language-lexicon-foreign', context);
    if (lang) foreign.lang = lang;
}

function hebrewSpan(text, language) {
    const span = document.createElement('span');
    span.className = 'language-lexicon-hebrew';
    span.lang = language === 'arc' ? 'arc' : 'he';
    span.dir = 'rtl';
    span.textContent = text;
    return span;
}

// The source's own numbers and letters; about a quarter of senses (all of a
// verb's stems, for one) have none and show no label.
function renderSense(parent, element, context) {
    const sense = document.createElement('div');
    sense.className = 'language-lexicon-sense';
    const number = element.getAttribute('n');
    if (number) {
        const label = document.createElement('span');
        label.className = 'language-lexicon-sense-label';
        label.textContent = number;
        sense.appendChild(label);
    }
    const body = document.createElement('div');
    body.className = 'language-lexicon-sense-body';
    appendChildren(body, element, context);
    sense.appendChild(body);
    parent.appendChild(sense);
}

// ---- The lexicon view -------------------------------------------------------

// `expansion` says which of a homonym set's lower entries are open:
// { isOpen(bdbId), toggle(bdbId) }.
export function renderHebrewLexiconEntry(entry, expansion) {
    const fragment = document.createDocumentFragment();
    if (entry.strongs) fragment.appendChild(renderStrongs(entry.strongs));
    fragment.appendChild(renderBdb(entry.bdb, expansion, { bdbHeadwords: entry.bdbHeadwords }));
    return fragment;
}

function sectionHeading(text) {
    const heading = document.createElement('div');
    heading.className = 'language-detail-heading';
    heading.textContent = text;
    return heading;
}

function quietLine(text, className = 'language-lexicon-quiet') {
    const line = document.createElement('div');
    line.className = className;
    line.textContent = text;
    return line;
}

function aramaicLabel() {
    const label = document.createElement('div');
    label.className = 'language-card-language';
    label.textContent = 'Aramaic';
    return label;
}

function renderStrongs(strongs) {
    const section = document.createElement('div');
    section.className = 'language-lexicon-strongs';
    section.appendChild(sectionHeading('Strong’s'));

    const head = document.createElement('div');
    head.className = 'language-lexicon-head';
    const headword = hebrewSpan(strongs.headword, strongs.language);
    headword.classList.add('language-lexicon-headword');
    head.appendChild(headword);
    if (strongs.transliteration) {
        const transliteration = document.createElement('span');
        transliteration.textContent = strongs.transliteration;
        head.appendChild(transliteration);
    }
    if (strongs.partOfSpeech) {
        const partOfSpeech = document.createElement('span');
        partOfSpeech.className = 'language-lexicon-grammar';
        partOfSpeech.textContent = partOfSpeechLabel(strongs.partOfSpeech);
        head.appendChild(partOfSpeech);
    }
    section.appendChild(head);

    // Strong's language attribute marks names as x-pn, Aramaic or not (H0426
    // among them); its own text says "(Aramaic)" for those that are.
    if (strongs.language === 'arc' || (strongs.sourceMarkup || '').startsWith('(Aramaic)')) {
        section.appendChild(aramaicLabel());
    }

    appendMarkupField(section, 'Meaning', strongs.meaningMarkup);
    appendMarkupField(section, 'Derivation', strongs.sourceMarkup);
    appendMarkupField(section, 'KJV translates as', strongs.usageMarkup);
    if (strongs.noteMarkup) {
        const note = document.createElement('div');
        note.className = 'language-lexicon-quiet';
        note.appendChild(renderHebrewLexiconMarkup(strongs.noteMarkup));
        section.appendChild(note);
    }
    return section;
}

function partOfSpeechLabel(codes) {
    return codes.split(' ').map(code => PART_OF_SPEECH_LABELS[code] ?? code).join(', ');
}

function appendMarkupField(container, label, markup) {
    if (!markup) return;
    const field = document.createElement('div');
    field.className = 'language-detail-field';
    const labelEl = document.createElement('span');
    labelEl.className = 'language-detail-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'language-detail-value';
    valueEl.appendChild(renderHebrewLexiconMarkup(markup));
    field.appendChild(labelEl);
    field.appendChild(valueEl);
    container.appendChild(field);
}

function renderBdb(entries, expansion, context) {
    const section = document.createElement('div');
    section.className = 'language-lexicon-bdb';
    section.appendChild(sectionHeading('Brown-Driver-Briggs'));

    if (entries.length === 0) {
        section.appendChild(quietLine('No Brown-Driver-Briggs entry is linked to this Strong’s number.'));
        return section;
    }
    if (entries.length > 1) {
        section.appendChild(quietLine(
            `This Strong’s number covers ${entries.length} entries in BDB, listed by how often each occurs. `
            + 'Which one applies in this verse isn’t marked.'));
    }

    entries.forEach((entry, index) => {
        if (index === 0) {
            section.appendChild(renderBdbEntry(entry, context));
            return;
        }
        const open = expansion.isOpen(entry.bdbId);
        section.appendChild(renderBdbToggle(entry, open, expansion, context));
        if (open) section.appendChild(renderBdbEntry(entry, context));
    });
    return section;
}

function renderBdbEntry(entry, context) {
    const wrap = document.createElement('div');
    wrap.className = 'language-lexicon-bdb-entry';
    wrap.dataset.bdbId = entry.bdbId;
    if (entry.language === 'arc') wrap.appendChild(aramaicLabel());
    const body = document.createElement('div');
    body.className = 'language-detail-lexicon';
    body.appendChild(renderHebrewLexiconMarkup(entry.bodyMarkup, context));
    wrap.appendChild(body);
    if (ABRIDGED_STATUSES.has(entry.status)) {
        wrap.appendChild(quietLine(ABRIDGED_NOTE));
    }
    return wrap;
}

// One line for a lower entry: headword, part of speech, first definition.
function renderBdbToggle(entry, open, expansion, context) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'language-card-lexicon-btn language-lexicon-entry-btn';
    button.classList.toggle('open', open);
    button.appendChild(hebrewSpan(entry.headword, entry.language));

    const { partOfSpeech, meaning } = summarizeBdbEntry(entry.bodyMarkup, context);
    if (partOfSpeech) {
        button.appendChild(document.createTextNode(' '));
        const grammar = document.createElement('span');
        grammar.className = 'language-lexicon-grammar';
        grammar.textContent = partOfSpeech;
        button.appendChild(grammar);
    }
    if (meaning) {
        button.appendChild(document.createTextNode(` ${meaning}`));
    }
    button.addEventListener('click', () => expansion.toggle(entry.bdbId));
    return button;
}

// An entry with no <def> (mostly names: "a son of Rehoboam") gives its opening
// words instead, without the headword and part of speech already on the line.
function summarizeBdbEntry(markup, context) {
    const root = parseMarkup(markup);
    if (!root) return { partOfSpeech: null, meaning: '' };
    for (const word of root.querySelectorAll('w[src]')) {
        const pointsAt = word.getAttribute('src') === word.textContent && context.bdbHeadwords?.get(word.textContent);
        if (pointsAt) word.textContent = pointsAt.headword;
    }
    const partOfSpeech = root.querySelector('pos');
    const definition = root.querySelector('def');
    const summary = {
        partOfSpeech: partOfSpeech ? partOfSpeech.textContent : null,
        meaning: definition ? definition.textContent : '',
    };
    if (!definition) {
        root.querySelector('w')?.remove();
        partOfSpeech?.remove();
        summary.meaning = root.textContent.replace(/\s+/g, ' ').replace(/^[\s.,;:\[\]()—-]+/, '').trim();
    }
    return summary;
}
