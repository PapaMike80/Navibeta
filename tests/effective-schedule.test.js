// Regression guard for the only NaviBeta data overlay kept above NaviSuite production.
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const sourceCode = fs.readFileSync('assets/js/effective-schedule.js', 'utf8');
const storage = new Map();
const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); }
};

const window = {
  NaviSharedData: {
    load: async () => ({}),
    loadBase: async () => ({})
  },
  NaviAdminFirebase: {
    saveAdminUpdates: async payload => payload
  },
  dispatchEvent() {}
};

const context = {
  window,
  localStorage,
  console,
  fetch: async () => { throw new Error('network not expected in materialize test'); },
  AbortController,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options?.detail; }
};
vm.createContext(context);
vm.runInContext(sourceCode, context);

const base = {
  date: [
    { iso:'2026-09-07', stato:'bozza' },
    { iso:'2026-09-08', stato:'bozza' }
  ],
  residenze: {
    DESENZANO: [{
      id:'91',
      agent_uid:'AG_PEDRONI_M',
      agente:'PEDRONI M.',
      qualifica:'marinaio',
      turni:{ '2026-09-07':'D1', '2026-09-08':'RIP' },
      turni_settimanali:{ legacy:['D1','RIP'] }
    }]
  },
  turni_navi:[{ data:'2026-09-07', corsa:'D4', nave:'Baldo' }],
  variazioni_ods:[]
};

const first = window.NaviEffectiveSchedule.materialize(base, null, 'test-base');
assert.equal(first.meta.version, 1);
assert.equal(first.data.effective_schedule, true);
assert.equal(first.data.residenze.DESENZANO[0].turni['2026-09-07'], 'D1');
assert.equal(first.data.residenze.DESENZANO[0].turni_settimanali, undefined);

const changed = JSON.parse(JSON.stringify(base));
changed.variazioni_ods = [
  { data:'2026-09-07', id_agente:'91', turno_nuovo:'D2', tipo:'ODS', ods:'35' },
  { data:'2026-09-07', id_agente:'91', turno_nuovo:'D3', tipo:'ODS', ods:'36' },
  { data:'2026-09-07', id_agente:'91', turno_nuovo:'D4', tipo:'MANUALE', note:'override' }
];
const second = window.NaviEffectiveSchedule.materialize(changed, first, 'test-change');
assert.equal(second.meta.version, 2);
assert.equal(second.data.residenze.DESENZANO[0].turni['2026-09-07'], 'D4');
assert.equal(second.meta.changeCount, 1);
assert.deepEqual(
  JSON.parse(JSON.stringify(second.meta.lastChangeSet[0])),
  { agentId:'91', agentName:'PEDRONI M.', date:'2026-09-07', from:'D1', to:'D4', origin:'manuale' }
);
const effective = second.data.effective_meta['91|2026-09-07'];
assert.equal(effective.baseService, 'D1');
assert.equal(effective.service, 'D4');
assert.equal(effective.origin, 'manuale');
assert.equal(effective.source.ods, '');

const odsOnly = JSON.parse(JSON.stringify(base));
odsOnly.variazioni_ods = [
  { data:'2026-09-07', id_agente:'91', turno_nuovo:'D2', tipo:'ODS', ods:'35' },
  { data:'2026-09-07', id_agente:'91', turno_nuovo:'D3', tipo:'ODS', ods:'36' }
];
const third = window.NaviEffectiveSchedule.materialize(odsOnly, first, 'test-ods');
assert.equal(third.data.residenze.DESENZANO[0].turni['2026-09-07'], 'D3');
assert.equal(third.data.effective_meta['91|2026-09-07'].origin, 'ods');

console.log('Effective schedule checks passed');
