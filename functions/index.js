const crypto = require("crypto");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

admin.initializeApp();
const db = admin.database();
const PROJECT_ID = process.env.GCLOUD_PROJECT || "navisuite-f116f";
const FEED_ORIGIN = `https://europe-west1-${PROJECT_ID}.cloudfunctions.net/calendarFeed`;

function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function randomToken() { return crypto.randomBytes(32).toString("base64url"); }
function clean(value) { return String(value || "").trim(); }
function isPinHash(value) { return /^[a-f0-9]{64}$/i.test(clean(value)); }
function sameHash(a, b) {
  if (!isPinHash(a) || !isPinHash(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a.toLowerCase()), Buffer.from(b.toLowerCase()));
}
function json(res, status, value) {
  res.status(status).set("Cache-Control", "no-store").json(value);
}
function cors(req, res) {
  res.set("Access-Control-Allow-Origin", "https://papamike80.github.io");
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}
function escapeText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const chunks = []; let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > 75) { chunks.push(current); current = " " + char; }
    else current += char;
  }
  chunks.push(current); return chunks.join("\r\n");
}
function localDateTime(date, minutes) {
  const [year, month, day] = date.split("-");
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}00`;
}
function stamp(date) { return new Date(date || Date.now()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function normalizeName(value) { return clean(value).toLocaleUpperCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.'’`]/g, "").replace(/\s+/g, " "); }
function normalizeShift(value) {
  const raw = clean(value).toUpperCase().replace(/[‐‑–—]/g, "-");
  if (!raw || /^(RIP\.?|RIPOSO|-{2,}|={2,})$/.test(raw)) return "RIP";
  if (/^(LAV\.?|TERRA)$/.test(raw)) return "TERRA";
  if (/^F\.?P\.?-*$/.test(raw)) return "F.P.";
  return raw.replace(/\*/g, "").replace(/--/g, "").replace(/\.{2,}$/g, ".").replace(/-+$/g, "");
}
function effectiveShift(raw) {
  const normalized = normalizeShift(raw);
  const match = normalized.match(/(?:^C)?([DRMP]\d|BIS|POND|PONM|AGB|AGM|AGT|T1|M1|DT|T2|CAR1?|CAP1?|SR1)(?:C|$)/i);
  return match ? match[1].toUpperCase() : normalized;
}
function isWorkShift(shift) { return !["", "RIP", "RIPOSO", "MALATTIA", "CON", "CONG", "CONG."].includes(String(shift || "").toUpperCase()); }
// Orari di presenza, coerenti con le competenze turni già usate da NaviBeta.
const TIMES = {
  D1:[7*60+55,20*60+15], D2:[7*60+20,18*60+25], D3:[7*60,19*60+20], D4:[7*60+15,19*60+45],
  T1:[7*60+20,19*60+55], T2:[7*60+20,18*60+49], M1:[7*60+20,19*60+50],
  R1:[7*60+20,19*60+35], R2:[7*60+20,19*60+35], R3:[7*60+20,18*60+40], R4:[7*60+20,19*60],
  CAR:[7*60+20,18*60+30], CAR1:[7*60+20,18*60+30], P1:[7*60+20,19*60+5], P2:[7*60+20,19*60+25], P3:[7*60+20,19*60+15],
  CAP:[7*60+20,19*60+15], CAP1:[7*60+20,19*60+15], SR1:[7*60+20,18*60+35],
  AGB:[7*60,17*60+25], AGM:[7*60,17*60+45], AGT:[7*60,19*60+10], DT:[6*60+55,17*60+15], POND:[9*60+10,20*60+25], PONM:[7*60,17*60+25], LD:[7*60,16*60]
};
function shiftTimes(shift) { return TIMES[String(shift || "").toUpperCase()] || [8*60,16*60]; }
function allAgents(schedule) { return Object.values(schedule?.residenze || {}).flat(); }
function agentFor(schedule, id) { return allAgents(schedule).find(agent => String(agent?.id || "") === String(id)); }
function dateList(schedule, agent) {
  const dates = new Set((schedule?.date || []).map(item => clean(item?.iso)).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)));
  Object.keys(agent?.turni || {}).forEach(date => dates.add(date));
  Object.values(agent?.turni_settimanali || {}).forEach((_, key) => {
    // Le date definitive sono sempre in schedule.date; questo ramo conserva compatibilità con import recenti.
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) dates.add(key);
  });
  return [...dates].sort();
}
function shiftAt(agent, date, schedule) {
  if (agent?.turni?.[date] !== undefined) return agent.turni[date];
  const item = (schedule?.date || []).find(row => row?.iso === date);
  const weekKey = item?.weekKey || item?.settimana || item?.week;
  const index = Number(item?.dayIndex ?? item?.giornoIndice ?? item?.indice);
  if (weekKey && Number.isInteger(index)) return agent?.turni_settimanali?.[weekKey]?.[index];
  // Formato compatibile con il calendario NaviBeta: ogni settimana contiene dateIso.
  for (const [key, shifts] of Object.entries(agent?.turni_settimanali || {})) {
    const match = (schedule?.settimane || schedule?.weeks || []).find(w => String(w?.key || "") === key);
    const indexInWeek = match?.dateIso?.indexOf(date);
    if (indexInWeek >= 0) return shifts[indexInWeek];
  }
  return "RIP";
}
function variationsFor(updates, agent, date) {
  const all = [...(updates?.odsVariations || []), ...(updates?.manualVariations || [])]
    .filter(item => item && item.attiva !== false && item.data === date)
    .filter(item => String(item.id_agente || "") === String(agent?.id || "") || normalizeName(item.agente) === normalizeName(agent?.agente));
  all.sort((a, b) => {
    const priority = item => String(item?.tipo || "").toUpperCase() === "MANUALE" ? (item?.requestId ? -1 : 1000000) : Number.parseInt(String(item?.ods || "").match(/\d+/)?.[0] || "0", 10);
    return priority(a) - priority(b);
  });
  return all.at(-1) || null;
}
// Stessa sorgente usata da assets/js/shared-data.js: gli import ODS scrivono
// il turno nella mappa per data prima che vengano applicate le variazioni.
function scheduleWithImports(schedule, updates) {
  const copy = JSON.parse(JSON.stringify(schedule || {}));
  const agents = allAgents(copy);
  const imports = Array.isArray(updates?.scheduleImports) ? updates.scheduleImports : [];
  imports.filter(batch => batch && batch.attiva !== false)
    .sort((a, b) => String(a.importedAt || "").localeCompare(String(b.importedAt || "")))
    .forEach(batch => (batch.rows || []).forEach(row => {
      const target = agents.find(agent => String(agent?.id || "") === String(row?.id_agente || "")) ||
        agents.find(agent => normalizeName(agent?.agente) === normalizeName(row?.agente));
      if (!target) return;
      target.turni = target.turni || {};
      (batch.dates || []).forEach((date, index) => { target.turni[date] = normalizeShift(row?.turni?.[index]); });
    }));
  return copy;
}
function revisionFor(shift, variation, updatedAt) {
  return parseInt(sha256(JSON.stringify({shift, variation:variation ? {n:variation.turno_nuovo,o:variation.turno_originale,r:variation.requestId,ods:variation.ods,t:variation.tipo} : null, updatedAt:String(updatedAt || "")})).slice(0, 8), 16);
}
function icsFor(agentId, schedule, updates) {
  schedule = scheduleWithImports(schedule, updates);
  const agent = agentFor(schedule, agentId);
  if (!agent) throw new Error("Agente non trovato nel turno corrente");
  // Mai l'ora della richiesta: altrimenti SEQUENCE/ETag cambierebbero senza
  // una modifica effettiva del turno.
  const modified = updates?.updatedAt || schedule?.updatedAt || "2000-01-01T00:00:00Z";
  const events = dateList(schedule, agent).map(date => {
    const variation = variationsFor(updates, agent, date);
    const shift = effectiveShift(variation?.turno_nuovo ?? shiftAt(agent, date, schedule));
    if (!isWorkShift(shift)) return null;
    const [start, end] = shiftTimes(shift);
    const uid = `${encodeURIComponent(String(agentId))}-${date}@navibeta`;
    const description = variation ? `Turno aggiornato${variation.ods ? ` · ${variation.ods}` : ""}` : "Turno NaviBeta";
    return [
      "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(modified)}`, `LAST-MODIFIED:${stamp(modified)}`,
      `SEQUENCE:${revisionFor(shift, variation, modified)}`, `DTSTART;TZID=Europe/Rome:${localDateTime(date, start)}`,
      `DTEND;TZID=Europe/Rome:${localDateTime(date, end)}`, `SUMMARY:${escapeText(`${shift} — NaviGarda`)}`,
      `DESCRIPTION:${escapeText(description)}`, "STATUS:CONFIRMED", "END:VEVENT"
    ];
  }).filter(Boolean).flat();
  const timezone = [
    "BEGIN:VTIMEZONE", "TZID:Europe/Rome", "X-LIC-LOCATION:Europe/Rome",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19810329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19961027T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"
  ];
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NaviBeta//Calendario turni//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Turni NaviBeta", "X-WR-TIMEZONE:Europe/Rome", ...timezone, ...events, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}

exports.calendarToken = onRequest({ region:"europe-west1" }, async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, {error:"Metodo non consentito"});
  const agentId = clean(req.body?.agentId), pinHash = clean(req.body?.pinHash), regenerate = req.body?.regenerate === true;
  if (!agentId || !sameHash(pinHash, pinHash)) return json(res, 400, {error:"Richiesta non valida"});
  const authSnap = await db.ref(`private/adminUpdates/userAuth/${agentId.replace(/[.#$\[\]/]/g, "_")}`).get();
  if (!sameHash(pinHash, authSnap.val()?.pinHash)) return json(res, 403, {error:"Sessione non verificata. Esci e accedi di nuovo."});
  const agentKey = agentId.replace(/[.#$\[\]/]/g, "_");
  const current = await db.ref(`private/calendarTokensByAgent/${agentKey}`).get();
  // "Rigenera" revoca ogni URL precedente; una prima configurazione su un
  // secondo dispositivo invece non deve interrompere il calendario già attivo.
  if (regenerate && current.exists()) {
    const hashes = Object.keys(current.val() || {});
    await Promise.all(hashes.map(hash => db.ref(`private/calendarTokens/${hash}`).remove()));
    await db.ref(`private/calendarTokensByAgent/${agentKey}`).remove();
  }
  const token = randomToken(), hash = sha256(token), now = new Date().toISOString();
  await Promise.all([
    db.ref(`private/calendarTokens/${hash}`).set({agentId, createdAt:now}),
    db.ref(`private/calendarTokensByAgent/${agentKey}/${hash}`).set({createdAt:now})
  ]);
  return json(res, 200, {calendarUrl:`${FEED_ORIGIN}?token=${encodeURIComponent(token)}`});
});

exports.calendarFeed = onRequest({ region:"europe-west1" }, async (req, res) => {
  const token = clean(req.query?.token);
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return res.status(404).set("Cache-Control", "no-store").end("Calendario non trovato");
  const record = (await db.ref(`private/calendarTokens/${sha256(token)}`).get()).val();
  if (!record?.agentId) return res.status(404).set("Cache-Control", "no-store").end("Calendario non trovato");
  const [scheduleSnap, updatesSnap] = await Promise.all([db.ref("public/schedule").get(), db.ref("private/adminUpdates").get()]);
  try {
    const body = icsFor(record.agentId, scheduleSnap.val() || {}, updatesSnap.val() || {});
    const etag = `"${sha256(body)}"`;
    const lastModified = updatesSnap.val()?.updatedAt || scheduleSnap.val()?.updatedAt || "2000-01-01T00:00:00Z";
    res.set({"Content-Type":"text/calendar; charset=utf-8", "Cache-Control":"private, max-age=300, must-revalidate", "ETag":etag, "Last-Modified":new Date(lastModified).toUTCString(), "X-Content-Type-Options":"nosniff"});
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    if (String(req.query?.download || "") === "1") res.set("Content-Disposition", "attachment; filename=navibeta-turni.ics");
    return res.status(200).send(body);
  } catch (error) {
    console.error("calendar feed", error);
    return res.status(500).set("Cache-Control", "no-store").end("Calendario non disponibile");
  }
});
