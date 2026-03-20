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
- It enforces browsing policy with Manifest V3 `declarativeNetRequest` dynamic rules generated from the current whitelist.
- Blocked navigations are redirected to the bundled `blocked.html` page.
- It can log visit metadata and ChatGPT prompts to Firebase/GA only when valid production configuration is provided in `config.js`.
- Heartbeat and uninstall callbacks are disabled automatically when `BACKEND_BASE` is blank.

## Permission justification

- `storage`: saves whitelist rules, device ID, login state, PC code, and cached class data.
- `activeTab`: opens the floating class-code panel only for the tab the user explicitly clicks from the toolbar.
- `declarativeNetRequest`: enforces the whitelist using generated allow and redirect rules instead of request-time script logic.
- `scripting`: injects the floating class-code panel into the current active tab on demand.
- `tabs`: reads current tab metadata for logging and supports action-button behavior on the active tab.
- `alarms`: sends periodic heartbeat pings when a backend is configured.
- `<all_urls>`: required because whitelist rules may allow arbitrary destinations and the default DNR rule redirects all other web navigations.

## Privacy disclosure draft

This extension may collect browsing URLs, page titles, device identifiers, class code, roll number, PC code, and submitted ChatGPT prompts for school/lab administration. Data stays local unless production Firebase / analytics endpoints are configured by the operator.
