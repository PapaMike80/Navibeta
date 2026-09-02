/// <reference path="../pb_data/types.d.ts" />

// NaviSuite V2 personal iCalendar subscriptions.
// Tokens and preferences are server-managed through pb_hooks custom routes.
migrate((app) => {
  const agenti = app.findCollectionByNameOrId("agenti");

  const collection = new Collection({
    type: "base",
    name: "calendar_subscriptions",
    fields: [
      {
        type: "relation",
        name: "agente",
        collectionId: agenti.id,
        maxSelect: 1,
        required: true,
        cascadeDelete: true,
      },
      { type: "text", name: "token", required: true, min: 48, max: 80 },
      { type: "bool", name: "attivo" },
      { type: "bool", name: "includi_nave" },
      { type: "bool", name: "includi_equipaggio" },
      { type: "bool", name: "includi_ormeggio" },
      { type: "bool", name: "includi_rifornimento" },
      { type: "number", name: "giorni_passati", min: 0, max: 730, onlyInt: true },
      { type: "number", name: "giorni_futuri", min: 28, max: 730, onlyInt: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_calendar_subscriptions_agent ON calendar_subscriptions (agente)",
      "CREATE UNIQUE INDEX idx_calendar_subscriptions_token ON calendar_subscriptions (token)",
    ],
    // The browser never accesses this collection directly.
    // Authenticated management and public token lookup are exposed only by pb_hooks routes.
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  app.save(collection);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("calendar_subscriptions"));
  } catch {
    // Already removed.
  }
});
