/// <reference path="../pb_data/types.d.ts" />

// Ponte Radio / Web Push registry for the PocketBase-only NaviSuite V2 runtime.
// No Firebase dependency. Normal clients authenticate as PocketBase users.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const agenti = app.findCollectionByNameOrId("agenti");
  const signedIn = `@request.auth.id != ""`;
  const admin = `@request.auth.role = "admin" || @request.auth.role = "super_user"`;

  const subscriptions = new Collection({
    type: "base",
    name: "push_subscriptions",
    listRule: signedIn,
    viewRule: signedIn,
    createRule: `user = @request.auth.id`,
    updateRule: `user = @request.auth.id`,
    deleteRule: `user = @request.auth.id || ${admin}`,
    fields: [
      { type:"relation", name:"user", collectionId:users.id, maxSelect:1, required:true, cascadeDelete:true },
      { type:"relation", name:"agente", collectionId:agenti.id, maxSelect:1, required:true, cascadeDelete:true },
      { type:"text", name:"device_id", required:true, max:160 },
      { type:"text", name:"device_label", max:80 },
      { type:"url", name:"endpoint", required:true },
      { type:"text", name:"p256dh", required:true, max:512 },
      { type:"text", name:"auth_key", required:true, max:512 },
      { type:"bool", name:"enabled" },
      { type:"number", name:"vapid_version", min:0, onlyInt:true },
      { type:"json", name:"preferences" }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_push_subscription_device ON push_subscriptions (agente, device_id)",
      "CREATE INDEX idx_push_subscription_enabled ON push_subscriptions (agente, enabled)"
    ]
  });
  app.save(subscriptions);

  const queue = new Collection({
    type: "base",
    name: "push_queue",
    listRule: `requested_by = @request.auth.id || ${admin}`,
    viewRule: `requested_by = @request.auth.id || ${admin}`,
    createRule: `requested_by = @request.auth.id`,
    updateRule: null,
    deleteRule: admin,
    fields: [
      { type:"relation", name:"requested_by", collectionId:users.id, maxSelect:1, required:true },
      { type:"relation", name:"sender_agent", collectionId:agenti.id, maxSelect:1, required:true },
      { type:"relation", name:"target_agent", collectionId:agenti.id, maxSelect:1 },
      { type:"bool", name:"broadcast" },
      { type:"select", name:"kind", values:["ponteradio","custom","summary","shift_change","ods"], maxSelect:1, required:true },
      { type:"select", name:"status", values:["pending","processing","sent","partial","failed"], maxSelect:1, required:true },
      { type:"text", name:"title", required:true, max:120 },
      { type:"text", name:"body", required:true, max:500 },
      { type:"url", name:"url" },
      { type:"json", name:"meta" },
      { type:"text", name:"error", max:2000 },
      { type:"date", name:"processed_at" }
    ],
    indexes: [
      "CREATE INDEX idx_push_queue_status ON push_queue (status)",
      "CREATE INDEX idx_push_queue_target ON push_queue (target_agent)"
    ]
  });
  app.save(queue);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("push_queue")); } catch (_) {}
  try { app.delete(app.findCollectionByNameOrId("push_subscriptions")); } catch (_) {}
});
