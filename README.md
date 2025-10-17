# chrome_extension_site_blocker

This repository contains a Chrome extension that blocks access to specified websites. The README below is an onboarding guide: what the project does, how it is organized, how to run and debug it, and where to look to make common changes.

---

## Purpose

The extension's goal is to prevent access to user-configured sites (for productivity or parental controls). It exposes a UI to add/remove sites and enforces blocking at the browser level.

## Quick start (load in Chrome)

1. Install prerequisites: a recent Chrome/Chromium build.
2. Build (if there is a build step): check for package.json and run `npm install` and `npm run build` if present.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable "Developer mode" (top-right).
5. Click "Load unpacked" and select the project folder (the folder containing `manifest.json`).
6. Test by visiting a site listed in the blocked list.

## Typical file layout and what to edit

Note: file names below describe common extension structure. If your copy differs, open the repo root to confirm exact names.

- `manifest.json` — Chrome extension manifest (permissions, background script or service worker, content scripts, options/popup pages). Any changes to permissions or background scripts require reloading the extension in Chrome.

- `background.js` or `service_worker.js` — Background script that runs persistently (or as a service worker for Manifest V3). This is usually where blocking logic lives (e.g., intercepting requests via `chrome.webRequest` or `declarativeNetRequest`). Look here to change how and when sites are blocked.

- `popup.html`, `popup.js`, `popup.css` — Popup UI shown when the extension icon is clicked. Typically allows quick toggles and viewing the currently blocked site list.

- `options.html`, `options.js` — Full configuration UI (adding/removing blocked sites, setting schedules, whitelists). Use `chrome.storage.sync` or `chrome.storage.local` to persist settings.

- `content_scripts/` — Scripts injected into pages (if used). Avoid putting blocking logic here; content scripts are for in-page UI or modifications.

- `icons/` — Extension icons displayed in the toolbar and Chrome store.

## Data flow & core logic

- User modifies blocked site list via popup/options UI.
- UI code writes the list to Chrome storage (`chrome.storage.sync` or `local`).
- Background script listens for web requests or uses declarative rules and checks the stored list.
- When a match is found, the background script blocks or redirects the request (or shows an interstitial page).

If the project uses Manifest V3, blocking is typically implemented with `declarativeNetRequest` rules or the background service worker. For Manifest V2, `chrome.webRequest.onBeforeRequest` may be used.

## Debugging tips

- Open the extension's background page or service worker console via `chrome://extensions/` → "Service Worker" / "Inspect views".
- Use `console.log` liberally while developing. Remember to remove or reduce logs before shipping.
- Use the Network and Application tabs to inspect storage and requests.
- Reload the unpacked extension after changing manifest or background files.

## Common tasks for an intern
- Improve UI/UX of popup/options pages.
- Add tests (unit tests for helper functions) and linting.

## Coding conventions

- Keep UI code separated from background logic.
- Persist structured data as arrays/objects in `chrome.storage` and use a single canonical source of truth (the background script) to enforce blocking rules.
- Follow existing JS style in the repo. If using TypeScript, prefer typed storage wrappers.

## Notes

- Check manifest version (v2 vs v3) before changing APIs: APIs differ between manifest versions.
- Be mindful of Chrome permission requests; unnecessary permissions may block approval for publishing.
