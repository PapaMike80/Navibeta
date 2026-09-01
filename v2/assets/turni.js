(() => {
  const $ = id => document.getElementById(id);
  const DAY_MS = 86400000;
  let allAgents = [];
  let residence = '';
  let rangeStart = mondayOf(new Date());

  function localDate(iso) { return new Date(`${iso}T12:00:00`); }
  function toIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
  function mondayOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return d;
  }
  function daysInRange() { return Array.from({ length: 28 }, (_, i) => addDays(rangeStart, i)); }
  function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
  function pbDate(iso) { return `${iso} 00:00:00.000Z`; }
  function labelRange() {
    const end = addDays(rangeStart, 27);
    const fmt = new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'short', year:'numeric' });
    return `${fmt.format(rangeStart)} → ${fmt.format(end)}`;
  }

  async function loadAgents() {
    allAgents = await NaviV2PB.listAll('agenti', {
      filter: 'attivo = true',
      sort: 'residenza,nome_completo',
      fields: 'id,legacy_id,nome_completo,residenza,grado,ruolo,attivo',
    });
    const me = NaviV2PB.agent();
    const residences = [...new Set(allAgents.map(a => String(a.residenza || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,'it'));
    residence = residences.includes(String(me?.residenza || '')) ? String(me.residenza) : residences[0] || '';
    $('residence').innerHTML = residences.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
    $('residence').value = residence;
  }

  async function load() {
    const started = performance.now();
    $('status').textContent = 'Caricamento PocketBase…';
    $('rangeLabel').textContent = labelRange();
    const startIso = toIso(rangeStart);
    const endIso = toIso(addDays(rangeStart, 27));
    const escapedResidence = NaviV2PB.escapeFilter(residence);
    const agents = allAgents.filter(a => String(a.residenza || '') === residence);
    const filter = `data >= "${pbDate(startIso)}" && data <= "${pbDate(endIso)}" && residenza = "${escapedResidence}" && stato != "annullato"`;
    try {
      const rows = await NaviV2PB.listAll('turni_effective', {
        filter,
        sort: 'data',
        fields: 'id,agente,data,servizio,servizio_base,origine_effective,stato,versione,residenza',
      });
      render(agents, rows);
      const elapsed = Math.round(performance.now() - started);
      $('status').textContent = `${rows.length} turni · ${agents.length} agenti · ${elapsed} ms`;
    } catch (error) {
      $('tableWrap').innerHTML = `<div class="empty">Errore PocketBase: ${escapeHtml(error.message)}</div>`;
      $('status').textContent = 'Errore di caricamento';
    }
  }

  function render(agents, rows) {
    const days = daysInRange();
    const byAgentDate = new Map(rows.map(row => [`${row.agente}|${String(row.data).slice(0,10)}`, row]));
    const me = NaviV2PB.agent();
    const sorted = [...agents].sort((a,b) => {
      const am = String(a.id) === String(me?.id) ? -1 : 0;
      const bm = String(b.id) === String(me?.id) ? -1 : 0;
      return am - bm || String(a.nome_completo).localeCompare(String(b.nome_completo),'it');
    });
    const fmtDow = new Intl.DateTimeFormat('it-IT', { weekday:'short' });
    const header = days.map(day => `<th class="day"><span class="dow">${escapeHtml(fmtDow.format(day))}</span><span class="num">${day.getDate()}</span></th>`).join('');
    const body = sorted.map(agent => {
      const cells = days.map(day => {
        const iso = toIso(day);
        const row = byAgentDate.get(`${agent.id}|${iso}`);
        const service = String(row?.servizio || '—');
        const changed = row && row.origine_effective !== 'turno_importato';
        const cls = service.toUpperCase() === 'RIP' ? 'rip' : '';
        const title = row ? `${service}${changed ? ` · ${row.origine_effective}` : ''}${row.servizio_base && row.servizio_base !== service ? ` · base ${row.servizio_base}` : ''}` : 'Nessun turno';
        return `<td title="${escapeHtml(title)}"><span class="pill ${cls} ${changed ? 'changed' : ''}">${escapeHtml(service)}</span></td>`;
      }).join('');
      const mine = String(agent.id) === String(me?.id);
      return `<tr class="${mine ? 'me' : ''}"><td class="name" title="${escapeHtml(agent.grado || '')}">${escapeHtml(agent.nome_completo)}</td>${cells}</tr>`;
    }).join('');
    $('tableWrap').innerHTML = sorted.length ? `<table><thead><tr><th class="name">${escapeHtml(residence)}</th>${header}</tr></thead><tbody>${body}</tbody></table>` : '<div class="empty">Nessun agente in questa residenza.</div>';
  }

  $('residence').addEventListener('change', event => { residence = event.target.value; load(); });
  $('prev').addEventListener('click', () => { rangeStart = addDays(rangeStart, -28); load(); });
  $('next').addEventListener('click', () => { rangeStart = addDays(rangeStart, 28); load(); });
  $('today').addEventListener('click', () => { rangeStart = mondayOf(new Date()); load(); });
  $('logout').addEventListener('click', () => { NaviV2PB.logout(); location.replace('index.html'); });

  (async () => {
    if (!(await NaviV2PB.requireSession())) return;
    const me = NaviV2PB.agent();
    $('who').textContent = `${me?.nome_completo || ''}${me?.residenza ? ` · ${me.residenza}` : ''}`;
    try { await loadAgents(); await load(); }
    catch (error) { $('status').textContent = error.message; }
  })();
})();
