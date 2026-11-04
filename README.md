# Audio for Wikipedia

A Chrome / Chromium browser extension (Manifest V3) that reads Wikipedia
articles aloud using the browser's built-in speech synthesis. Pick which
sections to read, filter out non-prose content, and control playback from
in-page buttons or the keyboard.

No accounts, no API keys, and the extension makes no network requests of its
own. Speech uses the browser's built-in `speechSynthesis` Web Speech API.
Note that some voices are provided by an online service: in Chrome, the
"Google …" voices send the text being read to Google to be synthesized. Choose
a voice supplied by your operating system if you want everything to stay on
your device. See [PRIVACY.md](PRIVACY.md).

Not affiliated with or endorsed by the Wikimedia Foundation.

## Features

- **Read aloud** any Wikipedia article with the browser's native voices.
- **Per-article section picker** — before you press play, tick exactly which
  headings/sections get read. Everything is selected by default.
- **Content filters** — skip infoboxes, tables, image captions, math formulas,
  inline footnote markers like `[1]`, and programming examples / code blocks.
  Toggle each category in settings.
- **Select all / none** — a master checkbox in the section list toggles every
  section at once, and shows a mixed (indeterminate) state when only some are
  selected.
- **Voice settings** — choose voice, rate, pitch, and volume. Settings persist
  across sessions and sync via your browser profile.
- **In-page controls** — a floating bar with previous-section, play/pause,
  stop, next-section, a volume slider (0%–100%), a playback-speed slider
  (0.5×–3.0×), a settings button, and a collapse button that tucks the panel
  away so it doesn't cover the article. Slider changes apply live and are
  saved; settings changed on the options page apply to open articles
  immediately. Clicking the toolbar icon toggles play/pause on an article.
- **Keyboard shortcuts** — control playback without reaching for the mouse.
- **Natural list reading** — a short pause follows each bullet or numbered list
  item (and a parent item before its sub-list), so lists don't run together.
- **Section highlighting** — the section currently being read is highlighted,
  and its title is announced before its content. When the Introduction is read,
  the article title is announced first.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome, Edge, Brave, or another Chromium browser.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this project folder
   (the one containing `manifest.json`).
4. Open any article on `*.wikipedia.org/wiki/...`. The floating control bar and
   section list appear in the bottom-right corner.

There is no build step — the extension runs the plain files in `src/` directly.

## Usage

1. On a Wikipedia article, the control bar and a **"Read these sections"** list
   appear. Untick any sections you want to skip.
2. Press **▶** (or the play/pause shortcut) to start. Each selected section's
   heading is spoken first, then its prose.
3. Use the buttons or shortcuts to pause/resume, stop, or jump to the next
   section.
4. Click **⚙** to open settings and adjust the voice, speed, and content filters.

### Default keyboard shortcuts

| Action           | Shortcut        |
| ---------------- | --------------- |
| Play / pause     | `Alt+Shift+P`   |
| Stop             | `Alt+Shift+S`   |
| Next section     | `Alt+Shift+N`   |
| Previous section | `Alt+Shift+,`   |

Change these at `chrome://extensions/shortcuts`. Chrome may refuse to assign a
default that collides with one of its own shortcuts; the options page and the
button tooltips always show the shortcuts that are actually active.

If a shortcut does nothing the very first time, click anywhere on the article
once — Chrome only allows speech after you have interacted with the page.

## Settings

Open the options page from the control bar's ⚙ button, or from the extension's
entry in `chrome://extensions`.

- **Voice / Rate / Pitch / Volume** — standard speech controls, with a
  **Preview voice** button.
- **Skip this content** — checkboxes for infoboxes, tables, image captions,
  math formulas, footnote markers, and programming examples / code blocks.
  Checked means "skip, don't read". Code filtering targets syntax-highlighted
  blocks (e.g. the examples under "Syntactic form" on the
  [Tail call](https://en.wikipedia.org/wiki/Tail_call) article) and
  preformatted blocks; short inline code inside a sentence is still read.

## Project structure

```
manifest.json            MV3 manifest (content scripts, commands, options)
src/
  service_worker.js      Relays shortcuts / toolbar clicks to the active tab
  core/
    extractor.js         DOM -> ordered section outline (pure)
    filters.js           Strip non-prose + chunk into sentences (pure)
    speech.js            speechSynthesis queue engine
    settings.js          Load/save settings via chrome.storage.sync
    commands.js          Command -> action mapping
  content/
    content.js           Orchestrates extract -> UI -> speak
    controls.js          Floating control bar + outline checklist
    controls.css         Control bar styles
  options/
    options.html/js/css  Settings page
scripts/package.sh       Builds the Web Store zip (manifest + src only)
test/                    Vitest unit + integration tests (not shipped)
PRIVACY.md               Privacy policy
CHROMEWEBSTORE.md        Store listing copy, permission justifications, checklist
```

## How it works

`speechSynthesis` only exists in page contexts, so all speaking happens in the
content script; the service worker exists only to forward keyboard commands to
the active tab. Long articles are split into short sentence-sized chunks and
spoken as a managed queue, with a periodic `pause()`/`resume()` keep-alive to
work around Chromium stalling long speech queues.

The extension parses the live article DOM, handling both the legacy
(`<h2><span class="mw-headline">`) and newer Parsoid
(`<div class="mw-heading"><h2>`) heading markup.

## Development

Core logic is covered by unit and integration tests using Vitest + jsdom. The
tests are not part of the shipped extension.

```bash
npm install
npm test
npm run package   # -> dist/audio-for-wikipedia-<version>.zip
```

The core modules use a small UMD-style wrapper so the same source works both as
a plain browser content script (attaching to a `WikiReader` global) and as a
CommonJS import in the tests — keeping a single source of truth with no build
step.

## Limitations

- Voice quality depends on the voices installed in your operating system and
  browser.
- The extension runs on `https://*.wikipedia.org/wiki/*` article pages.
- Sibling-language Wikimedia sites (Wiktionary, etc.) are not matched by default;
  add their host patterns to `manifest.json` if you want them.

## License

See [LICENSE](LICENSE).
