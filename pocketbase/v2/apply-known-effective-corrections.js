import process from "node:process";

const execute = process.argv.includes("--execute");
const cutoffArg = process.argv.find(arg => arg.startsWith("--cutoff="));
const cutoff = (cutoffArg?.split("=")[1] || "2026-07-01").slice(0, 10);

class PB {
  constructor(baseUrl) { this.baseUrl = String(baseUrl || "").replace(/\/$/, ""); this.token = ""; }
  async request(path, options = {}) {
    const headers = { Accept:"application/json", Authorization:this.token, ...(options.headers || {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(this.baseUrl + path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body.message || ""}`);
    return body;
  }
  async login() {
    const identity = process.env.POCKETBASE_SUPERUSER_EMAIL;
    const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;
    if (!identity || !password) throw new Error("Credenziali superuser PocketBase mancanti.");
    const auth = await this.request("/api/collections/_superusers/auth-with-password", { method:"POST", body:JSON.stringify({ identity, password }) });
    this.token = auth.token;
  }
  async listAll(collection, { filter = "", fields = "", sort = "" } = {}) {
    const out = [];
    for (let page = 1;; page++) {
      const params = new URLSearchParams({ page:String(page), perPage:"500" });
      if (filter) params.set("filter", filter);
      if (fields) params.set("fields", fields);
      if (sort) params.set("sort", sort);
      const result = await this.request(`/api/collections/${collection}/records?${params}`);
      out.push(...(result.items || []));
      if (page >= Number(result.totalPages || 1)) break;
    }
    return out;
  }
  async update(collection, id, payload) {
    return this.request(`/api/collections/${collection}/records/${id}`, { method:"PATCH", body:JSON.stringify(payload) });
  }
}

const pb = new PB(process.env.POCKETBASE_URL || "http://127.0.0.1:8090");
await pb.login();

const allRows = await pb.listAll("turni_effective", {
  filter:`data >= "${cutoff} 00:00:00.000Z" && stato != "annullato"`,
  fields:"id,data,agente,servizio,codice_turno,servizio_base,origine_effective,stato,versione,note",
  sort:"data",
});

const isLavVariant = value => /^(?:TERRA|LAV[.;]?)$/i.test(String(value || "").trim());
const normalizeLav = value => isLavVariant(value) ? "LAV" : String(value || "");
const rows = allRows.filter(row =>
  isLavVariant(row.servizio) ||
  isLavVariant(row.codice_turno) ||
  isLavVariant(row.servizio_base)
);

const changes = rows.map(row => ({
  id:row.id,
  data:String(row.data || "").slice(0,10),
  servizio_da:row.servizio,
  servizio_a:normalizeLav(row.servizio),
  codice_turno_da:row.codice_turno || "",
  codice_turno_a:normalizeLav(row.codice_turno || ""),
  servizio_base_da:row.servizio_base || "",
  servizio_base_a:normalizeLav(row.servizio_base || ""),
}));

if (execute) {
  for (const row of rows) {
    const correctionNote = "Normalizzazione NaviSuite V2: terra/lav varianti -> LAV.";
    const previousNote = String(row.note || "").trim();
    const payload = {
      servizio:normalizeLav(row.servizio),
      codice_turno:normalizeLav(row.codice_turno || ""),
      servizio_base:normalizeLav(row.servizio_base || ""),
      versione:Math.max(1, Number(row.versione || 1) + 1),
      note:previousNote.includes(correctionNote) ? previousNote : [previousNote, correctionNote].filter(Boolean).join("\n"),
    };
    await pb.update("turni_effective", row.id, payload);
  }
}

console.log(JSON.stringify({
  mode:execute ? "execute" : "dry-run",
  rule:"terra / lav / lav. / lav; -> LAV",
  cutoff,
  scanned:allRows.length,
  matches:rows.length,
  updated:execute ? rows.length : 0,
  sample:changes.slice(0,50),
}, null, 2));

if (!execute) console.log("\nDry-run: nessun record modificato. Riesegui con --execute dopo aver verificato il riepilogo.");
