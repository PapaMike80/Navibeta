'use strict';

const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const required = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'FIREBASE_API_KEY', 'FIREBASE_DATABASE_URL'];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`[push-worker] Variabile mancante: ${name}`);
    process.exit(1);
  }
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY.trim();
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY.trim();
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY.trim();
const DB = process.env.FIREBASE_DATABASE_URL.replace(/\/$/, '');
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'https://papamike80.github.io/Navibeta/';
const POLL_MS = Math.max(2000, Number(process.env.POLL_MS || 5000));
const BATCH_SIZE = Math.max(1, Math.min(100, Number(process.env.BATCH_SIZE || 25)));
const STATE_FILE = process.env.AUTH_STATE_FILE || '/data/firebase-auth.json';
const STALE_PROCESSING_MS = Math.max(60000, Number(process.env.STALE_PROCESSING_MS || 120000));

const safeKey = value => String(value || '').trim().replace(/[.#$\[\]\/]/g, '_');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let auth = null;
let running = false;
let shuttingDown = false;
let lastHeartbeat = 0;

function ensureStateDir() {
  const dir = path.dirname(STATE_FILE);
  fs.mkdirSync(dir, { recursive: true });
}

function loadAuthState() {
  try {
    const value = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (value?.refreshToken) return value;
  } catch (_) { }
  return null;
}

function saveAuthState(value) {
  ensureStateDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ refreshToken: value.refreshToken }, null, 2) + '\n', { mode: 0o600 });
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function signUpAnonymous() {
  const data = await jsonFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const result = { idToken: data.idToken, refreshToken: data.refreshToken };
  saveAuthState(result);
  return result;
}

async function refreshFirebase(refreshToken) {
  const data = await jsonFetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const result = { idToken: data.id_token, refreshToken: data.refresh_token || refreshToken };
  saveAuthState(result);
  return result;
}

async function getAuth(forceRefresh = false) {
  if (!forceRefresh && auth?.idToken) return auth;
  const saved = loadAuthState();
  if (saved?.refreshToken) {
    try {
      auth = await refreshFirebase(saved.refreshToken);
      return auth;
    } catch (error) {
      console.warn('[push-worker] Refresh Firebase fallito, creo una nuova sessione anonima:', error.message);
    }
  }
  auth = await signUpAnonymous();
  return auth;
}

async function authorizedFetch(pathname, options = {}, retry = true) {
  const current = await getAuth();
  const url = `${DB}/${String(pathname).replace(/^\/+/, '')}.json?auth=${encodeURIComponent(current.idToken)}`;
  const response = await fetch(url, options);
  if ((response.status === 401 || response.status === 403) && retry) {
    auth = null;
    await getAuth(true);
    return authorizedFetch(pathname, options, false);
  }
  return response;
}

async function db(pathname, options = {}) {
  const response = await authorizedFetch(pathname, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Firebase HTTP ${response.status}`);
  return data;
}

async function claimQueueItem(key) {
  const queuePath = `private/adminUpdates/pushQueue/${safeKey(key)}`;
  const getResponse = await authorizedFetch(queuePath, {
    headers: { 'X-Firebase-ETag': 'true' }
  });
  const current = await getResponse.json().catch(() => null);
  if (!getResponse.ok || !current || current.status !== 'pending') return null;
  const etag = getResponse.headers.get('etag');
  if (!etag) return null;

  const claimed = {
    ...current,
    status: 'processing',
    processingAt: new Date().toISOString(),
    worker: 'truenas'
  };

  const putResponse = await authorizedFetch(queuePath, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'if-match': etag
    },
    body: JSON.stringify(claimed)
  });

  if (putResponse.status === 412) return null;
  if (!putResponse.ok) {
    const data = await putResponse.json().catch(() => null);
    throw new Error(data?.error || `Claim Firebase HTTP ${putResponse.status}`);
  }
  return { key, ...claimed };
}

function allowedByPreferences(subscription, kind) {
  const prefs = subscription?.preferences || {};
  if (kind === 'tomorrow-summary') return prefs.tomorrowSummary !== false;
  if (kind === 'shift-change') return prefs.shiftChanges !== false;
  if (kind === 'ods') return prefs.ods !== false;
  return true;
}

async function subscriptionsFor(targetAgentId) {
  if (targetAgentId === '*') {
    const all = await db('private/adminUpdates/pushSubscriptions') || {};
    const list = [];
    Object.entries(all).forEach(([agentKey, devices]) => {
      Object.entries(devices || {}).forEach(([deviceKey, item]) => list.push({ agentKey, deviceKey, ...(item || {}) }));
    });
    return list;
  }
  const agentKey = safeKey(targetAgentId);
  const devices = await db(`private/adminUpdates/pushSubscriptions/${agentKey}`) || {};
  return Object.entries(devices).map(([deviceKey, item]) => ({ agentKey, deviceKey, ...(item || {}) }));
}

async function markFinal(item, status, extra = {}) {
  await db(`private/adminUpdates/pushQueue/${safeKey(item.key)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      processedAt: new Date().toISOString(),
      worker: 'truenas',
      ...extra
    })
  });
}

async function processItem(item) {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors = [];

  try {
    const subscriptions = (await subscriptionsFor(String(item.targetAgentId || '')))
      .filter(sub => sub.enabled !== false)
      .filter(sub => allowedByPreferences(sub, item.kind));

    for (const sub of subscriptions) {
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        skipped += 1;
        continue;
      }

      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
      };
      const payload = JSON.stringify({
        title: String(item.title || 'NaviSuite'),
        body: String(item.body || ''),
        url: String(item.url || 'naviturni.html'),
        tag: `navisuite-${item.kind || 'push'}-${Date.now()}`,
        renotify: true,
        data: { kind: String(item.kind || '') }
      });

      try {
        const response = await webpush.sendNotification(subscription, payload, { TTL: 600 });
        console.log(`[push-worker] ${item.id || item.key} -> ${sub.agentId || item.targetAgentId}/${sub.deviceLabel || sub.deviceId || sub.deviceKey}: ${response.statusCode}`);
        sent += 1;
      } catch (error) {
        failed += 1;
        const status = Number(error?.statusCode || 0);
        errors.push(`${sub.deviceLabel || sub.deviceId || 'device'}:${status || error.message}`);
        console.error(`[push-worker] Errore ${item.id || item.key}:`, status || error.message);
        if (status === 404 || status === 410) {
          try {
            await db(`private/adminUpdates/pushSubscriptions/${safeKey(sub.agentId || item.targetAgentId)}/${safeKey(sub.deviceId || sub.deviceKey)}`, { method: 'DELETE' });
          } catch (_) { }
        }
      }
    }

    const finalStatus = sent > 0
      ? (failed > 0 ? 'partial' : 'sent')
      : (subscriptions.length ? 'error' : 'no_subscriptions');

    await markFinal(item, finalStatus, {
      sentCount: sent,
      failedCount: failed,
      skippedCount: skipped,
      errorSummary: errors.slice(0, 5).join(' | ')
    });
  } catch (error) {
    console.error(`[push-worker] Errore item ${item.id || item.key}:`, error.message);
    await markFinal(item, 'error', {
      sentCount: sent,
      failedCount: failed,
      skippedCount: skipped,
      errorSummary: String(error.message || error).slice(0, 500)
    }).catch(() => {});
  }
}

async function recoverStale(queueObject) {
  const now = Date.now();
  for (const [key, item] of Object.entries(queueObject || {})) {
    if (item?.status !== 'processing') continue;
    const stamp = Date.parse(item.processingAt || '');
    if (!Number.isFinite(stamp) || now - stamp < STALE_PROCESSING_MS) continue;
    try {
      await db(`private/adminUpdates/pushQueue/${safeKey(key)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'pending', recoveredAt: new Date().toISOString() })
      });
      item.status = 'pending';
      console.warn(`[push-worker] Recuperata notifica rimasta in processing: ${key}`);
    } catch (error) {
      console.error('[push-worker] Recupero processing fallito:', error.message);
    }
  }
}

async function cleanup(queueObject) {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const [key, item] of Object.entries(queueObject || {})) {
    if (!['sent', 'partial', 'error', 'no_subscriptions'].includes(String(item?.status || ''))) continue;
    const stamp = Date.parse(item?.processedAt || item?.createdAt || '');
    if (!Number.isFinite(stamp) || stamp >= cutoff) continue;
    await db(`private/adminUpdates/pushQueue/${safeKey(key)}`, { method: 'DELETE' }).catch(() => {});
  }
}

async function processQueue() {
  if (running) return;
  running = true;
  try {
    const queueObject = await db('private/adminUpdates/pushQueue') || {};
    await recoverStale(queueObject);

    const candidates = Object.entries(queueObject)
      .filter(([, item]) => item?.status === 'pending')
      .sort((a, b) => String(a[1]?.createdAt || '').localeCompare(String(b[1]?.createdAt || '')))
      .slice(0, BATCH_SIZE);

    if (candidates.length) console.log(`[push-worker] ${candidates.length} notifiche da processare`);

    for (const [key] of candidates) {
      if (shuttingDown) break;
      const claimed = await claimQueueItem(key);
      if (claimed) await processItem(claimed);
    }

    await cleanup(queueObject);

    if (Date.now() - lastHeartbeat > 5 * 60 * 1000) {
      lastHeartbeat = Date.now();
      console.log(`[push-worker] attivo · polling ${POLL_MS} ms · ${new Date().toISOString()}`);
    }
  } catch (error) {
    console.error('[push-worker] Ciclo fallito:', error.message || error);
    auth = null;
  } finally {
    running = false;
  }
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

process.on('SIGTERM', () => { shuttingDown = true; });
process.on('SIGINT', () => { shuttingDown = true; });

(async () => {
  console.log(`[push-worker] NaviSuite Push Worker avviato · polling ${POLL_MS} ms`);
  await getAuth();
  while (!shuttingDown) {
    await processQueue();
    await sleep(POLL_MS);
  }
  console.log('[push-worker] Arresto pulito.');
  process.exit(0);
})();
