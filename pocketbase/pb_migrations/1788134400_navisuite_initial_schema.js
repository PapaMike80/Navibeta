/// <reference path="../pb_data/types.d.ts" />

// NaviSuite schema for PocketBase v0.40.1.
// All API rules are deny-by-default. Superusers bypass collection rules.
migrate((app) => {
  const admin = `@request.auth.role = "admin" || @request.auth.role = "super_user"`;
  const signedIn = `@request.auth.id != ""`;
  const ownAgent = `agente.user = @request.auth.id`;
  const save = (definition) => {
    const collection = new Collection(definition);
    app.save(collection);
    return collection;
  };
  const base = (name, fields, rules = {}, indexes = []) => save({
    type: "base", name, fields, indexes,
    listRule: rules.list ?? null,
    viewRule: rules.view ?? null,
    createRule: rules.create ?? null,
    updateRule: rules.update ?? null,
    deleteRule: rules.delete ?? null,
  });
  const relation = (name, collection, options = {}) => ({
    type: "relation", name, collectionId: collection.id,
    maxSelect: options.maxSelect ?? 1,
    required: options.required ?? false,
    cascadeDelete: options.cascadeDelete ?? false,
  });
  const text = (name, options = {}) => ({ type: "text", name, ...options });
  const number = (name, options = {}) => ({ type: "number", name, min: 0, onlyInt: true, ...options });
  const bool = (name, options = {}) => ({ type: "bool", name, ...options });
  const date = (name, options = {}) => ({ type: "date", name, ...options });
  const select = (name, values, options = {}) => ({ type: "select", name, values, maxSelect: 1, ...options });
  const json = (name, options = {}) => ({ type: "json", name, ...options });

  // PocketBase 0.40.1 initializes a standard auth collection named "users".
  // Extend it instead of creating a duplicate, preserving its system auth fields.
  const users = app.findCollectionByNameOrId("users");
  users.listRule = `id = @request.auth.id || ${admin}`;
  users.viewRule = `id = @request.auth.id || ${admin}`;
  users.createRule = null;
  users.updateRule = `id = @request.auth.id && @request.body.role:changed = false || ${admin}`;
  users.deleteRule = admin;
  users.manageRule = admin;
  users.authRule = `attivo = true`;
  users.passwordAuth = { enabled: true, identityFields: ["email"] };
  users.fields.add(new TextField({ name:"nome_visualizzato", max:120 }));
  users.fields.add(new SelectField({ name:"role", values:["agente", "admin", "super_user"], maxSelect:1, required:true }));
  users.fields.add(new BoolField({ name:"attivo" }));
  users.addIndex("idx_users_role", false, "role", "");
  app.save(users);

  const agenti = base("agenti", [
    relation("user", users), text("legacy_id", { required: true, max: 100 }),
    text("nome", { max: 80 }), text("cognome", { max: 80 }), text("nome_completo", { required: true, max: 160 }),
    text("matricola", { max: 40 }), text("grado", { max: 80 }), text("residenza", { max: 80 }),
    select("ruolo", ["agente", "admin", "super_user"], { required: true }),
    bool("attivo"), json("permessi_speciali"), text("legacy_source", { max: 120 }),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_agenti_legacy_id ON agenti (legacy_id)",
    "CREATE INDEX idx_agenti_residenza_attivo ON agenti (residenza, attivo)",
  ]);

  const importazioni = base("importazioni_turni", [
    text("legacy_id", { max: 160 }), text("nome_file", { max: 255 }), text("tipo", { max: 50 }),
    text("hash_sorgente", { max: 128 }), select("stato", ["preparata", "validata", "importata", "parziale", "errore"]),
    date("periodo_inizio"), date("periodo_fine"), date("importata_il"), relation("importata_da", users),
    number("record_letti"), number("record_creati"), number("record_aggiornati"), number("record_scartati"),
    json("metadati"), text("note", { max: 2000 }),
  ], { list: admin, view: admin, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_importazioni_hash ON importazioni_turni (hash_sorgente) WHERE hash_sorgente != ''",
    "CREATE INDEX idx_importazioni_periodo ON importazioni_turni (periodo_inizio, periodo_fine)",
  ]);

  const turni = base("turni", [
    relation("agente", agenti, { required: true, cascadeDelete: true }), date("data", { required: true }),
    text("servizio", { required: true, max: 80 }), text("codice_turno", { max: 40 }), text("nave", { max: 100 }),
    text("residenza", { max: 80 }), select("origine", ["calendario", "ods", "manuale", "cambio_turno", "migrazione"], { required: true }),
    select("stato", ["bozza", "pubblicato", "annullato"], { required: true }), bool("variazione"),
    text("servizio_precedente", { max: 80 }), bool("trasferta"), text("note", { max: 2000 }),
    relation("importazione", importazioni), text("legacy_id", { max: 180 }), json("legacy_payload"),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_turni_agente_data ON turni (agente, data)",
    "CREATE UNIQUE INDEX idx_turni_legacy ON turni (legacy_id) WHERE legacy_id != ''",
    "CREATE INDEX idx_turni_data_residenza ON turni (data, residenza)",
  ]);

  const diaria = base("diaria", [
    relation("agente", agenti, { required: true, cascadeDelete: true }), date("data", { required: true }), relation("turno", turni),
    text("servizio", { max: 80 }), number("ore_servizio_minuti"), number("ore_lavorate_minuti"), bool("ore_lavorate_override"),
    number("straordinario_ritardo_minuti"), number("straordinario_cambio_minuti"), number("straordinario_sentine_minuti"),
    select("tipo_sentine", ["merda", "sentine", "sentine_merda", "personalizzato"]), number("banca_ore_minuti"),
    select("diaria_percentuale", ["0", "9", "12", "24", "40", "50"]), bool("pernotto_40"), bool("festivita_lavorata"),
    bool("ticket_dovuto"), bool("ticket_usato"), bool("secondo_ticket"), bool("indennita_imbarco"),
    number("indennita_aliscafo"), bool("presenza"), number("trasferta_minuti"), bool("rifornimento"),
    bool("parametro_139"), bool("maneggio_denaro"), bool("override_manuale"), text("note", { max: 2000 }),
    text("legacy_id", { max: 180 }), json("legacy_payload"),
  ], { list: `${ownAgent} || ${admin}`, view: `${ownAgent} || ${admin}`, create: `${ownAgent} || ${admin}`, update: `${ownAgent} || ${admin}`, delete: admin }, [
    "CREATE UNIQUE INDEX idx_diaria_agente_data ON diaria (agente, data)",
    "CREATE UNIQUE INDEX idx_diaria_legacy ON diaria (legacy_id) WHERE legacy_id != ''",
    "CREATE INDEX idx_diaria_data ON diaria (data)",
  ]);

  const cambi = base("cambi_turno", [
    text("legacy_id", { required: true, max: 180 }), relation("richiedente", agenti, { required: true }), relation("collega", agenti),
    date("data_richiedente"), date("data_collega"), text("turno_richiedente", { max: 80 }), text("turno_collega", { max: 80 }),
    select("stato", ["pending", "accepted", "approved", "rejected", "cancelled"], { required: true }),
    date("inviata_il"), date("accettata_il"), date("approvata_il"), date("rifiutata_il"), date("annullata_il"),
    relation("approvata_da", users), text("note", { max: 2000 }), json("legacy_payload"),
  ], {
    list: `richiedente.user = @request.auth.id || collega.user = @request.auth.id || ${admin}`,
    view: `richiedente.user = @request.auth.id || collega.user = @request.auth.id || ${admin}`,
    create: `richiedente.user = @request.auth.id || ${admin}`,
    update: `richiedente.user = @request.auth.id || collega.user = @request.auth.id || ${admin}`,
    delete: admin,
  }, ["CREATE UNIQUE INDEX idx_cambi_legacy ON cambi_turno (legacy_id)", "CREATE INDEX idx_cambi_stato_date ON cambi_turno (stato, data_richiedente)"]);

  const variazioni = base("variazioni", [
    text("legacy_id", { required: true, max: 180 }), relation("agente", agenti), date("data", { required: true }),
    text("da_servizio", { max: 80 }), text("a_servizio", { max: 80 }), select("origine", ["ods_ufficio", "ods_volontari", "manuale", "cambio_turno"]),
    select("stato", ["proposta", "approvata", "respinta", "applicata", "annullata"]), relation("importazione", importazioni),
    relation("cambio_turno", cambi), text("note", { max: 2000 }), json("legacy_payload"),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_variazioni_legacy ON variazioni (legacy_id)", "CREATE INDEX idx_variazioni_data_agente ON variazioni (data, agente)",
  ]);

  const navi = base("navi", [
    text("legacy_id", { max: 120 }), text("nome", { required: true, max: 120 }), text("residenza", { max: 80 }),
    bool("attiva"), text("note", { max: 2000 }),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_navi_nome ON navi (nome)", "CREATE UNIQUE INDEX idx_navi_legacy ON navi (legacy_id) WHERE legacy_id != ''",
  ]);
  const requisiti = base("requisiti_equipaggio_nave", [
    relation("nave", navi, { required: true, cascadeDelete: true }), text("servizio", { max: 80 }),
    text("grado", { required: true, max: 80 }), number("quantita", { required: true, min: 1 }), number("ordine"),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_requisiti_nave_servizio_grado ON requisiti_equipaggio_nave (nave, servizio, grado)",
  ]);
  const turniNavi = base("turni_navi", [
    text("legacy_id", { max: 180 }), relation("nave", navi, { required: true }), date("data", { required: true }),
    text("servizio", { required: true, max: 80 }), text("ormeggio_serale", { max: 160 }), bool("rifornimento_mattina"),
    relation("importazione", importazioni), text("note", { max: 2000 }), json("legacy_payload"),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_turni_navi_nave_data_servizio ON turni_navi (nave, data, servizio)",
    "CREATE UNIQUE INDEX idx_turni_navi_legacy ON turni_navi (legacy_id) WHERE legacy_id != ''",
  ]);
  base("equipaggi_turno_nave", [
    relation("turno_nave", turniNavi, { required: true, cascadeDelete: true }), relation("agente", agenti, { required: true }),
    text("grado_assegnato", { max: 80 }), bool("sostituzione"), text("note", { max: 1000 }),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_equipaggio_turno_agente ON equipaggi_turno_nave (turno_nave, agente)",
  ]);

  base("documenti", [
    text("legacy_id", { max: 180 }), text("titolo", { required: true, max: 200 }), text("descrizione", { max: 2000 }),
    text("categoria", { max: 80 }), { type: "file", name: "file", required: true, maxSelect: 1, maxSize: 52428800 },
    bool("pubblicato"), date("pubblicato_il"), relation("autore", users), json("visibilita"),
  ], { list: `${signedIn} && pubblicato = true || ${admin}`, view: `${signedIn} && pubblicato = true || ${admin}`, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_documenti_legacy ON documenti (legacy_id) WHERE legacy_id != ''", "CREATE INDEX idx_documenti_pubblicato ON documenti (pubblicato, pubblicato_il)",
  ]);
  base("annunci", [
    text("legacy_id", { max: 180 }), text("titolo", { required: true, max: 200 }), text("testo", { required: true, max: 10000 }),
    bool("pubblicato"), date("pubblicato_il"), date("scadenza"), relation("autore", users),
    select("priorita", ["normale", "importante", "urgente"]), json("visibilita"),
  ], { list: `${signedIn} && pubblicato = true || ${admin}`, view: `${signedIn} && pubblicato = true || ${admin}`, create: admin, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_annunci_legacy ON annunci (legacy_id) WHERE legacy_id != ''", "CREATE INDEX idx_annunci_pubblicazione ON annunci (pubblicato, pubblicato_il, scadenza)",
  ]);
  base("configurazione", [
    text("chiave", { required: true, max: 120 }), json("valore", { required: true }), text("descrizione", { max: 1000 }),
    relation("aggiornata_da", users), date("aggiornata_il"),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, ["CREATE UNIQUE INDEX idx_configurazione_chiave ON configurazione (chiave)"]);
  base("periodi_bozza", [
    date("data_inizio", { required: true }), date("data_fine", { required: true }), bool("attivo"),
    relation("aggiornato_da", users), date("aggiornato_il"), text("legacy_id", { max: 120 }),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, ["CREATE UNIQUE INDEX idx_periodo_bozza_attivo ON periodi_bozza (attivo) WHERE attivo = 1"]);
  base("attivita_utenti", [
    relation("agente", agenti, { required: true, cascadeDelete: true }), date("ultimo_accesso"), text("ultima_pagina", { max: 120 }),
    date("ultimo_contatto"), text("legacy_uid", { max: 160 }),
  ], { list: admin, view: `${ownAgent} || ${admin}`, create: `${ownAgent} || ${admin}`, update: `${ownAgent} || ${admin}`, delete: admin }, ["CREATE UNIQUE INDEX idx_attivita_agente ON attivita_utenti (agente)"]);
  base("segnalazioni", [
    text("legacy_id", { required: true, max: 180 }), relation("autore", agenti, { required: true }),
    select("categoria", ["bug", "miglioria", "altro"]), text("area", { max: 80 }), text("titolo", { required: true, max: 120 }),
    text("descrizione", { required: true, max: 3000 }), select("stato", ["nuovo", "verifica", "risolto"]),
    text("nota_admin", { max: 1600 }), date("aperta_il"), date("aggiornata_il"),
  ], { list: `autore.user = @request.auth.id || ${admin}`, view: `autore.user = @request.auth.id || ${admin}`, create: `autore.user = @request.auth.id`, update: admin, delete: admin }, [
    "CREATE UNIQUE INDEX idx_segnalazioni_legacy ON segnalazioni (legacy_id)", "CREATE INDEX idx_segnalazioni_stato ON segnalazioni (stato, aggiornata_il)",
  ]);
  base("stati_settimana", [
    date("data_inizio", { required: true }), select("stato", ["bozza", "ufficiale"]), relation("aggiornato_da", users), date("aggiornato_il"),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, ["CREATE UNIQUE INDEX idx_stati_settimana_inizio ON stati_settimana (data_inizio)"]);
  base("correzioni_quiz", [
    text("quiz_id", { required: true, max: 120 }), json("risposte", { required: true }), relation("aggiornata_da", users), date("aggiornata_il"), text("legacy_id", { max: 120 }),
  ], { list: signedIn, view: signedIn, create: admin, update: admin, delete: admin }, ["CREATE UNIQUE INDEX idx_correzioni_quiz_id ON correzioni_quiz (quiz_id)"]);
  base("log_migrazione", [
    text("esecuzione_id", { required: true, max: 120 }), text("fase", { max: 80 }), text("collection", { max: 120 }),
    text("legacy_id", { max: 180 }), select("esito", ["creato", "aggiornato", "saltato", "errore"]),
    text("messaggio", { max: 3000 }), date("registrato_il"), json("dettagli"),
  ], { list: admin, view: admin, create: admin, update: null, delete: admin }, ["CREATE INDEX idx_log_migrazione_esecuzione ON log_migrazione (esecuzione_id, collection, esito)"]);
}, (app) => {
  [
    "log_migrazione", "correzioni_quiz", "stati_settimana", "segnalazioni", "attivita_utenti", "periodi_bozza",
    "configurazione", "annunci", "documenti", "equipaggi_turno_nave", "turni_navi", "requisiti_equipaggio_nave",
    "navi", "variazioni", "cambi_turno", "diaria", "turni", "importazioni_turni", "agenti",
  ].forEach((name) => {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  });
  try {
    const users = app.findCollectionByNameOrId("users");
    ["nome_visualizzato", "role", "attivo"].forEach((name) => {
      const field = users.fields.getByName(name);
      if (field) users.fields.removeById(field.id);
    });
    users.removeIndex("idx_users_role");
    users.listRule = "id = @request.auth.id";
    users.viewRule = "id = @request.auth.id";
    users.createRule = "";
    users.updateRule = "id = @request.auth.id";
    users.deleteRule = "id = @request.auth.id";
    users.manageRule = null;
    users.authRule = "";
    app.save(users);
  } catch (_) {}
});
