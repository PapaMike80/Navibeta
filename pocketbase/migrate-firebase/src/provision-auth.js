import { readFile } from "node:fs/promises";
import process from "node:process";

const execute = process.argv.includes("--execute");
const exportPath = process.env.FIREBASE_EXPORT_FILE;
if (!exportPath) throw new Error("Imposta FIREBASE_EXPORT_FILE con l'export JSON Firebase offline.");

const source = JSON.parse(await readFile(exportPath, "utf8"));
const userAuth = source?.private?.adminUpdates?.userAuth || {};
const validPinHash = value => /^[a-f0-9]{64}$/i.test(String(value || ""));
const clean = value => String(value ?? "").trim();
const syntheticEmail = legacyId => {
  const hex = Buffer.from(clean(legacyId), "utf8").toString("hex").slice(0, 80) || "unknown";
  return `agent-${hex}@navisuite.invalid`;
};

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

  async find(collection, field, value) {
    const escaped = String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    const params = new URLSearchParams({ perPage:"1", filter:`${field} = "${escaped}"` });
    const page = await this.request(`/api/collections/${collection}/records?${params}`);
    return page.items?.[0] || null;
  }

  async listAll(collection, fields = "id") {
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

  async createUser(agent, auth) {
    const pinHash = clean(auth.pinHash).toLowerCase();
    const legacyId = clean(agent.legacy_id);
    return this.request("/api/collections/users/records", {
      method:"POST",
      body:JSON.stringify({
        login_id:legacyId,
        email:syntheticEmail(legacyId),
        password:pinHash,
        passwordConfirm:pinHash,
        nome_visualizzato:clean(agent.nome_completo || legacyId),
        role:["admin", "super_user"].includes(agent.ruolo) ? agent.ruolo : "agente",
        attivo:agent.attivo !== false,
        must_change_pin:Boolean(auth.mustChangePin),
        verified:true,
        emailVisibility:false,
      }),
    });
  }

  async updateUserMetadata(user, agent, auth) {
    const payload = {
      nome_visualizzato:clean(agent.nome_completo || agent.legacy_id),
      role:["admin", "super_user"].includes(agent.ruolo) ? agent.ruolo : "agente",
      attivo:agent.attivo !== false,
      must_change_pin:Boolean(auth.mustChangePin),
      emailVisibility:false,
    };
    if (!user.email) payload.email = syntheticEmail(agent.legacy_id);
    return this.request(`/api/collections/users/records/${user.id}`, {
      method:"PATCH",
      body:JSON.stringify(payload),
    });
  }

  async linkAgent(agent, userId) {
    return this.request(`/api/collections/agenti/records/${agent.id}`, {
      method:"PATCH",
      body:JSON.stringify({ user:userId }),
    });
  }
}

const pb = new PocketBaseAdmin(process.env.POCKETBASE_URL || "http://127.0.0.1:8090");
await pb.login();

const allAgents = await pb.listAll("agenti", "id,legacy_id,nome_completo,attivo,residenza,ruolo,user");
const authLegacyIds = new Set(
  Object.entries(userAuth)
    .map(([key, value]) => clean((value && typeof value === "object" ? value.id : "") || key))
    .filter(Boolean)
);

const summary = {
  mode:execute ? "execute" : "dry-run",
  firebaseAuthEntries:Object.keys(userAuth).length,
  pocketBaseAgents:allAgents.length,
  candidates:0,
  created:0,
  existing:0,
  linked:0,
  alreadyLinked:0,
  skippedMissingAgent:[],
  skippedInvalidPinHash:[],
  conflicts:[],
  agentsWithoutFirebaseAuth:allAgents
    .filter(agent => !authLegacyIds.has(clean(agent.legacy_id)))
    .map(agent => ({
      legacyId:clean(agent.legacy_id),
      nome:clean(agent.nome_completo),
      attivo:agent.attivo !== false,
      residenza:clean(agent.residenza),
      ruolo:clean(agent.ruolo),
    })),
};

for (const [key, authValue] of Object.entries(userAuth)) {
  // Intentionally read only id/pinHash/mustChangePin. Legacy plaintext initialPin,
  // when present in the Firebase export, is never copied to PocketBase.
  const auth = authValue && typeof authValue === "object" ? authValue : {};
  const legacyId = clean(auth.id || key);
  if (!legacyId) continue;
  if (!validPinHash(auth.pinHash)) {
    summary.skippedInvalidPinHash.push(legacyId);
    continue;
  }

  const agent = await pb.find("agenti", "legacy_id", legacyId);
  if (!agent) {
    summary.skippedMissingAgent.push(legacyId);
    continue;
  }
  summary.candidates += 1;

  let user = await pb.find("users", "login_id", legacyId);
  if (user) {
    summary.existing += 1;
    if (agent.user && agent.user !== user.id) {
      summary.conflicts.push({ legacyId, agentUser:agent.user, loginUser:user.id });
      continue;
    }
    if (execute) user = await pb.updateUserMetadata(user, agent, auth);
  } else if (execute) {
    user = await pb.createUser(agent, auth);
    summary.created += 1;
  } else {
    user = { id:"<new-user>" };
    summary.created += 1;
  }

  if (agent.user) {
    summary.alreadyLinked += 1;
    continue;
  }
  summary.linked += 1;
  if (execute) await pb.linkAgent(agent, user.id);
}

console.log(JSON.stringify(summary, null, 2));
if (!execute) {
  console.log("\nDry-run: nessun account o collegamento è stato scritto. Usa --execute solo dopo aver verificato questo riepilogo.");
}
