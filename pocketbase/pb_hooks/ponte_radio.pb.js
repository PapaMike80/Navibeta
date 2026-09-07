/// <reference path="../pb_data/types.d.ts" />

(function () {
  function roleOf(auth) {
    return String(auth && auth.getString("role") || "").toLowerCase();
  }

  function isAdmin(e) {
    const role = roleOf(e.auth);
    return role === "admin" || role === "super_user" || e.hasSuperuserAuth();
  }

  function currentAgent(app, auth) {
    if (!auth) throw new ForbiddenError("Accesso richiesto.");
    const loginId = String(auth.getString("login_id") || "").trim();
    if (!loginId) throw new ForbiddenError("Profilo agente non associato.");
    try {
      return app.findFirstRecordByFilter("agenti", "legacy_id = {:login}", { login: loginId });
    } catch (_) {
      throw new ForbiddenError("Profilo agente non trovato.");
    }
  }

  function workerSecret() {
    return String($os.getenv("PONTERADIO_WORKER_SECRET") || "").trim();
  }

  function requireWorker(e) {
    const expected = workerSecret();
    const supplied = String(e.request.header.get("X-PonteRadio-Worker") || "").trim();
    if (!expected || supplied !== expected) throw new ForbiddenError("Worker non autorizzato.");
  }

  routerAdd("GET", "/api/navisuite-v2/ponteradio/recipients", (e) => {
    const me = currentAgent(e.app, e.auth);
    const subscriptions = e.app.findRecordsByFilter("push_subscriptions", "enabled = true", "", 500, 0);
    const seen = new Set();
    const recipients = [];
    for (const sub of subscriptions) {
      const agentId = sub.getString("agente");
      if (!agentId || agentId === me.id || seen.has(agentId)) continue;
      seen.add(agentId);
      try {
        const agent = e.app.findRecordById("agenti", agentId);
        if (!agent.getBool("attivo")) continue;
        recipients.push({ id: agent.id, legacy_id: agent.getString("legacy_id"), name: agent.getString("nome") || agent.getString("nome_visualizzato") || agent.getString("legacy_id") });
      } catch (_) {}
    }
    recipients.sort((a, b) => String(a.name).localeCompare(String(b.name), "it"));
    return e.json(200, { recipients, canBroadcast: isAdmin(e) });
  }, $apis.requireAuth());

  routerAdd("POST", "/api/navisuite-v2/ponteradio/subscription", (e) => {
    const agent = currentAgent(e.app, e.auth);
    const body = new DynamicModel({ device_id: "", device_label: "", endpoint: "", p256dh: "", auth_key: "", enabled: true, vapid_version: 2, preferences: {} });
    e.bindBody(body);
    const deviceId = String(body.device_id || "").trim();
    const endpoint = String(body.endpoint || "").trim();
    const p256dh = String(body.p256dh || "").trim();
    const authKey = String(body.auth_key || "").trim();
    if (!deviceId || !endpoint || !p256dh || !authKey) throw new BadRequestError("Subscription incompleta.");
    let record = null;
    try {
      record = e.app.findFirstRecordByFilter("push_subscriptions", "agente = {:agent} && device_id = {:device}", { agent: agent.id, device: deviceId });
    } catch (_) {
      record = new Record(e.app.findCollectionByNameOrId("push_subscriptions"));
    }
    record.set("user", e.auth.id);
    record.set("agente", agent.id);
    record.set("device_id", deviceId);
    record.set("device_label", String(body.device_label || "").slice(0, 80));
    record.set("endpoint", endpoint);
    record.set("p256dh", p256dh);
    record.set("auth_key", authKey);
    record.set("enabled", body.enabled !== false);
    record.set("vapid_version", Number(body.vapid_version || 2));
    record.set("preferences", body.preferences || {});
    e.app.save(record);
    return e.json(200, { id: record.id, enabled: record.getBool("enabled") });
  }, $apis.requireAuth());

  routerAdd("POST", "/api/navisuite-v2/ponteradio/send", (e) => {
    const sender = currentAgent(e.app, e.auth);
    const body = new DynamicModel({ target_agent: "", broadcast: false, title: "", body: "", url: "ponteradio.html", meta: {} });
    e.bindBody(body);
    const message = String(body.body || "").trim();
    if (!message) throw new BadRequestError("Scrivi un messaggio.");
    if (message.length > 500) throw new BadRequestError("Messaggio troppo lungo.");
    const broadcast = body.broadcast === true;
    if (broadcast && !isAdmin(e)) throw new ForbiddenError("Invio a tutti riservato agli amministratori.");
    let targetId = String(body.target_agent || "").trim();
    if (!broadcast) {
      if (!targetId) throw new BadRequestError("Destinatario mancante.");
      const target = e.app.findRecordById("agenti", targetId);
      if (!target.getBool("attivo")) throw new BadRequestError("Destinatario non attivo.");
    } else targetId = "";
    const queue = new Record(e.app.findCollectionByNameOrId("push_queue"));
    queue.set("requested_by", e.auth.id);
    queue.set("sender_agent", sender.id);
    if (targetId) queue.set("target_agent", targetId);
    queue.set("broadcast", broadcast);
    queue.set("kind", "ponteradio");
    queue.set("status", "pending");
    queue.set("title", String(body.title || ("Ponte Radio · " + (sender.getString("nome") || sender.getString("legacy_id")))).slice(0, 120));
    queue.set("body", message);
    queue.set("url", String(body.url || "ponteradio.html"));
    queue.set("meta", body.meta || {});
    e.app.save(queue);
    return e.json(202, { id: queue.id, status: "pending" });
  }, $apis.requireAuth());

  routerAdd("GET", "/api/navisuite-v2/ponteradio/worker/jobs", (e) => {
    requireWorker(e);
    const jobs = e.app.findRecordsByFilter("push_queue", "status = 'pending'", "", 25, 0);
    const result = [];
    for (const job of jobs) {
      job.set("status", "processing");
      e.app.save(job);

      let subscriptions = [];
      if (job.getBool("broadcast")) {
        subscriptions = e.app.findRecordsByFilter("push_subscriptions", "enabled = true", "", 500, 0);
      } else {
        const targetId = job.getString("target_agent");
        if (targetId) {
          subscriptions = e.app.findRecordsByFilter("push_subscriptions", "enabled = true && agente = {:agent}", "", 50, 0, { agent: targetId });
        }
      }

      result.push({
        id: job.id,
        title: job.getString("title"),
        body: job.getString("body"),
        url: job.getString("url"),
        meta: job.get("meta") || {},
        subscriptions: subscriptions.map((sub) => ({
          id: sub.id,
          endpoint: sub.getString("endpoint"),
          keys: {
            p256dh: sub.getString("p256dh"),
            auth: sub.getString("auth_key")
          }
        }))
      });
    }
    return e.json(200, { jobs: result });
  });

  routerAdd("POST", "/api/navisuite-v2/ponteradio/worker/result", (e) => {
    requireWorker(e);
    const body = new DynamicModel({ id: "", status: "", error: "", expired: [] });
    e.bindBody(body);
    const id = String(body.id || "").trim();
    if (!id) throw new BadRequestError("Job mancante.");
    const job = e.app.findRecordById("push_queue", id);
    const status = ["sent", "partial", "failed"].includes(String(body.status)) ? String(body.status) : "failed";
    job.set("status", status);
    job.set("error", String(body.error || "").slice(0, 1000));
    job.set("processed_at", new Date().toISOString());
    e.app.save(job);
    for (const subId of (body.expired || [])) {
      try {
        const sub = e.app.findRecordById("push_subscriptions", String(subId));
        sub.set("enabled", false);
        e.app.save(sub);
      } catch (_) {}
    }
    return e.json(200, { ok: true });
  });
})();
