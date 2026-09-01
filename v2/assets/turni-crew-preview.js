(() => {
  const NO_CREW = new Set(['','—','RIP','CON','F.P.','FP','S.S.','MAL','CORSO']);
  const GRADE = {
    capitano:{label:'Capitano',color:'#facc15',rank:1},comandante:{label:'Capitano',color:'#facc15',rank:1},
    'capo timoniere':{label:'Capo Timoniere',color:'#fb923c',rank:1},capotimoniere:{label:'Capo Timoniere',color:'#fb923c',rank:1},
    motorista:{label:'Motorista',color:'#a855f7',rank:2},timoniere:{label:'Timoniere',color:'#22c55e',rank:3},
    'aiuto motorista':{label:'Aiuto Motorista',color:'#3b82f6',rank:4},aiutomotorista:{label:'Aiuto Motorista',color:'#3b82f6',rank:4},
    marinaio:{label:'Marinaio',color:'#9ca3af',rank:5},operaio:{label:'Operaio',color:'#14b8a6',rank:6},
    barista:{label:'Barista',color:'#f472b6',rank:7}
  };

  const SERVICE_COLORS = {
    D1:'#3b6bcc',D2:'#2d9e6b',D3:'#e07b3a',D4:'#c45cba',BIS:'#5ec4d4',POND:'#f08080',DT:'#e6d44a',
    P1:'#60a5fa',P2:'#34d399',P3:'#fbbf24',CAP:'#f472b6',SR1:'#22d3ee',
    R1:'#38bdf8',R2:'#f59e0b',R3:'#22c55e',R4:'#f472b6',CAR:'#fb7185',
    T1:'#38bdf8',T2:'#fb923c',M1:'#a78bfa',
    AGB:'#60a5fa',AGM:'#2dd4bf',AGT:'#34d399',PONM:'#5ec4d4',LD:'#94a3b8',PT:'#fb923c',LAV:'#fbbf24',
    TERRA:'#fbbf24',RIP:'#6b7280'
  };

  const RESIDENCE_COURSES = {
    DESENZANO:['D1','D2','D3','D4','BIS'],
    MADERNO:['T1','T2','M1'],
    RIVA:['R1','R2','R3','R4','CAR'],
    PESCHIERA:['P1','P2','P3','CAP','SR1']
  };
  const ALL_COURSES = Object.values(RESIDENCE_COURSES).flat();
  const GROUND_SERVICES = ['AGB','DT','POND','PT','AGM','AGT','PONM','LD','LAV'];
  const GROUND_SET = new Set(GROUND_SERVICES);
  const SHIFT_RESIDENCE = Object.fromEntries(
    Object.entries(RESIDENCE_COURSES).flatMap(([res,shifts]) => shifts.map(shift => [shift,res]))
  );
  const PRETTY = { AGB:'AgB',POND:'PonD',AGM:'AgM',AGT:'AgT',PONM:'PonM' };

  const crewCache = new Map();
  const dateRowsCache = new Map();
  let agentsPromise = null;
  let hoverTimer = 0;
  let activeCell = null;
  let pinned = null;
  let lastTouch = { cell:null, at:0 };
  let suppressClickUntil = 0;

  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const norm = value => String(value || '').trim().toLowerCase().replace(/[_-]+/g,' ');
  const rawServiceKey = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'').replace(/\*/g,'').replace(/--/g,'');
  const prettyService = value => PRETTY[rawServiceKey(value)] || rawServiceKey(value);
  const crewServiceKey = value => {
    const raw = rawServiceKey(value);
    if (raw === 'TERRA') return 'TERRA';
    if (NO_CREW.has(raw)) return raw;
    const match = raw.match(/(?:^C)?([DRMP]\d|BIS|POND|PONM|AGB|AGM|AGT|T1|M1|DT|T2|CAR|CAP|SR1)(?:C|$)/i);
    return match?.[1] ? match[1].toUpperCase() : raw;
  };
  const crewTargetForService = value => {
    const clean = crewServiceKey(value);
    return GROUND_SET.has(clean) ? 'TERRA' : clean;
  };
  const grade = agent => {
    if (norm(agent?.ruolo) === 'barista') return GRADE.barista;
    return GRADE[norm(agent?.grado || agent?.ruolo)] || {label:agent?.grado || 'Equipaggio',color:'#94a3b8',rank:99};
  };
  const dateLabel = iso => new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${iso}T12:00:00`)).toUpperCase();
  const dateToIso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayIso = () => dateToIso(new Date());
  const addDay = (iso,delta) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate()+delta);
    return dateToIso(d);
  };
  const selectedTableResidence = () => String(document.getElementById('residence')?.value || '').trim().toUpperCase();
  const serviceResidence = service => SHIFT_RESIDENCE[crewServiceKey(service)] || '';
  const eventCell = target => target?.closest?.('td[data-date],th.day[data-date]') || null;
  const isDateHeader = cell => Boolean(cell?.matches?.('th.day[data-date]'));

  function tooltip() {
    let el = document.getElementById('crewPreview');
    if (!el) {
      el = document.createElement('div');
      el.id = 'crewPreview';
      el.className = 'crew-preview';
      document.body.appendChild(el);
    }
    return el;
  }
  function backdrop() {
    let el = document.getElementById('crewPreviewBackdrop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'crewPreviewBackdrop';
      el.className = 'crew-preview-backdrop';
      el.addEventListener('click', closePinned);
      document.body.appendChild(el);
    }
    return el;
  }
  function hidePreview() {
    clearTimeout(hoverTimer);
    if (pinned) return;
    activeCell = null;
    tooltip().classList.remove('open');
  }
  function closePinned() {
    pinned = null;
    activeCell = null;
    const el = tooltip();
    el.classList.remove('open','pinned','editing');
    el.removeAttribute('style');
    backdrop().classList.remove('open');
    document.body.classList.remove('crew-popup-open');
  }
  function position(el, cell) {
    if (pinned) return;
    const rect = cell.getBoundingClientRect();
    const margin = 8;
    const width = el.offsetWidth || 240;
    const height = el.offsetHeight || 160;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top = rect.bottom + 7;
    if (top + height > window.innerHeight - margin) top = rect.top - height - 7;
    top = Math.max(margin, top);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  async function agents() {
    if (!agentsPromise) agentsPromise = NaviV2PB.listAll('agenti',{filter:'attivo = true',fields:'id,legacy_id,nome_completo,residenza,grado,ruolo,attivo'});
    return agentsPromise;
  }
  async function mePerson() {
    const me = NaviV2PB.agent();
    if (!me?.id) return null;
    return (await agents()).find(person => String(person.id) === String(me.id)) || me;
  }
  async function rowsForDate(date) {
    if (dateRowsCache.has(date)) return dateRowsCache.get(date);
    const start = `${date} 00:00:00.000Z`, end = `${date} 23:59:59.999Z`;
    const promise = NaviV2PB.listAll('turni_effective',{
      filter:`data >= "${start}" && data <= "${end}" && stato != "annullato"`,
      fields:'id,agente,data,servizio,servizio_base,origine_effective,stato,versione,residenza',sort:'agente'
    });
    dateRowsCache.set(date,promise);
    return promise;
  }
  async function crew(date, service) {
    const target = crewTargetForService(service);
    const key = `${date}|${target}`;
    if (crewCache.has(key)) return crewCache.get(key);
    const [people, rows] = await Promise.all([agents(),rowsForDate(date)]);
    const byId = new Map(people.map(person => [String(person.id),person]));
    const result = rows
      .filter(row => {
        const clean = crewServiceKey(row.servizio);
        return target === 'TERRA' ? GROUND_SET.has(clean) : clean === target;
      })
      .map(row => ({ person:byId.get(String(row.agente)), row }))
      .filter(item => item.person)
      .sort((a,b) => {
        const ga = grade(a.person), gb = grade(b.person);
        return ga.rank-gb.rank || String(a.person.nome_completo).localeCompare(String(b.person.nome_completo),'it');
      });
    crewCache.set(key,result);
    return result;
  }
  async function personForCell(cell) {
    if (isDateHeader(cell)) return mePerson();
    const legacy = cell?.closest('tr[data-agent-id]')?.dataset.agentId;
    if (!legacy) return null;
    return (await agents()).find(person => String(person.legacy_id) === String(legacy)) || null;
  }
  async function rowForPersonDate(person,date) {
    if (!person?.id) return null;
    return (await rowsForDate(date)).find(row => String(row.agente) === String(person.id)) || null;
  }
  function isMe(person) {
    return String(person?.id || '') === String(NaviV2PB.agent()?.id || '');
  }
  function canEditOwnService() {
    return Boolean(pinned?.person && isMe(pinned.person) && pinned.mode === 'person' && pinned.row?.id);
  }
  function listHtml(list) {
    const me = NaviV2PB.agent();
    return list.length ? list.map(({person}) => {
      const g = grade(person);
      const mine = String(person.id) === String(me?.id);
      return `<div class="crew-preview-person${mine ? ' is-me' : ''}" style="--grade-color:${g.color}"><span class="crew-preview-name">${esc(person.nome_completo)}${mine ? ' · TU' : ''}</span><span class="crew-preview-grade">${esc(g.label)}</span></div>`;
    }).join('') : '<div class="crew-preview-empty">Nessun equipaggio trovato.</div>';
  }

  async function previewServiceForCell(cell,date) {
    const direct = cell?.dataset.service || cell?.querySelector('.cell-pill')?.textContent;
    if (direct) return String(direct).toUpperCase();
    if (isDateHeader(cell)) {
      const mine = await mePerson();
      const row = await rowForPersonDate(mine,date);
      return String(row?.servizio || 'RIP').toUpperCase();
    }
    return '';
  }
  async function showPreview(cell) {
    if (pinned) return;
    const date = cell?.dataset.date;
    if (!date) { hidePreview(); return; }
    const rawService = await previewServiceForCell(cell,date);
    if (activeCell && activeCell !== cell) return;
    const clean = crewServiceKey(rawService);
    const target = crewTargetForService(rawService);
    if (!rawService || rawService === '—') { hidePreview(); return; }
    activeCell = cell;
    const el = tooltip();
    const color = SERVICE_COLORS[target] || SERVICE_COLORS[clean] || '#2dd4bf';
    el.style.setProperty('--crew-service',color);
    el.innerHTML = `<div class="crew-preview-head"><strong class="crew-preview-service">${esc(prettyService(rawService))}</strong><span class="crew-preview-date">${esc(dateLabel(date))}</span></div><div class="crew-preview-empty">${NO_CREW.has(clean) ? 'Nessun equipaggio previsto.' : 'Caricamento equipaggio…'}</div>`;
    el.classList.remove('pinned','editing');
    el.classList.add('open');
    position(el,cell);
    if (NO_CREW.has(clean)) return;
    try {
      const list = await crew(date,target);
      if (activeCell !== cell || pinned) return;
      el.innerHTML = `<div class="crew-preview-head"><strong class="crew-preview-service">${esc(prettyService(rawService))}</strong><span class="crew-preview-date">${esc(dateLabel(date))}</span></div><div class="crew-preview-list">${listHtml(list)}</div>`;
      requestAnimationFrame(() => position(el,cell));
    } catch {
      if (activeCell !== cell || pinned) return;
      el.innerHTML = `<div class="crew-preview-head"><strong class="crew-preview-service">${esc(prettyService(rawService))}</strong><span class="crew-preview-date">${esc(dateLabel(date))}</span></div><div class="crew-preview-empty">Equipaggio non disponibile.</div>`;
      requestAnimationFrame(() => position(el,cell));
    }
  }

  function viewButtons(residence,active) {
    const shifts = [...(RESIDENCE_COURSES[residence] || []),'TERRA'];
    return shifts.map(shift => `<button type="button" class="crew-view-shift${shift===active ? ' active' : ''}" data-view-shift="${shift}" style="--shift-color:${SERVICE_COLORS[shift] || '#2dd4bf'}">${shift}</button>`).join('');
  }
  function editOption(service,current) {
    const active = rawServiceKey(service) === rawServiceKey(current);
    return `<button type="button" class="crew-edit-shift${active ? ' active' : ''}" data-edit-shift="${service}" style="--shift-color:${SERVICE_COLORS[service] || '#64748b'}">${esc(prettyService(service))}</button>`;
  }
  function editMenuHtml(current) {
    const meResidence = String(NaviV2PB.agent()?.residenza || '').trim().toUpperCase();
    const own = RESIDENCE_COURSES[meResidence] || [];
    const other = ALL_COURSES.filter(service => !own.includes(service));
    return `<div class="crew-edit-group"><div class="crew-edit-group-title">${esc(meResidence || 'MIA RESIDENZA')}</div><div class="crew-edit-grid">${own.map(s => editOption(s,current)).join('')}</div></div>
      <div class="crew-edit-group"><div class="crew-edit-group-title">ALTRE CORSE</div><div class="crew-edit-grid">${other.map(s => editOption(s,current)).join('')}</div></div>
      <div class="crew-edit-group"><div class="crew-edit-group-title">TERRA</div><div class="crew-edit-grid">${GROUND_SERVICES.map(s => editOption(s,current)).join('')}</div></div>`;
  }

  async function renderPinned() {
    if (!pinned) return;
    const el = tooltip();
    const person = pinned.person;
    const row = await rowForPersonDate(person,pinned.date);
    if (!pinned) return;
    pinned.row = row;
    pinned.actualRaw = String(row?.servizio || 'RIP').toUpperCase();
    const actualCrew = crewServiceKey(pinned.actualRaw);

    if (pinned.mode === 'person') pinned.viewService = NO_CREW.has(actualCrew) ? '' : crewTargetForService(actualCrew);
    else if (!pinned.viewService) pinned.viewService = NO_CREW.has(actualCrew) ? '' : crewTargetForService(actualCrew);

    const residence = serviceResidence(pinned.viewService || actualCrew) || String(person?.residenza || selectedTableResidence()).toUpperCase();
    pinned.residence = RESIDENCE_COURSES[residence] ? residence : selectedTableResidence();

    const shownService = pinned.mode === 'course' ? (pinned.viewService || actualCrew || pinned.actualRaw) : pinned.actualRaw;
    const shownColorKey = crewTargetForService(shownService) || shownService;
    const color = SERVICE_COLORS[shownColorKey] || SERVICE_COLORS[crewServiceKey(shownService)] || '#2dd4bf';
    el.style.setProperty('--crew-service',color);

    const editable = canEditOwnService();
    const navLabel = pinned.mode === 'person' ? 'VEDI CORSA · SEGUI I MIEI TURNI' : `VEDI CORSA · SEGUI ${pinned.viewService || ''}`;

    el.innerHTML = `<div class="crew-popup-top">
      <div class="crew-popup-course">
        <button type="button" class="crew-current-service${editable ? '' : ' readonly'}" ${editable ? '' : 'disabled'} title="${editable ? 'Cambia il mio servizio' : ''}"><strong>${esc(prettyService(shownService))}</strong></button>
        <div class="crew-edit-services" aria-hidden="true">${editable ? editMenuHtml(pinned.actualRaw) : ''}</div>
        <div class="crew-popup-mini-label">${esc(navLabel)}</div>
        <div class="crew-view-shifts">${viewButtons(pinned.residence,pinned.viewService)}</div>
      </div>
      <div class="crew-popup-day">
        <div class="crew-popup-date">${esc(dateLabel(pinned.date))}</div>
        <div class="crew-popup-day-nav"><button type="button" class="crew-day-arrow" data-day-step="-1" aria-label="Giorno precedente">‹</button><button type="button" class="crew-day-today" data-day-today aria-label="Torna a oggi">Oggi</button><button type="button" class="crew-day-arrow" data-day-step="1" aria-label="Giorno successivo">›</button></div>
      </div>
      <button type="button" class="crew-popup-close" aria-label="Chiudi">×</button>
    </div>
    <div class="crew-preview-list"><div class="crew-preview-empty">Caricamento equipaggio…</div></div>`;

    if (!pinned.viewService) {
      el.querySelector('.crew-preview-list').innerHTML = `<div class="crew-preview-empty">${pinned.mode === 'person' ? 'Nessun equipaggio previsto per il tuo servizio di questa giornata.' : 'Seleziona una corsa per vedere l’equipaggio.'}</div>`;
      return;
    }
    try {
      const list = await crew(pinned.date,pinned.viewService);
      if (!pinned) return;
      el.querySelector('.crew-preview-list').innerHTML = listHtml(list);
    } catch {
      if (pinned) el.querySelector('.crew-preview-list').innerHTML = '<div class="crew-preview-empty">Equipaggio non disponibile.</div>';
    }
  }

  async function openPinned(cell) {
    const date = cell?.dataset.date;
    const person = await personForCell(cell);
    if (!date || !person) return;
    const directService = cell?.dataset.service || cell?.querySelector('.cell-pill')?.textContent || '';
    const followsMine = isDateHeader(cell) || isMe(person);
    pinned = {
      cell,
      person,
      date,
      viewService:crewTargetForService(directService),
      mode:followsMine ? 'person' : 'course',
      editing:false,
      row:null
    };
    activeCell = cell;
    const el = tooltip();
    el.removeAttribute('style');
    el.classList.add('open','pinned');
    backdrop().classList.add('open');
    document.body.classList.add('crew-popup-open');
    await renderPinned();
  }

  function invalidateDate(date) {
    dateRowsCache.delete(date);
    [...crewCache.keys()].filter(key => key.startsWith(`${date}|`)).forEach(key => crewCache.delete(key));
  }
  function updateVisibleCell(person,date,service) {
    const row = [...document.querySelectorAll('tr[data-agent-id]')].find(tr => String(tr.dataset.agentId) === String(person?.legacy_id));
    const cell = row?.querySelector(`td[data-date="${date}"]`);
    if (!cell) return;
    cell.dataset.service = service;
    const pill = cell.querySelector('.cell-pill');
    if (pill) pill.textContent = service;
  }
  async function saveService(shift) {
    if (!pinned?.row?.id || !canEditOwnService()) return;
    const button = tooltip().querySelector(`[data-edit-shift="${shift}"]`);
    if (button) button.disabled = true;
    try {
      const result = await NaviV2PB.request(`/api/navisuite-v2/turni/${encodeURIComponent(pinned.row.id)}/servizio`,{method:'POST',body:{servizio:shift}});
      invalidateDate(pinned.date);
      updateVisibleCell(pinned.person,pinned.date,String(result?.servizio || shift).toUpperCase());
      pinned.editing = false;
      await renderPinned();
      tooltip().classList.remove('editing');
    } catch (error) {
      const el = tooltip();
      let msg = el.querySelector('.crew-popup-error');
      if (!msg) {
        msg = document.createElement('div');
        msg.className = 'crew-popup-error';
        el.querySelector('.crew-popup-top')?.after(msg);
      }
      msg.textContent = error?.message || 'Modifica non salvata.';
      if (button) button.disabled = false;
    }
  }

  const wrap = document.getElementById('tableWrap');
  wrap?.addEventListener('mouseover', event => {
    if (!matchMedia('(hover:hover)').matches || pinned) return;
    const cell = eventCell(event.target);
    if (!cell || cell.contains(event.relatedTarget)) return;
    activeCell = cell;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showPreview(cell),80);
  });
  wrap?.addEventListener('mouseout', event => {
    if (!matchMedia('(hover:hover)').matches || pinned) return;
    const cell = eventCell(event.target);
    if (!cell || cell.contains(event.relatedTarget)) return;
    hoverTimer = setTimeout(hidePreview,90);
  });
  wrap?.addEventListener('touchend', event => {
    const cell = eventCell(event.target);
    if (!cell || pinned) return;
    const now = Date.now();
    suppressClickUntil = now + 550;
    event.preventDefault();
    event.stopPropagation();
    if (lastTouch.cell === cell && now-lastTouch.at < 430) {
      lastTouch = {cell:null,at:0};
      openPinned(cell);
    } else {
      lastTouch = {cell,at:now};
      activeCell = cell;
      showPreview(cell);
    }
  },{passive:false,capture:true});
  wrap?.addEventListener('click', event => {
    const cell = eventCell(event.target);
    if (!cell || pinned || Date.now() < suppressClickUntil) return;
    if (!matchMedia('(hover:hover)').matches) return;
    event.preventDefault();
    event.stopPropagation();
    openPinned(cell);
  },true);

  document.addEventListener('click', event => {
    if (pinned) {
      const el = tooltip();
      if (event.target.closest('.crew-popup-close')) { closePinned(); return; }
      if (event.target.closest('[data-day-today]')) {
        pinned.date = todayIso();
        renderPinned();
        return;
      }
      const day = event.target.closest('[data-day-step]');
      if (day) {
        pinned.date = addDay(pinned.date,Number(day.dataset.dayStep));
        renderPinned();
        return;
      }
      const view = event.target.closest('[data-view-shift]');
      if (view) {
        pinned.mode = 'course';
        pinned.viewService = view.dataset.viewShift;
        pinned.editing = false;
        el.classList.remove('editing');
        renderPinned();
        return;
      }
      if (event.target.closest('.crew-current-service:not(.readonly)')) {
        pinned.editing = !pinned.editing;
        el.classList.toggle('editing',pinned.editing);
        el.querySelector('.crew-edit-services')?.setAttribute('aria-hidden',pinned.editing ? 'false' : 'true');
        return;
      }
      const edit = event.target.closest('[data-edit-shift]');
      if (edit) { saveService(edit.dataset.editShift); return; }
      return;
    }
    if (!eventCell(event.target)) hidePreview();
  });
  window.addEventListener('scroll', () => { if (!pinned) hidePreview(); },{passive:true});
  window.addEventListener('resize', () => { if (!pinned) hidePreview(); },{passive:true});
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && pinned) closePinned(); });
})();
