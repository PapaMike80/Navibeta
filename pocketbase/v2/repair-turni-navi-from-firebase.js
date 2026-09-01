#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const arg = name => args.find(v => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || '';
const sourceFile = arg('file') || process.env.FIREBASE_EXPORT_FILE || '/work/firebase-export.json';
const sampleDate = arg('date') || '2026-09-01';
const sampleService = String(arg('service') || 'D1').trim().toUpperCase();
const PB = String(process.env.POCKETBASE_URL || 'http://127.0.0.1:8095').replace(/\/$/, '');
const EMAIL = process.env.POCKETBASE_SUPERUSER_EMAIL || '';
const PASS = process.env.POCKETBASE_SUPERUSER_PASSWORD || '';

const clean = value => String(value ?? '').trim();
const values = input => Array.isArray(input)
  ? input.filter(Boolean)
  : Object.entries(input || {}).map(([key,value]) => ({__key:key,...(value || {})}));
const slug = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'') || 'VUOTO';
const stableId = (...parts) => parts.map(slug).join(':').slice(0,180);
const isoDate = value => /^\d{4}-\d{2}-\d{2}/.test(clean(value)) ? `${clean(value).slice(0,10)} 00:00:00.000Z` : '';
const raw = value => clean(value).toUpperCase().replace(/\s+/g,'').replace(/\*/g,'').replace(/--/g,'');
const cleanService = value => {
  const v = raw(value);
  const match = v.match(/(?:^C)?([DRMP]\d|BIS|T1|T2|M1|CAR|CAP|SR1)(?:C|$)/i);
  return match?.[1] ? match[1].toUpperCase() : v;
};
const isActive = item => item?.attiva !== false && !/^(?:no|false|0)$/i.test(clean(item?.attiva));
const yes = value => value === true || value === 1 || /^(?:si|sì|true|1|yes)$/i.test(clean(value));
const rowKey = item => `${clean(item?.data)}|${clean(item?.corsa)}|${clean(item?.nave).toLocaleUpperCase('it')}`;
const shipNameKey = value => clean(value).toLocaleUpperCase('it');
const usableRow = item => clean(item?.nave) && isoDate(item?.data) && clean(item?.corsa) && isActive(item);

class PocketBaseAdmin {
  constructor() { this.token = ''; }
  async request(path,{method='GET',body}={}) {
    const headers = {Accept:'application/json'};
    if (this.token) headers.Authorization = this.token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(PB + path,{method,headers,body:body === undefined ? undefined : JSON.stringify(body)});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${payload?.message || ''}`);
    return payload;
  }
  async login() {
    if (!EMAIL || !PASS) throw new Error('Imposta POCKETBASE_SUPERUSER_EMAIL e POCKETBASE_SUPERUSER_PASSWORD.');
    const auth = await this.request('/api/collections/_superusers/auth-with-password',{method:'POST',body:{identity:EMAIL,password:PASS}});
    this.token = auth.token;
  }
  async listAll(collection,fields='') {
    const out = [];
    for (let page=1;;page++) {
      const params = new URLSearchParams({page:String(page),perPage:'500'});
      if (fields) params.set('fields',fields);
      const result = await this.request(`/api/collections/${collection}/records?${params}`);
      out.push(...(result.items || []));
      if (page >= Number(result.totalPages || 1)) break;
    }
    return out;
  }
  create(collection,body) { return this.request(`/api/collections/${collection}/records`,{method:'POST',body}); }
  update(collection,id,body) { return this.request(`/api/collections/${collection}/records/${id}`,{method:'PATCH',body}); }
}

function same(a,b,fields) {
  return fields.every(field => {
    const av = a?.[field];
    const bv = b?.[field];
    if (typeof bv === 'boolean') return Boolean(av) === bv;
    if (field === 'legacy_payload') return JSON.stringify(av || {}) === JSON.stringify(bv || {});
    return String(av ?? '') === String(bv ?? '');
  });
}

const root = JSON.parse(await readFile(sourceFile,'utf8'));
const schedule = root?.public?.schedule || {};
const admin = root?.private?.adminUpdates || {};
const publicRows = values(schedule.turni_navi);
const adminRows = values(admin.turniNavi);

const pb = new PocketBaseAdmin();
await pb.login();
const [existingShips,existingTurns] = await Promise.all([
  pb.listAll('navi','id,legacy_id,nome,residenza,attiva'),
  pb.listAll('turni_navi','id,legacy_id,nave,data,servizio,ormeggio_serale,rifornimento_mattina,legacy_payload')
]);

// Fonte di verità per i nomi nave:
// - nomi già presenti nella collection navi;
// - nomi presenti nel roster pubblico turni_navi, che nel runtime legacy era la
//   base approvata. Gli adminUpdates possono contenere righe sporche/personale,
//   quindi possono sovrascrivere o aggiungere turni SOLO per navi già note.
const trustedShipNames = new Set([
  ...existingShips.map(row => shipNameKey(row.nome)),
  ...publicRows.filter(usableRow).map(row => shipNameKey(row.nave))
].filter(Boolean));

const trustedPublicRows = publicRows.filter(usableRow).filter(item => trustedShipNames.has(shipNameKey(item.nave)));
const trustedAdminRows = adminRows.filter(usableRow).filter(item => trustedShipNames.has(shipNameKey(item.nave)));
const rejectedAdminRows = adminRows.filter(usableRow).filter(item => !trustedShipNames.has(shipNameKey(item.nave)));

// Replica replaceByKey() del runtime legacy: pubblico come base, admin dopo e
// quindi prevalente sulla stessa data+corsa+nave.
const mergedMap = new Map();
trustedPublicRows.forEach(item => mergedMap.set(rowKey(item),item));
trustedAdminRows.forEach(item => mergedMap.set(rowKey(item),item));
const merged = [...mergedMap.values()];

const sourceShips = [...new Map(merged.map(item => [shipNameKey(item.nave),item])).values()];
const shipByLegacy = new Map(existingShips.map(row => [String(row.legacy_id),row]));
const turnByLegacy = new Map(existingTurns.map(row => [String(row.legacy_id),row]));
const shipPlan = [];
const turnPlan = [];

for (const item of sourceShips) {
  const legacy_id = stableId('nave',item.nave);
  const desired = {legacy_id,nome:clean(item.nave),residenza:clean(item.residenza),attiva:true,note:''};
  const existing = shipByLegacy.get(legacy_id);
  const action = !existing ? 'create' : same(existing,desired,['legacy_id','nome','residenza','attiva']) ? 'unchanged' : 'update';
  shipPlan.push({action,existing,desired});
}

if (execute) {
  for (const item of shipPlan) {
    if (item.action === 'create') item.existing = await pb.create('navi',item.desired);
    else if (item.action === 'update') item.existing = await pb.update('navi',item.existing.id,item.desired);
    if (item.existing) shipByLegacy.set(item.desired.legacy_id,item.existing);
  }
}

for (const item of merged) {
  const shipLegacy = stableId('nave',item.nave);
  const ship = shipByLegacy.get(shipLegacy) || shipPlan.find(p => p.desired.legacy_id === shipLegacy)?.existing;
  const legacy_id = stableId('turno_nave',item.nave,item.data,item.corsa);
  const desired = {
    legacy_id,
    nave:ship?.id || '',
    data:isoDate(item.data),
    servizio:clean(item.corsa),
    ormeggio_serale:clean(item.ormeggio_serale),
    rifornimento_mattina:yes(item.rifornimento_mattina),
    note:clean(item.note),
    legacy_payload:item
  };
  const existing = turnByLegacy.get(legacy_id);
  const action = !existing ? 'create' : same(existing,desired,['legacy_id','nave','data','servizio','ormeggio_serale','rifornimento_mattina','legacy_payload']) ? 'unchanged' : 'update';
  turnPlan.push({action,existing,desired,source:item});
}

const count = plan => Object.fromEntries(['create','update','unchanged'].map(action => [action,plan.filter(x => x.action === action).length]));
const sample = turnPlan.filter(item => clean(item.source.data).slice(0,10) === sampleDate && cleanService(item.source.corsa) === sampleService).map(item => ({
  action:item.action,
  data:clean(item.source.data).slice(0,10),
  corsa:item.source.corsa,
  nave:item.source.nave,
  ormeggio_serale:item.source.ormeggio_serale || '',
  rifornimento_mattina:yes(item.source.rifornimento_mattina),
  relation_nave:item.desired.nave || '(non risolta)'
}));

console.log(JSON.stringify({
  mode: execute ? 'execute' : 'dry-run',
  sourceFile,
  source:{
    public:publicRows.length,
    admin:adminRows.length,
    publicTrusted:trustedPublicRows.length,
    adminTrusted:trustedAdminRows.length,
    adminRejected:rejectedAdminRows.length,
    mergedActive:merged.length,
    trustedShips:trustedShipNames.size,
    mergedShips:sourceShips.length
  },
  pocketbaseBefore:{navi:existingShips.length,turni_navi:existingTurns.length},
  plan:{navi:count(shipPlan),turni_navi:count(turnPlan)},
  rejectedAdminSample:rejectedAdminRows.slice(0,10).map(item => ({data:item.data,corsa:item.corsa,nave:item.nave})),
  sample:{date:sampleDate,service:sampleService,rows:sample}
},null,2));

if (!execute) process.exit(0);

for (const item of turnPlan) {
  if (!item.desired.nave) throw new Error(`Nave non risolta per ${item.desired.legacy_id}`);
  if (item.action === 'create') await pb.create('turni_navi',item.desired);
  else if (item.action === 'update') await pb.update('turni_navi',item.existing.id,item.desired);
}

console.log(JSON.stringify({
  ok:true,
  written:{
    navi:shipPlan.filter(x => x.action !== 'unchanged').length,
    turni_navi:turnPlan.filter(x => x.action !== 'unchanged').length
  }
},null,2));
