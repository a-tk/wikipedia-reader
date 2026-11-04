# Chrome Web Store Listing — Audio for Wikipedia

> Last Updated: 2026-11-03

## Store Listing

**Extension Name** [REQUIRED]
Audio for Wikipedia

**Short Description** [REQUIRED]
Taken from `manifest.json` "description" (max 132 characters). The current text
is 142 characters — shorten it before uploading. Keep it specific, e.g. what it
does for the reader: read articles aloud, choose sections, skip tables.

**Detailed Description** [REQUIRED]

Listen to Wikipedia articles instead of reading them.

Audio for Wikipedia adds a small control bar to every Wikipedia article. Press play and the article is read aloud, section by section, using the voices already available in your browser.

Features
Choose exactly which sections to read with a checklist — everything is selected by default, and "Select all" toggles the lot.
Skip what doesn't sound good read aloud: infoboxes, tables, image captions, math formulas, footnote markers like [1], and code. Each can be turned on or off in settings.
Follow along: the sentence being read is highlighted on the page and the page scrolls to keep it in view. Both can be turned off in settings.
Hear the article title before the introduction and each section's heading before its text.
Play, pause, stop, and jump to the next or previous section from the control bar, the keyboard, or the toolbar button.
Adjust volume and playback speed (0.5× to 3×) while listening. Pick your voice and pitch in settings and preview them.
Collapse the control bar when you want it out of the way.

How to use
1. Open any article on wikipedia.org.
2. Untick any sections you want to skip.
3. Press the play button, or use the shortcut Alt+Shift+P.
Other default shortcuts: Alt+Shift+S to stop, Alt+Shift+N for the next section, Alt+Shift+Comma for the previous section. You can change them at chrome://extensions/shortcuts.

Privacy
Audio for Wikipedia has no account, no analytics, and no server. Your settings are stored in your browser. The extension only runs on Wikipedia article pages. Note that some browser voices (for example Chrome's "Google" voices) are online voices that send the text being read to the voice provider; choose a voice from your operating system to keep everything on your device.

Audio for Wikipedia is an independent project and is not affiliated with or endorsed by the Wikimedia Foundation.

**Category** [REQUIRED]
Accessibility

**Single Purpose** [REQUIRED]
Reads Wikipedia articles aloud with section selection and playback controls.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | src/icons/icon128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

### Screenshot Notes
1. A Wikipedia article with the control bar and section checklist open, showing the sentence being read highlighted while playing.
2. The section checklist with a few sections unticked and "Select all" in its mixed state.
3. The settings page (voice, speed, "Skip this content" options).

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Saves the user's voice, speed, pitch, volume, and content-skip preferences so they persist between visits and sync across the user's browsers. Nothing else is stored. |
| https://*.wikipedia.org/wiki/* | content script match | The control bar and section checklist appear on Wikipedia article pages, and the extension reads the article text on that page so it can be read aloud. It does not run on any other site. |

No `host_permissions` are requested; the extension does not read tabs, URLs, history, or any page outside the content-script match above.

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

Preferences (voice, speed, filters) are stored in `chrome.storage.sync` and are not transmitted to the developer. Article text is read in the page and is never stored or sent by the extension. The extension makes no network requests.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | No | No | — | No |
| Personal communications | No | No | — | No |
| Location | No | No | — | No |
| Web history | No | No | — | No |
| User activity | No | No | — | No |
| Website content | No (read locally to speak it; not stored or sent) | No | — | No |

> Review note: when the user picks an online browser voice, the *browser* sends
> the spoken text to the voice provider. This is browser behavior, not the
> extension's, and is disclosed in the description and PRIVACY.md.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
TODO: host `PRIVACY.md` at a public URL (e.g. the GitHub repo or GitHub Pages) and paste it here. Fill in the contact email in the policy first.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
TODO

**Contact Email** [REQUIRED]
TODO (shown publicly on the listing)

**Support URL / Email** [RECOMMENDED]
TODO (e.g. GitHub Issues)

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.1.0 | 2026-11-03 | Initial version: read-aloud with section picker, content filters, voice/speed/volume controls, keyboard shortcuts, toolbar button, collapsible control bar (minimized by default), sentence highlighting with follow-along scrolling. | Draft |

## Review Notes

### Known Issues / Limitations
- The name contains "Wikipedia". Wikimedia's trademark policy may object to its use in an extension name; the description states the project is independent. Verify the current policy, and be ready to rename (e.g. "Audio Reader for Wikipedia") if the listing is flagged.
- Chrome only allows speech after the user has interacted with the page; the extension shows a hint if a keyboard shortcut is used first.
- Default shortcuts may be unassigned if they collide with another extension or Chrome; users can set them at chrome://extensions/shortcuts.

### Pre-publish checklist
- [ ] Shorten manifest `description` to ≤ 132 characters
- [ ] Add screenshots (1280×800)
- [ ] Fill in contact email in PRIVACY.md and host it; add URL above
- [ ] Fill in publisher name, contact and support info
- [ ] `npm test` passes, then `npm run package` and upload `dist/audio-for-wikipedia-<version>.zip`
- [ ] Bump `version` in manifest.json (and package.json) for every re-upload

### Rejection History
None yet.
