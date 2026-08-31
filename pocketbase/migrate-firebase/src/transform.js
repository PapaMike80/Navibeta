const values = input => Array.isArray(input) ? input.filter(value => value != null) : Object.entries(input || {}).map(([key, value]) => ({ __key:key, ...(value || {}) }));
const clean = value => String(value ?? "").trim();
const isoDate = value => /^\d{4}-\d{2}-\d{2}/.test(clean(value)) ? clean(value).slice(0, 10) + " 00:00:00.000Z" : "";
const isoTime = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString().replace("T", " ") : "";
const minutes = value => Math.max(0, Math.round(Number(value) || 0));
const slug = value => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "VUOTO";
const stableId = (...parts) => parts.map(slug).join(":").slice(0, 180);
const dedupe = (records, key = record => record.legacy_id) => [...new Map(records.map(record => [key(record), record])).values()];
const role = value => {
  const normalized = clean(value).toLowerCase().replace(/[ _-]+/g, "_");
  if (["superuser", "super_user"].includes(normalized)) return "super_user";
  return normalized === "admin" ? "admin" : "agente";
};

export function rootNodes(root) {
  const admin = root?.private?.adminUpdates || {};
  return { schedule:root?.public?.schedule || {}, changes:root?.private?.changeRequests || {}, admin };
}

export function transformAgents(root) {
  const { schedule, admin } = rootNodes(root); const byId = new Map();
  Object.entries(schedule.residenze || {}).forEach(([residenza, agents]) => values(agents).forEach(agent => {
    const legacy = clean(agent.id || agent.agentId || agent.__key); if (!legacy) return;
    byId.set(legacy, { legacy_id:legacy, nome_completo:clean(agent.agente || agent.name || legacy), matricola:clean(agent.matricola), grado:clean(agent.qualifica), residenza:clean(agent.residence || agent.residenza || residenza), ruolo:role(agent.role), attivo:agent.attivo !== false, permessi_speciali:{ barista:Boolean(agent.barista || residenza === "BARISTE"), specialVisibility:agent.specialVisibility || null }, legacy_source:"public/schedule/residenze" });
  }));
  Object.entries(admin.agentProfiles || {}).forEach(([key, profile]) => {
    const legacy = clean(profile?.id || key); const previous = byId.get(legacy) || {};
    byId.set(legacy, { ...previous, legacy_id:legacy, nome_completo:clean(profile?.name || previous.nome_completo || legacy), grado:clean(profile?.qualifica || previous.grado), residenza:clean(profile?.residence || previous.residenza), ruolo:role(profile?.role || previous.ruolo), attivo:profile?.attivo !== false, permessi_speciali:previous.permessi_speciali || {}, legacy_source:previous.legacy_source ? previous.legacy_source + "+agentProfiles" : "agentProfiles" });
  });
  return [...byId.values()];
}

export function transformImports(root) {
  const { admin } = rootNodes(root);
  return values(admin.scheduleImports).map((item, index) => ({ legacy_id:clean(item.id || item.__key || `import-${index}`), nome_file:clean(item.filename || item.titolo), tipo:clean(item.tipo || item.source || "turni"), hash_sorgente:clean(item.identityVersion ? `${item.id}:${item.identityVersion}` : item.id || item.__key), stato:item.attiva === false ? "parziale" : "importata", periodo_inizio:isoDate(item.inizio), periodo_fine:isoDate(item.fine), importata_il:isoTime(item.importedAt), record_letti:Array.isArray(item.rows) ? item.rows.length : minutes(item.rows), metadati:item, note:clean(item.sheetName) }));
}

export function transformTurns(root) {
  const { schedule } = rootNodes(root); const out = [];
  Object.entries(schedule.residenze || {}).forEach(([residenza, agents]) => values(agents).forEach(agent => {
    const agentId = clean(agent.id || agent.agentId || agent.__key); if (!agentId) return;
    Object.entries(agent.turni || {}).forEach(([date, shift]) => {
      if (!isoDate(date) || !clean(shift)) return;
      out.push({ __agentLegacyId:agentId, legacy_id:stableId("turno", agentId, date), data:isoDate(date), servizio:clean(shift), codice_turno:clean(shift), residenza:clean(residenza), origine:"calendario", stato:"pubblicato", variazione:false, legacy_payload:{ source:"public/schedule/residenze", value:shift } });
    });
  }));
  return dedupe(out);
}

export function transformDiaria(root) {
  const { admin } = rootNodes(root); const out = [];
  Object.entries(admin.diaria || {}).forEach(([agentId, archive]) => values(archive?.entries).forEach(entry => {
    const owner = clean(archive?.agentId || agentId); const date = clean(entry.date); const overtime = entry.overtimeComponents || {};
    const service = minutes(entry.serviceMinutes); const hasWorked = Number.isFinite(Number(entry.workedMinutes));
    out.push({ __agentLegacyId:owner, legacy_id:stableId("diaria", owner, date), data:isoDate(date), servizio:clean(entry.shift), ore_servizio_minuti:service, ore_lavorate_minuti:hasWorked ? minutes(entry.workedMinutes) : service + minutes(overtime.ordinario ?? entry.delay) + minutes(overtime.cambi ?? entry.changeMinutes) + minutes(overtime.sentine ?? entry.sentineActivity?.minutes), ore_lavorate_override:Boolean(entry.overtimeMeta?.workedMode === "manual" || hasWorked), straordinario_ritardo_minuti:minutes(overtime.ordinario ?? entry.delay), straordinario_cambio_minuti:minutes(overtime.cambi ?? entry.changeMinutes), straordinario_sentine_minuti:minutes(overtime.sentine ?? entry.sentineActivity?.minutes), tipo_sentine:clean(entry.sentineActivity?.type), banca_ore_minuti:minutes(entry.bank), diaria_percentuale:clean(entry.allowanceRate ?? "0"), pernotto_40:Boolean(entry.overnight40), festivita_lavorata:Boolean(entry.holidayWorked), ticket_dovuto:entry.ticketPresence !== undefined || entry.mealUsed !== undefined, ticket_usato:Boolean(entry.ticketPresence ?? entry.mealUsed), secondo_ticket:Boolean(Number(entry.secondMeal)), indennita_imbarco:Boolean(entry.embark), indennita_aliscafo:minutes(entry.hydrofoil), presenza:!["RIP","RIPOSO","MAL","MALATTIA"].includes(clean(entry.shift).toUpperCase()), trasferta_minuti:entry.travel ? 120 : 0, rifornimento:Boolean(entry.refuel), parametro_139:Boolean(entry.parametro139 || entry.par139), maneggio_denaro:Boolean(entry.cashHandling), override_manuale:Boolean(entry.manualOverride), note:clean(entry.note), legacy_payload:entry });
  }));
  return dedupe(out);
}

export function transformChanges(root) {
  const { changes, admin } = rootNodes(root);
  const approved = new Set(values(admin.approvedChangeRequests).flatMap(x => [clean(x.id || x.requestId), clean(x.__key)]).filter(Boolean));
  const deleted = new Map(values(admin.deletedChangeRequests).map(x => [clean(x.requestId || x.__key), x]));
  return values(changes).map(item => {
    const id = clean(item.id || item.__key); const removed = deleted.get(id); const raw = removed ? "cancelled" : approved.has(id) ? "approved" : clean(item.status || "pending").toLowerCase();
    return { legacy_id:id, __requesterLegacyId:clean(item.agentId), __colleagueLegacyId:clean(item.colleagueId), data_richiedente:isoDate(item.date || item.agentDate), data_collega:isoDate(item.colleagueDate), turno_richiedente:clean(item.shift || item.agentShift), turno_collega:clean(item.colleagueShift), stato:["pending","accepted","approved","rejected","cancelled"].includes(raw) ? raw : "pending", inviata_il:isoTime(item.sentAt), accettata_il:isoTime(item.acceptedAt), approvata_il:isoTime(item.approvedAt), rifiutata_il:isoTime(item.rejectedAt), annullata_il:isoTime(removed?.deletedAt), note:clean(item.note), legacy_payload:item };
  });
}

const variationRecords = (source, origin) => values(source).map((item, index) => {
  const agent = clean(item.id_agente || item.agentId); const date = clean(item.data || item.date);
  return { __agentLegacyId:agent, legacy_id:stableId("variazione", origin, item.requestId || item.__key || index, agent, date, item.turno_nuovo), data:isoDate(date), da_servizio:clean(item.turno_originale), a_servizio:clean(item.turno_nuovo), origine:origin, stato:item.attiva === false ? "annullata" : "applicata", note:clean(item.note), legacy_payload:item };
}).filter(item => item.data);

export function transformVariations(root) {
  const { schedule, admin } = rootNodes(root);
  return dedupe([...variationRecords(schedule.variazioni_ods, "ods_ufficio"), ...variationRecords(admin.odsVariations, "ods_ufficio"), ...variationRecords(admin.manualVariations, "manuale")], item => stableId(item.__agentLegacyId, item.data, item.da_servizio, item.a_servizio, item.origine));
}

// The public schedule is the approved ship roster. Some legacy admin imports contain
// malformed agent-table rows in the `nave` field, so they are only a fallback.
const shipRows = root => {
  const { schedule, admin } = rootNodes(root);
  const approved = values(schedule.turni_navi).filter(item => clean(item.nave));
  return approved.length ? approved : values(admin.turniNavi).filter(item => clean(item.nave) && clean(item.nave).length <= 80);
};
export function transformShips(root) {
  return dedupe(shipRows(root).map(item => ({ legacy_id:stableId("nave", item.nave), nome:clean(item.nave), residenza:clean(item.residenza), attiva:item.attiva !== false, note:"" })), item => item.nome.toUpperCase());
}
export function transformShipTurns(root) {
  const out = shipRows(root).map(item => ({ __shipLegacyId:stableId("nave", item.nave), legacy_id:stableId("turno_nave", item.nave, item.data, item.corsa), data:isoDate(item.data), servizio:clean(item.corsa), ormeggio_serale:clean(item.ormeggio_serale), rifornimento_mattina:Boolean(item.rifornimento_mattina), note:clean(item.note), legacy_payload:item })).filter(item => item.data && item.servizio);
  return dedupe(out, item => stableId(item.__shipLegacyId, item.data, item.servizio));
}

export function transformDocuments(root) {
  const { admin } = rootNodes(root); const files = admin.documentsFiles || {};
  return values(admin.documentsMeta).map(item => ({ legacy_id:clean(item.id || item.__key), titolo:clean(item.titolo || item.filename || "Documento"), descrizione:"", categoria:clean(item.tipo), pubblicato:true, pubblicato_il:isoTime(item.uploadedAt), visibilita:{ inizio:item.inizio || null, fine:item.fine || null }, __fileName:clean(item.filename || `${item.id || item.__key}.bin`), __fileDataUrl:clean(files[item.id || item.__key]?.dataUrl) })).filter(item => item.legacy_id && item.__fileDataUrl);
}

export function transformAnnouncements(root) {
  const { admin } = rootNodes(root); const out = [];
  Object.entries(admin.announcements || {}).forEach(([area, section]) => {
    if (area === "personal") return Object.entries(section || {}).forEach(([agentId, personal]) => { const item = personal?.published; if (item) out.push({ legacy_id:clean(item.id || stableId("annuncio", area, agentId)), titolo:clean(item.title), testo:clean(item.message), pubblicato:personal.disabled !== true, pubblicato_il:isoTime(item.publishedAt), priorita:"normale", visibilita:{ scope:"personal", agentId } }); });
    const item = section?.published; if (item) out.push({ legacy_id:clean(item.id || stableId("annuncio", area)), titolo:clean(item.title), testo:clean(item.message), pubblicato:section.disabled !== true, pubblicato_il:isoTime(item.publishedAt), priorita:"normale", visibilita:{ scope:area, audience:section.audience || null } });
  });
  return dedupe(out);
}

export function transformConfiguration(root) {
  const { admin } = rootNodes(root); const out = [];
  if (admin.serviceConfigurations) out.push({ __migrationKey:"configurazione:serviceConfigurations", __keyField:"chiave", chiave:"serviceConfigurations", valore:admin.serviceConfigurations, descrizione:"Configurazione servizi Firebase", aggiornata_il:isoTime(admin.serviceConfigurations.updatedAt) });
  if (admin.announcements) out.push({ __migrationKey:"configurazione:announcementsDrafts", __keyField:"chiave", chiave:"announcementsDrafts", valore:admin.announcements, descrizione:"Bozze e impostazioni annunci Firebase", aggiornata_il:isoTime(admin.updatedAt) });
  return out;
}
export function transformDraftPeriods(root) {
  const { admin } = rootNodes(root); const item = admin.draftPeriod;
  return item?.start && item?.end ? [{ legacy_id:"firebase-draft-period", data_inizio:isoDate(item.start), data_fine:isoDate(item.end), attivo:true, aggiornato_il:isoTime(item.updatedAt) }] : [];
}
export function transformActivities(root) {
  const { admin } = rootNodes(root); const presence = admin.userPresence || {};
  return values(admin.userRegistry).map(item => { const agentId = clean(item.id || item.__key); const contacts = values(presence[agentId]); const latest = contacts.map(contact => isoTime(contact.lastSeen)).filter(Boolean).sort().at(-1) || ""; return { __agentLegacyId:agentId, __migrationKey:stableId("attivita", agentId), __keyField:"agente", ultimo_accesso:isoTime(item.lastAccess), ultima_pagina:clean(item.lastPage), ultimo_contatto:latest || isoTime(item.lastAccess), legacy_uid:clean(contacts[0]?.uid) }; }).filter(item => item.__agentLegacyId);
}
export function transformFeedback(root) {
  const { admin } = rootNodes(root);
  return values(admin.feedbackTickets).map(item => { const category = clean(item.category || "altro").toLowerCase(); const status = clean(item.status || "nuovo").toLowerCase(); return { legacy_id:clean(item.id || item.__key), __authorLegacyId:clean(item.authorId), categoria:["bug","miglioria","altro"].includes(category) ? category : "altro", area:clean(item.area || "Generale"), titolo:clean(item.title), descrizione:clean(item.description), stato:["nuovo","verifica","risolto"].includes(status) ? status : "nuovo", nota_admin:clean(item.adminNote), aperta_il:isoTime(item.createdAt), aggiornata_il:isoTime(item.updatedAt) }; });
}
export function transformWeekStatuses(root) {
  const { admin } = rootNodes(root);
  return values(admin.weekStatuses).map(item => ({ __migrationKey:stableId("settimana", item.date || item.__key), __keyField:"data_inizio", data_inizio:isoDate(item.date || item.__key), stato:clean(item.status || item.stato).toLowerCase() === "ufficiale" ? "ufficiale" : "bozza", aggiornata_il:isoTime(item.updatedAt) })).filter(item => item.data_inizio);
}
export function transformQuizCorrections(root) {
  const { admin } = rootNodes(root); const item = admin.quizCorrections;
  return item?.answers ? [{ legacy_id:"firebase-quiz-corrections", quiz_id:"default", risposte:item.answers, aggiornata_il:isoTime(item.updatedAt) }] : [];
}

export function buildPlan(root) {
  return [
    ["agenti", transformAgents], ["importazioni_turni", transformImports], ["turni", transformTurns], ["diaria", transformDiaria],
    ["cambi_turno", transformChanges], ["variazioni", transformVariations], ["navi", transformShips], ["turni_navi", transformShipTurns],
    ["documenti", transformDocuments], ["annunci", transformAnnouncements], ["configurazione", transformConfiguration], ["periodi_bozza", transformDraftPeriods],
    ["attivita_utenti", transformActivities], ["segnalazioni", transformFeedback], ["stati_settimana", transformWeekStatuses], ["correzioni_quiz", transformQuizCorrections],
  ].map(([collection, transform]) => ({ collection, records:transform(root) }));
}
