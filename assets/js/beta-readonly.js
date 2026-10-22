/*
 * NaviBeta - sola lettura.
 * Blocca ogni scrittura in rete e nel localStorage (POST/PUT/PATCH/DELETE, sendBeacon, override di metodo)
 * verso Firebase Realtime Database e PocketBase. Il login anonimo Firebase
 * (identitytoolkit/securetoken) e l'autenticazione PocketBase restano permessi,
 * perche' servono solo per leggere.
 */
(function () {
  'use strict';
  if (window.__naviBetaReadOnly) return;
  window.__naviBetaReadOnly = true;

  const AUTH_OK = /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|\/auth-with-|\/auth-refresh|\/request-(?:otp|verification)/i;
  const DB_HOSTS = /firebaseio\.com|firebasedatabase\.app|firestore\.googleapis\.com|firebasestorage\.googleapis\.com|\.ts\.net|\/api\/collections\/|\/api\/navisuite-v2\//i;

  const pbBase = () => { try { return localStorage.getItem('navisuite.pbBase') || ''; } catch (_) { return ''; } };

  function absolute(url) {
    try { return new URL(String(url && url.url ? url.url : url), location.href); } catch (_) { return null; }
  }

  function isBlocked(url, method) {
    const u = absolute(url);
    if (!u) return false;
    const href = u.href;
    if (AUTH_OK.test(href)) return false;
    const base = pbBase();
    const isDb = DB_HOSTS.test(href) || (base && href.indexOf(base) === 0);
    if (!isDb) return false;
    const m = String(method || 'GET').toUpperCase();
    const override = (u.searchParams.get('x-http-method-override') || '').toUpperCase();
    if (override && override !== 'GET') return true;
    return m !== 'GET' && m !== 'HEAD';
  }

  function warn(url, method) {
    try { console.warn('[NaviBeta] scrittura bloccata (sola lettura):', method, String(url)); } catch (_) {}
    try {
      if (!document.getElementById('navibeta-ro-badge') && document.body) {
        const b = document.createElement('div');
        b.id = 'navibeta-ro-badge';
        b.textContent = 'BETA · sola lettura: salvataggio bloccato';
        b.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483000;background:#7c2d12;color:#fff;font:600 12px Manrope,system-ui,sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:none';
        document.body.appendChild(b);
        setTimeout(() => { try { b.remove(); } catch (_) {} }, 4000);
      }
    } catch (_) {}
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      const method = (init && init.method) || (input && input.method) || 'GET';
      const url = input && input.url ? input.url : input;
      if (isBlocked(url, method)) {
        warn(url, method);
        return Promise.resolve(new Response(JSON.stringify({ error: 'NaviBeta e in sola lettura' }), {
          status: 403, statusText: 'Forbidden', headers: { 'Content-Type': 'application/json' }
        }));
      }
      return nativeFetch.apply(this, arguments);
    };
  }

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__betaBlocked = isBlocked(url, method);
    this.__betaInfo = [method, url];
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__betaBlocked) {
      warn(this.__betaInfo[1], this.__betaInfo[0]);
      const self = this;
      setTimeout(() => {
        try { self.dispatchEvent(new Event('error')); if (typeof self.onerror === 'function') self.onerror(new Event('error')); } catch (_) {}
      }, 0);
      return;
    }
    return xhrSend.apply(this, arguments);
  };

  if (navigator.sendBeacon) {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url) {
      if (isBlocked(url, 'POST')) { warn(url, 'POST'); return false; }
      return nativeBeacon.apply(null, arguments);
    };
  }
  /*
   * Storage del browser: su papamike80.github.io il localStorage e' condiviso con
   * NaviSuite (produzione), quindi niente va scritto davvero. Le scritture restano
   * solo in memoria finche' la pagina e' aperta e spariscono al ricaricamento.
   * Passano solo le chiavi di accesso (login) e la cache del token anonimo Firebase.
   */
  const PASS_KEYS = /^(naviturni_logged_agent|navidiaria.activeAgent|navisuite.adminFirebaseAuth.v1|navisuite.pageAccess)$/;
  try {
    const proto = Storage.prototype;
    const nGet = proto.getItem, nSet = proto.setItem, nRem = proto.removeItem, nClear = proto.clear, nKey = proto.key;
    const nLen = Object.getOwnPropertyDescriptor(proto, 'length');
    const overlays = new WeakMap();
    const ov = (st) => { let m = overlays.get(st); if (!m) { m = new Map(); overlays.set(st, m); } return m; };
    const isLocal = (st) => { try { return st === window.localStorage; } catch (_) { return false; } };
    const keysOf = (st) => {
      const real = []; const n = nLen.get.call(st);
      for (let i = 0; i < n; i++) real.push(nKey.call(st, i));
      const m = ov(st); const out = real.filter((k) => !(m.has(k) && m.get(k) === null));
      m.forEach((v, k) => { if (v !== null && out.indexOf(k) < 0) out.push(k); });
      return out;
    };
    proto.getItem = function (k) { if (isLocal(this)) { const m = ov(this); k = String(k); if (m.has(k)) return m.get(k); } return nGet.call(this, k); };
    proto.setItem = function (k, v) { if (isLocal(this) && !PASS_KEYS.test(String(k))) { ov(this).set(String(k), String(v)); return; } return nSet.call(this, k, v); };
    proto.removeItem = function (k) { if (isLocal(this) && !PASS_KEYS.test(String(k))) { ov(this).set(String(k), null); return; } return nRem.call(this, k); };
    proto.clear = function () { if (isLocal(this)) { keysOf(this).forEach((k) => { if (!PASS_KEYS.test(k)) ov(this).set(k, null); }); return; } return nClear.call(this); };
    proto.key = function (i) { return isLocal(this) ? (keysOf(this)[i] === undefined ? null : keysOf(this)[i]) : nKey.call(this, i); };
    Object.defineProperty(proto, 'length', { configurable: true, get: function () { return isLocal(this) ? keysOf(this).length : nLen.get.call(this); } });
  } catch (_) {}
})();
