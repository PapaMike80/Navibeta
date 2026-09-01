import process from "node:process";

const cutoffArg = process.argv.find(arg => arg.startsWith("--cutoff="));
const cutoff = String(cutoffArg?.split("=")[1] || "2026-07-01").slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error("Cutoff non valido: usa --cutoff=YYYY-MM-DD");

class PocketBaseAdmin {
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.token = "";
  }

  async request(path, options = {}) {
    const headers = { Authorization:this.token, ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(this.baseUrl + path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = body?.data ? ` ${JSON.stringify(body.data)}` : "";
      throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body.message || ""}${detail}`);
    }
    return body;
  }

  async login() {
    const identity = process.env.POCKETBASE_SUPERUSER_EMAIL;
    const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;
    if (!identity || !password) throw new Error("Credenziali PocketBase Superuser mancanti.");
    const auth = await this.request("/api/collections/_superusers/auth-with-password", {
      method:"POST",
      body:JSON.stringify({ identity, password }),
    });
    this.token = auth.token;
  }

  async collection(name) {
    return this.request(`/api/collections/${encodeURIComponent(name)}`);
  }

  async count(collection, filter = "") {
    const params = new URLSearchParams({ page:"1", perPage:"1", fields:"id" });
    if (filter) params.set("filter", filter);
    const result = await this.request(`/api/collections/${collection}/records?${params}`);
    return Number(result.totalItems || 0);
  }

  async listAll(collection, fields) {
    const out = [];
    const perPage = 500;
    for (let page = 1; ; page += 1) {
      const params = new URLSearchParams({
        page:String(page),
        perPage:String(perPage),
        skipTotal:"1",
        fields,
      });
      const result = await this.request(`/api/collections/${collection}/records?${params}`);
      const items = Array.isArray(result.items) ? result.items : [];
      out.push(...items);
      if (items.length < perPage) break;
    }
    return out;
  }
}

const byteLength = value => value == null ? 0 : Buffer.byteLength(JSON.stringify(value), "utf8");
const mib = bytes => Math.round((bytes / 1024 / 1024) * 1000) / 1000;
const datePart = value => String(value || "").slice(0, 10);
const dateRange = records => {
  const dates = records.map(record => datePart(record.data)).filter(Boolean).sort();
  return { min:dates[0] || null, max:dates.at(-1) || null };
};

const pb = new PocketBaseAdmin(process.env.POCKETBASE_URL || "http://127.0.0.1:8090");
await pb.login();

const collectionNames = [
  "users", "agenti", "turni", "diaria", "cambi_turno", "importazioni_turni", "variazioni",
  "navi", "requisiti_equipaggio_nave", "turni_navi", "equipaggi_turno_nave", "documenti",
  "annunci", "configurazione", "periodi_bozza", "attivita_utenti", "segnalazioni",
  "stati_settimana", "correzioni_quiz", "log_migrazione",
];

const counts = {};
for (const name of collectionNames) counts[name] = await pb.count(name);

const usersSchema = await pb.collection("users");
const userFieldNames = new Set((usersSchema.fields || []).map(field => field.name));
const authHasLoginId = userFieldNames.has("login_id");
const authHasMustChangePin = userFieldNames.has("must_change_pin");
const userFields = ["id", "role", "attivo", authHasLoginId ? "login_id" : null, authHasMustChangePin ? "must_change_pin" : null]
  .filter(Boolean)
  .join(",");

const [users, agenti, turni, diaria, cambi, variazioni, turniNavi] = await Promise.all([
  pb.listAll("users", userFields),
  pb.listAll("agenti", "id,user,legacy_id,nome_completo,attivo,residenza,ruolo"),
  pb.listAll("turni", "id,data,agente,stato,legacy_payload"),
  pb.listAll("diaria", "id,data,agente,turno,legacy_payload"),
  pb.listAll("cambi_turno", "id,data_richiedente,data_collega,richiedente,collega,stato,legacy_payload"),
  pb.listAll("variazioni", "id,data,agente,stato,legacy_payload"),
  pb.listAll("turni_navi", "id,data,nave,servizio,legacy_payload"),
]);

const userIds = new Set(users.map(item => item.id));
const agentIds = new Set(agenti.map(item => item.id));
const linkedAgents = agenti.filter(item => item.user && userIds.has(item.user));
const brokenAgentLinks = agenti.filter(item => item.user && !userIds.has(item.user));
const orphanTurns = turni.filter(item => item.agente && !agentIds.has(item.agente));
const orphanDiaria = diaria.filter(item => item.agente && !agentIds.has(item.agente));

const payloadGroups = { turni, diaria, cambi_turno:cambi, variazioni, turni_navi:turniNavi };
const legacyPayload = Object.fromEntries(Object.entries(payloadGroups).map(([name, records]) => {
  const rows = records.filter(record => record.legacy_payload != null);
  const bytes = rows.reduce((sum, record) => sum + byteLength(record.legacy_payload), 0);
  return [name, { records:rows.length, bytes, mib:mib(bytes) }];
}));
const totalLegacyBytes = Object.values(legacyPayload).reduce((sum, item) => sum + item.bytes, 0);

const before = records => records.filter(record => {
  const date = datePart(record.data || record.data_richiedente);
  return date && date < cutoff;
}).length;

const result = {
  generatedAt:new Date().toISOString(),
  cutoff,
  counts,
  auth:{
    schemaPreparedForPinLogin:authHasLoginId && authHasMustChangePin,
    hasLoginIdField:authHasLoginId,
    hasMustChangePinField:authHasMustChangePin,
    users:users.length,
    agents:agenti.length,
    agentsLinkedToUser:linkedAgents.length,
    agentsWithoutUser:agenti.filter(item => !item.user).length,
    brokenAgentUserLinks:brokenAgentLinks.length,
    usersWithoutLoginId:authHasLoginId ? users.filter(item => !item.login_id).length : null,
    usersMustChangePin:authHasMustChangePin ? users.filter(item => item.must_change_pin).length : null,
  },
  integrity:{
    orphanTurns:orphanTurns.length,
    orphanDiaria:orphanDiaria.length,
    diariaWithoutTurnRelation:diaria.filter(item => !item.turno).length,
  },
  retention:{
    turniBeforeCutoff:before(turni),
    diariaBeforeCutoff:before(diaria),
    variazioniBeforeCutoff:before(variazioni),
    cambiBeforeCutoff:before(cambi),
  },
  ranges:{
    turni:dateRange(turni),
    diaria:dateRange(diaria),
    variazioni:dateRange(variazioni),
    turni_navi:dateRange(turniNavi),
  },
  legacyPayload:{
    byCollection:legacyPayload,
    totalBytes:totalLegacyBytes,
    totalMiB:mib(totalLegacyBytes),
  },
};

console.log(JSON.stringify(result, null, 2));
