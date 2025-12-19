// background.js
// Load shared config into the service worker
try { importScripts('config.js'); } catch (e) {}
// Using Firebase REST only for Firestore writes (no SDK loaded)
const MAX_LOGS = 10000;
// Load CONFIG if available (from config.js)
const HEARTBEAT_MINUTES = (self.CONFIG && self.CONFIG.HEARTBEAT_MINUTES) || 1;
const BACKEND_BASE = (self.CONFIG && self.CONFIG.BACKEND_BASE) || "https://your-backend.com"; // TODO

// Generate or fetch persistent device ID
async function getOrCreateDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (deviceId) return deviceId;

  const newId = crypto.getRandomValues(new Uint8Array(16))
    .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  await chrome.storage.local.set({ deviceId: newId });
  return newId;
}

/**
 * Send event to GA4 via Measurement Protocol
 * - Requires CONFIG.GA4.measurement_id and CONFIG.GA4.api_secret
 * - Uses deviceId as client_id to identify the device in GA
 */
async function sendToGA(eventName, eventParams = {}) {
  try {
    if (!self.CONFIG || !self.CONFIG.GA4) return false;
    const { measurement_id, api_secret } = self.CONFIG.GA4;
    if (!measurement_id || !api_secret) return false;

    // client_id: use deviceId (persistent) or generate fallback
    const deviceId = await getOrCreateDeviceId(); // you already have this helper
    const client_id = deviceId || `${Math.floor(Math.random() * 1e10)}`;

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurement_id)}&api_secret=${encodeURIComponent(api_secret)}`;

    const body = {
      client_id,
      events: [{
        name: eventName,
        params: eventParams
      }]
    };

    // fetch with keepalive so the service worker can send it even when unloading
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    });

    return true;
  } catch (err) {
    console.warn('[LabPolicy] sendToGA failed', err);
    return false;
  }
}



// ==== Firebase direct REST helpers (anonymous auth + write to Firestore) ====
// We obtain an access_token suitable for Firestore by first doing anonymous
// sign-in to get a refresh_token, then exchanging it via STS to an access token.
async function getFirebaseAccessToken() {
  const now = Date.now();
  const { fbToken = null } = await chrome.storage.local.get('fbToken');
  if (fbToken && fbToken.access && fbToken.access.expiresAt - 60_000 > now) {
    return fbToken.access.token;
  }
  if (!self.CONFIG || !self.CONFIG.FIREBASE) return null;
  const apiKey = self.CONFIG.FIREBASE.apiKey;
  try {
    let refreshToken = fbToken?.refreshToken;
    if (!refreshToken) {
      // Anonymous sign-in for a fresh refresh token
      const res = await fetch(`${self.CONFIG.FIREBASE.rest.identityToolkit}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true })
      });
      if (!res.ok) return null;
      const json = await res.json();
      refreshToken = json.refreshToken;
    }

    // Exchange refresh token for Google OAuth access token
    const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });
    if (!tokenRes.ok) return null;
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    const expiresInMs = parseInt(tokenJson.expires_in || '3600', 10) * 1000;
    const record = { refreshToken, access: { token: accessToken, expiresAt: now + expiresInMs } };
    await chrome.storage.local.set({ fbToken: record });
    return accessToken;
  } catch (e) {
    return null;
  }
}

async function writeLogToFirestore(payload) {
  if (!self.CONFIG || !self.CONFIG.FIREBASE) return;
  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) return;
  const projectId = self.CONFIG.FIREBASE.projectId;
  const endpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents/logs`;
  const doc = {
    fields: {
      url: { stringValue: String(payload.url || '') },
      title: { stringValue: String(payload.title || '') },
      allowed: { booleanValue: !!payload.allowed },
      classCode: { stringValue: String(payload.classCode || '') },
      rollNumber: { stringValue: String(payload.rollNumber || '') },
      pcCode: { stringValue: String(payload.pcCode || '') },
      deviceId: { stringValue: String(payload.deviceId || '') },
      ts: { timestampValue: new Date(payload.ts || Date.now()).toISOString() }
    }
  };
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(doc),
      keepalive: true
    });
    if (!res.ok) {
      console.warn('Firestore write failed', res.status, await res.text());
    }
  } catch (e) {}
}

async function postJSON(path, data) {
  try {
    const res = await fetch(`${BACKEND_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      keepalive: true,
    });
    return res.ok;
  } catch (e) {
    // Swallow network errors; will retry on next alarm
    return false;
  }
}

// On install: register device, set uninstall URL, and start heartbeat alarm
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[LabPolicy] service worker installed');
  const id = await getOrCreateDeviceId();
  await postJSON("/install", { id, ts: Date.now() });

  // Set uninstall callback URL
  try {
    chrome.runtime.setUninstallURL(`${BACKEND_BASE}/uninstalled?id=${encodeURIComponent(id)}`);
  } catch (e) {}

  // Create repeating heartbeat alarm
  chrome.alarms.create("heartbeat", { periodInMinutes: HEARTBEAT_MINUTES });
});

// On browser startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[LabPolicy] service worker startup');
});

// Heartbeat on alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "heartbeat") return;
  const id = await getOrCreateDeviceId();
  const ts = Date.now();
  const ok = await postJSON(`/heartbeat`, { id, ts });
  await chrome.storage.local.set({ lastHeartbeat: { ts, ok } });
});

// Message API for options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message && message.type === "getDeviceStatus") {
      const id = await getOrCreateDeviceId();
      const { lastHeartbeat = null } = await chrome.storage.local.get("lastHeartbeat");
      sendResponse({ id, lastHeartbeat });
    } else if (message && message.type === "heartbeatNow") {
      const id = await getOrCreateDeviceId();
      const ts = Date.now();
      const ok = await postJSON(`/heartbeat`, { id, ts });
      await chrome.storage.local.set({ lastHeartbeat: { ts, ok } });
      sendResponse({ ok, ts });
    } else {
      sendResponse(undefined);
    }
  })();
  return true; // keep channel open for async reply
});

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
    }
  } catch (e) {
    console.warn("Bad URL:", url);
  }
  return false;
}

// Log visit
async function logVisit(url, title, tabId, allowed) {
  const timestamp = new Date().toISOString();

  try {
    const deviceId = await getOrCreateDeviceId();

    // Read data safely
    const { pcCode = '' } = await chrome.storage.local.get('pcCode');
    const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');

    // Write to Firestore (existing behavior)
    await writeLogToFirestore({
      url,
      title,
      allowed,
      classCode: studentInfo.classCode || '',
      rollNumber: studentInfo.rollNumber || '',
      pcCode,
      deviceId,
      ts: Date.parse(timestamp)
    });

    // Send to Google Analytics
    await sendToGA('site_visit', {
      page_location: String(url || ''),
      page_title: String(title || ''),
      allowed: Boolean(allowed),
      pc_code: String(pcCode || ''),
      class_code: String(studentInfo.classCode || ''),
      roll_number: String(studentInfo.rollNumber || ''),
      device_id: String(deviceId || ''),
      timestamp
    });

  } catch (e) {
    console.warn('[logVisit] failed', e);
  }
}


// Handle navigation
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // only main-frame

  // Ignore extension pages and Chrome internal pages
  if (details.url.startsWith(chrome.runtime.getURL('')) || 
      details.url.startsWith('chrome://') || 
      details.url === "about:blank") {
    return;
  }

  console.log('[LabPolicy] onBeforeNavigate attempt', details.url);

  // Optional: early log (title will be inaccurate, but URL is known early)
  // You can log here if you want "attempted access" even if later blocked
  // But do NOT redirect here!
});

// Fallback: also listen to tab updates when a page completes loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  // Ignore extension pages and chrome internal pages
  if (tab.url.startsWith(chrome.runtime.getURL('')) ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:')) {
    return;
  }

  console.log('[LabPolicy] tabs.onUpdated complete', tab.url);

  try {
    const { whitelist = [] } = await chrome.storage.local.get('whitelist');
    const allowed = isAllowed(tab.url, whitelist);
    if (!allowed) {
      // Redirect to blocked page
      const blockedUrl = chrome.runtime.getURL("blocked.html") + 
                        '?orig=' + encodeURIComponent(tab.url);
      await chrome.tabs.update(tabId, { url: blockedUrl });
    }

    // Log the final visit (accurate title and URL)
    await logVisit(tab.url, tab.title || 'Untitled', tabId, allowed);

  } catch (e) {
    console.warn('[LabPolicy] onUpdated handler error', e);
  }
});

// Handle client-side navigation in SPAs (History API pushState/replaceState)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;

  try {
    const tab = await chrome.tabs.get(details.tabId);
    if (!tab.url || 
        tab.url.startsWith(chrome.runtime.getURL('')) ||
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('about:')) {
      return;
    }

    console.log('[LabPolicy] History state updated (SPA)', tab.url);

    const { whitelist = [] } = await chrome.storage.local.get('whitelist');
    const allowed = isAllowed(tab.url, whitelist);

    if (!allowed) {
      const blockedUrl = chrome.runtime.getURL("blocked.html") + 
                        '?orig=' + encodeURIComponent(tab.url);
      await chrome.tabs.update(details.tabId, { url: blockedUrl });
    }

    await logVisit(tab.url, tab.title || 'Untitled', details.tabId, allowed);

  } catch (e) {
    console.warn('[LabPolicy] onHistoryStateUpdated error', e);
  }
}, { url: [{ schemes: ["http", "https"] }] });