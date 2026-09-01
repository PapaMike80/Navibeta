/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const signedIn = `@request.auth.id != ""`;
  const admin = `@request.auth.role = "admin" || @request.auth.role = "super_user"`;
  const effective = app.findCollectionByNameOrId("turni_effective");
  const agenti = app.findCollectionByNameOrId("agenti");
  const users = app.findCollectionByNameOrId("users");

  const collection = new Collection({
    type: "base",
    name: "turni_effective_eventi",
    fields: [
      { type:"relation", name:"turno_effective", collectionId:effective.id, maxSelect:1, required:true, cascadeDelete:true },
      { type:"relation", name:"agente", collectionId:agenti.id, maxSelect:1, required:true, cascadeDelete:true },
      { type:"date", name:"data", required:true },
      { type:"text", name:"servizio_precedente", max:80 },
      { type:"text", name:"servizio_nuovo", required:true, max:80 },
      { type:"select", name:"tipo", values:["manuale","ods","cambio_turno","import"], maxSelect:1, required:true },
      { type:"relation", name:"autore", collectionId:users.id, maxSelect:1, required:false, cascadeDelete:false },
      { type:"text", name:"note", max:2000 },
      { type:"json", name:"meta" },
    ],
    indexes: [
      "CREATE INDEX idx_turni_effective_eventi_turno ON turni_effective_eventi (turno_effective, created)",
      "CREATE INDEX idx_turni_effective_eventi_agent_date ON turni_effective_eventi (agente, data)",
    ],
    listRule: admin,
    viewRule: admin,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });
  app.save(collection);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("turni_effective_eventi")); } catch (_) {}
});
