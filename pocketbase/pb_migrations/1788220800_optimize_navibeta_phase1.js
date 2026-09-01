/// <reference path="../pb_data/types.d.ts" />

// NaviBeta/PocketBase phase 1 optimization.
// Safe/non-destructive migration: no application records are removed.
// It prepares auth for the existing agent+PIN UX and adds indexes for hot queries.
migrate((app) => {
  const admin = `@request.auth.role = "admin" || @request.auth.role = "super_user"`;

  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("login_id")) {
    users.fields.add(new TextField({ name:"login_id", max:100 }));
  }
  if (!users.fields.getByName("must_change_pin")) {
    users.fields.add(new BoolField({ name:"must_change_pin" }));
  }

  // NaviSuite does not need real email addresses for the current agent+PIN flow.
  // PocketBase allows a custom unique identity field; login_id will contain the
  // stable legacy agent id. The client can keep sending the existing 64-char
  // SHA-256 PIN hash as the PocketBase password.
  const emailField = users.fields.getByName("email");
  if (emailField) emailField.required = false;
  users.addIndex("idx_users_login_id", true, "login_id", "login_id != ''");
  users.passwordAuth = { enabled:true, identityFields:["login_id", "email"] };

  // Use the long-form compatibility syntax rather than :changed. It means:
  // an agent may update their own auth record only if role, active state and
  // login id are either omitted from the request or kept equal to the stored value.
  // Admin/super_user can still manage these fields.
  users.updateRule = `(
    id = @request.auth.id &&
    (@request.body.role:isset = false || @request.body.role = role) &&
    (@request.body.attivo:isset = false || @request.body.attivo = attivo) &&
    (@request.body.login_id:isset = false || @request.body.login_id = login_id)
  ) || ${admin}`;
  app.save(users);

  const addIndex = (collectionName, name, unique, columns, where = "") => {
    const collection = app.findCollectionByNameOrId(collectionName);
    collection.addIndex(name, unique, columns, where);
    app.save(collection);
  };

  // Directory and calendar.
  addIndex("agenti", "idx_agenti_residenza_attivo_nome", false, "residenza, attivo, nome_completo");
  addIndex("turni", "idx_turni_stato_data", false, "stato, data");
  addIndex("turni", "idx_turni_data_stato_residenza", false, "data, stato, residenza");

  // Diaria: the existing unique (agente,data) index is optimal for the personal
  // monthly view; this reverse index speeds up admin/day-wide reads.
  addIndex("diaria", "idx_diaria_data_agente", false, "data, agente");

  // Change requests are normally filtered by one of the two participants.
  addIndex("cambi_turno", "idx_cambi_richiedente_stato_data", false, "richiedente, stato, data_richiedente");
  addIndex("cambi_turno", "idx_cambi_collega_stato_data", false, "collega, stato, data_collega");

  // ODS/manual variations are queried both by day and by agent.
  addIndex("variazioni", "idx_variazioni_agente_data", false, "agente, data");
  addIndex("variazioni", "idx_variazioni_stato_data", false, "stato, data");

  // Ship planning is displayed primarily by day/service; crew may also be
  // queried from the agent point of view.
  addIndex("navi", "idx_navi_attiva_residenza_nome", false, "attiva, residenza, nome");
  addIndex("turni_navi", "idx_turni_navi_data_servizio", false, "data, servizio");
  addIndex("turni_navi", "idx_turni_navi_data_nave", false, "data, nave");
  addIndex("equipaggi_turno_nave", "idx_equipaggi_agente_turno", false, "agente, turno_nave");

  // Admin online/activity view.
  addIndex("attivita_utenti", "idx_attivita_ultimo_contatto", false, "ultimo_contatto");
});
