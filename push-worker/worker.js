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
const AUTO_CHECK_MS = Math.max(15000, Number(process.env.AUTO_CHECK_MS || 30000));
const AUTO_GRACE_MINUTES = Math.max(2, Math.min(30, Number(process.env.AUTO_GRACE_MINUTES || 10)));

const safeKey = value => String(value || '').trim().replace(/[.#$\[\]\/]/g, '_');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const asArray = value => Array.isArray(value) ? value.filter(Boolean) : Object.values(value || {}).filter(Boolean);
const norm = value => String(value || '').trim().toLocaleUpperCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();

let auth = null;
let running = false;
let shuttingDown = false;
let lastHeartbeat = 0;
let lastAutoCheck = 0;
let stateWriteWarningShown = false;
let scheduleCache = { at: 0, value: null };
let serviceConfigCache = { at: 0, value: null };

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
  try {
    ensureStateDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify({ refreshToken: value.refreshToken }, null, 2) + '\n', { mode: 0o600 });
    stateWriteWarningShown = false;
    return true;
  } catch (error) {
    if (!stateWriteWarningShown) {
      stateWriteWarningShown = true;
      console.warn(`[push-worker] Stato Firebase non persistito (${STATE_FILE}): ${error.code || error.message}. Continuo usando la sessione in memoria.`);
    }
    return false;
  }
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
  const result = { uid: data.localId, idToken: data.idToken, refreshToken: data.refreshToken };
  saveAuthState(result);
  return result;
}

async function refreshFirebase(refreshToken) {
  const data = await jsonFetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const result = { uid: data.user_id, idToken: data.id_token, refreshToken: data.refresh_token || refreshToken };
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

function allowedByPreferences(subscription, kind) {
  const prefs = subscription?.preferences || {};
  if (kind === 'tomorrow-summary' || kind === 'auto-summary') return prefs.tomorrowSummary !== false;
  if (kind === 'shift-change') return prefs.shiftChanges !== false;
  if (kind === 'ods') return prefs.ods !== false;
  return true;
}

async function subscriptionsFor(targetAgentId, targetDeviceId = '') {
  if (targetAgentId === '*') {
    const all = await db('private/adminUpdates/pushSubscriptions') || {};
    const list = [];
    Object.entries(all).forEach(([agentKey, devices]) => {
      Object.entries(devices || {}).forEach(([deviceKey, item]) => list.push({ agentKey, deviceKey, ...(item || {}) }));
    });
    return targetDeviceId ? list.filter(item => String(item.deviceId || item.deviceKey) === String(targetDeviceId)) : list;
  }
  const agentKey = safeKey(targetAgentId);
  const devices = await db(`private/adminUpdates/pushSubscriptions/${agentKey}`) || {};
  const list = Object.entries(devices).map(([deviceKey, item]) => ({ agentKey, deviceKey, ...(item || {}) }));
  return targetDeviceId ? list.filter(item => String(item.deviceId || item.deviceKey) === String(targetDeviceId)) : list;
}

async function claimQueueItem(key) {
  const queuePath = `private/adminUpdates/pushQueue/${safeKey(key)}`;
  const getResponse = await authorizedFetch(queuePath, { headers: { 'X-Firebase-ETag': 'true' } });
  const current = await getResponse.json().catch(() => null);
  if (!getResponse.ok || !current || current.status !== 'pending') return null;
  const etag = getResponse.headers.get('etag');
  if (!etag) return null;

  const claimed = { ...current, status: 'processing', processingAt: new Date().toISOString(), worker: 'truenas' };
  const putResponse = await authorizedFetch(queuePath, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'if-match': etag },
    body: JSON.stringify(claimed)
  });
  if (putResponse.status === 412) return null;
  if (!putResponse.ok) {
    const data = await putResponse.json().catch(() => null);
    throw new Error(data?.error || `Claim Firebase HTTP ${putResponse.status}`);
  }
  return { key, ...claimed };
}

async function markFinal(item, status, extra = {}) {
  await db(`private/adminUpdates/pushQueue/${safeKey(item.key)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, processedAt: new Date().toISOString(), worker: 'truenas', ...extra })
  });
}

async function processItem(item) {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors = [];

  try {
    const subscriptions = (await subscriptionsFor(String(item.targetAgentId || ''), String(item.targetDeviceId || '')))
      .filter(sub => sub.enabled !== false)
      .filter(sub => allowedByPreferences(sub, item.kind));

    for (const sub of subscriptions) {
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        skipped += 1;
        continue;
      }
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
      const payload = JSON.stringify({
        title: String(item.title || 'NaviSuite'),
        body: String(item.body || ''),
        url: String(item.url || 'naviturni.html'),
        tag: `navisuite-${item.kind || 'push'}-${item.meta?.date || Date.now()}`,
        renotify: true,
        data: { kind: String(item.kind || ''), ...(item.meta || {}) }
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

    const finalStatus = sent > 0 ? (failed > 0 ? 'partial' : 'sent') : (subscriptions.length ? 'error' : 'no_subscriptions');
    await markFinal(item, finalStatus, { sentCount: sent, failedCount: failed, skippedCount: skipped, errorSummary: errors.slice(0, 5).join(' | ') });
  } catch (error) {
    console.error(`[push-worker] Errore item ${item.id || item.key}:`, error.message);
    await markFinal(item, 'error', {
      sentCount: sent, failedCount: failed, skippedCount: skipped,
      errorSummary: String(error.message || error).slice(0, 500)
    }).catch(() => {});
  }
}

function addDays(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

function romeNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function parseClock(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, minuteOfDay: hour * 60 + minute };
}

function normalizeDelivery(preferences = {}) {
  const raw = preferences?.summaryDelivery || {};
  const mode = ['previous-day', 'same-day', 'before-service'].includes(String(raw.mode)) ? String(raw.mode) : 'previous-day';
  const time = parseClock(raw.time)?.text || '22:05';
  const leadMinutes = [30, 60, 120].includes(Number(raw.leadMinutes)) ? Number(raw.leadMinutes) : 60;
  return { mode, time, leadMinutes };
}

function normalizeShift(value) {
  const raw = String(value ?? '').trim().toUpperCase().replace(/[‐‑–—]/g, '-').replace(/\s+/g, '');
  if (!raw || /^(?:RIP|RIPOSO|===|--+)$/.test(raw)) return 'RIP';
  if (/^(?:CON|CONG\.?|CONGEDO)$/.test(raw)) return 'CON';
  if (/^(?:LAV\.?|TERRA)$/.test(raw)) return 'TERRA';
  if (/^F\.?P\.?$/.test(raw)) return 'F.P.';
  return raw;
}

function courseShift(value) {
  const raw = normalizeShift(value);
  const direct = raw.match(/^C?(D[1-4]|BIS|T[12]|M1|R[1-4]|CAR\d*|P[1-3]|CAP\d*|SR1)C?$/)?.[1];
  if (!direct) return '';
  const code = direct.replace(/\d+$/, '');
  return code === 'CAR' || code === 'CAP' ? code : direct;
}

function flattenAgents(data) {
  const result = [];
  const seen = new Set();
  Object.values(data?.residenze || {}).forEach(list => (list || []).forEach(agent => {
    const key = String(agent?.id || agent?.agent_uid || norm(agent?.agente || agent?.name));
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(agent);
  }));
  return result;
}

function findAgent(data, agentId) {
  const target = String(agentId || '');
  return flattenAgents(data).find(agent => String(agent?.id || agent?.agent_uid || '') === target) || null;
}

function roleRank(agent) {
  const value = String(agent?.qualifica || agent?.grado || agent?.role || '');
  if (/capitano|comandante/i.test(value)) return 1;
  if (/capo\s*timoniere|capotimoniere/i.test(value)) return 2;
  if (/motorista/i.test(value) && !/aiuto/i.test(value)) return 3;
  if (/timoniere/i.test(value)) return 4;
  if (/aiuto\s*motorista|aiutomotorista/i.test(value)) return 5;
  if (/marinaio/i.test(value)) return 6;
  if (/barista/i.test(value)) return 7;
  return 99;
}

function shipInfoFor(data, iso, shift) {
  const course = courseShift(shift);
  if (!course) return null;
  return asArray(data?.turni_navi).filter(item => item?.attiva !== false && String(item?.data || '').slice(0, 10) === iso)
    .find(item => courseShift(item?.corsa || item?.turno) === course) || null;
}

function crewFor(data, iso, shift) {
  const course = courseShift(shift);
  if (!course) return [];
  return flattenAgents(data).filter(agent => courseShift(agent?.turni?.[iso]) === course)
    .sort((a, b) => roleRank(a) - roleRank(b) || String(a?.agente || a?.name || '').localeCompare(String(b?.agente || b?.name || ''), 'it'));
}

function refuelLabel(ship) {
  const value = ship?.rifornimento_mattina ?? ship?.rifornimento ?? ship?.rifornimentoMattina ?? '';
  if (value === true) return 'Sì';
  if (value === false || value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text || /^(?:0|false|no)$/i.test(text)) return '';
  if (/^(?:1|true|si|sì|yes)$/i.test(text)) return 'Sì';
  return text;
}

function dateLabel(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const weekdays = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `${weekdays[date.getUTCDay()]} ${d} ${months[m - 1]}`;
}

function buildSummary(data, agentId, iso) {
  const agent = findAgent(data, agentId);
  if (!agent) throw new Error(`Agente ${agentId} non trovato nel Turno effettivo`);
  const shift = normalizeShift(agent?.turni?.[iso]);
  const title = `NaviSuite · ${dateLabel(iso)} · ${shift || 'N/D'}`;
  const nonWorking = /^(?:RIP|CON|F\.P\.|FERIE|MAL|MALATTIA|S\.S\.)$/i.test(shift);
  if (!shift || nonWorking) return { title, body: shift || 'Nessun servizio assegnato.', shift, iso };

  const ship = shipInfoFor(data, iso, shift);
  const vessel = String(ship?.nave || ship?.nome_nave || '').trim();
  const berth = String(ship?.ormeggio_serale || ship?.ormeggio || ship?.ormeggioSera || '').trim();
  const refuel = refuelLabel(ship);
  const names = crewFor(data, iso, shift).map(item => String(item?.agente || item?.name || '').trim()).filter(Boolean);
  const lines = [vessel ? `${shift} · ${vessel}` : shift];
  if (names.length) lines.push(`Equipaggio: ${names.join(', ')}`);
  if (berth) lines.push(`Ormeggio serale: ${berth}`);
  if (refuel) lines.push(`Rifornimento: ${refuel}`);
  let body = lines.join('\n');
  if (body.length > 500) body = body.slice(0, 499) + '…';
  return { title, body, shift, iso };
}

const FALLBACK_SERVICE_STARTS = {
  D1: '07:55', D2: '07:20', D3: '07:00', D4: '07:15', BIS: '08:00',
  DT: '06:55', POND: '09:10'
};

function startFromObject(value) {
  if (!value) return '';
  if (typeof value === 'string') return parseClock(value)?.text || '';
  const candidates = [value.start, value.inizio, value.startTime, value.orario_inizio, value.orarioInizio, value.serviceStart, value.ora_inizio];
  for (const candidate of candidates) {
    const parsed = parseClock(candidate);
    if (parsed) return parsed.text;
  }
  return '';
}

function serviceStartFor(data, agent, shift, iso, configs) {
  const agentCandidates = [
    agent?.orari?.[iso], agent?.turni_orari?.[iso], agent?.serviceTimes?.[iso], agent?.serviceStart?.[iso], agent?.orario?.[iso]
  ];
  for (const candidate of agentCandidates) {
    const found = startFromObject(candidate);
    if (found) return found;
  }

  const key = normalizeShift(shift);
  const course = courseShift(key);
  const sources = [configs?.configurations, configs, data?.serviceConfigurations, data?.configurazioni_servizi].filter(Boolean);
  for (const source of sources) {
    const item = source?.[key] || source?.[key.toUpperCase?.()] || (course ? source?.[course] : null);
    const found = startFromObject(item);
    if (found) return found;
  }
  return FALLBACK_SERVICE_STARTS[key] || FALLBACK_SERVICE_STARTS[course] || '';
}

async function effectiveScheduleData() {
  if (scheduleCache.value && Date.now() - scheduleCache.at < 60000) return scheduleCache.value;
  const snapshot = await db('private/adminUpdates/effectiveSchedule');
  const data = snapshot?.data || null;
  if (!data) throw new Error('Turno effettivo non disponibile');
  scheduleCache = { at: Date.now(), value: data };
  return data;
}

async function serviceConfigurations() {
  if (Date.now() - serviceConfigCache.at < 5 * 60 * 1000) return serviceConfigCache.value;
  let value = null;
  try { value = await db('private/adminUpdates/serviceConfigurations'); } catch (_) { value = null; }
  serviceConfigCache = { at: Date.now(), value };
  return value;
}

function dueForTarget(now, targetDate, delivery, data, agent, shift, configs) {
  let sendDate = targetDate;
  let dueMinute = null;
  if (delivery.mode === 'previous-day') {
    sendDate = addDays(targetDate, -1);
    dueMinute = parseClock(delivery.time)?.minuteOfDay;
  } else if (delivery.mode === 'same-day') {
    dueMinute = parseClock(delivery.time)?.minuteOfDay;
  } else {
    const start = parseClock(serviceStartFor(data, agent, shift, targetDate, configs));
    if (!start) return false;
    dueMinute = start.minuteOfDay - Number(delivery.leadMinutes || 60);
    if (dueMinute < 0) {
      sendDate = addDays(targetDate, -1);
      dueMinute += 1440;
    }
  }
  if (now.date !== sendDate || !Number.isFinite(dueMinute)) return false;
  return now.minuteOfDay >= dueMinute && now.minuteOfDay < dueMinute + AUTO_GRACE_MINUTES;
}

async function enqueueAutomaticSummary(sub, data, configs, targetDate) {
  const deviceId = String(sub.deviceId || sub.deviceKey || '').trim();
  const agentId = String(sub.agentId || '').trim();
  if (!agentId || !deviceId) return false;
  const key = safeKey(`AUTO_${agentId}_${deviceId}_${targetDate}`);
  const path = `private/adminUpdates/pushQueue/${key}`;
  const existing = await db(path).catch(() => null);
  if (existing) return false;

  const summary = buildSummary(data, agentId, targetDate);
  const currentAuth = await getAuth();
  const item = {
    id: key,
    status: 'pending',
    kind: 'auto-summary',
    requestedByAgentId: 'system',
    requestedByName: 'NaviSuite automatico',
    ownerUid: currentAuth.uid || '',
    targetAgentId: agentId,
    targetDeviceId: deviceId,
    title: summary.title,
    body: summary.body,
    url: 'naviturni.html',
    meta: { date: targetDate, service: summary.shift || '', automatic: true },
    createdAt: new Date().toISOString()
  };
  await db(path, { method: 'PUT', body: JSON.stringify(item) });
  console.log(`[push-worker] Riepilogo automatico accodato: ${agentId}/${deviceId} · ${targetDate}`);
  return true;
}

async function scheduleAutomaticSummaries() {
  const now = romeNow();
  const all = await db('private/adminUpdates/pushSubscriptions') || {};
  const subscriptions = [];
  Object.entries(all).forEach(([agentKey, devices]) => Object.entries(devices || {}).forEach(([deviceKey, item]) => subscriptions.push({ agentKey, deviceKey, ...(item || {}) })));
  const enabled = subscriptions.filter(sub => sub.enabled !== false && sub.preferences?.tomorrowSummary !== false);
  if (!enabled.length) return;

  const [data, configs] = await Promise.all([effectiveScheduleData(), serviceConfigurations()]);
  for (const sub of enabled) {
    const agent = findAgent(data, sub.agentId);
    if (!agent) continue;
    const delivery = normalizeDelivery(sub.preferences || {});
    for (const targetDate of [now.date, addDays(now.date, 1)]) {
      const shift = normalizeShift(agent?.turni?.[targetDate]);
      if (!shift) continue;
      if (!dueForTarget(now, targetDate, delivery, data, agent, shift, configs)) continue;
      try { await enqueueAutomaticSummary(sub, data, configs, targetDate); }
      catch (error) { console.error(`[push-worker] Scheduler ${sub.agentId}/${targetDate}:`, error.message); }
    }
  }
}

async function recoverStale(queueObject) {
  const now = Date.now();
  for (const [key, item] of Object.entries(queueObject || {})) {
    if (item?.status !== 'processing') continue;
    const stamp = Date.parse(item.processingAt || '');
    if (!Number.isFinite(stamp) || now - stamp < STALE_PROCESSING_MS) continue;
    try {
      await db(`private/adminUpdates/pushQueue/${safeKey(key)}`, { method: 'PATCH', body: JSON.stringify({ status: 'pending', recoveredAt: new Date().toISOString() }) });
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
    if (Date.now() - lastAutoCheck >= AUTO_CHECK_MS) {
      lastAutoCheck = Date.now();
      await scheduleAutomaticSummaries().catch(error => console.error('[push-worker] Scheduler automatico:', error.message));
    }

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
      console.log(`[push-worker] attivo · polling ${POLL_MS} ms · scheduler ${AUTO_CHECK_MS} ms · ${new Date().toISOString()}`);
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
  console.log(`[push-worker] NaviSuite Push Worker avviato · polling ${POLL_MS} ms · riepiloghi automatici attivi`);
  await getAuth();
  while (!shuttingDown) {
    await processQueue();
    await sleep(POLL_MS);
  }
  console.log('[push-worker] Arresto pulito.');
  process.exit(0);
})();
