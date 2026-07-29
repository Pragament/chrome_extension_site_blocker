console.log('[FCM Service Worker] Service Worker started.');

// Initial check if any push events have been received (Stage 8 warning)
chrome.storage.local.get("lastPushReceived").then(({ lastPushReceived = null }) => {
  if (!lastPushReceived) {
    console.warn('No push event received. This indicates the Service Worker is not receiving FCM messages.');
  }
}).catch(() => {});

// Load shared config and Firebase compat SDK scripts into the service worker
try {
  importScripts('config.js');
  importScripts('vendor/firebase/firebase-app-compat.js');
  importScripts('vendor/firebase/firebase-messaging-compat.js');
} catch (e) {
  console.error('[FCM Service Worker] Failed to import scripts:', e);
}

// Initialize Firebase Messaging inside Service Worker
if (self.CONFIG && self.CONFIG.FIREBASE) {
  try {
    if (firebase.apps.length === 0) {
      firebase.initializeApp(self.CONFIG.FIREBASE);
    }
    const messaging = firebase.messaging();
    console.log('[FCM Service Worker] Firebase Messaging SDK successfully initialized inside background worker.');
    console.log('[FCM Service Worker] Firebase Messaging initialized.');
    
    // Background message handler
    messaging.onBackgroundMessage((payload) => {
      console.log('[FCM Service Worker] onBackgroundMessage fired.');
      console.log('[FCM Service Worker] Notification payload received.');
      console.log('[FCM Service Worker] Background message event received payload:', JSON.stringify(payload, null, 2));
    });
  } catch (e) {
    console.error('[FCM Service Worker] Failed to initialize Firebase:', e);
  }
}
const MAX_LOGS = 10000;
// Load CONFIG if available (from config.js)
const HEARTBEAT_MINUTES = (self.CONFIG && self.CONFIG.HEARTBEAT_MINUTES) || 1;
const BACKEND_BASE = (self.CONFIG && self.CONFIG.BACKEND_BASE) || "";

function isPlaceholderValue(value) {
  return !value || /your-backend\.com|G-XXXXXXXXXX|ABCDEFGHIJKLMNOPQRSTUVWXYZ/.test(String(value));
}

function getConfiguredBackendBase() {
  return isPlaceholderValue(BACKEND_BASE) ? "" : BACKEND_BASE;
}

function withRequiredRules(lines = []) {
  const normalized = Array.isArray(lines)
    ? lines.map(line => String(line || '').trim()).filter(Boolean)
    : [];

  if (self.CONFIG && Array.isArray(self.CONFIG.REQUIRED_RULES)) {
    const set = new Set(normalized);
    self.CONFIG.REQUIRED_RULES.forEach(rule => set.add(rule));
    return Array.from(set);
  }

  return Array.from(new Set(normalized));
}

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
    if (isPlaceholderValue(measurement_id) || isPlaceholderValue(api_secret)) return false;

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
  const fields = {
    url: { stringValue: String(payload.url || '') },
    title: { stringValue: String(payload.title || '') },
    allowed: { booleanValue: !!payload.allowed },
    classCode: { stringValue: String(payload.classCode || '') },
    rollNumber: { stringValue: String(payload.rollNumber || '') },
    pcCode: { stringValue: String(payload.pcCode || '') },
    deviceId: { stringValue: String(payload.deviceId || '') },
    prompt: { stringValue: String(payload.prompt || '') },
    ts: { timestampValue: new Date(payload.ts || Date.now()).toISOString() }
  };
  if (payload.studentCode !== undefined && payload.studentCode !== null) {
    fields.studentCode = { stringValue: String(payload.studentCode) };
  }
  const doc = { fields };
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

function hashString(value) {
  let hash = 5381;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeFirestoreDocId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function getCodeHelpRequestId({ classCode, rollNumber, pageUrl }) {
  return [
    sanitizeFirestoreDocId(classCode),
    sanitizeFirestoreDocId(rollNumber),
    hashString(pageUrl)
  ].join('_');
}
function jsToFirestoreValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return { timestampValue: value };
    }
    return { stringValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(jsToFirestoreValue).filter(Boolean)
      }
    };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      const fVal = jsToFirestoreValue(v);
      if (fVal) fields[k] = fVal;
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function buildFirestoreFields(data) {
  const fields = {};
  Object.entries(data).forEach(([key, value]) => {
    const fVal = jsToFirestoreValue(value);
    if (fVal) {
      fields[key] = fVal;
    }
  });
  return fields;
}

function firestoreValueToJs(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) {
    const vals = value.arrayValue.values || [];
    return vals.map(firestoreValueToJs);
  }
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    return Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, firestoreValueToJs(v)])
    );
  }
  return undefined;
}

function firestoreFieldsToJs(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, firestoreValueToJs(value)])
  );
}
async function saveStudentCodeHelpRequest(payload) {
  if (!self.CONFIG || !self.CONFIG.FIREBASE) {
    return { success: false, message: 'Firebase is not configured.' };
  }

  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) {
    return { success: false, message: 'Unable to authenticate with Firebase.' };
  }
  const projectId = self.CONFIG.FIREBASE.projectId;
  const requestId = getCodeHelpRequestId(payload);
  const endpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents/codeHelpRequests/${encodeURIComponent(requestId)}`;
  const now = new Date();
  const fields = buildFirestoreFields({
    requestId,
    status: 'student_requested_help',
    classCode: payload.classCode,
    rollNumber: payload.rollNumber,
    pcCode: payload.pcCode,
    deviceId: payload.deviceId,
    pageUrl: payload.pageUrl,
    pageTitle: payload.pageTitle,
    studentCode: payload.code,
    updatedAt: now,
    lastStudentSentAt: now
  });
  console.log('[site-blocker] saveStudentCodeHelpRequest writing Firestore document', {
    requestId,
    classCode: payload.classCode,
    rollNumber: payload.rollNumber,
    pageUrl: payload.pageUrl,
    codeLength: String(payload.code || '').length,
  });
  const updateMask = Object.keys(fields)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');
  const res = await fetch(`${endpoint}?${updateMask}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ fields }),
    keepalive: true
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.warn('[site-blocker] saveStudentCodeHelpRequest Firestore write failed', res.status, errorText);
    return { success: false, message: 'Firestore write failed.' };
  }

  await writeLogToFirestore({
    url: payload.pageUrl,
    title: 'W3Schools Code Help Request',
    allowed: true,
    classCode: payload.classCode,
    rollNumber: payload.rollNumber,
    pcCode: payload.pcCode,
    deviceId: payload.deviceId,
    prompt: `W3Schools code help requested for ${payload.pageTitle || payload.pageUrl}`,
    ts: Date.now(),
    studentCode: payload.code
  });

  console.log('[site-blocker] saveStudentCodeHelpRequest Firestore write complete', { requestId });
  return { success: true, requestId };
}

async function fetchTeacherCodeHelpResponse(payload) {
  if (!self.CONFIG || !self.CONFIG.FIREBASE) {
    return { success: false, message: 'Firebase is not configured.' };
  }

  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) {
    return { success: false, message: 'Unable to authenticate with Firebase.' };
  }

  const projectId = self.CONFIG.FIREBASE.projectId;
  const requestId = getCodeHelpRequestId(payload);
  const endpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents/codeHelpRequests/${encodeURIComponent(requestId)}`;

  console.log('[site-blocker] fetchTeacherCodeHelpResponse reading Firestore document', {
    requestId,
    classCode: payload.classCode,
    rollNumber: payload.rollNumber,
    pageUrl: payload.pageUrl,
  });

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (res.status === 404) {
    console.log('[site-blocker] fetchTeacherCodeHelpResponse no request document found', { requestId });
    return { success: false, message: 'No code request found for this page yet.' };
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.warn('[site-blocker] fetchTeacherCodeHelpResponse Firestore read failed', res.status, errorText);
    return { success: false, message: 'Firestore read failed.' };
  }

  const data = await res.json();
  const fields = firestoreFieldsToJs(data.fields);
  const teacherCode = fields.teacherCode || fields.modifiedCode || fields.teacherModifiedCode || '';

  console.log('[site-blocker] fetchTeacherCodeHelpResponse read complete', {
    requestId,
    hasTeacherCode: Boolean(String(teacherCode || '').trim()),
    teacherCodeLength: String(teacherCode || '').length,
    status: fields.status || '',
  });

  if (!String(teacherCode || '').trim()) {
    return { success: false, message: 'Teacher has not added modified code yet.', requestId };
  }

  return {
    success: true,
    requestId,
    code: teacherCode,
    status: fields.status || '',
    updatedAt: fields.updatedAt || ''
  };
}

async function dbAskClassQuestion(payload) {
  if (!self.CONFIG || !self.CONFIG.BACKEND_BASE) {
    return { success: false, message: 'Backend URL is not configured.' };
  }
  console.log('[Extension Background] dbAskClassQuestion called with payload:', payload);
  const endpoint = `${self.CONFIG.BACKEND_BASE}/api/questions`;
  
  try {
    console.log('[Extension Background] Sending question to local Express backend:', payload);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        classCode: payload.classCode,
        rollNumber: payload.rollNumber,
        studentName: payload.studentName || '',
        questionTitle: payload.questionTitle || '',
        questionDescription: payload.questionDescription || '',
        studentCode: payload.studentCode || '',
        editorUrl: payload.editorUrl || ''
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn('[dbAskClassQuestion] Express API call failed', res.status, errorText);
      return { success: false, message: 'Failed to save question to Express API.' };
    }

    const json = await res.json();
    console.log('[Extension Background] Express API response:', json);
    return { success: true, questionId: json.questionId };
  } catch (error) {
    console.error('[dbAskClassQuestion] Error calling Express API:', error);
    return { success: false, message: 'Error calling notification server.' };
  }
}

async function dbRegisterFcmToken(payload) {
  console.log('[Background Service Worker] Background worker received token. Payload:', payload);
  
  if (!payload.fcmToken) {
    console.error('[Background Service Worker] POST /api/tokens will NOT be called because fcmToken is missing in the payload.');
    return { success: false, message: 'Missing FCM token.' };
  }
  if (!payload.classCode || !payload.rollNumber) {
    console.error('[Background Service Worker] POST /api/tokens will NOT be called because classCode or rollNumber is missing in the payload.');
    return { success: false, message: 'Missing classCode or rollNumber.' };
  }

  const backendBase = getConfiguredBackendBase();
  if (!backendBase) {
    console.error('[Background Service Worker] POST /api/tokens will NOT be called because backend base URL is not configured (CONFIG.BACKEND_BASE is empty/placeholder).');
    return { success: false, message: 'No backend server configured.' };
  }

  const endpoint = `${backendBase}/api/tokens`;
  console.log('[Background Service Worker] POST /api/tokens request. Body:', {
    classCode: payload.classCode,
    rollNumber: payload.rollNumber,
    studentName: payload.studentName || '',
    fcmToken: payload.fcmToken
  });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        classCode: payload.classCode,
        rollNumber: payload.rollNumber,
        studentName: payload.studentName || '',
        fcmToken: payload.fcmToken
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn('[Background Service Worker] Express backend token upload failed:', res.status, errorText);
      return { success: false, message: 'Failed to upload FCM token to backend.' };
    }

    const json = await res.json();
    console.log('[Background Service Worker] Firestore update success.');
    return { success: true };
  } catch (error) {
    console.error('[Background Service Worker] Error uploading token to Express backend:', error);
    return { success: false, message: 'Error calling Express backend.' };
  }
}

async function dbCheckFcmTokenRegistration(payload) {
  console.log('[Background Service Worker] Checking token registration on backend. Payload:', payload);
  const backendBase = getConfiguredBackendBase();
  if (!backendBase) {
    console.warn('[Background Service Worker] No backend base URL configured. Skipping token check.');
    return { success: false, message: 'No backend server configured.' };
  }

  const { classCode, rollNumber, fcmToken } = payload;
  const endpoint = `${backendBase}/api/tokens/check?classCode=${encodeURIComponent(classCode)}&rollNumber=${encodeURIComponent(rollNumber)}&fcmToken=${encodeURIComponent(fcmToken)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn('[Background Service Worker] Express backend check failed:', res.status);
      return { success: false, message: 'Failed to verify token with backend.' };
    }

    const json = await res.json();
    return { success: true, exists: json.exists, matches: json.matches };
  } catch (error) {
    console.error('[Background Service Worker] Error checking token on backend:', error);
    return { success: false, message: 'Error checking token on backend.' };
  }
}

async function dbFetchSingleQuestion(questionId) {
  if (!self.CONFIG || !self.CONFIG.FIREBASE) return null;
  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) return null;
  const projectId = self.CONFIG.FIREBASE.projectId;
  const endpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents/questions/${questionId}`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    console.warn('[dbFetchSingleQuestion] Failed to fetch single question', res.status);
    return null;
  }

  const doc = await res.json();
  const fields = firestoreFieldsToJs(doc.fields);
  const nameParts = doc.name.split('/');
  const id = nameParts[nameParts.length - 1];
  return { id, ...fields };
}

async function dbFetchOpenQuestions(classCode, limit = 10, offset = 0) {
  if (!self.CONFIG || !self.CONFIG.FIREBASE) return [];
  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) return [];
  const projectId = self.CONFIG.FIREBASE.projectId;
  const endpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents:runQuery`;

  const queryPayload = {
    structuredQuery: {
      from: [{ collectionId: "questions" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "classCode" },
          op: "EQUAL",
          value: { stringValue: classCode }
        }
      }
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(queryPayload)
  });

  if (!res.ok) {
    console.warn('[dbFetchOpenQuestions] Firestore query failed', res.status);
    return [];
  }

  const data = await res.json();
  let questions = [];
  if (Array.isArray(data)) {
    data.forEach(item => {
      if (item.document) {
        const doc = item.document;
        const fields = firestoreFieldsToJs(doc.fields);
        const nameParts = doc.name.split('/');
        const id = nameParts[nameParts.length - 1];
        questions.push({ id, ...fields });
      }
    });
  }

  // Filter in-memory for Open status
  questions = questions.filter(q => q.status === 'Open');

  questions.sort((a, b) => {
    const tA = new Date(a.createdTime || 0).getTime();
    const tB = new Date(b.createdTime || 0).getTime();
    return tB - tA;
  });

  return questions.slice(offset, offset + limit);
}

async function dbSubmitAnswer(payload) {
  if (!self.CONFIG || !self.CONFIG.BACKEND_BASE) {
    return { success: false, message: 'Backend URL is not configured.' };
  }
  const endpoint = `${self.CONFIG.BACKEND_BASE}/api/answers`;

  try {
    console.log('[Extension Background] Submitting answer to local Express backend:', payload);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        questionId: payload.questionId,
        solverRollNumber: payload.authorId,
        solverName: payload.authorName || '',
        correctedCode: payload.correctedCode || '',
        explanation: payload.explanation || ''
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn('[dbSubmitAnswer] Express API call failed', res.status, errorText);
      return { success: false, message: 'Failed to submit response to Express API.' };
    }

    const json = await res.json();
    console.log('[Extension Background] Express API response:', json);
    return { success: true };
  } catch (error) {
    console.error('[dbSubmitAnswer] Error calling Express API:', error);
    return { success: false, message: 'Error calling notification server.' };
  }
}

async function dbFetchMyQuestions(classCode, rollNumber, limit = 10, offset = 0) {
  if (!self.CONFIG || !self.CONFIG.FIREBASE) return [];
  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) return [];
  const projectId = self.CONFIG.FIREBASE.projectId;
  const endpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents:runQuery`;

  const queryPayload = {
    structuredQuery: {
      from: [{ collectionId: "questions" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "classCode" },
          op: "EQUAL",
          value: { stringValue: classCode }
        }
      }
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(queryPayload)
  });

  if (!res.ok) {
    console.warn('[dbFetchMyQuestions] Firestore query failed', res.status);
    return [];
  }

  const data = await res.json();
  let questions = [];
  if (Array.isArray(data)) {
    data.forEach(item => {
      if (item.document) {
        const doc = item.document;
        const fields = firestoreFieldsToJs(doc.fields);
        const nameParts = doc.name.split('/');
        const id = nameParts[nameParts.length - 1];
        questions.push({ id, ...fields });
      }
    });
  }

  // Filter in-memory for my questions
  questions = questions.filter(q => String(q.rollNumber) === String(rollNumber));

  questions.sort((a, b) => {
    const tA = new Date(a.createdTime || 0).getTime();
    const tB = new Date(b.createdTime || 0).getTime();
    return tB - tA;
  });

  return questions.slice(offset, offset + limit);
}

async function dbFetchQuestionResponses(questionId, limit = 10, offset = 0) {
  if (!self.CONFIG || !self.CONFIG.FIREBASE) return [];
  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) return [];
  const projectId = self.CONFIG.FIREBASE.projectId;
  
  const endpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents/questions/${questionId}:runQuery`;
  const queryPayload = {
    structuredQuery: {
      from: [{ collectionId: "responses", allDescendants: false }],
      limit: limit,
      offset: offset
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(queryPayload)
  });

  if (!res.ok) {
    console.warn('[dbFetchQuestionResponses] Firestore query failed', res.status);
    return [];
  }

  const data = await res.json();
  const responses = [];
  if (Array.isArray(data)) {
    data.forEach(item => {
      if (item.document) {
        const doc = item.document;
        const fields = firestoreFieldsToJs(doc.fields);
        const nameParts = doc.name.split('/');
        const id = nameParts[nameParts.length - 1];
        responses.push({ id, ...fields });
      }
    });
  }

  responses.sort((a, b) => {
    const tA = new Date(a.timestamp || 0).getTime();
    const tB = new Date(b.timestamp || 0).getTime();
    return tB - tA;
  });

  return responses;
}

async function dbAcceptAnswer(payload) {
  if (!self.CONFIG || !self.CONFIG.FIREBASE) {
    return { success: false, message: 'Firebase is not configured.' };
  }
  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) {
    return { success: false, message: 'Unable to authenticate with Firebase.' };
  }
  const projectId = self.CONFIG.FIREBASE.projectId;
  const { questionId, responseId, helperRollNumber, classCode } = payload;

  const questionEndpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents/questions/${questionId}`;
  const now = new Date();
  
  const updateFields = buildFirestoreFields({
    status: 'Solved',
    acceptedResponseId: responseId,
    acceptedBy: helperRollNumber,
    acceptedAt: now
  });

  const res = await fetch(`${questionEndpoint}?updateMask.fieldPaths=status&updateMask.fieldPaths=acceptedResponseId&updateMask.fieldPaths=acceptedBy&updateMask.fieldPaths=acceptedAt`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ fields: updateFields })
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.warn('[dbAcceptAnswer] PATCH question failed', res.status, errorText);
    return { success: false, message: 'Failed to update question status.' };
  }

  const pointsDocId = sanitizeFirestoreDocId(classCode) + '_' + sanitizeFirestoreDocId(helperRollNumber);
  const pointsEndpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents/studentPoints/${encodeURIComponent(pointsDocId)}`;
  
  const pointsRes = await fetch(pointsEndpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  let currentPoints = 0;
  let currentSolutions = 0;
  if (pointsRes.ok) {
    const pData = await pointsRes.json();
    const pFields = firestoreFieldsToJs(pData.fields);
    currentPoints = Number(pFields.points || 0);
    currentSolutions = Number(pFields.acceptedSolutions || 0);
  }

  const newPoints = currentPoints + 10;
  const newSolutions = currentSolutions + 1;

  const ptsFields = buildFirestoreFields({
    classCode,
    rollNumber: helperRollNumber,
    points: newPoints,
    acceptedSolutions: newSolutions
  });

  const ptsMask = 'updateMask.fieldPaths=classCode&updateMask.fieldPaths=rollNumber&updateMask.fieldPaths=points&updateMask.fieldPaths=acceptedSolutions';
  await fetch(`${pointsEndpoint}?${ptsMask}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ fields: ptsFields })
  });

  return { success: true };
}

/**
 * Fetch wishlist from Firestore based on class code
 * Returns array of allowed sites for the class
 */
async function fetchClassWishlist(classCode) {
  if (!classCode) return [];

  const accessToken = await getFirebaseAccessToken();
  if (!accessToken || !self.CONFIG || !self.CONFIG.FIREBASE) return [];

  try {
    const projectId = self.CONFIG.FIREBASE.projectId;
    // Query the classes collection for the document with the matching code field
    const endpoint = `${self.CONFIG.FIREBASE.rest.firestoreBase}/projects/${projectId}/databases/(default)/documents:runQuery`;

    const queryPayload = {
      structuredQuery: {
        from: [{ collectionId: "classes" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "code" },
            op: "EQUAL",
            value: { stringValue: classCode }
          }
        }
      }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(queryPayload)
    });

    if (!res.ok) {
      console.warn('[fetchClassWishlist] Firestore query failed', res.status);
      return [];
    }

    const data = await res.json();

    if (data && Array.isArray(data) && data.length > 0) {
      const doc = data[0].document;
      const wishlistField = doc.fields?.wishlist?.arrayValue?.values;
      if (wishlistField && Array.isArray(wishlistField)) {
        const wishlist = wishlistField.map(item => item.stringValue).filter(Boolean);
        console.log('[fetchClassWishlist] Found wishlist for class', classCode, wishlist);
        return wishlist;
      }
    }

    console.log('[fetchClassWishlist] No wishlist found for class', classCode);
    return [];
  } catch (err) {
    console.warn('[fetchClassWishlist] error', err);
    return [];
  }
}

/**
 * Get combined whitelist: local admin whitelist + student's class wishlist from Firestore
 */
async function getCombinedWhitelist() {
  // Get local admin whitelist
  const { whitelist = [] } = await chrome.storage.local.get('whitelist');
  let combined = [...whitelist];

  // Add required rules
  if (self.CONFIG && Array.isArray(self.CONFIG.REQUIRED_RULES)) {
    combined = [...combined, ...self.CONFIG.REQUIRED_RULES];
  }

  // Get student's class code and fetch their class wishlist
  const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');
  if (studentInfo.classCode) {
    // Check cache first (valid for 5 minutes)
    const { classWishlistCache } = await chrome.storage.local.get('classWishlistCache');
    const now = Date.now();

    if (classWishlistCache &&
      classWishlistCache.classCode === studentInfo.classCode &&
      classWishlistCache.timestamp > now - 5 * 60 * 1000) {
      // Use cached wishlist
      console.log('[getCombinedWhitelist] Using cached wishlist');
      combined = [...combined, ...classWishlistCache.wishlist];
    } else {
      // Fetch fresh wishlist from Firestore
      console.log('[getCombinedWhitelist] Fetching wishlist for class:', studentInfo.classCode);
      const classWishlist = await fetchClassWishlist(studentInfo.classCode);
      combined = [...combined, ...classWishlist];

      // Cache the result
      await chrome.storage.local.set({
        classWishlistCache: {
          classCode: studentInfo.classCode,
          wishlist: classWishlist,
          timestamp: now
        }
      });
    }
  }

  return Array.from(new Set(combined));
}

async function postJSON(path, data) {
  const backendBase = getConfiguredBackendBase();
  if (!backendBase) return false;
  try {
    const res = await fetch(`${backendBase}${path}`, {
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
  const backendBase = getConfiguredBackendBase();
  if (backendBase) {
    await postJSON("/install", { id, ts: Date.now() });
  }

  // Set uninstall callback URL
  try {
    if (backendBase) {
      chrome.runtime.setUninstallURL(`${backendBase}/uninstalled?id=${encodeURIComponent(id)}`);
    }
  } catch (e) { }

  // Create repeating heartbeat alarm
  chrome.alarms.create("heartbeat", { periodInMinutes: HEARTBEAT_MINUTES });
});

// On browser startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[LabPolicy] service worker startup');
  console.log('[FCM Service Worker] Service Worker started via runtime.onStartup.');
});

// Heartbeat on alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "heartbeat") return;
  
  // Periodic check if any push events have been received (Stage 8 warning)
  const { lastPushReceived = null } = await chrome.storage.local.get("lastPushReceived");
  if (!lastPushReceived) {
    console.warn('No push event received. This indicates the Service Worker is not receiving FCM messages.');
  }

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
    } else if (message && message.type === "refreshWishlist") {
      // Clear cache to force refresh
      await chrome.storage.local.remove('classWishlistCache');
      const requestedClassCode = String(message.classCode || '').trim();
      const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');
      const classCode = requestedClassCode || studentInfo.classCode || '';

      if (classCode) {
        const wishlist = await fetchClassWishlist(classCode);
        if (!wishlist.length) {
          sendResponse({
            success: false,
            message: `Class code "${classCode}" was not found in Firestore.`,
            classCode
          });
          return;
        }

        await chrome.storage.local.set({
          whitelist: withRequiredRules(wishlist),
          classWishlistCache: {
            classCode,
            wishlist,
            timestamp: Date.now()
          }
        });
        sendResponse({ success: true, wishlist, classCode });
      } else {
        sendResponse({ success: false, message: 'No class code set' });
      }
    } else if (message && message.type === "logChatGptPrompt") {
      // Legacy handler — kept for backward compatibility, delegates to logAiPrompt logic
      const prompt = String(message.prompt || '').trim();
      if (!prompt) {
        console.log('[site-blocker] logChatGptPrompt skipped: empty prompt');
        sendResponse({ success: false, message: 'No prompt provided' });
        return;
      }

      console.log('[site-blocker] logChatGptPrompt received', { prompt });
      const deviceId = await getOrCreateDeviceId();
      const { pcCode = '' } = await chrome.storage.local.get('pcCode');
      const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');

      await writeLogToFirestore({
        url: 'https://chatgpt.com/',
        title: 'ChatGPT Prompt',
        allowed: true,
        classCode: studentInfo.classCode || '',
        rollNumber: studentInfo.rollNumber || '',
        pcCode,
        deviceId,
        prompt,
        ts: Date.now()
      });

      console.log('[site-blocker] logChatGptPrompt Firestore write requested');
      sendResponse({ success: true });
    } else if (message && message.type === "logAiPrompt") {
      // Unified handler for ChatGPT, Microsoft Copilot, Google Gemini
      const prompt = String(message.prompt || '').trim();
      const siteName = String(message.siteName || 'AI Tool').trim();
      const siteUrl = String(message.siteUrl || '').trim();

      if (!prompt) {
        console.log(`[site-blocker] logAiPrompt skipped: empty prompt (${siteName})`);
        sendResponse({ success: false, message: 'No prompt provided' });
        return;
      }

      console.log(`[site-blocker] logAiPrompt received from ${siteName}`, { prompt });
      const deviceId = await getOrCreateDeviceId();
      const { pcCode = '' } = await chrome.storage.local.get('pcCode');
      const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');

      await writeLogToFirestore({
        url: siteUrl,
        title: `${siteName} Prompt`,
        allowed: true,
        classCode: studentInfo.classCode || '',
        rollNumber: studentInfo.rollNumber || '',
        pcCode,
        deviceId,
        prompt,
        ts: Date.now()
      });

      console.log(`[site-blocker] logAiPrompt Firestore write requested for ${siteName}`);
      sendResponse({ success: true });
    } else if (message && message.type === "submitStudentCode") {
      const code = String(message.code || '');
      const pageUrl = String(message.pageUrl || sender?.tab?.url || '').trim();
      const pageTitle = String(message.pageTitle || sender?.tab?.title || '').trim();

      console.log('[site-blocker] submitStudentCode received', {
        pageUrl,
        pageTitle,
        codeLength: code.length,
      });

      if (!code.trim()) {
        sendResponse({ success: false, message: 'No code provided' });
        return;
      }

      const deviceId = await getOrCreateDeviceId();
      const { pcCode = '' } = await chrome.storage.local.get('pcCode');
      const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');
      const classCode = String(studentInfo.classCode || '').trim();
      const rollNumber = String(studentInfo.rollNumber || '').trim();

      if (!classCode || !rollNumber) {
        console.warn('[site-blocker] submitStudentCode skipped: missing class or roll', {
          hasClassCode: Boolean(classCode),
          hasRollNumber: Boolean(rollNumber),
        });
        sendResponse({ success: false, message: 'Set class code and roll number first.' });
        return;
      }

      const result = await saveStudentCodeHelpRequest({
        code,
        pageUrl,
        pageTitle,
        classCode,
        rollNumber,
        pcCode,
        deviceId,
      });
      sendResponse(result);
    } else if (message && message.type === "fetchTeacherCode") {
      const pageUrl = String(message.pageUrl || sender?.tab?.url || '').trim();

      console.log('[site-blocker] fetchTeacherCode received', { pageUrl });

      const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');
      const classCode = String(studentInfo.classCode || '').trim();
      const rollNumber = String(studentInfo.rollNumber || '').trim();

      if (!classCode || !rollNumber) {
        console.warn('[site-blocker] fetchTeacherCode skipped: missing class or roll', {
          hasClassCode: Boolean(classCode),
          hasRollNumber: Boolean(rollNumber),
        });
        sendResponse({ success: false, message: 'Set class code and roll number first.' });
        return;
      }

      const result = await fetchTeacherCodeHelpResponse({
        pageUrl,
        classCode,
        rollNumber,
      });
      sendResponse(result);
    } else if (message && message.type === "askClassQuestion") {
      const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');
      const classCode = String(studentInfo.classCode || '').trim();
      const rollNumber = String(studentInfo.rollNumber || '').trim();
      const studentName = String(studentInfo.studentName || '').trim();
      if (!classCode || !rollNumber) {
        sendResponse({ success: false, message: 'Set class code and roll number first.' });
        return;
      }
      const result = await dbAskClassQuestion({
        classCode,
        rollNumber,
        studentName,
        questionTitle: message.title,
        questionDescription: message.description,
        studentCode: message.code,
        editorUrl: message.editorUrl
      });
      sendResponse(result);
    } else if (message && message.type === "registerFcmToken") {
      const result = await dbRegisterFcmToken({
        classCode: message.classCode,
        rollNumber: message.rollNumber,
        studentName: message.studentName || '',
        fcmToken: message.fcmToken
      });
      sendResponse(result);
    } else if (message && message.type === "checkFcmToken") {
      const result = await dbCheckFcmTokenRegistration({
        classCode: message.classCode,
        rollNumber: message.rollNumber,
        fcmToken: message.fcmToken
      });
      sendResponse(result);
    } else if (message && message.type === "fetchSingleQuestion") {
      const question = await dbFetchSingleQuestion(message.questionId);
      sendResponse({ success: true, question });
    } else if (message && message.type === "fetchOpenQuestions") {
      const classCode = String(message.classCode || '').trim();
      const limit = Number(message.limit || 10);
      const offset = Number(message.offset || 0);
      const questions = await dbFetchOpenQuestions(classCode, limit, offset);
      sendResponse({ success: true, questions });
    } else if (message && message.type === "submitAnswer") {
      const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');
      const classCode = String(studentInfo.classCode || '').trim();
      const rollNumber = String(studentInfo.rollNumber || '').trim();
      const studentName = String(studentInfo.studentName || '').trim();
      const authorName = studentName ? studentName : ("Roll " + rollNumber);
      if (!classCode || !rollNumber) {
        sendResponse({ success: false, message: 'Set class code and roll number first.' });
        return;
      }
      const result = await dbSubmitAnswer({
        questionId: message.questionId,
        correctedCode: message.correctedCode,
        explanation: message.explanation,
        authorId: rollNumber,
        authorName: authorName
      });
      sendResponse(result);
    } else if (message && message.type === "fetchMyQuestions") {
      const classCode = String(message.classCode || '').trim();
      const rollNumber = String(message.rollNumber || '').trim();
      const limit = Number(message.limit || 10);
      const offset = Number(message.offset || 0);
      const questions = await dbFetchMyQuestions(classCode, rollNumber, limit, offset);
      sendResponse({ success: true, questions });
    } else if (message && message.type === "fetchQuestionResponses") {
      const questionId = String(message.questionId || '').trim();
      const limit = Number(message.limit || 10);
      const offset = Number(message.offset || 0);
      const responses = await dbFetchQuestionResponses(questionId, limit, offset);
      sendResponse({ success: true, responses });
    } else if (message && message.type === "acceptAnswer") {
      const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');
      const classCode = String(studentInfo.classCode || '').trim();
      const result = await dbAcceptAnswer({
        questionId: message.questionId,
        responseId: message.responseId,
        helperRollNumber: message.helperRollNumber,
        classCode
      });
      sendResponse(result);
    } else if (message && message.type === "openStudentDashboard") {
      const tabName = message.tab || "classQuestions";
      const url = chrome.runtime.getURL(`student_dashboard.html?tab=${tabName}`);
      chrome.tabs.create({ url });
      sendResponse({ success: true });
    } else if (message && message.type === "trigger_fcm_setup") {
      console.log('[Background Service Worker] Received trigger_fcm_setup message.');
      setupBackgroundFCM().catch(err => {
        console.error('[Background Service Worker] Error in setupBackgroundFCM:', err);
      });
      sendResponse({ success: true });
    } else {
      sendResponse(undefined);
    }
  })();
  return true; // keep channel open for async reply
});

/**
 * Convert a whitelist pattern into a RegExp for URL matching.
 *
 * Supported pattern forms (in priority order):
 *  1. Subdomain wildcard  *.example.com          — matches example.com and any subdomain
 *  2. URL path wildcard   https://site.com/path/* — * matches any suffix in the path/query
 *  3. Exact domain        example.com             — hostname-only match
 *  4. Plain prefix        https://site.com/page   — URL must start with this string
 *  5. Hostname contains   partial                 — hostname contains the string (legacy fallback)
 */
function patternToRegex(pattern) {
  // Subdomain wildcard: *.example.com
  if (pattern.startsWith("*.")) {
    const base = escapeRegex(pattern.slice(2));
    // Matches the base domain or any subdomain
    return new RegExp(`^https?://([^/]+\\.)?${base}(/|$)`, "i");
  }

  // URL with wildcard(s) in path/query: must contain a protocol and a *
  if (/^https?:\/\//.test(pattern) && pattern.includes("*")) {
    // Split on * and escape each segment, then join with .*
    const regexStr = pattern
      .split("*")
      .map(escapeRegex)
      .join(".*");
    return new RegExp(`^${regexStr}`, "i");
  }

  // Exact domain (no slashes, no protocol)
  if (!pattern.includes("/") && !pattern.includes(":")) {
    const escaped = escapeRegex(pattern);
    return new RegExp(`^https?://(([^/]+\\.)?${escaped})(/|$)`, "i");
  }

  // Plain prefix (full URL starts with pattern)
  return new RegExp(`^${escapeRegex(pattern)}`, "i");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match URL against whitelist patterns
function isAllowed(url, whitelist) {
  try {
    const u = new URL(url);
    for (const rule of whitelist) {
      const pattern = rule.trim();
      if (!pattern) continue;

      try {
        const regex = patternToRegex(pattern);
        if (regex.test(url)) return true;
      } catch (regexErr) {
        // Fallback: legacy plain-string checks
        if (u.hostname === pattern) return true;
        if (url.startsWith(pattern)) return true;
        if (u.hostname.includes(pattern)) return true;
      }
    }
  } catch (e) {
    console.warn("Bad URL:", url);
  }
  return false;
}

// Log visit
async function logVisit(url, title, tabId, allowed) {
  if (
    url.includes('new-tab-page') || 
    url.includes('newtab') || 
    url.startsWith('chrome://') || 
    url.startsWith('edge://') || 
    url.startsWith('file://') || 
    (title && title.toLowerCase() === 'new tab')
  ) {
    return;
  }
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

  // Ignore navigation to the extension's own URLs and browser internal pages
  if (
    details.url.startsWith(chrome.runtime.getURL('')) || 
    details.url.startsWith('chrome://') || 
    details.url.startsWith('edge://') || 
    details.url.startsWith('about:') ||
    details.url.startsWith('file://') ||
    details.url.includes('new-tab-page') ||
    details.url.includes('newtab')
  ) {
    return;
  }

  console.log('[LabPolicy] onBeforeNavigate', details.url);
  const whitelist = await getCombinedWhitelist();
  const allowed = isAllowed(details.url, whitelist);

  if (!allowed) {
    chrome.tabs.update(details.tabId, {
      url: chrome.runtime.getURL("blocked.html") + "?orig=" + encodeURIComponent(details.url)
    });
  }

  chrome.tabs.get(details.tabId, (tab) => {
    const title = tab?.title || "Untitled";
    console.log('[LabPolicy] logging visit', { url: details.url, allowed });
    logVisit(details.url, title, details.tabId, allowed);
  });
});

// Fallback: also listen to tab updates when a page completes loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (tab.url.startsWith(chrome.runtime.getURL(''))) return;
  if (
    tab.url.startsWith('chrome://') || 
    tab.url.startsWith('edge://') || 
    tab.url.startsWith('about:') ||
    tab.url.startsWith('file://') ||
    tab.url.includes('new-tab-page') ||
    tab.url.includes('newtab')
  ) return;
  try {
    console.log('[LabPolicy] tabs.onUpdated complete', tab.url);
    const whitelist = await getCombinedWhitelist();
    const allowed = isAllowed(tab.url, whitelist);
    if (!allowed) {
      chrome.tabs.update(tabId, { url: chrome.runtime.getURL('blocked.html') + '?orig=' + encodeURIComponent(tab.url) });
    }
    logVisit(tab.url, tab.title || 'Untitled', tabId, allowed);
  } catch (e) { }
});

// FCM Service Worker Listeners

// Unified push payload handler
async function handleIncomingPushData(data) {
  console.log('[FCM Service Worker] Processing incoming push data:', JSON.stringify(data, null, 2));
  if (!data) return;

  const { studentInfo = {} } = await chrome.storage.local.get('studentInfo');
  
  // Exclude notifying yourself if you are the original action triggerer
  if (data.rollNumber && String(data.rollNumber) === String(studentInfo.rollNumber)) {
    console.log('[FCM Service Worker] Suppressing notification for the action initiator.');
    return;
  }
  
  // If it's a new question, check for local muting preferences
  if (data.type === 'new_question') {
    const { muteEndTime } = await chrome.storage.local.get('muteEndTime');
    if (muteEndTime && Date.now() < Number(muteEndTime)) {
      console.log('[FCM Service Worker] Suppressing class questions alert: active mute period is enabled.');
      // Still broadcast to active sidebars so their lists refresh silently
      broadcastToActiveTabs({ type: 'push_received', data });
      return;
    }
  }
  
  // Build notification title and body
  let notificationTitle = '📢 New Class Question';
  let notificationBody = '';
  
  if (data.type === 'new_question') {
    const qTitle = data.title ? String(data.title).trim() : '';
    if (qTitle) {
      notificationBody = `Roll No. ${data.rollNumber || 'unknown'} asked a question.\nTitle:\n${qTitle}\n\nClick to help.`;
    } else {
      notificationBody = `Roll No. ${data.rollNumber || 'unknown'} asked a new question.`;
    }
  } else if (data.type === 'answer_notification') {
    notificationTitle = '✅ Your Question Has Been Answered';
    notificationBody = `Roll No. ${data.solverRollNumber || 'unknown'} has answered your question.`;
  } else {
    // Fallback message composition
    notificationTitle = data.title || '📢 New Class Question';
    const fallbackTitle = data.title ? String(data.title).trim() : '';
    if (fallbackTitle) {
      notificationBody = `Roll No. ${data.rollNumber || 'unknown'} asked a question.\nTitle:\n${fallbackTitle}\n\nClick to help.`;
    } else {
      notificationBody = `Roll No. ${data.rollNumber || 'unknown'} asked a new question.`;
    }
  }
  
  const notificationOptions = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: notificationTitle,
    message: notificationBody,
    priority: 2, // Max priority
    requireInteraction: false // Allow auto-dismiss
  };
  console.log('[FCM Service Worker] Notification options:', notificationOptions);
  
  const notificationId = String(data.questionId || 'fcm_alert_' + Date.now());
  
  // Await the creation of the notification to prevent service worker premature termination
  await new Promise((resolve) => {
    console.log('[FCM Service Worker] Creating desktop notification...');
    chrome.notifications.create(notificationId, notificationOptions, (id) => {
      console.log('[FCM Service Worker] Notification ID:', id);
      if (chrome.runtime.lastError) {
        console.log('[FCM Service Worker] Success: false');
        console.log('[FCM Service Worker] Failure: true');
        console.error('[FCM Service Worker] Runtime error:', chrome.runtime.lastError.message);
      } else {
        console.log('[FCM Service Worker] Success: true');
        console.log('[FCM Service Worker] Failure: false');
        console.log('[FCM Service Worker] Runtime error: none');
        console.log('[FCM Service Worker] Notification creation success.');
      }
      // Auto dismiss after 7 seconds
      setTimeout(() => {
        chrome.notifications.clear(id);
      }, 7000);
      resolve();
    });
  });
  
  // Broadcast to any active client sidebars
  broadcastToActiveTabs({ type: 'push_received', data });
}

// Helper to handle redirecting clicks on notifications to deep-linked solver dashboard
async function handleNotificationClick(questionId) {
  console.log('[FCM Service Worker] Handling click for question:', questionId);
  let targetUrl = chrome.runtime.getURL('student_dashboard.html');
  if (questionId && !questionId.startsWith('fcm_alert')) {
    targetUrl += `?focusQuestion=${encodeURIComponent(questionId)}`;
  }
  
  await new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const existingTab = tabs.find(tab => tab.url && tab.url.includes('student_dashboard.html'));
      if (existingTab) {
        chrome.tabs.update(existingTab.id, { url: targetUrl, active: true }, (updatedTab) => {
          if (updatedTab) {
            chrome.windows.update(updatedTab.windowId, { drawAttention: true, focused: true });
          }
          resolve();
        });
      } else {
        chrome.tabs.create({ url: targetUrl }, () => {
          resolve();
        });
      }
    });
  });
}

// Bind chrome.notifications click listener (for extension desktop notifications)
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('[FCM Service Worker] Notification clicked.');
  console.log('[FCM Service Worker] Question ID:', notificationId);
  let targetUrl = chrome.runtime.getURL('student_dashboard.html');
  if (notificationId && !notificationId.startsWith('fcm_alert')) {
    targetUrl += `?focusQuestion=${encodeURIComponent(notificationId)}`;
  }
  console.log('[FCM Service Worker] Deep Link:', targetUrl);
  chrome.notifications.clear(notificationId);
  handleNotificationClick(notificationId);
});

// Bind standard Push listener
self.addEventListener('push', (event) => {
  console.log('[FCM Service Worker] Push event received.');
  
  // Track that we received a push event
  chrome.storage.local.set({ lastPushReceived: Date.now() }).catch(() => {});
  
  let payload;
  try {
    payload = event.data ? event.data.json() : null;
    console.log('[FCM Service Worker] Payload parsed:', JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error('[FCM Service Worker] Failed to parse push event JSON data:', e);
    return;
  }
  
  if (payload) {
    const data = payload.data || payload.notification || payload;
    console.log('[FCM Service Worker] event.waitUntil() started.');
    const promise = handleIncomingPushData(data)
      .then(() => {
        console.log('[FCM Service Worker] event.waitUntil() completed.');
      })
      .catch((err) => {
        console.error('[FCM Service Worker] Error in handleIncomingPushData:', err);
      });
    event.waitUntil(promise);
  }
});

// Fallback SW notification click listener
self.addEventListener('notificationclick', (event) => {
  console.log('[FCM Service Worker] Notification clicked (Service Worker Event).');
  event.notification.close();
  
  const tag = event.notification.tag || (event.notification.data && event.notification.data.questionId) || event.notificationId;
  console.log('[FCM Service Worker] Question ID:', tag);
  let targetUrl = chrome.runtime.getURL('student_dashboard.html');
  if (tag && !tag.startsWith('fcm_alert')) {
    targetUrl += `?focusQuestion=${encodeURIComponent(tag)}`;
  }
  console.log('[FCM Service Worker] Deep Link:', targetUrl);
  event.waitUntil(handleNotificationClick(tag));
});

function broadcastToActiveTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.url && tab.url.includes('w3schools.com')) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Suppress errors for tabs not listening
        });
      }
    }
  });
  // Also send internally to extension pages (dashboard, options)
  chrome.runtime.sendMessage(message).catch(() => {
    // Suppress errors when no pages are active
  });
}

// Automatic FCM registration is handled solely in the frontend options and dashboard pages.

function triggerFcmSetupOnActiveTabs() {
  console.log('[Background Service Worker] Querying open extension tabs to refresh FCM registration...');
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) return;
    for (const tab of tabs) {
      if (tab.url && (tab.url.includes('student_dashboard.html') || tab.url.includes('options.html'))) {
        console.log('[Background Service Worker] Service worker restart detected. Requesting FCM setup refresh on tab:', tab.id);
        chrome.tabs.sendMessage(tab.id, { type: 'trigger_fcm_setup' }).catch(() => {});
      }
    }
  });
}
triggerFcmSetupOnActiveTabs();

async function setupBackgroundFCM() {
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
  
  // Check permission
  console.log('[FCM] Notification permission status:', Notification.permission);
  if (Notification.permission !== 'granted') {
    console.warn('[FCM] Notification permission is not granted. Current state:', Notification.permission);
    console.log('[FCM] registerFcmToken not sent because notification permission is not granted.');
    return;
  }
  
  try {
    if (typeof firebase !== 'undefined') {
      if (firebase.apps.length === 0) {
        firebase.initializeApp(self.CONFIG.FIREBASE);
      }
      console.log('[FCM] Firebase initialized.');
      console.log('[FCM] Requesting Service Worker registration.');
      const registration = self.registration;
      if (!registration) {
        console.error('[FCM] Service Worker registration not found.');
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
      
      console.log('[FCM] Requesting FCM token...');
      let token = null;
      try {
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
      console.log('[FCM] Background acknowledged token.');
      console.log('[FCM] Sending POST /api/tokens... (initiated by background)');
      
      const res = await dbRegisterFcmToken({
        classCode: studentInfo.classCode,
        rollNumber: studentInfo.rollNumber,
        studentName: studentInfo.studentName || '',
        fcmToken: token
      });
      
      if (res && res.success) {
        console.log('[FCM] Registration completed successfully.');
      } else {
        console.error('[FCM] Token upload failed via dbRegisterFcmToken:', res?.message || 'Unknown error');
      }
    } else {
      console.warn('[FCM] Firebase SDK is not loaded in background context.');
      console.log('[FCM] registerFcmToken not sent because Firebase SDK is not defined.');
    }
  } catch (error) {
    console.error('[FCM] Error during setupFCM execution:', error);
  }
}
