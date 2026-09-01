import { readFile } from "node:fs/promises";
import process from "node:process";

const execute = process.argv.includes("--execute");
const exportPath = process.env.FIREBASE_EXPORT_FILE;
if (!exportPath) throw new Error("Imposta FIREBASE_EXPORT_FILE con l'export JSON Firebase offline.");

const clean = value => String(value ?? "").trim();
const slug = value => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "VUOTO";
const stableId = (...parts) => parts.map(slug).join(":").slice(0, 180);
const normalizeAgentName = value => clean(value).toLocaleUpperCase("it").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
const stableAgentUid = value => {
  const normalized = normalizeAgentName(value).replace(/\s+/g, "_");
  return normalized ? `AG_${normalized}` : "";
};
const normalizedImportedShift = value => {
  const raw = clean(value).toUpperCase().replace(/[‐‑–—]/g, "-");
  if (!raw || /^(?:RIP(?:\.|-*)?|RIPOSO|-{2,}|={2,})$/.test(raw)) return "RIP";
  if (/^(?:CONG?\.?|CON;|CONC\.?|C\.)$/.test(raw)) return "CON";
  if (/^(?:LAV\.?|TERRA)$/.test(raw)) return "TERRA";
  if (/^F\.?P\.?-*$/.test(raw)) return "F.P.";
  return raw.replace(/\.{2,}$/g, ".").replace(/-+$/g, "");
};
const clone = value => JSON.parse(JSON.stringify(value ?? {}));

function normalizeScheduleAgents(data) {
  const seen = new Map();
  Object.entries(data?.residenze || {}).forEach(([residence, list]) => {
    const unique = [];
    (Array.isArray(list) ? list : Object.values(list || {})).forEach(agent => {
      if (!agent || typeof agent !== "object") return;
      const uid = clean(agent.agent_uid || stableAgentUid(agent.agente || agent.name));
      if (!uid) return;
      agent.agent_uid = uid;
      const existing = seen.get(uid);
      if (existing) {
        existing.turni = { ...(existing.turni || {}), ...(agent.turni || {}) };
        existing.turni_settimanali = { ...(existing.turni_settimanali || {}), ...(agent.turni_settimanali || {}) };
        return;
      }
      seen.set(uid, agent);
      unique.push(agent);
    });
    data.residenze[residence] = unique;
  });
  return data;
}

function normalizeBaseShifts(data) {
  Object.values(data?.residenze || {}).forEach(list => (list || []).forEach(agent => {
    agent.turni ||= {};
    Object.keys(agent.turni).forEach(iso => { agent.turni[iso] = normalizedImportedShift(agent.turni[iso]); });
  }));
  return data;
}

function applyScheduleImports(data, imports) {
  normalizeScheduleAgents(data);
  normalizeBaseShifts(data);
  const active = (Array.isArray(imports) ? imports : Object.values(imports || {}))
    .filter(item => item && item.attiva !== false)
    .sort((a, b) => clean(a.importedAt).localeCompare(clean(b.importedAt)));
  if (!active.length) return data;

  const agents = Object.values(data.residenze || {}).flat();
  const legacyDesenzanoJune2026 = {
    65:"TIBILETTI F.",66:"BITTURINI D.",67:"GASPARINI F.",68:"BURDO A.",69:"BETTINI M.",70:"GRUMELLI M.",71:"GIACCI GL.",72:"AVANZINI A.",73:"GHIZZI E.",74:"ZENEGAGLIA D.",75:"COSTAMAGNA S.",76:"PROSPERO L.",77:"SCANNAPIECO A.",78:"CEFARIELLO G.",79:"SQUARZONI P.",80:"LA BELLA V.",81:"CAMPOSTRINI E.",82:"CHIMINELLI M.",83:"BARBIERI G.",84:"TANZI E.",85:"VALOTTI G.",86:"MONACO S.",87:"PEROTTI F.",88:"CAMPAGNARO R.",89:"FRANZONI F.",90:"DOLCERA L.",91:"PEDRONI M.",92:"STUMPO D.",93:"BARTOLI F.",94:"LONARDI N.",95:"SCALA L.",96:"BUTTURINI C.",97:"GARDANI R.",98:"BERSANELLI S.",99:"SCARMIGLIATI A.",100:"CACEFFO M.",101:"SPILLER M.",102:"BERGAMINI D.",103:"PAIOLA D."
  };

  for (const batch of active) {
    const dates = Array.isArray(batch.dates) ? batch.dates.map(clean) : [];
    const rows = Array.isArray(batch.rows) ? batch.rows : Object.values(batch.rows || {});
    for (const row of rows) {
      const legacyBatch = !row?.agent_uid && clean(batch.inizio) === "2026-06-22" && clean(batch.fine) === "2026-07-26";
      const legacyName = legacyBatch ? legacyDesenzanoJune2026[Number(row?.id_agente)] : "";
      const wantedUid = clean(row?.agent_uid || stableAgentUid(legacyName || row?.agente));
      const wantedName = normalizeAgentName(row?.agente);
      const target = agents.find(agent => clean(agent.agent_uid || stableAgentUid(agent.agente)) === wantedUid)
        || (wantedName ? agents.find(agent => normalizeAgentName(agent.agente) === wantedName) : null)
        || agents.find(agent => clean(agent.id) === clean(row?.id_agente));
      if (!target) continue;
      target.turni ||= {};
      dates.forEach((iso, index) => { if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) target.turni[iso] = normalizedImportedShift(row?.turni?.[index]); });
    }
  }

  const bitturiniBozza = {
    "2026-09-07":"D3","2026-09-08":"RIP","2026-09-09":"RIP","2026-09-10":"D3","2026-09-11":"RIP","2026-09-12":"CP1C","2026-09-13":"BIS","2026-09-14":"D4","2026-09-15":"RIP","2026-09-16":"D2","2026-09-17":"D3","2026-09-18":"RIP","2026-09-19":"D2","2026-09-20":"D3","2026-09-21":"RIP","2026-09-22":"D3","2026-09-23":"D2","2026-09-24":"D4","2026-09-25":"RIP","2026-09-26":"D3","2026-09-27":"RIP","2026-09-28":"D3","2026-09-29":"RIP","2026-09-30":"RIP","2026-10-01":"BIS","2026-10-02":"D3","2026-10-03":"S.S.","2026-10-04":"F.P."
  };
  const bertuzzoBozza = {
    "2026-09-07":"P2","2026-09-08":"P2","2026-09-09":"RIP","2026-09-10":"P2","2026-09-11":"RIP","2026-09-12":"RIP","2026-09-13":"RIP","2026-09-14":"RIP","2026-09-15":"P1","2026-09-16":"P2","2026-09-17":"CD2C","2026-09-18":"S.S.","2026-09-19":"P1","2026-09-20":"RIP","2026-09-21":"P1","2026-09-22":"P2","2026-09-23":"P1","2026-09-24":"P2","2026-09-25":"RIP","2026-09-26":"RIP","2026-09-27":"RIP","2026-09-28":"RIP","2026-09-29":"P1","2026-09-30":"P1","2026-10-01":"P2","2026-10-02":"RIP","2026-10-03":"P2","2026-10-04":"P1"
  };
  if (active.some(batch => clean(batch.inizio) === "2026-09-07" && clean(batch.fine) === "2026-10-04")) {
    const bitturini = agents.find(agent => normalizeAgentName(agent?.agente) === "BITTURINI D");
    const bertuzzo = agents.find(agent => normalizeAgentName(agent?.agente) === "BERTUZZO F");
    if (bitturini) bitturini.turni = { ...(bitturini.turni || {}), ...bitturiniBozza };
    if (bertuzzo) bertuzzo.turni = { ...(bertuzzo.turni || {}), ...bertuzzoBozza };
  }
  return data;
}

function effectiveTurnRecords(source) {
  const schedule = applyScheduleImports(clone(source?.public?.schedule || {}), source?.private?.adminUpdates?.scheduleImports || []);
  const out = [];
  Object.entries(schedule.residenze || {}).forEach(([residenza, agents]) => (agents || []).forEach(agent => {
    const agentId = clean(agent.id || agent.agentId || agent.__key);
    if (!agentId) return;
    Object.entries(agent.turni || {}).forEach(([date, shift]) => {
      const iso = clean(date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      const service = normalizedImportedShift(shift);
      out.push({
        agentLegacyId:agentId,
        legacy_id:stableId("turno", agentId, iso),
        data:`${iso} 00:00:00.000Z`,
        servizio:service,
        codice_turno:service,
        residenza:clean(residenza),
        origine:"calendario",
        stato:"pubblicato",
        variazione:false,
      });
    });
  }));
  return [...new Map(out.map(record => [record.legacy_id, record])).values()];
}

class PocketBaseAdmin {
  constructor(baseUrl) { this.baseUrl = clean(baseUrl).replace(/\/$/, ""); this.token = ""; }
  async request(path, options = {}) {
    const headers = { Accept:"application/json", Authorization:this.token, ...(options.headers || {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(this.baseUrl + path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body.message || ""} ${JSON.stringify(body.data || {})}`);
    return body;
  }
  async login() {
    const identity = process.env.POCKETBASE_SUPERUSER_EMAIL;
    const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;
    if (!identity || !password) throw new Error("Credenziali PocketBase Superuser mancanti.");
    const auth = await this.request("/api/collections/_superusers/auth-with-password", { method:"POST", body:JSON.stringify({ identity, password }) });
    this.token = auth.token;
  }
  async listAll(collection, fields = "") {
    const all = [];
    for (let page = 1;; page++) {
      const params = new URLSearchParams({ page:String(page), perPage:"500" });
      if (fields) params.set("fields", fields);
      const result = await this.request(`/api/collections/${collection}/records?${params}`);
      all.push(...(result.items || []));
      if (page >= Number(result.totalPages || page)) break;
    }
    return all;
  }
  async createTurn(record, agentPbId) {
    const payload = { ...record, agente:agentPbId, legacy_payload:{ source:"effective_schedule", value:record.servizio } };
    delete payload.agentLegacyId;
    return this.request("/api/collections/turni/records", { method:"POST", body:JSON.stringify(payload) });
  }
  async updateTurn(id, record, agentPbId) {
    const payload = {
      agente:agentPbId,
      data:record.data,
      servizio:record.servizio,
      codice_turno:record.codice_turno,
      residenza:record.residenza,
      origine:record.origine,
      stato:record.stato,
      variazione:false,
    };
    return this.request(`/api/collections/turni/records/${id}`, { method:"PATCH", body:JSON.stringify(payload) });
  }
}

const source = JSON.parse(await readFile(exportPath, "utf8"));
const expected = effectiveTurnRecords(source);
const pb = new PocketBaseAdmin(process.env.POCKETBASE_URL || "http://127.0.0.1:8090");
await pb.login();

const [agents, existing] = await Promise.all([
  pb.listAll("agenti", "id,legacy_id,nome_completo"),
  pb.listAll("turni", "id,legacy_id,agente,data,servizio,codice_turno,residenza,origine,stato"),
]);
const agentByLegacy = new Map(agents.map(agent => [clean(agent.legacy_id), agent]));
const existingByLegacy = new Map(existing.map(turn => [clean(turn.legacy_id), turn]));
const expectedKeys = new Set(expected.map(turn => turn.legacy_id));
const missingAgents = new Set();
const creates = [];
const updates = [];
let unchanged = 0;

const same = (a, b) => clean(a) === clean(b);
for (const record of expected) {
  const agent = agentByLegacy.get(record.agentLegacyId);
  if (!agent) { missingAgents.add(record.agentLegacyId); continue; }
  const current = existingByLegacy.get(record.legacy_id);
  if (!current) { creates.push({ record, agentPbId:agent.id }); continue; }
  const currentDate = clean(current.data).slice(0, 10);
  const expectedDate = clean(record.data).slice(0, 10);
  const changed = !same(current.agente, agent.id)
    || currentDate !== expectedDate
    || !same(current.servizio, record.servizio)
    || !same(current.codice_turno, record.codice_turno)
    || !same(current.residenza, record.residenza)
    || !same(current.origine, record.origine)
    || !same(current.stato, record.stato);
  if (changed) updates.push({ id:current.id, record, agentPbId:agent.id, before:{ servizio:current.servizio, data:currentDate, agente:current.agente } });
  else unchanged++;
}

const extras = existing.filter(turn => clean(turn.legacy_id).startsWith("TURNO:") && !expectedKeys.has(clean(turn.legacy_id)));
const cutoff = "2026-07-01";
const summary = {
  mode:execute ? "execute" : "dry-run",
  expected:expected.length,
  existing:existing.length,
  unchanged,
  updates:updates.length,
  creates:creates.length,
  extrasNotDeleted:extras.length,
  missingAgents:[...missingAgents].sort(),
  fromCutoff:{
    expected:expected.filter(r => r.data.slice(0,10) >= cutoff).length,
    updates:updates.filter(x => x.record.data.slice(0,10) >= cutoff).length,
    creates:creates.filter(x => x.record.data.slice(0,10) >= cutoff).length,
    extrasNotDeleted:extras.filter(x => clean(x.data).slice(0,10) >= cutoff).length,
  },
  sampleUpdates:updates.slice(0,20).map(x => ({ legacy_id:x.record.legacy_id, before:x.before.servizio, after:x.record.servizio })),
  sampleCreates:creates.slice(0,20).map(x => ({ legacy_id:x.record.legacy_id, servizio:x.record.servizio })),
};
console.log(JSON.stringify(summary, null, 2));

if (!execute) {
  console.log("\nDry-run: nessun turno modificato. Lo script non cancella mai record PocketBase.");
  process.exit(0);
}
if (missingAgents.size) throw new Error(`Riparazione interrotta: agenti PocketBase mancanti: ${[...missingAgents].join(", ")}`);

let done = 0;
for (const item of updates) {
  await pb.updateTurn(item.id, item.record, item.agentPbId);
  done++;
  if (done % 500 === 0) console.error(`[repair-turni] ${done}/${updates.length + creates.length}`);
}
for (const item of creates) {
  await pb.createTurn(item.record, item.agentPbId);
  done++;
  if (done % 500 === 0) console.error(`[repair-turni] ${done}/${updates.length + creates.length}`);
}
console.log(JSON.stringify({ ok:true, updated:updates.length, created:creates.length, deleted:0 }, null, 2));
