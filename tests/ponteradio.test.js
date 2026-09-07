const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Ponte Radio frontend uses PocketBase and no Firebase module', () => {
  const page = read('ponteradio.html');
  const script = read('assets/js/ponteradio.js');
  assert.match(page, /v2\/assets\/pb\.js/);
  assert.match(page, /assets\/js\/ponteradio\.js/);
  assert.doesNotMatch(page, /firebase/i);
  assert.match(script, /API_ROOT = '\/api\/navisuite-v2\/ponteradio'/);
  assert.match(script, /API_ROOT \+ '\/recipients'/);
  assert.doesNotMatch(script, /firebase/i);
});

test('Ponte Radio keeps conversation history on the device', () => {
  const script = read('assets/js/ponteradio.js');
  const serviceWorker = read('sw.js');
  const hook = read('pocketbase/pb_hooks/ponte_radio.pb.js');
  assert.match(script, /indexedDB\.open\(DB_NAME/);
  assert.match(script, /resumeConversation/);
  assert.match(serviceWorker, /saveIncomingPonteRadio/);
  assert.match(serviceWorker, /indexedDB\.open\('navisuite-ponteradio'/);
  assert.match(hook, /job\.set\("body", "\[contenuto eliminato dopo l'invio\]"\)/);
  assert.match(hook, /job\.set\("meta", \{\}\)/);
});

test('PocketBase worker routes inline the secret check', () => {
  const hook = read('pocketbase/pb_hooks/ponte_radio.pb.js');
  const routes = hook.match(/routerAdd\("(?:GET|POST)", "\/api\/navisuite-v2\/ponteradio\/worker\/(?:jobs|result)"[\s\S]*?\n\}\);/g) || [];
  assert.equal(routes.length, 2);
  for (const route of routes) {
    assert.match(route, /\$os\.getenv\("PONTERADIO_WORKER_SECRET"\)/);
    assert.match(route, /X-PonteRadio-Worker/);
    assert.match(route, /throw new ForbiddenError/);
  }
  assert.doesNotMatch(hook, /function\s+requireWorker/);
});

test('Ponte Radio queue never uses an unsupported status', () => {
  const sources = [
    read('pocketbase/pb_hooks/ponte_radio.pb.js'),
    read('ponteradio-worker/worker.js'),
  ].join('\n');
  assert.doesNotMatch(sources, /no_subscriptions/);
  for (const status of ['pending', 'processing', 'sent', 'partial', 'failed']) {
    assert.match(sources, new RegExp(status));
  }
});

test('shared menu and Home expose Ponte Radio', () => {
  assert.match(read('assets/js/shared-menu.js'), /ponteradio\.html','📻','Ponte Radio'/);
  assert.match(read('index.html'), /href="ponteradio\.html"/);
});
