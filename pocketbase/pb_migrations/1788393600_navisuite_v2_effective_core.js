/// <reference path="../pb_data/types.d.ts" />

// NaviSuite V2 core.
// Runtime pages read only turni_effective; imported/source rows stay auditable.
migrate((app) => {
  const signedIn = `@request.auth.id != ""`;
  const admin = `@request.auth.role = "admin" || @request.auth.role = "super_user"`;

  const agenti = app.findCollectionByNameOrId("agenti");
  const importazioni = app.findCollectionByNameOrId("importazioni_turni");
  const variazioni = app.findCollectionByNameOrId("variazioni");
  const cambi = app.findCollectionByNameOrId("cambi_turno");
  const diaria = app.findCollectionByNameOrId("diaria");

  const saveBase = (name, fields, indexes, rules = {}) => {
    const collection = new Collection({
      type: "base",
      name,
      fields,
      indexes,
      listRule: rules.list ?? null,
      viewRule: rules.view ?? null,
      createRule: rules.create ?? null,
      updateRule: rules.update ?? null,
      deleteRule: rules.delete ?? null,
    });
    app.save(collection);
    return collection;
  };

  const relation = (name, collection, options = {}) => ({
    type: "relation",
    name,
    collectionId: collection.id,
    maxSelect: options.maxSelect ?? 1,
    required: options.required ?? false,
    cascadeDelete: options.cascadeDelete ?? false,
  });
  const text = (name, options = {}) => ({ type: "text", name, ...options });
  const date = (name, options = {}) => ({ type: "date", name, ...options });
  const bool = (name, options = {}) => ({ type: "bool", name, ...options });
  const number = (name, options = {}) => ({ type: "number", name, onlyInt: true, ...options });
  const json = (name, options = {}) => ({ type: "json", name, ...options });
  const select = (name, values, options = {}) => ({ type: "select", name, values, maxSelect: 1, ...options });

  const imported = saveBase("turni_importati", [
    relation("agente", agenti, { required: true, cascadeDelete: true }),
    relation("importazione", importazioni, { required: true, cascadeDelete: true }),
    date("data", { required: true }),
    text("servizio", { required: true, max: 80 }),
    text("codice_turno", { max: 40 }),
    text("nave", { max: 100 }),
    text("residenza", { max: 80 }),
    select("tipo_periodo", ["ufficiale", "bozza", "legacy"], { required: true }),
    number("riga_sorgente", { min: 0 }),
    text("chiave_sorgente", { max: 180 }),
    json("source_payload"),
  ], [
    "CREATE UNIQUE INDEX idx_turni_importati_batch_agent_date ON turni_importati (importazione, agente, data)",
    "CREATE INDEX idx_turni_importati_agent_date ON turni_importati (agente, data)",
    "CREATE INDEX idx_turni_importati_periodo ON turni_importati (data, tipo_periodo)",
  ], {
    list: signedIn,
    view: signedIn,
    create: admin,
    // Source rows are immutable through the public API. Superusers/server-side jobs bypass rules.
    update: null,
    delete: null,
  });

  const effective = saveBase("turni_effective", [
    relation("agente", agenti, { required: true, cascadeDelete: true }),
    date("data", { required: true }),
    text("servizio", { required: true, max: 80 }),
    text("codice_turno", { max: 40 }),
    text("nave", { max: 100 }),
    text("residenza", { max: 80 }),
    text("servizio_base", { max: 80 }),
    select("origine_effective", ["turno_importato", "ods", "cambio_turno", "manuale", "migrazione"], { required: true }),
    select("stato", ["ufficiale", "bozza", "annullato"], { required: true }),
    relation("turno_importato", imported),
    relation("importazione_base", importazioni),
    relation("ultima_variazione", variazioni),
    relation("ultimo_cambio", cambi),
    number("versione", { required: true, min: 1 }),
    bool("override_manuale"),
    text("note", { max: 2000 }),
    json("effective_meta"),
  ], [
    "CREATE UNIQUE INDEX idx_turni_effective_agent_date ON turni_effective (agente, data)",
    "CREATE INDEX idx_turni_effective_date_residence ON turni_effective (data, residenza)",
    "CREATE INDEX idx_turni_effective_origin_date ON turni_effective (origine_effective, data)",
  ], {
    list: signedIn,
    view: signedIn,
    // No browser/client writes. All effective mutations are server-side operations.
    create: null,
    update: null,
    delete: null,
  });

  // Link personal daily records to the materialized effective shift while keeping
  // the old legacy `turno` relation untouched for migration/audit purposes.
  if (!diaria.fields.getByName("turno_effective")) {
    diaria.fields.add(new RelationField({
      name: "turno_effective",
      collectionId: effective.id,
      maxSelect: 1,
      required: false,
      cascadeDelete: false,
    }));
    app.save(diaria);
  }

  saveBase("firebase_sync_runs", [
    text("snapshot_id", { required: true, max: 180 }),
    text("snapshot_hash", { max: 128 }),
    select("source_mode", ["frozen_export", "delta_export", "legacy_live"], { required: true }),
    select("stato", ["preparato", "dry_run", "importato", "parziale", "errore"], { required: true }),
    date("source_generated_at"),
    date("imported_at"),
    number("records_seen", { min: 0 }),
    number("records_created", { min: 0 }),
    number("records_updated", { min: 0 }),
    number("records_unchanged", { min: 0 }),
    number("records_deleted", { min: 0 }),
    json("summary"),
    text("note", { max: 4000 }),
  ], [
    "CREATE UNIQUE INDEX idx_firebase_sync_runs_snapshot ON firebase_sync_runs (snapshot_id)",
    "CREATE INDEX idx_firebase_sync_runs_imported ON firebase_sync_runs (imported_at)",
  ], {
    list: admin,
    view: admin,
    create: null,
    update: null,
    delete: null,
  });

  saveBase("firebase_sync_state", [
    text("entity_type", { required: true, max: 80 }),
    text("entity_key", { required: true, max: 220 }),
    text("content_hash", { required: true, max: 128 }),
    text("source_path", { max: 300 }),
    date("first_seen_at"),
    date("last_seen_at"),
    date("last_imported_at"),
    bool("deleted_in_source"),
    json("sync_meta"),
  ], [
    "CREATE UNIQUE INDEX idx_firebase_sync_state_entity ON firebase_sync_state (entity_type, entity_key)",
    "CREATE INDEX idx_firebase_sync_state_hash ON firebase_sync_state (content_hash)",
  ], {
    list: admin,
    view: admin,
    create: null,
    update: null,
    delete: null,
  });
});
