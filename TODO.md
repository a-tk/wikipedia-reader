# TODO

## 1. Publish the privacy policy (GitHub Pages)

The site is built in [docs/](docs/) but not live yet.

- [ ] Push `master` to GitHub (`git@github.com:a-tk/wikipedia-reader.git`).
- [ ] Repo **Settings → Pages → Build and deployment → Deploy from a branch**,
      then choose branch `master` and folder `/docs`, and Save.
- [ ] Wait a minute or two, then confirm both pages load:
  - https://a-tk.github.io/wikipedia-reader/
  - https://a-tk.github.io/wikipedia-reader/privacy.html
- [ ] Pages on a free GitHub account only serves **public** repositories. Make the
      repo public if it isn't.
- [ ] If the repo is ever renamed or moved, the URL changes. Update it in
      [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md), [README.md](README.md),
      [PRIVACY.md](PRIVACY.md) and the links in [docs/](docs/).
- [ ] Optional: the policy's contact is the GitHub issues page. Add an email
      address to [docs/privacy.html](docs/privacy.html) if you prefer one.
- [ ] If the extension's data practices change (new permission, network call,
      analytics), update [docs/privacy.html](docs/privacy.html) and its
      "Last updated" date *before* shipping. `test/docs.test.js` fails if the
      manifest permissions drift from what the policy says.

## 2. Chrome Web Store submission

Full listing copy and permission justifications are in
[CHROMEWEBSTORE.md](CHROMEWEBSTORE.md).

- [ ] **Shorten the manifest `description`** to 132 characters or fewer (it is
      currently 142 and the upload will be rejected).
- [ ] Take screenshots (1280×800 or 640×400, at least one). Suggested shots are
      listed in CHROMEWEBSTORE.md.
- [ ] Optional: a 440×280 small promo tile.
- [ ] Fill in the publisher name, contact email (shown publicly) and support URL
      in CHROMEWEBSTORE.md and the developer dashboard.
- [ ] Paste the privacy policy URL (above) into the dashboard.
- [ ] Check Wikimedia's current trademark policy for "Wikipedia" in the name. The
      listing says the project is independent; be ready to rename (for example
      "Audio Reader for Wikipedia") if it is flagged.
- [ ] `npm test`, then `npm run package`, then upload
      `dist/audio-for-wikipedia-<version>.zip`. The docs site is not included
      in the zip.
- [ ] Bump `version` in `manifest.json` and `package.json` for every re-upload.
- [ ] After the extension is published, add a Chrome Web Store install link to
      [docs/index.html](docs/index.html) (it currently links to GitHub).

## 3. Check in a real browser

These were built and unit-tested but never run in Chrome.

- [ ] Load unpacked and confirm the keyboard shortcuts work. Check
      `chrome://extensions/shortcuts`, since Chrome may not assign every default.
- [ ] Confirm the sentence highlight appears from the content script (CSS Custom
      Highlight API). If not, the section highlight is the fallback.
- [ ] Confirm the first Play uses your chosen voice and the icons render at the
      same size.
- [ ] Replay the Go article's Keywords list and check that the long pauses at
      "interface" and "var" are gone now that the keep-alive is removed. If they
      remain, try shortening the list-item pause (`DEFAULT_ITEM_PAUSE_MS` in
      `src/core/filters.js`).

## 4. Known rough edges

- Inline `<code>` is dropped entirely when the code filter is on, so "numeric
  ones (byte, int64, …)" is spoken as "numeric ones (, , , etc.)". Consider
  dropping the leftover punctuation, or filtering only code blocks.
- Version-style text such as `go1.[major].[patch]` is split oddly by the sentence
  chunker. All the text is still spoken.
- A few reference-list entries ending in `!."` are not sentence-highlighted (they
  fall back to the section highlight).
- The control panel starts minimized on every page load and does not remember
  your last choice.
