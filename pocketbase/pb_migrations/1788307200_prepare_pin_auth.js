/// <reference path="../pb_data/types.d.ts" />

// NaviBeta/PocketBase phase 2: prepare the existing users auth collection
// for the current NaviSuite agent + 4-digit PIN UX.
//
// The browser will continue hashing NaviDiaria:<PIN> with SHA-256 and the
// resulting 64-char hex digest will be used as the PocketBase password.
// login_id is the stable legacy agent id. No application records are deleted.
migrate((app) => {
  const admin = `@request.auth.role = "admin" || @request.auth.role = "super_user"`;

  const users = app.findCollectionByNameOrId("users");

  if (!users.fields.getByName("login_id")) {
    users.fields.add(new TextField({ name: "login_id", max: 100 }));
  }
  if (!users.fields.getByName("must_change_pin")) {
    users.fields.add(new BoolField({ name: "must_change_pin" }));
  }

  // Password identity fields must be backed by a UNIQUE index.
  // Keep email as a secondary identity for administration/recovery; provisioned
  // agent accounts use deterministic @navisuite.invalid placeholder addresses.
  users.addIndex("idx_users_login_id", true, "login_id", "login_id != ''");
  app.save(users);

  const refreshed = app.findCollectionByNameOrId("users");
  refreshed.passwordAuth = {
    enabled: true,
    identityFields: ["login_id", "email"],
  };

  // An ordinary user can update their own safe auth fields, but cannot submit
  // role/active/login identity values. Superusers bypass rules and app admins
  // keep explicit management rights through the role rule.
  refreshed.updateRule = `(
    id = @request.auth.id &&
    @request.body.role:isset = false &&
    @request.body.attivo:isset = false &&
    @request.body.login_id:isset = false
  ) || ${admin}`;
  refreshed.deleteRule = admin;
  refreshed.manageRule = admin;
  refreshed.authRule = `attivo = true`;
  app.save(refreshed);
});
