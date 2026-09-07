(function () {
  'use strict';

  const API_ROOT = '/api/navisuite-v2/ponteradio';
  const VAPID_PUBLIC_KEY = 'BBuuE6ITF9JZ2ADHsgAbt4Vfc74bNsST6dbixZEtcWa8QppgWhrmtQdH46GkMtG12FFuC6bxl5MpxPCrRYKDgL0';
  const VAPID_VERSION = 2;
  const DB_NAME = 'navisuite-ponteradio';
  const STORE_NAME = 'messages';
  const MAX_HISTORY = 500;
  const DEVICE_KEY = 'navisuite.ponteradio.device';
  const $ = id => document.getElementById(id);

  function readProfile() {
    try {
      return JSON.parse(localStorage.getItem('navidiaria.activeAgent') || localStorage.getItem('naviturni_logged_agent') || 'null');
    } catch (_) {
      return null;
    }
  }

  const profile = readProfile();
  const legacyId = String(profile?.id || profile?.agentId || '').trim();
  const displayName = String(profile?.name || profile?.agente || profile?.cognome || legacyId).trim();
  let currentMessages = [];
  let recipientNames = new Map();
  let canBroadcast = false;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
  }

  function randomId(prefix) {
    const value = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2));
    return prefix + value;
  }

  function openHistoryDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('time', 'time');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Storico locale non disponibile.'));
    });
  }

  async function historyTransaction(mode, callback) {
    const db = await openHistoryDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error('Errore nello storico locale.'));
        transaction.onabort = () => reject(transaction.error || new Error('Operazione locale annullata.'));
        result = callback(store);
      });
    } finally {
      db.close();
    }
  }

  async function readHistory() {
    const rows = await historyTransaction('readonly', store => {
      const request = store.getAll();
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    });
    return (await rows).sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))).slice(-MAX_HISTORY);
  }

  async function addHistory(message) {
    const row = {
      id: String(message.id || randomId('local-')),
      direction: message.direction === 'in' ? 'in' : 'out',
      peerId: String(message.peerId || ''),
      peer: String(message.peer || 'Agente'),
      body: String(message.body || '').slice(0, 500),
      time: String(message.time || new Date().toISOString()),
    };
    await historyTransaction('readwrite', store => store.put(row));
    const all = await readHistory();
    if (all.length >= MAX_HISTORY) {
      const keep = new Set(all.slice(-MAX_HISTORY).map(item => item.id));
      await historyTransaction('readwrite', store => {
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (!keep.has(cursor.value.id)) cursor.delete();
          cursor.continue();
        };
      });
    }
    await renderHistory();
  }

  async function clearHistory() {
    await historyTransaction('readwrite', store => store.clear());
    await renderHistory();
  }

  async function migrateLegacyHistory() {
    const oldKey = 'navisuite.ponteradio.history.' + legacyId;
    let rows = [];
    try { rows = JSON.parse(localStorage.getItem(oldKey) || '[]'); } catch (_) {}
    if (!Array.isArray(rows) || !rows.length) return;
    for (const row of rows.slice(-MAX_HISTORY)) {
      await addHistory({ ...row, id: row.id || randomId('legacy-') });
    }
    localStorage.removeItem(oldKey);
  }

  async function renderHistory() {
    const target = $('radio-history');
    if (!target) return;
    try {
      currentMessages = (await readHistory()).reverse();
      target.innerHTML = currentMessages.length
        ? currentMessages.map(message => `
          <article class="message ${message.direction === 'out' ? 'out' : 'in'}" role="button" tabindex="0"
            data-message-id="${escapeHtml(message.id)}" title="Riprendi questa conversazione">
            <div class="meta">
              <strong>${escapeHtml(message.direction === 'out' ? 'A ' + message.peer : 'Da ' + message.peer)}</strong>
              <span>${escapeHtml(new Date(message.time).toLocaleString('it-IT', { dateStyle:'short', timeStyle:'short' }))}</span>
            </div>
            <div class="body">${escapeHtml(message.body)}</div>
          </article>`).join('')
        : '<div class="empty">Nessun messaggio salvato su questo dispositivo.</div>';
    } catch (_) {
      target.innerHTML = '<div class="empty">Storico locale non disponibile.</div>';
    }
  }

  function resumeConversation(card) {
    const message = currentMessages.find(item => item.id === card?.dataset?.messageId);
    if (!message) return;
    const select = $('radio-agent');
    const peerId = String(message.peerId || '');
    if (peerId && [...select.options].some(option => option.value === peerId)) {
      select.value = peerId;
    }
    $('radio-body').value = '';
    $('radio-body').placeholder = 'Continua la conversazione con ' + String(message.peer || 'questo agente') + '…';
    $('radio-status').textContent = '↩ Conversazione ripresa con ' + String(message.peer || 'destinatario') + '.';
    $('radio-body').focus();
    $('radio-body').scrollIntoView({ behavior:'smooth', block:'center' });
  }

  async function ensurePocketBaseAuth() {
    if (!window.NaviV2PB) throw new Error('Collegamento PocketBase non disponibile.');
    const currentUser = NaviV2PB.user();
    if (NaviV2PB.token() && String(currentUser?.login_id || '') === legacyId && await NaviV2PB.refresh()) return;
    NaviV2PB.logout();
    const passwordHash = localStorage.getItem('navidiaria.pin.' + legacyId) || '';
    await NaviV2PB.loginWithPasswordHash(legacyId, passwordHash);
  }

  function urlBase64ToUint8Array(value) {
    const pad = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
  }

  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = randomId('device-');
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function deviceLabel() {
    if (/iPhone/i.test(navigator.userAgent)) return 'iPhone';
    if (/iPad/i.test(navigator.userAgent)) return 'iPad';
    if (/Android/i.test(navigator.userAgent)) return 'Android';
    return 'Browser';
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  async function serviceWorkerRegistration() {
    if (!('serviceWorker' in navigator)) throw new Error('Service Worker non disponibile.');
    const registration = await navigator.serviceWorker.register('sw.js?ponteradio=2', { scope:'./', updateViaCache:'none' });
    registration.update().catch(() => {});
    return navigator.serviceWorker.ready;
  }

  async function saveSubscription(subscription) {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Subscription Web Push incompleta.');
    return NaviV2PB.request(API_ROOT + '/subscription', {
      method:'POST',
      body:{
        device_id:deviceId(),
        device_label:deviceLabel(),
        endpoint:String(json.endpoint),
        p256dh:String(json.keys.p256dh),
        auth_key:String(json.keys.auth),
        enabled:true,
        vapid_version:VAPID_VERSION,
        preferences:{ ponte_radio:true },
      },
    });
  }

  async function syncPushSubscription(requestPermission) {
    const title = $('radio-push-title');
    const copy = $('radio-push-copy');
    const button = $('radio-enable');
    if (!('Notification' in window) || !('PushManager' in window)) {
      title.textContent = 'Notifiche non supportate';
      copy.textContent = 'Questo browser non supporta Web Push.';
      button.hidden = true;
      return false;
    }
    if (isIos() && !isStandalone()) {
      title.textContent = 'Installa Navibeta su iPhone';
      copy.textContent = 'Apri Navibeta dalla schermata Home per ricevere le notifiche.';
      button.hidden = true;
      return false;
    }

    let permission = Notification.permission;
    if (requestPermission && permission !== 'granted') permission = await Notification.requestPermission();
    if (permission === 'denied') {
      title.textContent = 'Notifiche bloccate';
      copy.textContent = 'Riattivale dalle impostazioni del browser.';
      button.hidden = true;
      return false;
    }
    if (permission !== 'granted') {
      title.textContent = 'Notifiche non ancora attive';
      copy.textContent = 'Attivale per ricevere i messaggi anche con Navibeta chiusa.';
      button.hidden = false;
      return false;
    }

    title.textContent = 'Attivazione notifiche…';
    button.hidden = true;
    const registration = await serviceWorkerRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await saveSubscription(subscription);
    title.textContent = '✅ Notifiche attive';
    copy.textContent = 'Questo dispositivo può ricevere i messaggi di Ponte Radio.';
    return true;
  }

  async function loadRecipients() {
    const response = await NaviV2PB.request(API_ROOT + '/recipients');
    const rows = Array.isArray(response.recipients) ? response.recipients : [];
    canBroadcast = response.canBroadcast === true;
    recipientNames = new Map(rows.map(row => [String(row.id), String(row.name || row.legacy_id || row.id)]));
    $('radio-agent').innerHTML =
      '<option value="">Scegli agente…</option>' +
      (canBroadcast ? '<option value="*">📣 Tutti gli agenti</option>' : '') +
      rows.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name || row.legacy_id || row.id)}</option>`).join('');
  }

  async function sendMessage() {
    const select = $('radio-agent');
    const target = select.value;
    const body = $('radio-body').value.trim();
    const peer = select.selectedOptions[0]?.textContent || recipientNames.get(target) || target;
    if (!target) { $('radio-status').textContent = 'Scegli un destinatario.'; return; }
    if (target === '*' && !canBroadcast) { $('radio-status').textContent = 'L’invio a tutti è riservato agli admin.'; return; }
    if (!body) { $('radio-status').textContent = 'Scrivi il messaggio.'; return; }

    const button = $('radio-send');
    button.disabled = true;
    $('radio-status').textContent = 'Invio a PocketBase…';
    try {
      const queued = await NaviV2PB.request(API_ROOT + '/send', {
        method:'POST',
        body:{ target_agent:target === '*' ? '' : target, broadcast:target === '*', body },
      });
      await addHistory({
        id:'out-' + String(queued.id || randomId('message-')),
        direction:'out',
        peerId:target === '*' ? '' : target,
        peer,
        body,
        time:new Date().toISOString(),
      });
      $('radio-body').value = '';
      $('radio-status').textContent = '✅ Messaggio consegnato al servizio di invio.';
    } catch (error) {
      if (error?.status === 401) {
        try {
          await ensurePocketBaseAuth();
          $('radio-status').textContent = 'Sessione aggiornata: premi di nuovo Invia.';
        } catch (authError) {
          $('radio-status').textContent = '❌ ' + (authError?.message || 'Accesso PocketBase non riuscito.');
        }
      } else {
        $('radio-status').textContent = '❌ ' + (error?.message || 'Invio non riuscito.');
      }
    } finally {
      button.disabled = false;
    }
  }

  async function init() {
    if (!profile || !legacyId) {
      $('radio-app').innerHTML = '<section class="radio-card access-lock"><h1>📻 Ponte Radio</h1><p>Accedi a Navibeta per usare Ponte Radio.</p><a class="radio-home" href="index.html">Torna alla Home</a></section>';
      return;
    }

    await renderHistory();
    await migrateLegacyHistory();
    $('radio-status').textContent = 'Collegamento a PocketBase…';
    try {
      await ensurePocketBaseAuth();
      await loadRecipients();
      $('radio-status').textContent = displayName ? 'Pronto, ' + displayName + '.' : 'Ponte Radio pronto.';
      syncPushSubscription(false).catch(error => {
        $('radio-push-title').textContent = 'Notifiche non attive';
        $('radio-push-copy').textContent = error?.message || 'Attivazione non riuscita.';
        $('radio-enable').hidden = false;
      });
    } catch (error) {
      $('radio-agent').innerHTML = '<option value="">Destinatari non disponibili</option>';
      $('radio-send').disabled = true;
      $('radio-status').textContent = '❌ ' + (error?.message || 'Accesso PocketBase non riuscito.');
      $('radio-push-title').textContent = 'Notifiche non disponibili';
      $('radio-push-copy').textContent = 'Accedi nuovamente a Navibeta e riprova.';
    }
  }

  $('radio-send').addEventListener('click', sendMessage);
  $('radio-enable').addEventListener('click', async () => {
    $('radio-enable').disabled = true;
    try { await syncPushSubscription(true); }
    catch (error) {
      $('radio-push-title').textContent = 'Notifiche non attive';
      $('radio-push-copy').textContent = error?.message || 'Attivazione non riuscita.';
      $('radio-enable').hidden = false;
    } finally {
      $('radio-enable').disabled = false;
    }
  });
  $('radio-history').addEventListener('click', event => {
    const card = event.target.closest('[data-message-id]');
    if (card) resumeConversation(card);
  });
  $('radio-history').addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-message-id]');
    if (card) { event.preventDefault(); resumeConversation(card); }
  });
  $('radio-clear').addEventListener('click', () => {
    if (confirm('Cancellare lo storico Ponte Radio salvato su questo dispositivo?')) {
      clearHistory().catch(() => {});
    }
  });
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'ponteradio:message') renderHistory();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderHistory();
  });

  init();
})();
