// background.js
const MAX_LOGS = 10000;

// Match URL against whitelist patterns
function isAllowed(url, whitelist) {
  try {
    const u = new URL(url);
    for (const rule of whitelist) {
      const pattern = rule.trim();
      if (!pattern) continue;

      // Exact domain match
      if (u.hostname === pattern) return true;

      // Subdomain wildcard (*.example.com)
      if (pattern.startsWith("*.")) {
        const base = pattern.slice(2);
        if (u.hostname === base || u.hostname.endsWith("." + base)) {
          return true;
        }
      }

      // Prefix match (full URL starts with)
      if (url.startsWith(pattern)) return true;

      // Plain domain contains
      if (u.hostname.includes(pattern)) return true;
    }
  } catch (e) {
    console.warn("Bad URL:", url);
  }
  return false;
}

// Log visit
async function logVisit(url, title, tabId, allowed) {
  const timestamp = new Date().toISOString();
  const entry = { url, title, timestamp, tabId, allowed };

  const { logs = [] } = await chrome.storage.local.get("logs");
  logs.push(entry);

  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS); // prune oldest
  }

  await chrome.storage.local.set({ logs });
}

// Handle navigation
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // only main-frame

  // Ignore navigation to the extension's own URLs and the new tab page
  if (details.url.startsWith(chrome.runtime.getURL('')) || details.url === "chrome://new-tab-page-third-party/") {
    return;
  }

  const { whitelist = [] } = await chrome.storage.local.get("whitelist");
  const allowed = isAllowed(details.url, whitelist);

  if (!allowed) {
    chrome.tabs.update(details.tabId, {
      url: chrome.runtime.getURL("blocked.html") + "?orig=" + encodeURIComponent(details.url)
    });
  }

  chrome.tabs.get(details.tabId, (tab) => {
    const title = tab?.title || "Untitled";
    logVisit(details.url, title, details.tabId, allowed);
  });
});