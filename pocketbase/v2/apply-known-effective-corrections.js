import process from "node:process";

const execute = process.argv.includes("--execute");
const cutoffArg = process.argv.find(arg => arg.startsWith("--cutoff="));
const cutoff = (cutoffArg?.split("=")[1] || "2026-07-01").slice(0, 10);

class PB {
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.token = "";
  }

  async request(path, options = {}) {
    const headers = {
      Accept: "application/json",
      Authorization: this.token,
      ...(options.headers || {}),
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(this.baseUrl + path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body.message || ""}`);
    }
    return body;
  }

  async login() {
    const identity = process.env.POCKETBASE_SUPERUSER_EMAIL;
    const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;
    if (!identity || !password) throw new Error("Credenziali superuser PocketBase mancanti.");
    const auth = await this.request("/api/collections/_superusers/auth-with-password", {
      method: "POST",
      body: JSON.stringify({ identity, password }),
    });
    this.token = auth.token;
  }

  async listAll(collection, { filter = "", fields = "", sort = "" } = {}) {
    const out = [];
    for (let page = 1; ; page++) {
      const params = new URLSearchParams({ page: String(page), perPage: "500" });
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
    return this.request(`/api/collections/${collection}/records/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
}

const esc = value => String(value ?? "").replaceAll('"', '\\"');
const pb = new PB(process.env.POCKETBASE_URL || "http://127.0.0.1:8090");
await pb.login();

const agents = await pb.listAll("agenti", {
  filter: 'nome_completo = "ZENEGAGLIA D."',
  fields: "id,legacy_id,nome_completo,residenza",
});

if (agents.length !== 1) {
  throw new Error(`Atteso un solo ZENEGAGLIA D., trovati ${agents.length}. Nessuna modifica eseguita.`);
}

const agent = agents[0];
const filter = `agente = "${esc(agent.id)}" && data >= "${cutoff} 00:00:00.000Z" && servizio = "TERRA" && stato != "annullato"`;
const rows = await pb.listAll("turni_effective", {
  filter,
  fields: "id,data,servizio,servizio_base,origine_effective,stato,versione,note",
  sort: "data",
});

const changes = rows.map(row => ({
  id: row.id,
  data: String(row.data || "").slice(0, 10),
  da: row.servizio,
  a: "LAV",
  servizio_base_da: row.servizio_base || "",
  servizio_base_a: String(row.servizio_base || "").toUpperCase() === "TERRA" ? "LAV" : row.servizio_base || "",
}));

if (execute) {
  for (const row of rows) {
    const correctionNote = "Correzione verificata NaviSuite V2: ZENEGAGLIA D. = LAV (8h), non TERRA.";
    const previousNote = String(row.note || "").trim();
    const payload = {
      servizio: "LAV",
      versione: Math.max(1, Number(row.versione || 1) + 1),
      note: previousNote.includes(correctionNote)
        ? previousNote
        : [previousNote, correctionNote].filter(Boolean).join("\n"),
    };
    if (String(row.servizio_base || "").toUpperCase() === "TERRA") payload.servizio_base = "LAV";
    await pb.update("turni_effective", row.id, payload);
  }
}

console.log(JSON.stringify({
  mode: execute ? "execute" : "dry-run",
  correction: "ZENEGAGLIA D.: TERRA -> LAV",
  cutoff,
  agent: {
    id: agent.id,
    legacy_id: agent.legacy_id,
    nome: agent.nome_completo,
    residenza: agent.residenza,
  },
  matches: rows.length,
  updated: execute ? rows.length : 0,
  changes,
}, null, 2));

if (!execute) {
  console.log("\nDry-run: nessun record modificato. Riesegui con --execute per applicare la correzione.");
}
