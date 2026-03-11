# Chrome Web Store Release Notes

## Before upload

Run:

```sh
./scripts/validate-release.sh
./scripts/package-extension.sh
```

Upload the generated archive at `dist/lab-policy-whitelist-chrome-web-store.zip`.

## Reviewer notes

- The extension enforces whitelist-only browsing on managed/shared lab machines.
- It stores local admin and student/session state in `chrome.storage.local`.
- It redirects blocked navigations to the bundled `blocked.html` page.
- It can log visit metadata and ChatGPT prompts to Firebase/GA only when valid production configuration is provided in `config.js`.
- Heartbeat and uninstall callbacks are disabled automatically when `BACKEND_BASE` is blank.

## Permission justification

- `storage`: saves whitelist rules, device ID, login state, PC code, and cached class data.
- `tabs`: redirects blocked tabs and reads current tab metadata for logging.
- `webNavigation`: evaluates top-level navigations before the destination page loads.
- `alarms`: sends periodic heartbeat pings when a backend is configured.
- `<all_urls>`: required because the policy engine and the floating class-code panel operate across arbitrary sites.

## Privacy disclosure draft

This extension may collect browsing URLs, page titles, device identifiers, class code, roll number, PC code, and submitted ChatGPT prompts for school/lab administration. Data stays local unless production Firebase / analytics endpoints are configured by the operator.
