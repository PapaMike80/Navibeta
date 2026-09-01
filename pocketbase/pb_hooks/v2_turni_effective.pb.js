/// <reference path="../pb_data/types.d.ts" />

(function () {
  const allowed = new Set([
    "D1","D2","D3","D4","BIS","POND","DT",
    "T1","T2","M1","R1","R2","R3","R4","CAR",
    "P1","P2","P3","CAP","SR1","AGB","AGM","AGT",
    "RIP","TERRA","LAV","CON","F.P.","S.S.","MAL","CORSO"
  ]);

  function canonicalService(value) {
    let raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
    if (raw === "FP") raw = "F.P.";
    if (raw === "SS") raw = "S.S.";
    if (!allowed.has(raw)) throw new BadRequestError("Servizio non valido.");
    return raw === "POND" ? "PonD" : raw;
  }

  routerAdd("POST", "/api/navisuite-v2/turni/{id}/servizio", (e) => {
    const body = new DynamicModel({ servizio: "" });
    e.bindBody(body);
    const nextService = canonicalService(body.servizio);
    const turnoId = e.request.pathValue("id");
    const auth = e.auth;
    if (!auth) throw new ForbiddenError("Accesso richiesto.");

    let output = null;
    e.app.runInTransaction((txApp) => {
      const turno = txApp.findRecordById("turni_effective", turnoId);
      const agent = txApp.findRecordById("agenti", turno.getString("agente"));
      const role = String(auth.getString("role") || "").toLowerCase();
      const isAdmin = role === "admin" || role === "super_user" || e.hasSuperuserAuth();
      const isMine = String(agent.getString("legacy_id")) === String(auth.getString("login_id"));
      if (!isAdmin && !isMine) throw new ForbiddenError("Puoi modificare solo il tuo servizio.");
      if (turno.getString("stato") === "annullato") throw new BadRequestError("Il turno è annullato.");

      const previous = turno.getString("servizio");
      if (String(previous).toUpperCase() === String(nextService).toUpperCase()) {
        output = {
          id: turno.id,
          servizio: previous,
          versione: turno.getInt("versione"),
          origine_effective: turno.getString("origine_effective"),
          unchanged: true,
        };
        return;
      }

      const eventCollection = txApp.findCollectionByNameOrId("turni_effective_eventi");
      const audit = new Record(eventCollection);
      audit.set("turno_effective", turno.id);
      audit.set("agente", agent.id);
      audit.set("data", turno.get("data"));
      audit.set("servizio_precedente", previous);
      audit.set("servizio_nuovo", nextService);
      audit.set("tipo", "manuale");
      if (auth.collection().name === "users") audit.set("autore", auth.id);
      audit.set("meta", { source:"naviturni_v2_popup" });
      txApp.save(audit);

      turno.set("servizio", nextService);
      turno.set("codice_turno", nextService);
      turno.set("origine_effective", "manuale");
      turno.set("override_manuale", true);
      turno.set("versione", Math.max(1, turno.getInt("versione")) + 1);
      txApp.save(turno);

      output = {
        id: turno.id,
        servizio: turno.getString("servizio"),
        versione: turno.getInt("versione"),
        origine_effective: turno.getString("origine_effective"),
        unchanged: false,
      };
    });

    return e.json(200, output || {});
  }, $apis.requireAuth());
})();
