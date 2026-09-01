/// <reference path="../pb_data/types.d.ts" />

// NaviBeta/PocketBase phase 1 optimization.
// Safe/non-destructive migration: no application records are removed.
// Auth changes are intentionally postponed to a dedicated migration after
// auditing the real PocketBase auth collection currently in use.
migrate((app) => {
  const addIndexIfPossible = (collectionName, name, unique, columns, where = "") => {
    try {
      const collection = app.findCollectionByNameOrId(collectionName);
      collection.addIndex(name, unique, columns, where);
      app.save(collection);
      console.log(`[navibeta-opt] index ready: ${collectionName}.${name}`);
    } catch (error) {
      // Missing optional collections or already-existing compatible indexes must
      // not abort this non-destructive optimization phase. The later audit will
      // report the actual database shape before any runtime integration.
      console.log(`[navibeta-opt] skipped: ${collectionName}.${name}: ${error}`);
    }
  };

  // Directory and calendar.
  addIndexIfPossible("agenti", "idx_agenti_residenza_attivo_nome", false, "residenza, attivo, nome_completo");
  addIndexIfPossible("turni", "idx_turni_stato_data", false, "stato, data");
  addIndexIfPossible("turni", "idx_turni_data_stato_residenza", false, "data, stato, residenza");

  // Diaria: the existing unique (agente,data) index is optimal for the personal
  // monthly view; this reverse index speeds up admin/day-wide reads.
  addIndexIfPossible("diaria", "idx_diaria_data_agente", false, "data, agente");

  // Change requests are normally filtered by one of the two participants.
  addIndexIfPossible("cambi_turno", "idx_cambi_richiedente_stato_data", false, "richiedente, stato, data_richiedente");
  addIndexIfPossible("cambi_turno", "idx_cambi_collega_stato_data", false, "collega, stato, data_collega");

  // ODS/manual variations are queried both by day and by agent.
  addIndexIfPossible("variazioni", "idx_variazioni_agente_data", false, "agente, data");
  addIndexIfPossible("variazioni", "idx_variazioni_stato_data", false, "stato, data");

  // Ship planning is displayed primarily by day/service; crew may also be
  // queried from the agent point of view.
  addIndexIfPossible("navi", "idx_navi_attiva_residenza_nome", false, "attiva, residenza, nome");
  addIndexIfPossible("turni_navi", "idx_turni_navi_data_servizio", false, "data, servizio");
  addIndexIfPossible("turni_navi", "idx_turni_navi_data_nave", false, "data, nave");
  addIndexIfPossible("equipaggi_turno_nave", "idx_equipaggi_agente_turno", false, "agente, turno_nave");

  // Admin online/activity view.
  addIndexIfPossible("attivita_utenti", "idx_attivita_ultimo_contatto", false, "ultimo_contatto");
});
