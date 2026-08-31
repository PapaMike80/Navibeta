const values = input => Array.isArray(input) ? input.filter(Boolean) : Object.entries(input || {}).map(([key, value]) => ({ __key:key, ...(value || {}) }));
const isoDate = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 10) + " 00:00:00.000Z" : "";
const isoTime = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString().replace("T", " ") : "";
const minutes = value => Math.max(0, Math.round(Number(value) || 0));

export function rootNodes(root) {
  const admin = root?.private?.adminUpdates || {};
  return { schedule:root?.public?.schedule || {}, changes:root?.private?.changeRequests || {}, admin };
}

export function transformAgents(root) {
  const { schedule, admin } = rootNodes(root);
  const byId = new Map();
  Object.entries(schedule?.residenze || {}).forEach(([residenza, agents]) => values(agents).forEach(agent => {
    const legacy = String(agent.id || agent.agentId || agent.__key || "").trim();
    if (!legacy) return;
    byId.set(legacy, { legacy_id:legacy, nome_completo:String(agent.agente || agent.name || legacy), matricola:String(agent.matricola || ""), grado:String(agent.qualifica || ""), residenza:String(agent.residence || agent.residenza || residenza), ruolo:String(agent.role || "agente").toLowerCase().replace("super user", "super_user"), attivo:agent.attivo !== false, permessi_speciali:{ barista:Boolean(agent.barista), specialVisibility:agent.specialVisibility || null }, legacy_source:"public/schedule/residenze" });
  }));
  Object.entries(admin.agentProfiles || {}).forEach(([key, profile]) => {
    const legacy = String(profile?.id || key); const previous = byId.get(legacy) || {};
    byId.set(legacy, { ...previous, legacy_id:legacy, nome_completo:String(profile?.name || previous.nome_completo || legacy), grado:String(profile?.qualifica || previous.grado || ""), residenza:String(profile?.residence || previous.residenza || ""), ruolo:String(profile?.role || previous.ruolo || "agente").toLowerCase().replace("super user", "super_user"), attivo:true, legacy_source:previous.legacy_source ? previous.legacy_source + "+agentProfiles" : "agentProfiles" });
  });
  return [...byId.values()];
}

export function transformDiaria(root) {
  const { admin } = rootNodes(root); const out = [];
  Object.entries(admin.diaria || {}).forEach(([agentId, archive]) => values(archive?.entries).forEach(entry => {
    const overtime = entry.overtimeComponents || {};
    const service = minutes(entry.serviceMinutes);
    const hasWorked = Number.isFinite(Number(entry.workedMinutes));
    out.push({
      __agentLegacyId:String(archive?.agentId || agentId), legacy_id:String(entry.id || `${agentId}:${entry.date}`), data:isoDate(entry.date),
      servizio:String(entry.shift || ""), ore_servizio_minuti:service,
      ore_lavorate_minuti:hasWorked ? minutes(entry.workedMinutes) : service + minutes(overtime.ordinario ?? entry.delay) + minutes(overtime.cambi ?? entry.changeMinutes) + minutes(overtime.sentine ?? entry.sentineActivity?.minutes),
      ore_lavorate_override:Boolean(entry.overtimeMeta?.workedMode === "manual" || hasWorked),
      straordinario_ritardo_minuti:minutes(overtime.ordinario ?? entry.delay), straordinario_cambio_minuti:minutes(overtime.cambi ?? entry.changeMinutes), straordinario_sentine_minuti:minutes(overtime.sentine ?? entry.sentineActivity?.minutes),
      tipo_sentine:String(entry.sentineActivity?.type || ""), banca_ore_minuti:minutes(entry.bank), diaria_percentuale:String(entry.allowanceRate ?? "0"),
      pernotto_40:Boolean(entry.overnight40), festivita_lavorata:Boolean(entry.holidayWorked), ticket_dovuto:entry.ticketPresence !== undefined || entry.mealUsed !== undefined,
      ticket_usato:Boolean(entry.ticketPresence ?? entry.mealUsed), secondo_ticket:Boolean(Number(entry.secondMeal)), indennita_imbarco:Boolean(entry.embark), indennita_aliscafo:minutes(entry.hydrofoil),
      presenza:!['RIP','RIPOSO','MAL','MALATTIA'].includes(String(entry.shift || '').toUpperCase()), trasferta_minuti:entry.travel ? 120 : 0,
      rifornimento:Boolean(entry.refuel), parametro_139:Boolean(entry.parametro139 || entry.par139), maneggio_denaro:Boolean(entry.cashHandling), override_manuale:Boolean(entry.manualOverride), note:String(entry.note || ""), legacy_payload:entry,
    });
  }));
  return out;
}

export function transformChanges(root) {
  const { changes, admin } = rootNodes(root);
  const approved = new Set(values(admin.approvedChangeRequests).flatMap(x => [String(x.id || x.requestId || ""), String(x.__key || "")]).filter(Boolean));
  const deleted = new Map(values(admin.deletedChangeRequests).map(x => [String(x.requestId || x.__key || ""), x]));
  return values(changes).map(item => {
    const id = String(item.id || item.__key); const removed = deleted.get(id);
    return { legacy_id:id, __requesterLegacyId:String(item.agentId || ""), __colleagueLegacyId:String(item.colleagueId || ""), data_richiedente:isoDate(item.date || item.agentDate), data_collega:isoDate(item.colleagueDate), turno_richiedente:String(item.shift || item.agentShift || ""), turno_collega:String(item.colleagueShift || ""), stato:removed ? "cancelled" : approved.has(id) ? "approved" : String(item.status || "pending").toLowerCase(), inviata_il:isoTime(item.sentAt), annullata_il:isoTime(removed?.deletedAt), note:String(item.note || ""), legacy_payload:item };
  });
}

export function transformFeedback(root) {
  const { admin } = rootNodes(root);
  return values(admin.feedbackTickets).map(item => ({ legacy_id:String(item.id || item.__key), __authorLegacyId:String(item.authorId || ""), categoria:String(item.category || "altro"), area:String(item.area || "Generale"), titolo:String(item.title || ""), descrizione:String(item.description || ""), stato:String(item.status || "nuovo"), nota_admin:String(item.adminNote || ""), aperta_il:isoTime(item.createdAt), aggiornata_il:isoTime(item.updatedAt) }));
}

export function buildPlan(root) {
  return [
    { collection:"agenti", records:transformAgents(root) },
    { collection:"diaria", records:transformDiaria(root) },
    { collection:"cambi_turno", records:transformChanges(root) },
    { collection:"segnalazioni", records:transformFeedback(root) },
  ];
}
