/// <reference path="../pb_data/types.d.ts" />

// Ponte Radio is exposed through authenticated server routes in pb_hooks.
// Raw Web Push endpoints/keys and queue mutation are never exposed to normal clients.
migrate((app) => {
  const subscriptions = app.findCollectionByNameOrId("push_subscriptions");
  subscriptions.listRule = null;
  subscriptions.viewRule = null;
  subscriptions.createRule = null;
  subscriptions.updateRule = null;
  subscriptions.deleteRule = null;
  app.save(subscriptions);

  const queue = app.findCollectionByNameOrId("push_queue");
  queue.listRule = null;
  queue.viewRule = null;
  queue.createRule = null;
  queue.updateRule = null;
  queue.deleteRule = null;
  app.save(queue);
}, (app) => {
  const signedIn = `@request.auth.id != ""`;
  const admin = `@request.auth.role = "admin" || @request.auth.role = "super_user"`;

  const subscriptions = app.findCollectionByNameOrId("push_subscriptions");
  subscriptions.listRule = signedIn;
  subscriptions.viewRule = signedIn;
  subscriptions.createRule = `user = @request.auth.id`;
  subscriptions.updateRule = `user = @request.auth.id`;
  subscriptions.deleteRule = `user = @request.auth.id || ${admin}`;
  app.save(subscriptions);

  const queue = app.findCollectionByNameOrId("push_queue");
  queue.listRule = `requested_by = @request.auth.id || ${admin}`;
  queue.viewRule = `requested_by = @request.auth.id || ${admin}`;
  queue.createRule = `requested_by = @request.auth.id`;
  queue.updateRule = null;
  queue.deleteRule = admin;
  app.save(queue);
});
