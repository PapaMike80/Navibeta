/// <reference path="../pb_data/types.d.ts" />

// Minimal public directory used only before authentication.
// It intentionally contains no PIN/hash/email/private profile data.
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "login_directory",
    fields: [
      { type:"text", name:"login_id", required:true, max:100 },
      { type:"text", name:"nome_visualizzato", required:true, max:160 },
      { type:"text", name:"residenza", max:80 },
      { type:"bool", name:"attivo" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_login_directory_login_id ON login_directory (login_id)",
      "CREATE INDEX idx_login_directory_name ON login_directory (nome_visualizzato)",
    ],
    listRule: "attivo = true",
    viewRule: "attivo = true",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });
  app.save(collection);
});
