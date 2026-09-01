import { readFile } from "node:fs/promises";
import process from "node:process";

const execute = process.argv.includes("--execute");
const cutoffArg = process.argv.find(arg => arg.startsWith("--cutoff="));
const cutoff = (cutoffArg?.split("=")[1] || process.env.EFFECTIVE_CUTOFF || "2026-07-01").slice(0, 10);
const exportPath = process.env.FIREBASE_EXPORT_FILE;
if (!exportPath) throw new Error("Imposta FIREBASE_EXPORT_FILE con lo snapshot Firebase congelato.");

const root = JSON.parse(await readFile(exportPath, "utf8"));
const schedule = root?.public?.schedule || {};
const admin = root?.private?.adminUpdates || {};

const clean = value => String(value ?? "").trim();
const values = input => Array.isArray(input)
  ? input.filter(value => value != null)
  : Object.entries(input || {}).map(([key, value]) => ({ __key:key, ...(value || {}) }));
const normalizeName = value => clean(value).toLocaleUpperCase("it").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
const stableAgentUid = value => {
  const normalized = normalizeName(value).replace(/\s+/g, "_");
  return normalized ? `AG_${normalized}` : "";
};
const normalizeShift = value => {
  const raw = clean(value).toUpperCase().replace(/[‐‑–—]/g, "-");
  if (!raw || /^(?:RIP(?:\.|-*)?|RIPOSO|-{2,}|={2,})$/.test(raw)) return "RIP";
  if (/^(?:CONG?\.?|CON;|CONC\.?|C\.)$/.test(raw)) return "CON";
  if (/^(?:LAV\.?|TERRA)$/.test(raw)) return "TERRA";
  if (/^F\.?P\.?-*$/.test(raw)) return "F.P.";
  return raw.replace(/\.{2,}$/g, ".").replace(/-+$/g, "");
};
const pbDate = iso => `${iso} 00:00:00.000Z`;
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
const variationPriority = item => String(item?.tipo || "").toUpperCase() === "MANUALE"
  ? (item?.requestId ? -1 : 1000000)
  : Number.parseInt(String(item?.ods || "").match(/\d+/)?.[0] || "0", 10);
const variationKey = item => `${clean(item?.data)}|${clean(item?.id_agente || item?.agentId || item?.agente)}|${clean(item?.tipo)}|${clean(item?.ods)}`;

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizedAgents() {
  const seen = new Map();
  Object.entries(schedule.residenze || {}).forEach(([residenza, list]) => {
    values(list).forEach(raw => {
      const agent = clone(raw);
      const uid = clean(agent.agent_uid || stableAgentUid(agent.agente || agent.name));
      if (!uid) return;
      agent.agent_uid = uid;
      agent.id = clean(agent.id || agent.agentId || agent.__key);
      agent.agente = clean(agent.agente || agent.name);
      agent.residenza = clean(agent.residence || agent.residenza || residenza);
      agent.turni = { ...(agent.turni || {}) };
      const previous = seen.get(uid);
      if (previous) {
        previous.turni = { ...(previous.turni || {}), ...(agent.turni || {}) };
        if (!previous.id && agent.id) previous.id = agent.id;
        if (!previous.residenza && agent.residenza) previous.residenza = agent.residenza;
      } else {
        seen.set(uid, agent);
      }
    });
  });
  return [...seen.values()];
}

const agents = normalizedAgents();
const byLegacy = new Map(agents.filter(a => a.id).map(a => [String(a.id), a]));
const byUid = new Map(agents.map(a => [String(a.agent_uid), a]));
const byName = new Map(agents.filter(a => a.agente).map(a => [normalizeName(a.agente), a]));

// Some users exist only in admin profiles (baristas/offices/new agents). Add their identity
// for matching legacy variations even if they have no base schedule row.
Object.entries(admin.agentProfiles || {}).forEach(([key, profile]) => {
  const id = clean(profile?.id || key);
  const name = clean(profile?.name);
  if (!id || byLegacy.has(id)) return;
  const agent = {
    id,
    agente:name || id,
    agent_uid:stableAgentUid(name || id),
    residenza:clean(profile?.residence),
    turni:{},
  };
  agents.push(agent);
  byLegacy.set(id, agent);
  if (agent.agent_uid) byUid.set(agent.agent_uid, agent);
  if (name) byName.set(normalizeName(name), agent);
});

const dateState = new Map(values(schedule.date).filter(item => isDate(item?.iso)).map(item => [clean(item.iso), String(item?.stato || "ufficiale").toLowerCase()]));
const cells = new Map();
const sourceStats = { base:0, scheduleImports:0, ods:0, changes:0, manual:0, diariaOverride:0, baristas:0 };
const keyOf = (agentId, date) => `${agentId}|${date}`;

function putBase(agent, date, shift, meta = {}) {
  const agentId = clean(agent?.id);
  if (!agentId || !isDate(date) || date < cutoff) return;
  const normalized = normalizeShift(shift);
  if (!normalized) return;
  const key = keyOf(agentId, date);
  const existing = cells.get(key);
  const next = {
    legacyId:agentId,
    date,
    service:normalized,
    baseService:normalized,
    residence:clean(agent?.residenza),
    origin:"turno_importato",
    state:meta.state === "bozza" ? "bozza" : "ufficiale",
    meta:{ ...meta },
  };
  if (existing?.baseService) next.baseService = normalized;
  cells.set(key, next);
}

// 1. Firebase public base schedule.
agents.forEach(agent => Object.entries(agent.turni || {}).forEach(([date, shift]) => {
  if (!isDate(date)) return;
  putBase(agent, date, shift, { source:"public/schedule/residenze", state:dateState.get(date) === "bozza" ? "bozza" : "ufficiale" });
  sourceStats.base += date >= cutoff ? 1 : 0;
}));

// 2. Apply schedule imports with exactly the same legacy matching used by shared-data.js.
const legacyDesenzanoJune2026 = {
  65:"TIBILETTI F.",66:"BITTURINI D.",67:"GASPARINI F.",68:"BURDO A.",69:"BETTINI M.",70:"GRUMELLI M.",71:"GIACCI GL.",72:"AVANZINI A.",73:"GHIZZI E.",74:"ZENEGAGLIA D.",75:"COSTAMAGNA S.",76:"PROSPERO L.",77:"SCANNAPIECO A.",78:"CEFARIELLO G.",79:"SQUARZONI P.",80:"LA BELLA V.",81:"CAMPOSTRINI E.",82:"CHIMINELLI M.",83:"BARBIERI G.",84:"TANZI E.",85:"VALOTTI G.",86:"MONACO S.",87:"PEROTTI F.",88:"CAMPAGNARO R.",89:"FRANZONI F.",90:"DOLCERA L.",91:"PEDRONI M.",92:"STUMPO D.",93:"BARTOLI F.",94:"LONARDI N.",95:"SCALA L.",96:"BUTTURINI C.",97:"GARDANI R.",98:"BERSANELLI S.",99:"SCARMIGLIATI A.",100:"CACEFFO M.",101:"SPILLER M.",102:"BERGAMINI D.",103:"PAIOLA D."
};
const activeImports = values(admin.scheduleImports).filter(item => item && item.attiva !== false)
  .sort((a,b) => clean(a.importedAt).localeCompare(clean(b.importedAt)));

function matchImportRow(row, batch) {
  const legacyBatch = !row.agent_uid && clean(batch.inizio) === "2026-06-22" && clean(batch.fine) === "2026-07-26";
  const legacyName = legacyBatch ? legacyDesenzanoJune2026[Number(row.id_agente)] : "";
  const wantedUid = clean(row.agent_uid || stableAgentUid(legacyName || row.agente));
  const wantedName = normalizeName(row.agente);
  return (wantedUid && byUid.get(wantedUid)) ||
    (wantedName && byName.get(wantedName)) ||
    byLegacy.get(clean(row.id_agente)) || null;
}

activeImports.forEach(batch => {
  const dates = values(batch.dates).map(item => typeof item === "string" ? item : item?.iso).filter(isDate);
  values(batch.rows).forEach(row => {
    const target = matchImportRow(row, batch);
    if (!target) return;
    dates.forEach((date, index) => {
      if (date < cutoff) return;
      const shift = normalizeShift(row?.turni?.[index]);
      putBase(target, date, shift, {
        source:"admin.scheduleImports",
        batchId:clean(batch.id || batch.__key),
        filename:clean(batch.filename || batch.titolo),
        importedAt:clean(batch.importedAt),
        state:String(batch.tipo || "").toLowerCase().includes("bozza") ? "bozza" : "ufficiale",
      });
      sourceStats.scheduleImports += 1;
    });
  });
});

// Verified historical parser corrections already present in NaviBeta.
const fixedRows = [
  ["BITTURINI D", "2026-09-07", "2026-10-04", {
    "2026-09-07":"D3","2026-09-08":"RIP","2026-09-09":"RIP","2026-09-10":"D3","2026-09-11":"RIP","2026-09-12":"CP1C","2026-09-13":"BIS","2026-09-14":"D4","2026-09-15":"RIP","2026-09-16":"D2","2026-09-17":"D3","2026-09-18":"RIP","2026-09-19":"D2","2026-09-20":"D3","2026-09-21":"RIP","2026-09-22":"D3","2026-09-23":"D2","2026-09-24":"D4","2026-09-25":"RIP","2026-09-26":"D3","2026-09-27":"RIP","2026-09-28":"D3","2026-09-29":"RIP","2026-09-30":"RIP","2026-10-01":"BIS","2026-10-02":"D3","2026-10-03":"S.S.","2026-10-04":"F.P."
  }],
  ["BERTUZZO F", "2026-09-07", "2026-10-04", {
    "2026-09-07":"P2","2026-09-08":"P2","2026-09-09":"RIP","2026-09-10":"P2","2026-09-11":"RIP","2026-09-12":"RIP","2026-09-13":"RIP","2026-09-14":"RIP","2026-09-15":"P1","2026-09-16":"P2","2026-09-17":"CD2C","2026-09-18":"S.S.","2026-09-19":"P1","2026-09-20":"RIP","2026-09-21":"P1","2026-09-22":"P2","2026-09-23":"P1","2026-09-24":"P2","2026-09-25":"RIP","2026-09-26":"RIP","2026-09-27":"RIP","2026-09-28":"RIP","2026-09-29":"P1","2026-09-30":"P1","2026-10-01":"P2","2026-10-02":"RIP","2026-10-03":"P2","2026-10-04":"P1"
  }]
];
fixedRows.forEach(([name, start, end, shifts]) => {
  if (!activeImports.some(batch => clean(batch.inizio) === start && clean(batch.fine) === end)) return;
  const target = byName.get(normalizeName(name));
  if (!target) return;
  Object.entries(shifts).forEach(([date, shift]) => {
    if (date < cutoff) return;
    putBase(target, date, shift, { source:"verified-parser-correction", state:"bozza" });
  });
});

// 3. Barista schedule records are direct effective assignments in the current UI.
const baristaMap = new Map();
[...values(schedule.bariste || schedule.barista), ...values(admin.baristas)].forEach(item => {
  const name = clean(item?.barista || item?.agente || item?.nome);
  const date = clean(item?.data || item?.date);
  const shift = clean(item?.corsa || item?.turno || item?.shift);
  if (!name || !isDate(date) || date < cutoff || !shift) return;
  baristaMap.set(`${date}|${normalizeName(name)}`, item);
});
baristaMap.forEach(item => {
  const name = clean(item?.barista || item?.agente || item?.nome);
  const id = clean(item?.id);
  const target = (id && byLegacy.get(id)) || byName.get(normalizeName(name));
  if (!target) return;
  const date = clean(item?.data || item?.date);
  putBase(target, date, clean(item?.corsa || item?.turno || item?.shift), { source:"bariste", state:"ufficiale" });
  sourceStats.baristas += 1;
});

// Freeze base service after all official/bozza imports and before operative variations.
cells.forEach(cell => { cell.baseService = cell.service; });

// 4. Apply ODS + approved changes + manual variations in the same priority used by aggiornamenti.html.
const variationMap = new Map();
[...values(schedule.variazioni_ods), ...values(admin.odsVariations), ...values(admin.manualVariations)]
  .forEach(item => variationMap.set(variationKey(item), item));
const variations = [...variationMap.values()].filter(item => item && item.attiva !== false && isDate(item.data))
  .sort((a,b) => variationPriority(a) - variationPriority(b));

function matchVariation(item) {
  const id = clean(item?.id_agente || item?.agentId);
  const name = normalizeName(item?.agente || item?.agentName);
  return (id && byLegacy.get(id)) || (name && byName.get(name)) || null;
}

variations.forEach(item => {
  const target = matchVariation(item);
  const date = clean(item.data);
  if (!target || date < cutoff) return;
  const next = normalizeShift(item.turno_nuovo);
  if (!next) return;
  const key = keyOf(target.id, date);
  const cell = cells.get(key) || {
    legacyId:target.id, date, service:"RIP", baseService:"RIP", residence:clean(target.residenza),
    origin:"turno_importato", state:"ufficiale", meta:{ source:"implicit-rip" }
  };
  cell.service = next;
  const manual = String(item.tipo || "").toUpperCase() === "MANUALE";
  if (manual && item.requestId) {
    cell.origin = "cambio_turno";
    sourceStats.changes += 1;
  } else if (manual) {
    cell.origin = "manuale";
    sourceStats.manual += 1;
  } else {
    cell.origin = "ods";
    sourceStats.ods += 1;
  }
  cell.meta = {
    ...(cell.meta || {}),
    effectiveVariation:{
      data:date,
      ods:clean(item.ods),
      tipo:clean(item.tipo),
      requestId:clean(item.requestId),
      from:clean(item.turno_originale),
      to:next,
      note:clean(item.note),
    }
  };
  cells.set(key, cell);
});

// 5. A service manually changed from the daily editor has the highest current precedence.
Object.entries(admin.diaria || {}).forEach(([archiveKey, archive]) => {
  const agentId = clean(archive?.agentId || archiveKey);
  const target = byLegacy.get(agentId);
  if (!target) return;
  values(archive?.entries).forEach(entry => {
    const date = clean(entry?.date);
    if (!isDate(date) || date < cutoff || entry?.manualOverride !== true || entry?.manualModified !== true || !clean(entry?.shift)) return;
    const key = keyOf(agentId, date);
    const cell = cells.get(key) || {
      legacyId:agentId, date, service:"RIP", baseService:"RIP", residence:clean(target.residenza),
      origin:"turno_importato", state:"ufficiale", meta:{ source:"implicit-rip" }
    };
    cell.service = normalizeShift(entry.shift);
    cell.origin = "manuale";
    cell.meta = {
      ...(cell.meta || {}),
      diariaOverride:{ from:clean(entry.manualFrom), to:cell.service, updatedAt:clean(entry.updatedAt || entry.modifiedAt) }
    };
    cells.set(key, cell);
    sourceStats.diariaOverride += 1;
  });
});

class PocketBaseAdmin {
  constructor(baseUrl) { this.baseUrl = String(baseUrl || "").replace(/\/$/, ""); this.token = ""; }
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
    const auth = await this.request("/api/collections/_superusers/auth-with-password", {
      method:"POST", body:JSON.stringify({ identity, password }),
    });
    this.token = auth.token;
  }
  async listAll(collection, fields = "") {
    const out = [];
    for (let page = 1;; page += 1) {
      const params = new URLSearchParams({ page:String(page), perPage:"500" });
      if (fields) params.set("fields", fields);
      const result = await this.request(`/api/collections/${collection}/records?${params}`);
      out.push(...(result.items || []));
      if (page >= Number(result.totalPages || 1)) break;
    }
    return out;
  }
  async create(collection, payload) {
    return this.request(`/api/collections/${collection}/records`, { method:"POST", body:JSON.stringify(payload) });
  }
  async update(collection, id, payload) {
    return this.request(`/api/collections/${collection}/records/${id}`, { method:"PATCH", body:JSON.stringify(payload) });
  }
}

const pb = new PocketBaseAdmin(process.env.POCKETBASE_URL || "http://127.0.0.1:8090");
await pb.login();
const [pbAgents, existingEffective] = await Promise.all([
  pb.listAll("agenti", "id,legacy_id,nome_completo,residenza"),
  pb.listAll("turni_effective", "id,agente,data,servizio,servizio_base,residenza,origine_effective,stato,versione,effective_meta"),
]);
const pbAgentByLegacy = new Map(pbAgents.map(item => [clean(item.legacy_id), item]));
const pbLegacyById = new Map(pbAgents.map(item => [clean(item.id), clean(item.legacy_id)]));
const existingByKey = new Map(existingEffective.map(item => [keyOf(pbLegacyById.get(clean(item.agente)), clean(item.data).slice(0,10)), item]));

const missingAgents = new Set();
const expected = [...cells.values()].filter(cell => cell.date >= cutoff).sort((a,b) => a.date.localeCompare(b.date) || a.legacyId.localeCompare(b.legacyId));
const payloads = [];
for (const cell of expected) {
  const pbAgent = pbAgentByLegacy.get(cell.legacyId);
  if (!pbAgent) { missingAgents.add(cell.legacyId); continue; }
  payloads.push({
    key:keyOf(cell.legacyId, cell.date),
    payload:{
      agente:pbAgent.id,
      data:pbDate(cell.date),
      servizio:cell.service,
      codice_turno:cell.service,
      residenza:clean(cell.residence || pbAgent.residenza),
      servizio_base:cell.baseService,
      origine_effective:cell.origin,
      stato:cell.state === "bozza" ? "bozza" : "ufficiale",
      versione:1,
      override_manuale:cell.origin === "manuale",
      effective_meta:{ migratedFrom:"firebase-frozen-2026-09-01", cutoff, ...cell.meta },
    }
  });
}

const comparable = record => JSON.stringify({
  servizio:clean(record.servizio),
  servizio_base:clean(record.servizio_base),
  residenza:clean(record.residenza),
  origine_effective:clean(record.origine_effective),
  stato:clean(record.stato),
});
let creates = 0, updates = 0, unchanged = 0;
const sampleChanges = [];
for (const item of payloads) {
  const existing = existingByKey.get(item.key);
  if (!existing) {
    creates += 1;
    if (sampleChanges.length < 20) sampleChanges.push({ action:"create", key:item.key, to:item.payload.servizio, origin:item.payload.origine_effective });
    if (execute) await pb.create("turni_effective", item.payload);
    continue;
  }
  if (comparable(existing) === comparable(item.payload)) {
    unchanged += 1;
    continue;
  }
  updates += 1;
  if (sampleChanges.length < 20) sampleChanges.push({ action:"update", key:item.key, from:existing.servizio, to:item.payload.servizio, origin:item.payload.origine_effective });
  if (execute) {
    await pb.update("turni_effective", existing.id, {
      ...item.payload,
      versione:Math.max(1, Number(existing.versione || 1) + 1),
    });
  }
}

const expectedKeys = new Set(payloads.map(item => item.key));
const extrasNotDeleted = [...existingByKey.keys()].filter(key => key && !expectedKeys.has(key));
const origins = expected.reduce((acc, item) => { acc[item.origin] = (acc[item.origin] || 0) + 1; return acc; }, {});
const range = expected.length ? { min:expected[0].date, max:expected.at(-1).date } : { min:null, max:null };

console.log(JSON.stringify({
  mode:execute ? "execute" : "dry-run",
  cutoff,
  frozenSnapshot:exportPath,
  range,
  expectedEffective:expected.length,
  resolvableEffective:payloads.length,
  existingEffective:existingEffective.length,
  creates,
  updates,
  unchanged,
  extrasNotDeleted:extrasNotDeleted.length,
  missingAgents:[...missingAgents],
  byOrigin:origins,
  appliedSources:sourceStats,
  sampleChanges,
}, null, 2));

if (!execute) console.log("\nDry-run: turni_effective non modificato. Esegui con --execute solo dopo aver verificato il riepilogo.");
