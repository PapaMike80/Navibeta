import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { buildPlan } from "./transform.js";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const dryRun = args.has("--dry-run") || !execute;
if (execute && args.has("--dry-run")) throw new Error("Usa --dry-run oppure --execute, non entrambi.");

async function loadFirebaseExport() {
  const path = process.env.FIREBASE_EXPORT_FILE;
  if (path) return JSON.parse(await readFile(path, "utf8"));
  const base = String(process.env.FIREBASE_DATABASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("Imposta FIREBASE_EXPORT_FILE oppure FIREBASE_DATABASE_URL.");
  const token = process.env.FIREBASE_AUTH_TOKEN;
  const url = `${base}/.json${token ? `?auth=${encodeURIComponent(token)}` : ""}`;
  const response = await fetch(url, { method:"GET", headers:{ Accept:"application/json" } });
  if (!response.ok) throw new Error(`Lettura Firebase fallita: HTTP ${response.status}`);
  return response.json();
}

class PocketBaseAdmin {
  constructor(baseUrl) { this.baseUrl = baseUrl.replace(/\/$/, ""); this.token = ""; this.agentIds = new Map(); }
  async request(path, options = {}) {
    const response = await fetch(this.baseUrl + path, { ...options, headers:{ "Content-Type":"application/json", Authorization:this.token, ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body.message || ""}`);
    return body;
  }
  async login() {
    const identity = process.env.POCKETBASE_SUPERUSER_EMAIL, password = process.env.POCKETBASE_SUPERUSER_PASSWORD;
    if (!identity || !password) throw new Error("Credenziali PocketBase Superuser mancanti.");
    const auth = await this.request("/api/collections/_superusers/auth-with-password", { method:"POST", body:JSON.stringify({ identity, password }) });
    this.token = auth.token;
  }
  async find(collection, legacyId) {
    const filter = encodeURIComponent(`legacy_id = "${String(legacyId).replaceAll('"', '\\"')}"`);
    const page = await this.request(`/api/collections/${collection}/records?perPage=1&filter=${filter}`);
    return page.items?.[0] || null;
  }
  async resolveAgent(legacyId) {
    if (!legacyId) return ""; if (this.agentIds.has(legacyId)) return this.agentIds.get(legacyId);
    const found = await this.find("agenti", legacyId); const id = found?.id || ""; this.agentIds.set(legacyId, id); return id;
  }
  async upsert(collection, record) {
    const data = { ...record };
    if (data.__agentLegacyId) data.agente = await this.resolveAgent(data.__agentLegacyId);
    if (data.__requesterLegacyId) data.richiedente = await this.resolveAgent(data.__requesterLegacyId);
    if (data.__colleagueLegacyId) data.collega = await this.resolveAgent(data.__colleagueLegacyId);
    if (data.__authorLegacyId) data.autore = await this.resolveAgent(data.__authorLegacyId);
    Object.keys(data).filter(key => key.startsWith("__")).forEach(key => delete data[key]);
    const existing = await this.find(collection, data.legacy_id);
    const path = existing ? `/api/collections/${collection}/records/${existing.id}` : `/api/collections/${collection}/records`;
    return { action:existing ? "updated" : "created", record:await this.request(path, { method:existing ? "PATCH" : "POST", body:JSON.stringify(data) }) };
  }
}

const source = await loadFirebaseExport();
const plan = buildPlan(source);
const summary = Object.fromEntries(plan.map(group => [group.collection, group.records.length]));
console.log(JSON.stringify({ mode:dryRun ? "dry-run" : "execute", summary }, null, 2));
if (dryRun) process.exit(0);

const pb = new PocketBaseAdmin(process.env.POCKETBASE_URL || "http://127.0.0.1:8090");
await pb.login();
const checkpointPath = process.env.MIGRATION_CHECKPOINT_FILE || "./migration-checkpoint.json";
let checkpoint = { completed:{}, errors:[] };
try { checkpoint = JSON.parse(await readFile(checkpointPath, "utf8")); } catch {}
for (const group of plan) {
  checkpoint.completed[group.collection] ||= {};
  for (const record of group.records) {
    const key = record.legacy_id;
    if (checkpoint.completed[group.collection][key]) continue;
    try {
      const result = await pb.upsert(group.collection, record);
      checkpoint.completed[group.collection][key] = result.action;
    } catch (error) {
      checkpoint.errors.push({ collection:group.collection, legacy_id:key, message:error.message, at:new Date().toISOString() });
      await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
      throw error;
    }
    await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }
}
console.log(JSON.stringify({ ok:true, checkpoint:checkpointPath }, null, 2));
