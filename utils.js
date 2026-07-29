// Simple DOM and common helpers shared across the extension

// DOM helpers
function $(id) { return document.getElementById(id); }
function setHidden(el, hidden) { if (el) el.classList[hidden ? 'add' : 'remove']('hidden'); }
function setText(el, text) { if (el) el.textContent = text; }

// Data helpers
function normalizeLines(text) {
  return text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

// Export to global scope
// eslint-disable-next-line no-undef
self.$ = $;
// eslint-disable-next-line no-undef
self.setHidden = setHidden;
// eslint-disable-next-line no-undef
self.setText = setText;
// eslint-disable-next-line no-undef
self.normalizeLines = normalizeLines;

function showNotificationPermissionModal() {
  // Check if modal already exists
  if (document.getElementById('notificationPermissionModal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'notificationPermissionModal';
  overlay.className = 'notification-modal-overlay';
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100000; font-family: sans-serif;';

  const card = document.createElement('div');
  card.className = 'notification-modal-card';
  card.style.cssText = 'background: white; padding: 24px; border-radius: 12px; max-width: 400px; width: 95%; box-shadow: 0 10px 25px rgba(0,0,0,0.15); text-align: center; display: flex; flex-direction: column; gap: 16px; border: 1px solid #e2e8f0;';

  card.innerHTML = `
    <h3 style="font-size: 20px; font-weight: bold; color: #1e293b; margin: 0; display: flex; align-items: center; justify-content: center; gap: 8px;">
      🔔 Enable Notifications
    </h3>
    <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin: 0;">
      Notifications must be enabled to receive class questions and solver answers in real time. Please click below to grant permission.
    </p>
    <button id="grantNotificationPermissionBtn" style="background: #3b82f6; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; transition: background 0.2s;">
      Enable Notifications
    </button>
    <div id="permissionBlockGuide" style="display: none; font-size: 12px; color: #ef4444; line-height: 1.4; margin-top: 8px;">
      <strong>Browser blocked permission prompt!</strong><br>
      Please open <strong>Chrome Settings -> Privacy and security -> Site settings -> Notifications</strong> and allow notifications for this extension origin.
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const btn = card.querySelector('#grantNotificationPermissionBtn');
  const guide = card.querySelector('#permissionBlockGuide');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Requesting...';
    try {
      const permission = await Notification.requestPermission();
      console.log('[FCM Permission Dialog] Outcome:', permission);
      if (permission === 'granted') {
        const modal = document.getElementById('notificationPermissionModal');
        if (modal) modal.remove();
        setupFCM();
      } else {
        btn.textContent = 'Permission Denied';
        btn.style.backgroundColor = '#94a3b8';
        guide.style.display = 'block';
      }
    } catch (e) {
      console.error('[FCM Permission Dialog] Error:', e);
      guide.style.display = 'block';
      btn.textContent = 'Retry';
      btn.disabled = false;
    }
  });
}

async function getExtensionServiceWorkerRegistration() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    console.log('[FCM Setup] Found active service worker registrations:', registrations.map(r => (r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL)));
    
    let registration = registrations.find(r => {
      const scriptURL = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL;
      return scriptURL && scriptURL.includes('background.js');
    });
    
    if (registration) {
      console.log('[FCM Setup] Successfully resolved background.js registration from getRegistrations().');
      return registration;
    }
    
    console.log('[FCM Setup] background.js registration not found in getRegistrations(). Attempting to resolve via getRegistration()...');
    registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      console.log('[FCM Setup] Successfully resolved registration via getRegistration(). Scope:', registration.scope);
      return registration;
    }
    
    console.log('[FCM Setup] Registration still not found. Attempting programmatical register of background.js (may fail under extension CSP)...');
    try {
      registration = await navigator.serviceWorker.register('background.js');
      console.log('[FCM Setup] Programmatically registered background.js. Scope:', registration.scope);
      return registration;
    } catch (regErr) {
      console.error('[FCM Setup] Failed to register background.js programmatically:', regErr.message || regErr);
      return null;
    }
  } catch (err) {
    console.error('[FCM Setup] Failed to resolve service worker registration:', err);
    return null;
  }
}

async function setupFCM() {
  console.log('[FCM] setupFCM() called.');

  // 1. Check if student credentials exist first.
  let studentInfo;
  try {
    const data = await chrome.storage.local.get('studentInfo');
    studentInfo = data.studentInfo;
  } catch (err) {
    console.error('[FCM] Error reading studentInfo from storage:', err);
    console.log('[FCM] registerFcmToken not sent because reading studentInfo from storage failed.');
    return;
  }

  if (!studentInfo || !studentInfo.classCode || !studentInfo.rollNumber) {
    console.log('[FCM] Student credentials not found in storage. Skipping FCM registration.');
    console.log('[FCM] registerFcmToken not sent because student credentials are not fully configured.');
    return;
  }

  console.log('[FCM] Student information found.');
  console.log('[FCM] Notification permission status:', Notification.permission);
  
  if (Notification.permission !== 'granted') {
    console.warn('[FCM] Notification permission is not granted. Current state:', Notification.permission);
    console.log('[FCM] registerFcmToken not sent because notification permission is not granted.');
    showNotificationPermissionModal();
    return;
  }
  
  try {
    // Initialize Firebase in option/dashboard window context
    if (typeof firebase !== 'undefined') {
      if (firebase.apps.length === 0) {
        firebase.initializeApp(self.CONFIG.FIREBASE);
      }
      console.log('[FCM] Firebase initialized.');
      
      console.log('[FCM] Requesting Service Worker registration.');
      const registration = await getExtensionServiceWorkerRegistration();
      if (!registration) {
        console.error('[FCM] Extension service worker registration not found.');
        console.log('[FCM] registerFcmToken not sent because Service Worker registration was not acquired.');
        return;
      }
      console.log('[FCM] Service Worker registration acquired.');
      
      let vapidKey = (self.CONFIG && self.CONFIG.FIREBASE && self.CONFIG.FIREBASE.vapidKey) || undefined;
      if (vapidKey && vapidKey.length !== 87) {
        console.warn(`[FCM] Configured VAPID key "${vapidKey}" is malformed (length ${vapidKey.length}, expected 87). Falling back to default FCM VAPID key.`);
        vapidKey = 'BJkzAUL3Wb2QZXhIGqGpv4CZ638aYT7iiyT6mMHAbIfh9EV9QUXPo8MEmK5V66D7RhTBuJYKqN0G88siWe_6IfM';
      }
      
      const messaging = firebase.messaging();

      // Bind token refresh listener only if supported by the SDK version
      if (typeof messaging.onTokenRefresh === 'function') {
        messaging.onTokenRefresh(async () => {
          console.log('[FCM] Firebase issued a new registration token.');
          console.log('[FCM] Token regenerated and why: Firebase onTokenRefresh fired.');
          await chrome.storage.local.remove('fcmToken');
          setupFCM();
        });
      }
      
      let token = null;
      try {
        console.log('[FCM] Requesting FCM token...');
        token = await messaging.getToken({
          serviceWorkerRegistration: registration,
          vapidKey: vapidKey
        });
      } catch (err) {
        console.error(`[FCM] getToken() failed because ${err.message || err}`);
        console.log('[FCM] registerFcmToken not sent because getToken() threw an error.');
        return;
      }
      
      if (!token) {
        console.error('[FCM] Failed to retrieve or generate FCM token.');
        console.log('[FCM] registerFcmToken not sent because token is null/empty.');
        return;
      }
      
      console.log(`[FCM] FCM token generated: ${token}`);
      await chrome.storage.local.set({ fcmToken: token });
      
      console.log('[FCM] Sending token to background worker...');
      let res;
      try {
        res = await chrome.runtime.sendMessage({
          type: 'registerFcmToken',
          classCode: studentInfo.classCode,
          rollNumber: studentInfo.rollNumber,
          studentName: studentInfo.studentName || '',
          fcmToken: token
        });
      } catch (err) {
        console.error('[FCM] Sending token to background worker failed because', err.message || err);
        console.log('[FCM] registerFcmToken not sent because chrome.runtime.sendMessage failed.');
        return;
      }
      
      if (res && res.success) {
        console.log('[FCM] Background acknowledged token.');
        console.log('[FCM] Sending POST /api/tokens...');
        console.log('[FCM] Registration completed successfully.');
      } else {
        console.error('[FCM] Token upload failed via background worker:', res?.message || 'Unknown error');
        console.log('[FCM] registerFcmToken not sent or rejected by the background worker.');
      }
    } else {
      console.warn('[FCM] Firebase SDK is not loaded in this window context.');
      console.log('[FCM] registerFcmToken not sent because Firebase SDK is not defined.');
    }
  } catch (error) {
    console.error('[FCM] Error during setupFCM execution:', error);
  }
}

// Automatic listeners disabled to ensure FCM registration happens only on Update click
console.log('[FCM] Background listener & storage listener for automatic FCM registration are disabled.');

self.setupFCM = setupFCM;


