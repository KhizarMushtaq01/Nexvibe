# Help Sub-Pages, Problem Reports & Admin Feedback Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five dead `href="#"` links in Settings → Help with working in-app sub-pages (Help Center, Privacy Policy, Cookies Policy, Terms, Community Guidelines, About), add a real "Report a problem" form backed by a new `Feedback` model, and give admins a fully functional tab to triage those reports.

**Architecture:** Legal and FAQ copy moves into structured data modules under `frontend/src/content/`, rendered by two shared components (`LegalDocument`, `FaqBrowser`). The existing public pages and the new in-app Settings pages both read from those modules, so the two can never drift. Problem reports get their own small `Feedback` model rather than distorting the existing `Report` model's `targetType` enum.

**Tech Stack:** React 18 + Tailwind + react-icons/fi + react-hot-toast + react-router-dom (frontend), Express + Mongoose + multer/Cloudinary + express-rate-limit (backend), Vitest for pure-module tests.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-08-11-calling-chat-shortcuts-help-design.md`. Read it before starting.
- **Independent of the other two plans** in this batch — no shared files.
- **One source of truth for copy.** Any text that appears both publicly and in-app lives in `frontend/src/content/` and is imported by both. Never duplicate a paragraph.
- **No `dangerouslySetInnerHTML` anywhere.** Legal content is structured data, rendered as React elements.
- **Testing convention:** this repo unit-tests only pure modules (`frontend/src/lib/*.test.js`); there is no `@testing-library/react`. Do not add component tests or new frontend dependencies. Backend uses Vitest (added in Task 4 if not already present).
- **Frontend test command:** run from `frontend/`: `npx vitest run src/lib/<file>.test.js`
- **Backend test command:** run from `backend/`: `npx vitest run lib/<file>.test.js`
- **Styling:** existing CSS variables (`var(--bg-primary)`, `var(--bg-secondary)`, `var(--bg-tertiary)`, `var(--border)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`) and the existing `btn-brand` / `btn-outline` / `shimmer` utility classes. Icons from `react-icons/fi`.
- **Admin endpoints** go behind the existing `isAdmin` guard array in `backend/routes/adminRoutes.js:6`.
- **Commit after every task.**

---

### Task 1: Content modules and the shared `LegalDocument` renderer

**Files:**
- Create: `frontend/src/content/legal/privacy.js`
- Create: `frontend/src/content/legal/cookies.js`
- Create: `frontend/src/content/legal/terms.js`
- Create: `frontend/src/content/legal/guidelines.js`
- Create: `frontend/src/content/legal/about.js`
- Create: `frontend/src/content/legal/index.js`
- Create: `frontend/src/components/common/LegalDocument.jsx`
- Test: `frontend/src/content/legal/legal.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Each legal module default-exports `{ slug, title, lastUpdated, intro, sections: [{ heading, paragraphs: string[], bullets?: string[] }] }`
  - `frontend/src/content/legal/index.js` exports `LEGAL_DOCS: Record<slug, Doc>` and `getLegalDoc(slug) => Doc | null`
  - `<LegalDocument doc={Doc} />`

- [ ] **Step 1: Read the existing public pages first**

Open `frontend/src/pages/Privacy.jsx`, `frontend/src/pages/Cookies.jsx` and `frontend/src/pages/Terms.jsx`. The copy already written there is the source material — move it into the content modules rather than inventing new text. Only write fresh copy for `guidelines.js` and `about.js`, which have no existing page.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/content/legal/legal.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { LEGAL_DOCS, getLegalDoc } from './index.js';

const SLUGS = ['privacy', 'cookies', 'terms', 'guidelines', 'about'];

describe('LEGAL_DOCS', () => {
  it('contains every expected document', () => {
    expect(Object.keys(LEGAL_DOCS).sort()).toEqual([...SLUGS].sort());
  });

  it.each(SLUGS)('%s has a slug matching its key', (slug) => {
    expect(LEGAL_DOCS[slug].slug).toBe(slug);
  });

  it.each(SLUGS)('%s has a title and a last-updated date', (slug) => {
    expect(LEGAL_DOCS[slug].title).toBeTruthy();
    expect(LEGAL_DOCS[slug].lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each(SLUGS)('%s has at least three sections', (slug) => {
    expect(LEGAL_DOCS[slug].sections.length).toBeGreaterThanOrEqual(3);
  });

  it.each(SLUGS)('%s has a heading and real body text in every section', (slug) => {
    for (const section of LEGAL_DOCS[slug].sections) {
      expect(section.heading).toBeTruthy();
      const hasBody = (section.paragraphs?.length || 0) > 0 || (section.bullets?.length || 0) > 0;
      expect(hasBody).toBe(true);
    }
  });

  it.each(SLUGS)('%s contains no placeholder text', (slug) => {
    const blob = JSON.stringify(LEGAL_DOCS[slug]).toLowerCase();
    for (const bad of ['lorem ipsum', 'tbd', 'todo', 'placeholder', 'coming soon']) {
      expect(blob).not.toContain(bad);
    }
  });
});

describe('getLegalDoc', () => {
  it('returns the document for a known slug', () => expect(getLegalDoc('privacy').slug).toBe('privacy'));
  it('returns null for an unknown slug', () => expect(getLegalDoc('nope')).toBeNull());
  it('returns null rather than a prototype member for "constructor"', () => {
    expect(getLegalDoc('constructor')).toBeNull();
  });
  it('returns null for a missing slug', () => expect(getLegalDoc(undefined)).toBeNull());
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `frontend/`: `npx vitest run src/content/legal/legal.test.js`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 4: Write the content modules**

Create each file in the shape below. `privacy.js`, `cookies.js` and `terms.js` take their `paragraphs` verbatim from the corresponding existing public page; the example shows the required structure, not the required words.

`frontend/src/content/legal/privacy.js`:

```js
// Single source of truth for the privacy policy. Rendered both by the public
// /privacy page and by Settings -> Help -> Privacy Policy, so the two can
// never say different things.
export default {
  slug: 'privacy',
  title: 'Privacy Policy',
  lastUpdated: '2026-08-11',
  intro: 'This policy explains what NexVibe collects, why, and what control you have over it.',
  sections: [
    {
      heading: 'Information we collect',
      paragraphs: [
        'Account information you give us: your name, username, email address or phone number, date of birth, and profile photo.',
        'Content you create: posts, stories, reels, comments, and messages, along with the metadata attached to them such as timestamps and any location you choose to tag.',
      ],
      bullets: [
        'Device and connection data: browser type, operating system, and IP address.',
        'Usage data: which posts you view, search terms, and interactions.',
      ],
    },
    // ... remaining sections, taken from pages/Privacy.jsx
  ],
};
```

Do the same for `cookies.js` (slug `cookies`, title "Cookies Policy"), `terms.js` (slug `terms`, title "Terms of Service"), and write these two fresh:

- `guidelines.js` — slug `guidelines`, title "Community Guidelines". Sections covering: what NexVibe is for; content that is not allowed (harassment, hate speech, nudity, violence, spam, impersonation); authenticity and impersonation; intellectual property; what happens when a rule is broken (removal, strike, ban) and how to appeal. Each section needs real paragraphs — this is the document users are pointed at when their content is removed, so it has to actually say something.
- `about.js` — slug `about`, title "About NexVibe". Sections covering: what the app is; the technology it runs on (React, Node.js, MongoDB, Socket.io); privacy and security posture including end-to-end encrypted direct messages; and how to get in touch.

`frontend/src/content/legal/index.js`:

```js
import privacy from './privacy.js';
import cookies from './cookies.js';
import terms from './terms.js';
import guidelines from './guidelines.js';
import about from './about.js';

export const LEGAL_DOCS = { privacy, cookies, terms, guidelines, about };

// Own-property check so a URL of /settings/help/constructor resolves to
// "not found" rather than to Object.prototype.constructor.
export const getLegalDoc = (slug) =>
  (typeof slug === 'string' && Object.prototype.hasOwnProperty.call(LEGAL_DOCS, slug))
    ? LEGAL_DOCS[slug]
    : null;
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `frontend/`: `npx vitest run src/content/legal/legal.test.js`
Expected: PASS.

- [ ] **Step 6: Write the renderer**

Create `frontend/src/components/common/LegalDocument.jsx`:

```jsx
import { format } from 'date-fns';

/**
 * Renders a structured legal document. Deliberately takes data rather than
 * an HTML string -- no dangerouslySetInnerHTML, and the typography stays
 * consistent across every document.
 */
export default function LegalDocument({ doc, compact = false }) {
  if (!doc) return null;

  return (
    <article className={compact ? 'max-w-none' : 'max-w-3xl mx-auto'}>
      <header className="mb-8">
        <h1 className={`font-black mb-2 ${compact ? 'text-2xl' : 'text-3xl sm:text-4xl'}`}>{doc.title}</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Last updated {format(new Date(doc.lastUpdated), 'd MMMM yyyy')}
        </p>
        {doc.intro && (
          <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">{doc.intro}</p>
        )}
      </header>

      <div className="space-y-8">
        {doc.sections.map((section, i) => (
          <section key={i}>
            <h2 className="text-lg font-bold mb-3">{section.heading}</h2>

            {section.paragraphs?.map((p, pi) => (
              <p key={pi} className="text-[var(--text-secondary)] leading-relaxed mb-3 last:mb-0">{p}</p>
            ))}

            {section.bullets?.length > 0 && (
              <ul className="list-disc pl-5 space-y-1.5 mt-3 text-[var(--text-secondary)] leading-relaxed">
                {section.bullets.map((b, bi) => <li key={bi}>{b}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
```

- [ ] **Step 7: Point the public pages at the shared content**

Rewrite `frontend/src/pages/Privacy.jsx` to render the shared doc while keeping its existing public chrome:

```jsx
import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import PublicHeader from '../components/common/PublicHeader';
import LegalDocument from '../components/common/LegalDocument';
import { LEGAL_DOCS } from '../content/legal';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-8 transition-colors">
          <FiArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        <LegalDocument doc={LEGAL_DOCS.privacy} />
      </main>
    </div>
  );
}
```

Do the same for `Cookies.jsx` (`LEGAL_DOCS.cookies`) and `Terms.jsx` (`LEGAL_DOCS.terms`). If either page has extra chrome beyond the header, back link and body copy, preserve it.

- [ ] **Step 8: Verify**

Run from `frontend/`: `npm run build` → succeeds.

Then visit `/privacy`, `/cookies` and `/terms` in the app and confirm each renders the full document with correct headings and no missing sections, in both light and dark theme.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/content frontend/src/components/common/LegalDocument.jsx frontend/src/pages/Privacy.jsx frontend/src/pages/Cookies.jsx frontend/src/pages/Terms.jsx
git commit -m "feat: extract legal copy into shared content modules with a structured renderer"
```

---

### Task 2: Extract `FaqBrowser` from the public help page

**Files:**
- Create: `frontend/src/content/faq.js`
- Create: `frontend/src/components/common/FaqBrowser.jsx`
- Test: `frontend/src/lib/faqSearch.js` + `frontend/src/lib/faqSearch.test.js`
- Modify: `frontend/src/pages/Help.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FAQ_CATEGORIES: Array<{ key, title, iconName, questions: [{ id, q, a }] }>` from `content/faq.js`
  - `filterFaqs(categories, { query, categoryKey }) => Array<{ id, q, a, category }>` from `lib/faqSearch.js`
  - `<FaqBrowser lockedCategory?: string />`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/faqSearch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { filterFaqs, flattenFaqs } from './faqSearch.js';

const categories = [
  { key: 'account', title: 'Account Management', questions: [
    { id: 1, q: 'How do I reset my password?', a: 'Click Forgot Password on the login page.' },
    { id: 2, q: 'Can I change my username?', a: 'Yes, from Edit Profile.' },
  ]},
  { key: 'privacy', title: 'Privacy & Security', questions: [
    { id: 3, q: 'How do I block someone?', a: 'Open their profile and choose Block.' },
  ]},
];

describe('flattenFaqs', () => {
  it('tags every question with its category key and title', () => {
    const all = flattenFaqs(categories);
    expect(all).toHaveLength(3);
    expect(all[0].categoryKey).toBe('account');
    expect(all[0].category).toBe('Account Management');
  });

  it('handles an empty list', () => expect(flattenFaqs([])).toEqual([]));
});

describe('filterFaqs', () => {
  it('returns everything with no query and no category', () => {
    expect(filterFaqs(categories, {})).toHaveLength(3);
  });

  it('filters by category key', () => {
    const result = filterFaqs(categories, { categoryKey: 'privacy' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it('ignores an unknown category key rather than returning nothing', () => {
    expect(filterFaqs(categories, { categoryKey: 'nope' })).toHaveLength(3);
  });

  it('searches questions case-insensitively', () => {
    expect(filterFaqs(categories, { query: 'PASSWORD' }).map(f => f.id)).toEqual([1]);
  });

  it('searches answers too', () => {
    expect(filterFaqs(categories, { query: 'edit profile' }).map(f => f.id)).toEqual([2]);
  });

  it('lets a query search across categories even when one is selected', () => {
    // A search is a deliberate act -- narrowing it to the open tab would hide
    // the answer the user is looking for.
    expect(filterFaqs(categories, { query: 'block', categoryKey: 'account' }).map(f => f.id)).toEqual([3]);
  });

  it('returns nothing when the query matches nothing', () => {
    expect(filterFaqs(categories, { query: 'zzzzz' })).toEqual([]);
  });

  it('treats a whitespace-only query as no query', () => {
    expect(filterFaqs(categories, { query: '   ' })).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`: `npx vitest run src/lib/faqSearch.test.js`
Expected: FAIL — cannot resolve `./faqSearch.js`.

- [ ] **Step 3: Write the search module**

Create `frontend/src/lib/faqSearch.js`:

```js
export const flattenFaqs = (categories) =>
  (categories || []).flatMap(cat =>
    (cat.questions || []).map(q => ({ ...q, categoryKey: cat.key, category: cat.title }))
  );

/**
 * A query wins over the selected category: searching is a deliberate act and
 * should surface the answer wherever it lives, rather than silently hiding
 * hits outside the open tab.
 */
export const filterFaqs = (categories, { query = '', categoryKey = null } = {}) => {
  const all = flattenFaqs(categories);
  const q = query.trim().toLowerCase();

  if (q) {
    return all.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
  }
  if (categoryKey && all.some(f => f.categoryKey === categoryKey)) {
    return all.filter(f => f.categoryKey === categoryKey);
  }
  return all;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`: `npx vitest run src/lib/faqSearch.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Move the FAQ data into a content module**

Create `frontend/src/content/faq.js`. Move the `faqCategories` object from `frontend/src/pages/Help.jsx:12-68` here, converting it from an object keyed by category into an array (so order is explicit) and replacing the inline JSX icons with icon *names*, since content modules must not import React:

```js
// FAQ copy shared by the public /help page and Settings -> Help -> Help Center.
// Icons are named here and resolved to components by FaqBrowser -- content
// modules stay free of JSX so they can be imported anywhere.
export const FAQ_CATEGORIES = [
  {
    key: 'account',
    title: 'Account Management',
    iconName: 'user',
    questions: [
      { id: 1, q: 'How do I create an account?', a: "Click 'Sign Up' on the homepage or login page. You can sign up with email, phone number, or connect with Google, Facebook, or Apple." },
      // ... the remaining questions, moved verbatim from Help.jsx
    ],
  },
  // ... privacy, content, engagement, troubleshooting
];
```

Keep every existing question and answer — this is a move, not a rewrite.

- [ ] **Step 6: Write `FaqBrowser`**

Create `frontend/src/components/common/FaqBrowser.jsx`:

```jsx
import { useState } from 'react';
import { FiSearch, FiHelpCircle, FiChevronDown, FiUser, FiShield, FiCamera, FiHeart } from 'react-icons/fi';
import { FAQ_CATEGORIES } from '../../content/faq';
import { filterFaqs } from '../../lib/faqSearch';

const ICONS = { user: FiUser, shield: FiShield, camera: FiCamera, heart: FiHeart, help: FiHelpCircle };

/**
 * @param lockedCategory when set, the browser shows only that category and
 *   hides the category tabs -- used by "Privacy and Security Help", which is
 *   the same browser pointed at one topic.
 */
export default function FaqBrowser({ lockedCategory = null, compact = false }) {
  const [query, setQuery] = useState('');
  const [categoryKey, setCategoryKey] = useState(lockedCategory);
  const [openId, setOpenId] = useState(null);

  const results = filterFaqs(FAQ_CATEGORIES, {
    query,
    categoryKey: lockedCategory || categoryKey,
  });

  return (
    <div>
      <div className={`relative ${compact ? 'mb-5' : 'mb-8 max-w-2xl mx-auto'}`}>
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] w-5 h-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for help..."
          className="w-full pl-12 pr-4 py-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-pink-500 transition-colors"
        />
      </div>

      {!lockedCategory && (
        <div className={`flex flex-wrap gap-2 ${compact ? 'mb-5' : 'mb-8 justify-center'}`}>
          <button
            onClick={() => setCategoryKey(null)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              categoryKey === null
                ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/25'
                : 'bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            All Topics
          </button>
          {FAQ_CATEGORIES.map(cat => {
            const Icon = ICONS[cat.iconName] || FiHelpCircle;
            return (
              <button
                key={cat.key}
                onClick={() => setCategoryKey(cat.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  categoryKey === cat.key
                    ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/25'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {cat.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        {results.length === 0 ? (
          <div className="text-center py-12">
            <FiHelpCircle className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No results found</h3>
            <p className="text-sm text-[var(--text-secondary)]">Try different keywords, or report a problem below.</p>
          </div>
        ) : results.map(faq => (
          <div key={faq.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden">
            <button
              onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
              aria-expanded={openId === faq.id}
              className="flex items-center justify-between w-full p-4 text-left hover:bg-[var(--bg-tertiary)] transition-colors gap-3"
            >
              <span className="font-semibold text-sm">{faq.q}</span>
              <FiChevronDown className={`w-5 h-5 text-[var(--text-muted)] flex-shrink-0 transition-transform ${openId === faq.id ? 'rotate-180' : ''}`} />
            </button>
            {openId === faq.id && (
              <div className="p-4 pt-0 border-t border-[var(--border)] text-sm text-[var(--text-secondary)] leading-relaxed">
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Rewrite the public help page to use it**

Rewrite `frontend/src/pages/Help.jsx`, keeping the page's hero, "Still need help?" block and `PublicHeader`, but replacing the inline FAQ data, search state, category state and accordion with a single `<FaqBrowser />`.

While there, fix the dead link: `Help.jsx:176` points to `/contact`, which is not a route in `App.jsx`. Change it to point at `/settings/help/report` for logged-in users, or keep only the `mailto:support@nexvibe.com` button. Pick one — do not leave a link to a 404.

- [ ] **Step 8: Verify**

Run from `frontend/`: `npx vitest run src/lib/faqSearch.test.js && npm run build` → both pass.

Then visit `/help` and confirm: search filters, the category tabs filter, the accordion opens and closes, and every question that existed before is still there (25 of them).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/content/faq.js frontend/src/lib/faqSearch.js frontend/src/lib/faqSearch.test.js frontend/src/components/common/FaqBrowser.jsx frontend/src/pages/Help.jsx
git commit -m "feat: extract reusable FaqBrowser and shared FAQ content"
```

---

### Task 3: Settings → Help index and sub-page routing

**Files:**
- Modify: `frontend/src/pages/main/SettingsPage.jsx:533-544` (`HelpSection`) and the section dispatch at `:60-69`
- Create: `frontend/src/components/settings/HelpSubPage.jsx`
- Modify: `frontend/src/App.jsx` (add the nested help route)

**Interfaces:**
- Consumes: `LegalDocument` + `getLegalDoc` (Task 1), `FaqBrowser` (Task 2).
- Produces: routes `/settings/help/:page` for `center`, `privacy-help`, `privacy`, `cookies`, `terms`, `guidelines`, `report`, `about`.

- [ ] **Step 1: Add the route**

In `frontend/src/App.jsx`, next to the existing settings routes (lines 123–124), add:

```jsx
        <Route path="/settings/help/:page" element={<SettingsPage />} />
```

It must come **before** `<Route path="/:username" element={<ProfilePage />} />` — that catch-all would otherwise swallow it. The existing settings routes are already above it, so inserting immediately after line 124 is correct.

- [ ] **Step 2: Teach `SettingsPage` about the sub-page param**

In `frontend/src/pages/main/SettingsPage.jsx`, change the params destructure (line 22):

```jsx
  const { section = 'profile', page } = useParams();
```

and add the sub-page branch in the content dispatch, replacing line 68:

```jsx
          {activeSection === 'help' && (page
            ? <HelpSubPage page={page} />
            : <HelpSection navigate={navigate} />)}
```

Also make the mobile header show the sub-page's name and step back to the Help index rather than all the way out. Replace the mobile header block (lines 54–59):

```jsx
        <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-[var(--border)] md:hidden">
          <button
            aria-label="Back"
            onClick={() => {
              // A sub-page steps back to the Help index; the index steps back
              // to the settings menu.
              if (page) { navigate('/settings/help'); return; }
              setMobileShowSection(false);
              navigate('/settings');
            }}>
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="font-bold">
            {page ? HELP_PAGE_TITLES[page] || 'Help' : SECTIONS.find(s => s.key === activeSection)?.label}
          </h2>
        </div>
```

And keep `activeSection` in sync when the URL carries a sub-page — add near the top of the component:

```jsx
  // /settings/help/privacy has section === 'help' in the URL, so the sidebar
  // highlight and the mobile pane both need to follow it.
  useEffect(() => {
    setActiveSection(section);
    if (section !== 'profile' || page) setMobileShowSection(true);
  }, [section, page]);
```

- [ ] **Step 3: Replace the dead `HelpSection`**

Replace `frontend/src/pages/main/SettingsPage.jsx:533-544` entirely with:

```jsx
const HELP_PAGES = [
  { slug: 'center',       label: 'Help Center',              desc: 'Browse answers to common questions' },
  { slug: 'privacy-help', label: 'Privacy and Security Help', desc: 'Account privacy, blocking, 2FA' },
  { slug: 'report',       label: 'Report a problem',          desc: 'Tell us about a bug or abuse' },
  { slug: 'privacy',      label: 'Privacy Policy',            desc: 'What we collect and why' },
  { slug: 'cookies',      label: 'Cookies Policy',            desc: 'How we use cookies' },
  { slug: 'terms',        label: 'Terms of Service',          desc: 'The rules of using NexVibe' },
  { slug: 'guidelines',   label: 'Community Guidelines',      desc: "What's allowed on NexVibe" },
  { slug: 'about',        label: 'About',                     desc: 'Version and credits' },
];

export const HELP_PAGE_TITLES = Object.fromEntries(HELP_PAGES.map(p => [p.slug, p.label]));

function HelpSection({ navigate }) {
  return (
    <div className="max-w-[600px]">
      <h2 className="text-xl font-bold hidden md:block mb-5">Help</h2>
      {HELP_PAGES.map(item => (
        <button
          key={item.slug}
          onClick={() => navigate(`/settings/help/${item.slug}`)}
          className="w-full flex items-center justify-between gap-4 py-3.5 border-b border-[var(--border)] text-left hover:bg-[var(--bg-tertiary)] transition-colors px-2 -mx-2 rounded-lg"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">{item.label}</span>
            <span className="block text-xs text-[var(--text-muted)] truncate">{item.desc}</span>
          </span>
          <span className="text-[var(--text-muted)] flex-shrink-0">›</span>
        </button>
      ))}
    </div>
  );
}
```

`HELP_PAGE_TITLES` is exported because the mobile header above reads it; import it in `HelpSubPage` too rather than redefining the labels.

- [ ] **Step 4: Write `HelpSubPage`**

Create `frontend/src/components/settings/HelpSubPage.jsx`:

```jsx
import { Link } from 'react-router-dom';
import FaqBrowser from '../common/FaqBrowser';
import LegalDocument from '../common/LegalDocument';
import ReportProblemForm from './ReportProblemForm';
import { getLegalDoc } from '../../content/legal';

export default function HelpSubPage({ page }) {
  if (page === 'center') {
    return (
      <div className="max-w-[700px]">
        <h2 className="text-xl font-bold hidden md:block mb-5">Help Center</h2>
        <FaqBrowser compact />
      </div>
    );
  }

  if (page === 'privacy-help') {
    return (
      <div className="max-w-[700px]">
        <h2 className="text-xl font-bold hidden md:block mb-5">Privacy and Security Help</h2>
        <FaqBrowser compact lockedCategory="privacy" />
      </div>
    );
  }

  if (page === 'report') {
    return (
      <div className="max-w-[600px]">
        <h2 className="text-xl font-bold hidden md:block mb-5">Report a problem</h2>
        <ReportProblemForm />
      </div>
    );
  }

  const doc = getLegalDoc(page);
  if (doc) {
    return (
      <div className="max-w-[700px]">
        <LegalDocument doc={doc} compact />
      </div>
    );
  }

  return (
    <div className="max-w-[600px] py-12 text-center">
      <p className="font-semibold mb-2">Page not found</p>
      <p className="text-sm text-[var(--text-muted)] mb-4">This help page doesn't exist.</p>
      <Link to="/settings/help" className="btn-outline inline-block px-4 py-2 text-sm">Back to Help</Link>
    </div>
  );
}
```

`ReportProblemForm` is built in Task 5. Until then, stub it out to keep the build green — create `frontend/src/components/settings/ReportProblemForm.jsx` containing `export default function ReportProblemForm() { return null; }` and replace it wholesale in Task 5. Note the stub in the commit message so it is not mistaken for finished work.

- [ ] **Step 5: Verify**

Run from `frontend/`: `npm run build` → succeeds.

In the app, go to Settings → Help. Confirm: eight rows, each navigating to its page; Help Center shows the searchable FAQ; Privacy and Security Help shows only privacy questions with no category tabs; the four legal pages render in full; `/settings/help/nonsense` shows the not-found state; on mobile the back arrow goes Help sub-page → Help index → Settings menu, one step at a time.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/main/SettingsPage.jsx frontend/src/components/settings frontend/src/App.jsx
git commit -m "feat: make Settings help sub-pages real (report form stubbed, built in the next task)"
```

---

### Task 4: `Feedback` model and submission endpoint

**Files:**
- Create: `backend/models/Feedback.js`
- Create: `backend/controllers/feedbackController.js`
- Create: `backend/routes/feedbackRoutes.js`
- Create: `backend/lib/feedback.js`
- Test: `backend/lib/feedback.test.js`
- Modify: `backend/middleware/rateLimiters.js` (add `feedbackLimiter`)
- Modify: `backend/server.js:121` (mount the route)

**Interfaces:**
- Consumes: existing `protect`, `upload`, `uploadToCloudinary`.
- Produces:
  - `FEEDBACK_CATEGORIES`, `FEEDBACK_STATUSES`, `validateFeedback({ category, description }) => { valid, error }` from `backend/lib/feedback.js`
  - `POST /api/feedback` (multipart, optional `screenshot` file) → `{ success, feedback }`
  - `GET /api/feedback/mine?page=1` → `{ success, feedback: [], total, pages }`

- [ ] **Step 1: Add Vitest to the backend if it is not already there**

Check `backend/package.json` for a `test` script. If absent, run from `backend/`: `npm install --save-dev vitest@^4.1.10` and add `"test": "vitest run"` to `scripts`.

- [ ] **Step 2: Write the failing test**

Create `backend/lib/feedback.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, validateFeedback, MAX_DESCRIPTION } from './feedback.js';

describe('constants', () => {
  it('exposes the six categories', () => {
    expect(FEEDBACK_CATEGORIES).toEqual(['bug', 'abuse', 'payment', 'account', 'suggestion', 'other']);
  });

  it('exposes the four statuses', () => {
    expect(FEEDBACK_STATUSES).toEqual(['open', 'in_progress', 'resolved', 'wont_fix']);
  });

  it('caps descriptions at 2000 characters', () => expect(MAX_DESCRIPTION).toBe(2000));
});

describe('validateFeedback', () => {
  it('accepts a well-formed report', () => {
    expect(validateFeedback({ category: 'bug', description: 'The feed does not load.' }))
      .toEqual({ valid: true, error: null });
  });

  it('rejects an unknown category', () => {
    const { valid, error } = validateFeedback({ category: 'nonsense', description: 'x'.repeat(20) });
    expect(valid).toBe(false);
    expect(error).toMatch(/category/i);
  });

  it('rejects a missing category', () => {
    expect(validateFeedback({ description: 'x'.repeat(20) }).valid).toBe(false);
  });

  it('rejects an empty description', () => {
    const { valid, error } = validateFeedback({ category: 'bug', description: '   ' });
    expect(valid).toBe(false);
    expect(error).toMatch(/description/i);
  });

  it('rejects a description that is too short to act on', () => {
    expect(validateFeedback({ category: 'bug', description: 'help' }).valid).toBe(false);
  });

  it('rejects a description over the limit', () => {
    const { valid, error } = validateFeedback({ category: 'bug', description: 'x'.repeat(2001) });
    expect(valid).toBe(false);
    expect(error).toMatch(/2000/);
  });

  it('accepts a description exactly at the limit', () => {
    expect(validateFeedback({ category: 'bug', description: 'x'.repeat(2000) }).valid).toBe(true);
  });

  it('rejects a non-string description', () => {
    expect(validateFeedback({ category: 'bug', description: 42 }).valid).toBe(false);
  });

  it('does not accept a prototype key as a category', () => {
    expect(validateFeedback({ category: 'constructor', description: 'x'.repeat(20) }).valid).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `backend/`: `npx vitest run lib/feedback.test.js`
Expected: FAIL — cannot resolve `./feedback.js`.

- [ ] **Step 4: Write the shared module**

Create `backend/lib/feedback.js`:

```js
export const FEEDBACK_CATEGORIES = ['bug', 'abuse', 'payment', 'account', 'suggestion', 'other'];
export const FEEDBACK_STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix'];
export const MAX_DESCRIPTION = 2000;
const MIN_DESCRIPTION = 10;

export const validateFeedback = ({ category, description }) => {
  if (typeof category !== 'string' || !FEEDBACK_CATEGORIES.includes(category)) {
    return { valid: false, error: 'Choose a valid category' };
  }
  if (typeof description !== 'string') {
    return { valid: false, error: 'Description is required' };
  }
  const trimmed = description.trim();
  if (trimmed.length < MIN_DESCRIPTION) {
    // A two-word report cannot be acted on, and letting it through just
    // fills the admin queue with items nobody can resolve.
    return { valid: false, error: `Please describe the problem in at least ${MIN_DESCRIPTION} characters` };
  }
  if (trimmed.length > MAX_DESCRIPTION) {
    return { valid: false, error: `Description must be ${MAX_DESCRIPTION} characters or fewer` };
  }
  return { valid: true, error: null };
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `backend/`: `npx vitest run lib/feedback.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 6: Write the model**

Create `backend/models/Feedback.js`:

```js
import mongoose from 'mongoose';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, MAX_DESCRIPTION } from '../lib/feedback.js';

// Kept separate from the Report model on purpose: Report.targetType is
// ['post','user','message'] and a bug report has no target at all. Widening
// that enum would break the meaning of every existing report row.
const feedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category: { type: String, enum: FEEDBACK_CATEGORIES, required: true },
  description: { type: String, required: true, maxlength: MAX_DESCRIPTION },

  screenshot: {
    url: String,
    publicId: String
  },

  appVersion: String,
  // Captured server-side from the request header, never trusted from the
  // body -- a client-supplied user agent would be worthless for debugging.
  userAgent: String,

  status: { type: String, enum: FEEDBACK_STATUSES, default: 'open', index: true },
  adminNote: { type: String, maxlength: 2000 },
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  handledAt: Date
}, { timestamps: true });

feedbackSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Feedback', feedbackSchema);
```

- [ ] **Step 7: Add the rate limiter**

In `backend/middleware/rateLimiters.js`, append:

```js
// Feedback goes straight into the admin queue and can carry an image upload,
// so an unlimited endpoint is both a spam vector and a Cloudinary bill.
// Keyed by user id because the point is to stop one account flooding the
// queue, not to limit a shared IP.
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('feedback'),
  keyGenerator: (req) => `${req.ip}:${req.user?._id || 'anon'}`,
  handler: makeHandler(
    'RATE_LIMIT_EXCEEDED',
    'Too many problem reports. Please try again later.',
    'Bohat zyada problem reports. Baraye meherbani thodi dair baad koshish karein.'
  )
});
```

- [ ] **Step 8: Write the controller**

Create `backend/controllers/feedbackController.js`:

```js
import fs from 'fs';
import Feedback from '../models/Feedback.js';
import { validateFeedback } from '../lib/feedback.js';
import { uploadToCloudinary } from '../config/cloudinary.js';

export const createFeedback = async (req, res) => {
  try {
    const { category, description, appVersion } = req.body;

    const { valid, error } = validateFeedback({ category, description });
    if (!valid) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* already gone */ } }
      return res.status(400).json({ success: false, message: error });
    }

    let screenshot;
    if (req.file) {
      // Screenshots only -- a 100MB video in the admin queue helps nobody.
      if (!req.file.mimetype.startsWith('image/')) {
        try { fs.unlinkSync(req.file.path); } catch { /* already gone */ }
        return res.status(400).json({ success: false, message: 'Screenshot must be an image' });
      }
      if (req.file.size > 5 * 1024 * 1024) {
        try { fs.unlinkSync(req.file.path); } catch { /* already gone */ }
        return res.status(400).json({ success: false, message: 'Screenshot must be 5MB or smaller' });
      }
      const result = await uploadToCloudinary(req.file.path, 'nexvibe/feedback', { resource_type: 'image' });
      screenshot = { url: result.secure_url, publicId: result.public_id };
      try { fs.unlinkSync(req.file.path); } catch { /* already gone */ }
    }

    const feedback = await Feedback.create({
      user: req.user._id,
      category,
      description: description.trim(),
      screenshot,
      appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 40) : undefined,
      userAgent: (req.get('user-agent') || '').slice(0, 400)
    });

    res.status(201).json({ success: true, feedback });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const feedback = await Feedback.find({ user: req.user._id })
      .select('-userAgent -adminNote -handledBy')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Feedback.countDocuments({ user: req.user._id });

    res.json({ success: true, feedback, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 9: Add the routes and mount them**

Create `backend/routes/feedbackRoutes.js`:

```js
import express from 'express';
import * as feedback from '../controllers/feedbackController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/upload.js';
import { feedbackLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/', protect, feedbackLimiter, upload.single('screenshot'), feedback.createFeedback);
router.get('/mine', protect, feedback.getMyFeedback);

export default router;
```

In `backend/server.js`, add the import with the other route imports and mount it after line 121:

```js
app.use('/api/feedback', feedbackRoutes);
```

- [ ] **Step 10: Verify**

Run from `backend/`: `npx vitest run lib/feedback.test.js` → PASS.

Start the app and, from the browser console while logged in:

```js
const fd = new FormData();
fd.append('category', 'bug');
fd.append('description', 'The reels page freezes after ten scrolls.');
await fetch('/api/feedback', { method: 'POST', credentials: 'include', body: fd }).then(r => r.json());
```

Expected: `{ success: true, feedback: { ... status: 'open' } }`. Then `await fetch('/api/feedback/mine', { credentials: 'include' }).then(r => r.json())` returns it. Submit six times in a row and confirm the sixth is rejected with a 429.

- [ ] **Step 11: Commit**

```bash
git add backend/lib/feedback.js backend/lib/feedback.test.js backend/models/Feedback.js backend/controllers/feedbackController.js backend/routes/feedbackRoutes.js backend/middleware/rateLimiters.js backend/server.js backend/package.json backend/package-lock.json
git commit -m "feat: add Feedback model with rate-limited submission endpoint"
```

---

### Task 5: The "Report a problem" form

**Files:**
- Replace: `frontend/src/components/settings/ReportProblemForm.jsx` (the stub from Task 3)
- Modify: `frontend/src/services/api.js` (add `feedbackAPI`)

**Interfaces:**
- Consumes: `POST /api/feedback`, `GET /api/feedback/mine` (Task 4).
- Produces: `feedbackAPI.create(formData)`, `feedbackAPI.getMine(page)`.

- [ ] **Step 1: Add the API client**

In `frontend/src/services/api.js`, after the `reportAPI` block (line 234):

```js
// FEEDBACK (problem reports)
export const feedbackAPI = {
  create: (formData) => API.post('/feedback', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getMine: (page = 1) => API.get(`/feedback/mine?page=${page}`),
};
```

- [ ] **Step 2: Write the form**

Replace `frontend/src/components/settings/ReportProblemForm.jsx` in full:

```jsx
import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { feedbackAPI } from '../../services/api';
import { FiUpload, FiX } from 'react-icons/fi';

const CATEGORIES = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'abuse', label: 'Abuse or harmful content' },
  { value: 'account', label: 'Account problem' },
  { value: 'payment', label: 'Payment problem' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other', label: 'Something else' },
];

const MAX_DESCRIPTION = 2000;
const MIN_DESCRIPTION = 10;

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_fix: "Won't fix",
};

const STATUS_CLASSES = {
  open: 'bg-blue-500/10 text-blue-500',
  in_progress: 'bg-amber-500/10 text-amber-600',
  resolved: 'bg-green-500/10 text-green-600',
  wont_fix: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
};

export default function ReportProblemForm() {
  const [category, setCategory] = useState('bug');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const fileRef = useRef(null);

  const loadHistory = async () => {
    try {
      const { data } = await feedbackAPI.getMine();
      setHistory(data.feedback || []);
    } catch { /* the form still works without the history */ }
    finally { setLoadingHistory(false); }
  };

  useEffect(() => { loadHistory(); }, []);

  // Object URLs leak until revoked, and this component can churn through
  // several as the user swaps screenshots.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pickFile = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) { toast.error('Screenshot must be an image'); return; }
    if (selected.size > 5 * 1024 * 1024) { toast.error('Screenshot must be 5MB or smaller'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const trimmedLength = description.trim().length;
  const canSubmit = trimmedLength >= MIN_DESCRIPTION && trimmedLength <= MAX_DESCRIPTION && !submitting;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('description', description.trim());
      formData.append('appVersion', import.meta.env.VITE_APP_VERSION || 'web');
      if (file) formData.append('screenshot', file);

      const { data } = await feedbackAPI.create(formData);
      setHistory(prev => [data.feedback, ...prev]);
      setDescription('');
      setCategory('bug');
      clearFile();
      toast.success('Thanks — your report has been sent');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send your report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="feedback-category" className="block text-sm font-medium mb-1.5">What kind of problem?</label>
          <select
            id="feedback-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-sm focus:outline-none focus:border-pink-500"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="feedback-description" className="block text-sm font-medium mb-1.5">What happened?</label>
          <textarea
            id="feedback-description"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
            rows={6}
            placeholder="Tell us what you were doing and what went wrong. The more detail, the faster we can fix it."
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-sm leading-relaxed resize-y focus:outline-none focus:border-pink-500"
          />
          <p className={`text-xs mt-1 text-right ${trimmedLength > MAX_DESCRIPTION - 100 ? 'text-amber-500' : 'text-[var(--text-muted)]'}`}>
            {trimmedLength} / {MAX_DESCRIPTION}
          </p>
        </div>

        <div>
          <span className="block text-sm font-medium mb-1.5">Screenshot (optional)</span>
          {preview ? (
            <div className="relative inline-block">
              <img src={preview} alt="Screenshot preview" className="max-h-48 rounded-xl border border-[var(--border)]" />
              <button
                type="button"
                onClick={clearFile}
                aria-label="Remove screenshot"
                className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-[var(--bg-primary)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--bg-tertiary)]"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors w-full sm:w-auto justify-center"
            >
              <FiUpload className="w-4 h-4" /> Add a screenshot
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
        </div>

        <button type="submit" disabled={!canSubmit} className="btn-brand w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? 'Sending…' : 'Send report'}
        </button>

        <p className="text-xs text-[var(--text-muted)]">
          Your browser and app version are included automatically to help us reproduce the problem.
        </p>
      </form>

      <div className="mt-10">
        <h3 className="font-bold text-sm mb-3">Your reports</h3>
        {loadingHistory ? (
          <div className="space-y-2">{Array(2).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>
        ) : history.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">You haven't reported anything yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map(item => (
              <div key={item._id} className="border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-xs font-semibold capitalize">{item.category}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASSES[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] break-words">{item.description}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run from `frontend/`: `npm run build` → succeeds.

In the app, go to Settings → Help → Report a problem. Check: the submit button is disabled until the description reaches 10 characters; the counter updates; adding a screenshot shows a preview and the X removes it; submitting shows a success toast, clears the form, and adds the report to "Your reports" with an Open badge; reloading the page still shows it; a non-image file is rejected client-side.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/settings/ReportProblemForm.jsx frontend/src/services/api.js
git commit -m "feat: add the report-a-problem form with screenshot upload and submission history"
```

---

### Task 6: Admin feedback tab

**Files:**
- Modify: `backend/controllers/adminController.js` (add three controllers)
- Modify: `backend/routes/adminRoutes.js` (add three routes)
- Create: `frontend/src/pages/admin/AdminFeedback.jsx`
- Modify: `frontend/src/services/api.js` (add `adminAPI` methods)
- Modify: `frontend/src/App.jsx` (add the route)
- Modify: `frontend/src/components/admin/AdminLayout.jsx:15-26` (add the nav item)
- Modify: `backend/controllers/adminController.js` `getDashboardStats` (add the open-feedback count)
- Modify: `frontend/src/pages/admin/AdminDashboard.jsx` (show the count)

**Interfaces:**
- Consumes: the `Feedback` model (Task 4).
- Produces:
  - `GET /api/admin/feedback?status&category&q&page&limit` → `{ success, feedback, total, pages, counts }`
  - `PATCH /api/admin/feedback/:id` body `{ status?, adminNote? }` → `{ success, feedback }`
  - `DELETE /api/admin/feedback/:id` → `{ success }`
  - `adminAPI.getFeedback(params)`, `adminAPI.updateFeedback(id, data)`, `adminAPI.deleteFeedback(id)`

- [ ] **Step 1: Write the backend controllers**

In `backend/controllers/adminController.js`, add the imports:

```js
import Feedback from '../models/Feedback.js';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from '../lib/feedback.js';
```

and append:

```js
export const getFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const filter = {};
    if (FEEDBACK_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (FEEDBACK_CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    if (req.query.q) {
      // Escaped so a user-supplied '(' or '*' is matched literally instead of
      // throwing, or worse, becoming a catastrophically slow pattern.
      const escaped = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.description = { $regex: escaped, $options: 'i' };
    }

    const feedback = await Feedback.find(filter)
      .populate('user', 'username fullName avatar')
      .populate('handledBy', 'username')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Feedback.countDocuments(filter);

    // Tab counts ignore the status filter -- they are what the tabs display.
    const countFilter = { ...filter };
    delete countFilter.status;
    const grouped = await Feedback.aggregate([
      { $match: countFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const counts = Object.fromEntries(FEEDBACK_STATUSES.map(s => [s, 0]));
    for (const g of grouped) counts[g._id] = g.count;

    res.json({ success: true, feedback, total, pages: Math.ceil(total / limit), counts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateFeedback = async (req, res) => {
  try {
    const { status, adminNote } = req.body;

    if (status !== undefined && !FEEDBACK_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    if (adminNote !== undefined && (typeof adminNote !== 'string' || adminNote.length > 2000)) {
      return res.status(400).json({ success: false, message: 'Note must be 2000 characters or fewer' });
    }

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ success: false, message: 'Report not found' });

    if (status !== undefined) feedback.status = status;
    if (adminNote !== undefined) feedback.adminNote = adminNote;
    feedback.handledBy = req.user._id;
    feedback.handledAt = new Date();
    await feedback.save();

    const populated = await Feedback.findById(feedback._id)
      .populate('user', 'username fullName avatar')
      .populate('handledBy', 'username');

    res.json({ success: true, feedback: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findByIdAndDelete(req.params.id);
    if (!feedback) return res.status(404).json({ success: false, message: 'Report not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 2: Add the open-feedback count to the dashboard stats**

Find `getDashboardStats` in `backend/controllers/adminController.js` and add an open-feedback count alongside the existing counts, following whatever shape that function already returns (read it first — do not guess the response key names):

```js
    const openFeedback = await Feedback.countDocuments({ status: 'open' });
```

and include `openFeedback` in the response object.

- [ ] **Step 3: Add the routes**

In `backend/routes/adminRoutes.js`, after the reviews routes (line 25):

```js
router.get('/feedback', ...isAdmin, admin.getFeedback);
router.patch('/feedback/:id', ...isAdmin, admin.updateFeedback);
router.delete('/feedback/:id', ...adminOnly, admin.deleteFeedback);
```

Deletion is `adminOnly` deliberately: moderators can triage a report but should not be able to erase the record of one.

- [ ] **Step 4: Add the API client methods**

In `frontend/src/services/api.js`, inside `adminAPI` after `moderateReview` (line 260):

```js
  getFeedback: (params) => API.get('/admin/feedback', { params }),
  updateFeedback: (id, data) => API.patch(`/admin/feedback/${id}`, data),
  deleteFeedback: (id) => API.delete(`/admin/feedback/${id}`),
```

- [ ] **Step 5: Write the admin page**

Create `frontend/src/pages/admin/AdminFeedback.jsx`:

```jsx
// frontend/src/pages/admin/AdminFeedback.jsx
import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { adminAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import toast from 'react-hot-toast';
import { useConfirm } from '../../context/DialogContext';
import { FiCheckCircle, FiChevronDown, FiSearch, FiTrash2, FiExternalLink } from 'react-icons/fi';

const STATUS_TABS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont_fix', label: "Won't fix" },
];

const CATEGORIES = ['bug', 'abuse', 'payment', 'account', 'suggestion', 'other'];

const CATEGORY_CLASSES = {
  bug: 'bg-red-500/10 text-red-500',
  abuse: 'bg-orange-500/10 text-orange-500',
  payment: 'bg-violet-500/10 text-violet-500',
  account: 'bg-blue-500/10 text-blue-500',
  suggestion: 'bg-green-500/10 text-green-600',
  other: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
};

function FeedbackRow({ item, onSaved, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.adminNote || '');
  const [saving, setSaving] = useState(false);
  const confirmDialog = useConfirm();

  const dirty = status !== item.status || note !== (item.adminNote || '');

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await adminAPI.updateFeedback(item._id, { status, adminNote: note });
      toast.success('Report updated');
      onSaved(data.feedback);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ message: 'Delete this report permanently?', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await adminAPI.deleteFeedback(item._id);
      toast.success('Report deleted');
      onDeleted(item._id);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <Avatar src={item.user?.avatar} size={40} alt={item.user?.fullName} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-semibold">@{item.user?.username || 'deleted user'}</span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${CATEGORY_CLASSES[item.category]}`}>
              {item.category}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className={`text-sm text-[var(--text-secondary)] break-words ${expanded ? '' : 'line-clamp-2'}`}>
            {item.description}
          </p>
        </div>
        <FiChevronDown className={`w-5 h-5 text-[var(--text-muted)] flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] p-4 space-y-4">
          {item.screenshot?.url && (
            <a href={item.screenshot.url} target="_blank" rel="noreferrer" className="inline-block relative">
              <img src={item.screenshot.url} alt="Reporter's screenshot" className="max-h-64 rounded-xl border border-[var(--border)]" />
              <span className="absolute top-2 right-2 bg-black/60 text-white rounded-lg p-1.5">
                <FiExternalLink className="w-3.5 h-3.5" />
              </span>
            </a>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div><dt className="text-[var(--text-muted)]">App version</dt><dd className="break-words">{item.appVersion || '—'}</dd></div>
            <div><dt className="text-[var(--text-muted)]">User agent</dt><dd className="break-words">{item.userAgent || '—'}</dd></div>
          </dl>

          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex-1">
              <span className="block text-xs font-medium mb-1">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-sm focus:outline-none focus:border-pink-500"
              >
                {STATUS_TABS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-medium mb-1">Internal note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 2000))}
              rows={3}
              placeholder="Not shown to the reporter"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-sm resize-y focus:outline-none focus:border-pink-500"
            />
          </label>

          {item.handledBy && (
            <p className="text-xs text-[var(--text-muted)]">
              Last handled by @{item.handledBy.username}
              {item.handledAt && ` · ${formatDistanceToNow(new Date(item.handledAt), { addSuffix: true })}`}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={!dirty || saving} className="btn-brand px-4 py-1.5 rounded-lg text-sm disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={remove} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-red-300 text-red-500 text-sm hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
              <FiTrash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminFeedback() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('open');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getFeedback({ status, category: category || undefined, q: appliedQ || undefined, page, limit: 20 });
      setItems(data.feedback);
      setCounts(data.counts || {});
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed to load reports'); }
    finally { setLoading(false); }
  }, [status, category, appliedQ, page]);

  useEffect(() => { load(); }, [load]);

  const onSaved = (updated) => {
    // A status change moves the row out of the current tab, so drop it
    // rather than leaving a row that no longer belongs here.
    setItems(prev => updated.status === status
      ? prev.map(i => (i._id === updated._id ? updated : i))
      : prev.filter(i => i._id !== updated._id));
    setCounts(prev => ({ ...prev }));
    load();
  };

  const onDeleted = (id) => {
    setItems(prev => prev.filter(i => i._id !== id));
    setTotal(t => Math.max(0, t - 1));
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Feedback</h1>
        <p className="text-[var(--text-secondary)] text-sm">{total.toLocaleString()} reports in this view</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => { setStatus(t.value); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${status === t.value ? 'bg-pink-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}
          >
            {t.label}{counts[t.value] ? ` (${counts[t.value]})` : ''}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <form
          onSubmit={(e) => { e.preventDefault(); setAppliedQ(q); setPage(1); }}
          className="relative flex-1 min-w-0"
        >
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search descriptions…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-sm focus:outline-none focus:border-pink-500"
          />
        </form>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-sm focus:outline-none focus:border-pink-500"
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="h-24 rounded-2xl shimmer" />)
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">
            {status === 'open' ? (
              <span className="flex items-center justify-center gap-1.5">
                <FiCheckCircle className="w-4 h-4 text-green-500" /> No open reports
              </span>
            ) : `No ${STATUS_TABS.find(t => t.value === status)?.label.toLowerCase()} reports`}
          </div>
        ) : (
          items.map(item => (
            <FeedbackRow key={item._id} item={item} onSaved={onSaved} onDeleted={onDeleted} />
          ))
        )}
      </div>

      {pages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6">
          <p className="text-sm text-[var(--text-muted)]">Page {page} of {pages} · {total} total</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">← Prev</button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add the route and nav entry**

In `frontend/src/App.jsx`, import the page next to the other admin imports and add inside the admin route block (after line 139):

```jsx
        <Route path="feedback" element={<AdminFeedback />} />
```

In `frontend/src/components/admin/AdminLayout.jsx`, add `FiInbox` to the `react-icons/fi` import on line 6, and add to `navItems` after the Reviews entry (line 21):

```jsx
    { to: '/admin/feedback', label: 'Feedback', Icon: FiInbox },
```

- [ ] **Step 7: Show the open count on the dashboard**

Open `frontend/src/pages/admin/AdminDashboard.jsx`, find the existing stat-card grid, and add a card for `openFeedback` matching the surrounding cards exactly — same component, same class names, linking to `/admin/feedback`. Read the file first; do not invent a card shape.

- [ ] **Step 8: Verify**

Run from `frontend/`: `npm run build` → succeeds.

Then, logged in as an admin: submit two problem reports from a normal account, go to `/admin/feedback`, and confirm each of these:
1. Both appear under Open with the reporter's avatar, category chip and relative time.
2. The tab counts are right.
3. Expanding a row shows the full description, the screenshot (if any, and clicking opens it full size), the app version and the user agent.
4. Changing the status to "In progress" and saving moves the row out of the Open tab and into In progress, and the counts update.
5. An internal note saves and is still there after a reload.
6. The note is **not** visible to the reporter — check Settings → Help → Report a problem on the reporting account.
7. Searching for a word in a description filters correctly; searching for `(` does not error.
8. The category filter works.
9. Delete asks for confirmation and removes the row. As a moderator (not admin) the delete request returns 403.
10. The dashboard's open-feedback count matches the Open tab.

- [ ] **Step 9: Responsive check**

At 375×667, 768×1024 and 1440×900, in both themes: the status tabs wrap rather than overflow, rows stack readably, the expanded panel's controls stay inside the card, long user-agent strings wrap instead of widening the page, and there is no horizontal scroll.

- [ ] **Step 10: Commit**

```bash
git add backend/controllers/adminController.js backend/routes/adminRoutes.js frontend/src/pages/admin/AdminFeedback.jsx frontend/src/pages/admin/AdminDashboard.jsx frontend/src/services/api.js frontend/src/App.jsx frontend/src/components/admin/AdminLayout.jsx
git commit -m "feat: add admin feedback triage tab"
```

---

### Task 7: Full-suite verification

- [ ] **Step 1: Frontend tests**

Run from `frontend/`: `npx vitest run`
Expected: all suites pass, including the pre-existing `deviceDetect`, `e2eCrypto`, `longPress` and `permissionLabel` tests.

- [ ] **Step 2: Backend tests**

Run from `backend/`: `npx vitest run`
Expected: the `feedback` suite passes.

- [ ] **Step 3: Build**

Run from `frontend/`: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Dead-link sweep**

Grep the changed pages for links and confirm each target is a real route in `App.jsx`:

Run: `grep -rn 'to="/\|href="/' frontend/src/pages/Help.jsx frontend/src/components/settings frontend/src/components/common/LegalDocument.jsx`

Every `to=` / `href=` must match a `<Route path=...>` in `App.jsx`. Fix any that do not — `/contact` was one such link before this work and must not have come back.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: help pages and feedback review fixes"
```
