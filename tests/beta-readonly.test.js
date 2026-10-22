const assert = require('assert');
const calls = [];
global.window = global; global.location = { href: 'https://papamike80.github.io/Navibeta/index.html' };
global.document = { getElementById: () => null, body: null };
global.localStorage = { getItem: () => null };
Object.defineProperty(global, 'navigator', { value: { sendBeacon: () => true }, configurable: true });
global.XMLHttpRequest = function () {}; XMLHttpRequest.prototype.open = function () {}; XMLHttpRequest.prototype.send = function () { calls.push('xhr'); };
global.fetch = async (u, o) => { calls.push((o && o.method) || 'GET'); return { status: 200 }; };
require('../assets/js/beta-readonly.js');
(async () => {
  const fb = 'https://navisuite-f116f-default-rtdb.europe-west1.firebasedatabase.app/public/x.json';
  assert.strictEqual((await fetch(fb)).status, 200);
  for (const m of ['PUT', 'POST', 'PATCH', 'DELETE']) assert.strictEqual((await fetch(fb, { method: m })).status, 403);
  assert.strictEqual((await fetch(fb + '?x-http-method-override=PUT')).status, 403);
  assert.strictEqual((await fetch('https://truenas-scale.tail805e51.ts.net:8443/api/collections/a/records', { method: 'POST' })).status, 403);
  assert.strictEqual((await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=k', { method: 'POST' })).status, 200);
  assert.strictEqual(navigator.sendBeacon(fb, 'x'), false);
  assert.deepStrictEqual(calls, ['GET', 'POST']);
  console.log('ok');
})();

// localStorage: le scritture restano in memoria, il login passa
(() => {
  const store = new Map();
  class FakeStorage {
    getItem(k) { return store.has(k) ? store.get(k) : null; }
    setItem(k, v) { store.set(k, String(v)); }
    removeItem(k) { store.delete(k); }
    clear() { store.clear(); }
    key(i) { return Array.from(store.keys())[i] ?? null; }
    get length() { return store.size; }
  }
  global.Storage = FakeStorage;
  const ls = new FakeStorage();
  Object.defineProperty(global, 'localStorage', { value: ls, configurable: true });
  delete require.cache[require.resolve('../assets/js/beta-readonly.js')];
  delete global.__naviBetaReadOnly;
  require('../assets/js/beta-readonly.js');
  store.set('vecchio', 'a');
  ls.setItem('navidiaria.entries', 'x');
  assert.strictEqual(ls.getItem('navidiaria.entries'), 'x');
  assert.strictEqual(store.has('navidiaria.entries'), false);
  ls.removeItem('vecchio');
  assert.strictEqual(ls.getItem('vecchio'), null);
  assert.strictEqual(store.get('vecchio'), 'a');
  ls.setItem('naviturni_logged_agent', '{"id":1}');
  assert.strictEqual(store.get('naviturni_logged_agent'), '{"id":1}');
  assert.strictEqual(ls.length, 2);
  console.log('ok storage');
})();
