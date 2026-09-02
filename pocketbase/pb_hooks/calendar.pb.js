/// <reference path="../pb_data/types.d.ts" />

// NaviSuite V2 personal calendar feed.
// Management endpoints require PocketBase auth.
// The .ics endpoint is intentionally unauthenticated and protected by a long random token.

const CALENDAR_COLLECTION = "calendar_subscriptions";
const CALENDAR_ROUTE_BASE = "/api/navisuite/v2/calendar";

function calendarAgentForAuth(app, auth) {
  if (!auth || !auth.id) {
    throw new UnauthorizedError("Sessione non valida.");
  }
  try {
    return app.findFirstRecordByData("agenti", "user", auth.id);
  } catch {
    throw new NotFoundError("Profilo agente non trovato.");
  }
}

function calendarSubscriptionForAgent(app, agent, createIfMissing) {
  try {
    return app.findFirstRecordByData(CALENDAR_COLLECTION, "agente", agent.id);
  } catch (error) {
    if (!createIfMissing) throw error;
  }

  const collection = app.findCollectionByNameOrId(CALENDAR_COLLECTION);
  const record = new Record(collection);
  record.set("agente", agent.id);
  record.set("token", $security.randomString(56));
  record.set("attivo", true);
  record.set("includi_nave", true);
  record.set("includi_equipaggio", true);
  record.set("includi_ormeggio", true);
  record.set("includi_rifornimento", true);
  record.set("giorni_passati", 120);
  record.set("giorni_futuri", 400);
  app.save(record);
  return record;
}

function calendarPublicBaseUrl(e) {
  const configured = String($os.getenv("NAVISUITE_CALENDAR_PUBLIC_BASE_URL") || "").trim().replace(/\/+$/, "");
  if (configured) return configured;

  const forwardedProto = String(e.request.header.get("X-Forwarded-Proto") || "").split(",")[0].trim();
  const forwardedHost = String(e.request.header.get("X-Forwarded-Host") || "").split(",")[0].trim();
  const scheme = forwardedProto || (e.isTLS() ? "https" : "http");
  const host = forwardedHost || String(e.request.host || "");
  return `${scheme}://${host}`;
}

function calendarSettingsPayload(e, record) {
  const base = calendarPublicBaseUrl(e);
  const token = record.getString("token");
  return {
    attivo: record.getBool("attivo"),
    includi_nave: record.getBool("includi_nave"),
    includi_equipaggio: record.getBool("includi_equipaggio"),
    includi_ormeggio: record.getBool("includi_ormeggio"),
    includi_rifornimento: record.getBool("includi_rifornimento"),
    giorni_passati: record.getInt("giorni_passati"),
    giorni_futuri: record.getInt("giorni_futuri"),
    feed_url: `${base}${CALENDAR_ROUTE_BASE}/${token}.ics`,
    public_base_configured: Boolean(String($os.getenv("NAVISUITE_CALENDAR_PUBLIC_BASE_URL") || "").trim()),
  };
}

function boolFromBody(body, key, fallback) {
  if (!body || typeof body[key] !== "boolean") return fallback;
  return body[key];
}

function clampInt(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function dateOnlyUtc(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function pbDate(day) {
  return `${day} 00:00:00.000Z`;
}

function icsEscape(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function icsDate(day) {
  return String(day || "").replace(/-/g, "");
}

function icsTimestamp(value) {
  const parsed = value ? new Date(value) : new Date();
  const date = isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsFold(line) {
  const text = String(line);
  if (text.length <= 73) return text;
  const chunks = [];
  for (let i = 0; i < text.length; i += 73) {
    chunks.push(`${i ? " " : ""}${text.slice(i, i + 73)}`);
  }
  return chunks.join("\r\n");
}

function icsLine(name, value) {
  return `${name}:${icsEscape(value)}`;
}

function safeFindRecords(app, collection, filter, sort, limit, params) {
  try {
    return app.findRecordsByFilter(collection, filter, sort || "", limit || 0, 0, params || {});
  } catch {
    return [];
  }
}

function shipLookup(app) {
  const records = safeFindRecords(app, "navi", "attiva = true", "nome", 0, {});
  const byId = {};
  const byName = {};
  for (const ship of records) {
    const name = ship.getString("nome").trim();
    byId[ship.id] = name;
    if (name) byName[name.toLowerCase()] = ship.id;
  }
  return { byId, byName };
}

function findShipTurnForEvent(app, turn, ships) {
  const day = turn.getString("data").slice(0, 10);
  const service = turn.getString("servizio").trim();
  if (!day || !service) return null;

  const candidates = safeFindRecords(
    app,
    "turni_navi",
    "data = {:date} && servizio = {:service}",
    "",
    20,
    { date: pbDate(day), service }
  );
  if (!candidates.length) return null;

  const effectiveShip = turn.getString("nave").trim().toLowerCase();
  if (effectiveShip) {
    const wantedId = ships.byName[effectiveShip];
    const exact = candidates.find(item => item.getString("nave") === wantedId);
    if (exact) return exact;
  }

  return candidates[0];
}

function crewForShipTurn(app, shipTurn, fallbackTurns, agentNames, currentAgentId) {
  const crewRows = safeFindRecords(
    app,
    "equipaggi_turno_nave",
    "turno_nave = {:turno}",
    "grado_assegnato",
    0,
    { turno: shipTurn.id }
  );

  if (crewRows.length) {
    return crewRows.map(row => {
      const agentId = row.getString("agente");
      const name = agentNames[agentId] || "Agente";
      const grade = row.getString("grado_assegnato").trim();
      return `${grade ? `${grade} · ` : ""}${name}`;
    });
  }

  const day = shipTurn.getString("data").slice(0, 10);
  const service = shipTurn.getString("servizio").trim();
  return fallbackTurns
    .filter(turn => turn.getString("data").slice(0, 10) === day && turn.getString("servizio").trim() === service)
    .map(turn => {
      const agentId = turn.getString("agente");
      const name = agentNames[agentId] || (agentId === currentAgentId ? "Tu" : "Agente");
      return name;
    });
}

function calendarEventDescription(app, turn, subscription, context) {
  const service = turn.getString("servizio").trim() || "Servizio";
  const details = [`Servizio: ${service}`];
  const shipTurn = findShipTurnForEvent(app, turn, context.ships);

  if (subscription.getBool("includi_nave")) {
    let ship = turn.getString("nave").trim();
    if (!ship && shipTurn) ship = context.ships.byId[shipTurn.getString("nave")] || "";
    if (ship) details.push(`Nave: ${ship}`);
  }

  if (subscription.getBool("includi_equipaggio") && shipTurn) {
    const crew = crewForShipTurn(app, shipTurn, context.allTurns, context.agentNames, turn.getString("agente"));
    if (crew.length) {
      details.push("", "Equipaggio:", ...crew.map(name => `• ${name}`));
    }
  }

  if (subscription.getBool("includi_ormeggio") && shipTurn) {
    const mooring = shipTurn.getString("ormeggio_serale").trim();
    if (mooring) details.push("", `Ormeggio serale: ${mooring}`);
  }

  if (subscription.getBool("includi_rifornimento") && shipTurn && shipTurn.getBool("rifornimento_mattina")) {
    details.push("", "Rifornimento: previsto");
  }

  return details.join("\n");
}

function calendarEventSummary(app, turn, subscription, ships) {
  const service = turn.getString("servizio").trim() || "Servizio";
  if (!subscription.getBool("includi_nave")) return service;
  let ship = turn.getString("nave").trim();
  if (!ship) {
    const shipTurn = findShipTurnForEvent(app, turn, ships);
    if (shipTurn) ship = ships.byId[shipTurn.getString("nave")] || "";
  }
  return ship ? `${service} · ${ship}` : service;
}

routerAdd("GET", `${CALENDAR_ROUTE_BASE}/settings`, (e) => {
  const agent = calendarAgentForAuth(e.app, e.auth);
  const subscription = calendarSubscriptionForAgent(e.app, agent, true);
  return e.json(200, calendarSettingsPayload(e, subscription));
}, $apis.requireAuth("users"));

routerAdd("POST", `${CALENDAR_ROUTE_BASE}/settings`, (e) => {
  const agent = calendarAgentForAuth(e.app, e.auth);
  const subscription = calendarSubscriptionForAgent(e.app, agent, true);
  const body = e.requestInfo().body || {};

  subscription.set("attivo", boolFromBody(body, "attivo", subscription.getBool("attivo")));
  subscription.set("includi_nave", boolFromBody(body, "includi_nave", subscription.getBool("includi_nave")));
  subscription.set("includi_equipaggio", boolFromBody(body, "includi_equipaggio", subscription.getBool("includi_equipaggio")));
  subscription.set("includi_ormeggio", boolFromBody(body, "includi_ormeggio", subscription.getBool("includi_ormeggio")));
  subscription.set("includi_rifornimento", boolFromBody(body, "includi_rifornimento", subscription.getBool("includi_rifornimento")));
  subscription.set("giorni_passati", clampInt(body.giorni_passati, subscription.getInt("giorni_passati"), 0, 730));
  subscription.set("giorni_futuri", clampInt(body.giorni_futuri, subscription.getInt("giorni_futuri"), 28, 730));
  e.app.save(subscription);

  return e.json(200, calendarSettingsPayload(e, subscription));
}, $apis.requireAuth("users"));

routerAdd("POST", `${CALENDAR_ROUTE_BASE}/regenerate`, (e) => {
  const agent = calendarAgentForAuth(e.app, e.auth);
  const subscription = calendarSubscriptionForAgent(e.app, agent, true);
  subscription.set("token", $security.randomString(56));
  e.app.save(subscription);
  return e.json(200, calendarSettingsPayload(e, subscription));
}, $apis.requireAuth("users"));

routerAdd("GET", `${CALENDAR_ROUTE_BASE}/{token}.ics`, (e) => {
  const token = String(e.request.pathValue("token") || "");
  if (token.length < 48) throw new NotFoundError("Calendario non trovato.");

  let subscription;
  try {
    subscription = e.app.findFirstRecordByData(CALENDAR_COLLECTION, "token", token);
  } catch {
    throw new NotFoundError("Calendario non trovato.");
  }
  if (!subscription.getBool("attivo")) {
    throw new NotFoundError("Calendario non attivo.");
  }

  const agent = e.app.findRecordById("agenti", subscription.getString("agente"));
  const pastDays = clampInt(subscription.getInt("giorni_passati"), 120, 0, 730);
  const futureDays = clampInt(subscription.getInt("giorni_futuri"), 400, 28, 730);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const startDay = dateOnlyUtc(addUtcDays(today, -pastDays));
  const endDay = dateOnlyUtc(addUtcDays(today, futureDays));

  const personalTurns = safeFindRecords(
    e.app,
    "turni_effective",
    "agente = {:agent} && data >= {:start} && data <= {:end} && stato != 'annullato'",
    "data",
    0,
    { agent: agent.id, start: pbDate(startDay), end: pbDate(endDay) }
  );

  const allTurns = subscription.getBool("includi_equipaggio")
    ? safeFindRecords(
        e.app,
        "turni_effective",
        "data >= {:start} && data <= {:end} && stato != 'annullato'",
        "data",
        0,
        { start: pbDate(startDay), end: pbDate(endDay) }
      )
    : personalTurns;

  const agentIds = {};
  for (const turn of allTurns) agentIds[turn.getString("agente")] = true;
  const agentNames = {};
  const ids = Object.keys(agentIds);
  if (ids.length) {
    for (const record of e.app.findRecordsByIds("agenti", ids)) {
      agentNames[record.id] = record.getString("nome_completo").trim();
    }
  }

  const ships = shipLookup(e.app);
  const context = { allTurns, agentNames, ships };
  const calendarName = `NaviSuite · ${agent.getString("nome_completo").trim() || "Turni"}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NaviSuite V2//Calendario turni//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    icsLine("X-WR-CALNAME", calendarName),
    "X-WR-TIMEZONE:Europe/Rome",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const turn of personalTurns) {
    const day = turn.getString("data").slice(0, 10);
    if (!day) continue;
    const nextDay = dateOnlyUtc(addUtcDays(new Date(`${day}T12:00:00Z`), 1));
    lines.push(
      "BEGIN:VEVENT",
      icsLine("UID", `navisuite-v2-${agent.id}-${day}@calendar`),
      `DTSTAMP:${icsTimestamp(new Date())}`,
      `DTSTART;VALUE=DATE:${icsDate(day)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay)}`,
      icsLine("SUMMARY", calendarEventSummary(e.app, turn, subscription, ships)),
      icsLine("DESCRIPTION", calendarEventDescription(e.app, turn, subscription, context)),
      `SEQUENCE:${Math.max(0, turn.getInt("versione"))}`,
      `LAST-MODIFIED:${icsTimestamp(turn.getString("updated"))}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR", "");
  const body = lines.map(icsFold).join("\r\n");
  e.response.header().set("Cache-Control", "private, max-age=300");
  if (String(e.request.url.query().get("download") || "") === "1") {
    e.response.header().set("Content-Disposition", 'attachment; filename="navisuite-turni.ics"');
  }
  return e.blob(200, "text/calendar; charset=utf-8", toBytes(body));
});
