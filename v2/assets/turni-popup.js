(() => {
  const SHIFT_COLORS = {
    D1:['#3b6bcc','#1a2a4a'],D2:['#2d9e6b','#142a22'],D3:['#e07b3a','#2a1a0e'],D4:['#c45cba','#2a122a'],BIS:['#5ec4d4','#102a2e'],POND:['#f08080','#2a1212'],DT:['#e6d44a','#282200'],
    P1:['#60a5fa','#10233d'],P2:['#34d399','#102d25'],P3:['#fbbf24','#322607'],CAP:['#f472b6','#351629'],SR1:['#22d3ee','#103038'],
    R1:['#38bdf8','#102a38'],R2:['#f59e0b','#332307'],R3:['#22c55e','#10301d'],R4:['#f472b6','#351629'],CAR:['#fb7185','#35151e'],
    T1:['#38bdf8','#102a38'],T2:['#fb923c','#352013'],M1:['#a78bfa','#241635'],
    AGB:['#60a5fa','#102040'],AGM:['#2dd4bf','#103530'],AGT:['#34d399','#103227'],RIP:['#6b7280','#1a1c22'],CON:['#a78bfa','#1e1530'],TERRA:['#fbbf24','#302407'],LAV:['#fbbf24','#302407'],
    'F.P.':['#94a3b8','#1a1e28'],'S.S.':['#cbd5e1','#252a34'],MAL:['#fb7185','#35141d'],CORSO:['#67e8f9','#10313a']
  };
  const RESIDENCE_SERVICES = {
    desenzano:['D1','D2','D3','D4','BIS','PonD','DT','TERRA'],
    maderno:['T1','T2','M1','TERRA'],
    riva:['R1','R2','R3','R4','CAR','TERRA'],
    peschiera:['P1','P2','P3','CAP','SR1','TERRA']
  };
  const COMMON_SERVICES = ['RIP','LAV','CON','F.P.','S.S.','MAL','CORSO'];
  const NO_CREW = new Set(['RIP','CON','F.P.','S.S.','MAL','CORSO']);
  const GRADE = {
    capitano:{label:'Capitano',color:'#facc15',rank:1},comandante:{label:'Capitano',color:'#facc15',rank:1},
    'capo timoniere':{label:'Capo Timoniere',color:'#fb923c',rank:1},capotimoniere:{label:'Capo Timoniere',color:'#fb923c',rank:1},
    motorista:{label:'Motorista',color:'#a855f7',rank:2},timoniere:{label:'Timoniere',color:'#22c55e',rank:3},
    'aiuto motorista':{label:'Aiuto Motorista',color:'#3b82f6',rank:4},aiutomotorista:{label:'Aiuto Motorista',color:'#3b82f6',rank:4},
    marinaio:{label:'Marinaio',color:'#9ca3af',rank:5},operaio:{label:'Operaio',color:'#14b8a6',rank:6},
    barista:{label:'Barista',color:'#f472b6',rank:7}
  };

  let allAgentsPromise = null;
  let state = null;
  let saving = false;

  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const norm = value => String(value || '').trim().toLowerCase();
  const serviceKey = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'');
  const displayService = value => serviceKey(value) === 'POND' ? 'PonD' : String(value || '').trim().toUpperCase();
  const palette = value => SHIFT_COLORS[serviceKey(value)] || ['#94a3b8','#1e2230'];
  const dayBounds = iso => ({ start:`${iso} 00:00:00.000Z`, end:`${iso} 23:59:59.999Z` });
  const gradeInfo = agent => {
    const key = norm(agent?.grado || agent?.ruolo).replace(/[_-]+/g,' ');
    if (norm(agent?.ruolo) === 'barista') return GRADE.barista;
    return GRADE[key] || {label:agent?.grado || 'Equipaggio',color:'#94a3b8',rank:99};
  };
  const roleCanEditAny = () => ['admin','super_user'].includes(norm(NaviV2PB.user()?.role));

  function ensureLayer() {
    let layer = document.getElementById('turniPopupLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'turniPopupLayer';
    layer.className = 'turni-popup-layer';
    layer.innerHTML = '<div class="turni-popup-backdrop" data-popup-close></div><section class="turni-popup" role="dialog" aria-modal="true" aria-label="Dettaglio giornata"><div id="turniPopupContent"></div></section>';
    document.body.appendChild(layer);
    layer.addEventListener('click', event => { if (event.target.closest('[data-popup-close]')) closePopup(); });
    return layer;
  }

  function openLayer() {
    ensureLayer().classList.add('open');
    document.body.classList.add('popup-open');
  }
  function closePopup() {
    const layer = document.getElementById('turniPopupLayer');
    if (layer) layer.classList.remove('open');
    document.body.classList.remove('popup-open');
    state = null;
    saving = false;
  }
  function content() { return document.getElementById('turniPopupContent'); }

  function formatDate(iso) {
    const date = new Date(`${iso}T12:00:00`);
    const weekday = new Intl.DateTimeFormat('it-IT',{weekday:'long'}).format(date);
    const long = new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(date);
    return { weekday:weekday.toUpperCase(), long };
  }

  async function allAgents() {
    if (!allAgentsPromise) allAgentsPromise = NaviV2PB.listAll('agenti', { filter:'attivo = true', fields:'id,legacy_id,nome_completo,residenza,grado,ruolo,attivo' });
    return allAgentsPromise;
  }

  function loading(date, agentName) {
    const d = formatDate(date);
    content().innerHTML = `<header class="turni-popup-head"><div class="turni-popup-date"><strong>${esc(d.weekday)} · ${esc(d.long)}</strong><span>${esc(agentName)}</span></div><button class="turni-popup-close" type="button" data-popup-close aria-label="Chiudi">×</button></header><div class="turni-popup-body"><div class="turni-popup-loading"><div><div class="turni-popup-spinner"></div>Caricamento giornata…</div></div></div>`;
  }

  function serviceOptions(agent, current) {
    const residence = norm(agent?.residenza);
    const base = [...(RESIDENCE_SERVICES[residence] || []), ...COMMON_SERVICES];
    if (current && !base.some(item => serviceKey(item) === serviceKey(current))) base.unshift(current);
    return [...new Map(base.map(item => [serviceKey(item), item])).values()];
  }

  function renderCrew(crewAgents, targetAgent) {
    if (!crewAgents.length) return '<div class="turni-crew-empty">Nessun equipaggio associato a questo servizio.</div>';
    const groups = new Map();
    crewAgents.forEach(agent => {
      const info = gradeInfo(agent);
      const key = `${info.rank}|${info.label}|${info.color}`;
      if (!groups.has(key)) groups.set(key,{...info,items:[]});
      groups.get(key).items.push(agent);
    });
    return [...groups.values()].sort((a,b)=>a.rank-b.rank || a.label.localeCompare(b.label,'it')).map(group => {
      group.items.sort((a,b)=>String(a.nome_completo).localeCompare(String(b.nome_completo),'it'));
      const people = group.items.map(agent => {
        const mine = String(agent.id) === String(NaviV2PB.agent()?.id);
        const selected = String(agent.id) === String(targetAgent?.id);
        return `<span class="turni-crew-person${mine ? ' me' : ''}" title="${selected ? 'Giornata selezionata' : esc(group.label)}">${esc(agent.nome_completo)}${mine ? ' · TU' : ''}</span>`;
      }).join('');
      return `<div class="turni-crew-group" style="--grade:${group.color}"><div class="turni-crew-grade"><i></i>${esc(group.label)}</div><div class="turni-crew-bubbles">${people}</div></div>`;
    }).join('');
  }

  function render() {
    if (!state) return;
    const {date, targetAgent, turno, crewAgents, cell} = state;
    const d = formatDate(date);
    const service = turno.servizio;
    const [color] = palette(service);
    const canEdit = roleCanEditAny() || String(targetAgent.id) === String(NaviV2PB.agent()?.id);
    const options = serviceOptions(targetAgent, service).map(option => {
      const [c,bg] = palette(option);
      const active = serviceKey(option) === serviceKey(service);
      return `<button type="button" class="turni-service-option${active ? ' active' : ''}" data-service="${esc(option)}" style="--service:${c};--service-bg:${bg}">${esc(displayService(option))}</button>`;
    }).join('');
    const noCrew = NO_CREW.has(serviceKey(service));
    const crew = noCrew ? '<div class="turni-crew-empty">Questo tipo di giornata non prevede una composizione equipaggio.</div>' : renderCrew(crewAgents, targetAgent);
    content().innerHTML = `
      <header class="turni-popup-head"><div class="turni-popup-date"><strong>${esc(d.weekday)} · ${esc(d.long)}</strong><span>${esc(targetAgent.nome_completo)} · ${esc(targetAgent.residenza || '')}</span></div><button class="turni-popup-close" type="button" data-popup-close aria-label="Chiudi">×</button></header>
      <div class="turni-popup-body" style="--popup-service:${color}">
        <div class="turni-service-hero"><div class="turni-service-copy"><small>Servizio</small><div class="target-agent">${canEdit ? 'Tocca la bolla per modificare' : 'Servizio effettivo della giornata'}</div></div><button id="turniServiceButton" class="turni-service-button" type="button" ${canEdit ? '' : 'disabled'}>${esc(displayService(service))}${canEdit ? '<span class="edit-mark">✎</span>' : ''}</button></div>
        ${canEdit ? `<div id="turniServicePicker" class="turni-service-picker"><div class="turni-service-picker-title">Seleziona il nuovo servizio</div><div class="turni-service-options">${options}</div><div id="turniPopupSaveState" class="turni-popup-save-state"></div></div>` : ''}
        <section class="turni-crew-section"><div class="turni-popup-section-title"><strong>Equipaggio</strong><span>${noCrew ? '' : `${crewAgents.length} persone`}</span></div><div class="turni-crew-groups">${crew}</div></section>
      </div>`;
    const popup = document.querySelector('.turni-popup');
    if (popup) popup.style.setProperty('--popup-service', color);
    if (canEdit) {
      document.getElementById('turniServiceButton')?.addEventListener('click', () => document.getElementById('turniServicePicker')?.classList.toggle('open'));
      document.querySelectorAll('.turni-service-option').forEach(button => button.addEventListener('click', () => saveService(button.dataset.service, cell)));
    }
  }

  async function loadCrew(date, service, agents) {
    if (NO_CREW.has(serviceKey(service))) return [];
    const b = dayBounds(date);
    const escaped = NaviV2PB.escapeFilter(service);
    const rows = await NaviV2PB.listAll('turni_effective', {
      filter:`data >= "${b.start}" && data <= "${b.end}" && servizio = "${escaped}" && stato != "annullato"`,
      fields:'id,agente,data,servizio,stato,residenza',
      sort:'agente'
    });
    const byId = new Map(agents.map(agent => [String(agent.id), agent]));
    return rows.map(row => byId.get(String(row.agente))).filter(Boolean);
  }

  async function openForCell(cell) {
    const row = cell.closest('tr[data-agent-id]');
    if (!row || cell.cellIndex < 2) return;
    const dayHeaders = [...document.querySelectorAll('.turni-table thead th.day')];
    const header = dayHeaders[cell.cellIndex - 2];
    const date = header?.dataset.date;
    const legacyId = row.dataset.agentId;
    if (!date || !legacyId) return;
    openLayer();
    loading(date, row.querySelector('.td-name')?.innerText.trim() || legacyId);
    try {
      const agents = await allAgents();
      const targetAgent = agents.find(agent => String(agent.legacy_id) === String(legacyId));
      if (!targetAgent) throw new Error('Agente non trovato in PocketBase.');
      const b = dayBounds(date);
      const page = await NaviV2PB.list('turni_effective', {
        perPage:1,
        filter:`agente = "${NaviV2PB.escapeFilter(targetAgent.id)}" && data >= "${b.start}" && data <= "${b.end}" && stato != "annullato"`,
        fields:'id,agente,data,servizio,servizio_base,origine_effective,stato,versione,residenza'
      });
      const turno = page.items?.[0];
      if (!turno) throw new Error('Nessun turno effettivo trovato per questa giornata.');
      const crewAgents = await loadCrew(date, turno.servizio, agents);
      state = { date, targetAgent, turno, crewAgents, cell };
      render();
    } catch (error) {
      content().innerHTML = `<header class="turni-popup-head"><div class="turni-popup-date"><strong>Dettaglio giornata</strong></div><button class="turni-popup-close" type="button" data-popup-close>×</button></header><div class="turni-popup-body"><div class="turni-popup-error">${esc(error.message)}</div></div>`;
    }
  }

  function updateTableCell(cell, service) {
    if (!cell) return;
    const pill = cell.querySelector('.cell-pill');
    if (!pill) return;
    pill.textContent = displayService(service);
    pill.classList.add('changed','origin-manuale','service-colored');
    const [color,bg] = palette(service);
    pill.style.setProperty('--service-color',color);
    pill.style.setProperty('--service-bg',bg);
    cell.title = `${displayService(service)} · manuale`;
  }

  async function saveService(nextService, cell) {
    if (!state || saving || serviceKey(nextService) === serviceKey(state.turno.servizio)) {
      document.getElementById('turniServicePicker')?.classList.remove('open');
      return;
    }
    saving = true;
    const status = document.getElementById('turniPopupSaveState');
    if (status) { status.className='turni-popup-save-state'; status.textContent='Salvataggio…'; }
    document.querySelectorAll('.turni-service-option').forEach(button => button.disabled = true);
    try {
      const result = await NaviV2PB.request(`/api/navisuite-v2/turni/${encodeURIComponent(state.turno.id)}/servizio`, { method:'POST', body:{ servizio:nextService } });
      state.turno.servizio = result.servizio || nextService;
      state.turno.origine_effective = result.origine_effective || 'manuale';
      state.turno.versione = result.versione || state.turno.versione;
      updateTableCell(cell, state.turno.servizio);
      const agents = await allAgents();
      state.crewAgents = await loadCrew(state.date, state.turno.servizio, agents);
      render();
      const refreshed = document.getElementById('turniPopupSaveState');
      if (refreshed) { refreshed.className='turni-popup-save-state ok'; refreshed.textContent='✓ Salvato'; }
    } catch (error) {
      if (status) { status.className='turni-popup-save-state error'; status.textContent = error.status === 404 ? 'Endpoint PocketBase non ancora attivo.' : error.message; }
      document.querySelectorAll('.turni-service-option').forEach(button => button.disabled = false);
    } finally {
      saving = false;
    }
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#turniPopupLayer')) return;
    const cell = event.target.closest('.turni-table tbody td');
    if (!cell || cell.classList.contains('td-num') || cell.classList.contains('td-name')) return;
    openForCell(cell);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.getElementById('turniPopupLayer')?.classList.contains('open')) closePopup(); });
})();
