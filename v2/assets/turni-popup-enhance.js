(() => {
  const GROUND = new Set(['AGB','DT','POND','PT','AGM','AGT','PONM','LD','LAV']);
  const PRETTY = {AGB:'AgB',POND:'PonD',AGM:'AgM',AGT:'AgT',PONM:'PonM'};
  const SERVICE_COLOR = {AGB:'#60a5fa',POND:'#f08080',DT:'#e6d44a',PT:'#fb923c',AGM:'#2dd4bf',PONM:'#5ec4d4',AGT:'#34d399',LD:'#94a3b8',LAV:'#fbbf24'};
  const GRADE = {
    capitano:{color:'#facc15',rank:1},comandante:{color:'#facc15',rank:1},'capo timoniere':{color:'#fb923c',rank:1},capotimoniere:{color:'#fb923c',rank:1},
    motorista:{color:'#a855f7',rank:2},timoniere:{color:'#22c55e',rank:3},'aiuto motorista':{color:'#3b82f6',rank:4},aiutomotorista:{color:'#3b82f6',rank:4},
    marinaio:{color:'#9ca3af',rank:5},operaio:{color:'#14b8a6',rank:6},barista:{color:'#f472b6',rank:7}
  };
  const ORDER = {
    DESENZANO:['AGB','POND','DT'],
    MADERNO:['AGM','PONM','AGT'],
    RIVA:[],PESCHIERA:[]
  };
  const rowCache = new Map();
  let agentsPromise = null;
  let currentDate = '';
  let scheduled = false;

  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const raw = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'').replace(/\*/g,'').replace(/--/g,'');
  const cleanService = value => {
    const valueRaw = raw(value);
    const match = valueRaw.match(/(?:^C)?([DRMP]\d|BIS|POND|PONM|AGB|AGM|AGT|T1|M1|DT|T2|CAR|CAP|SR1)(?:C|$)/i);
    return match?.[1] ? match[1].toUpperCase() : valueRaw;
  };
  const pretty = value => PRETTY[raw(value)] || raw(value);
  const isoToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const addDay = (iso,delta) => {
    const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate()+delta);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const dateLabel = iso => new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${iso}T12:00:00`)).toUpperCase();
  const grade = person => {
    const key = String(person?.ruolo || person?.grado || '').trim().toLowerCase().replace(/[_-]+/g,' ');
    return GRADE[key] || {color:'#94a3b8',rank:99};
  };

  function inferResidence(root) {
    const shifts = new Set([...root.querySelectorAll('[data-view-shift]')].map(b => raw(b.dataset.viewShift)));
    if (shifts.has('D1')) return 'DESENZANO';
    if (shifts.has('T1')) return 'MADERNO';
    if (shifts.has('R1')) return 'RIVA';
    if (shifts.has('P1')) return 'PESCHIERA';
    return String(document.getElementById('residence')?.value || NaviV2PB.agent()?.residenza || '').trim().toUpperCase();
  }
  async function agents() {
    if (!agentsPromise) agentsPromise = NaviV2PB.listAll('agenti',{filter:'attivo = true',fields:'id,legacy_id,nome_completo,residenza,grado,ruolo,attivo'});
    return agentsPromise;
  }
  async function rows(date) {
    if (rowCache.has(date)) return rowCache.get(date);
    const promise = NaviV2PB.listAll('turni_effective',{
      filter:`data >= "${date} 00:00:00.000Z" && data <= "${date} 23:59:59.999Z" && stato != "annullato"`,
      fields:'agente,data,servizio,residenza,stato'
    });
    rowCache.set(date,promise);
    return promise;
  }
  function groundPriority(residence,service) {
    const first = ORDER[residence] || [];
    const idx = first.indexOf(service);
    if (idx >= 0) return idx;
    return 20 + ['LAV','LD','PT','AGB','POND','DT','AGM','PONM','AGT'].indexOf(service);
  }
  async function renderGroundCrew(root) {
    const active = root.querySelector('.crew-view-shift.active[data-view-shift="TERRA"]');
    if (!active || !currentDate) return;
    const list = root.querySelector(':scope > .crew-preview-list');
    if (!list) return;
    const residence = inferResidence(root);
    const signature = `${currentDate}|${residence}`;
    if (list.querySelector(`[data-terra-signature="${signature}"]`)) return;

    try {
      const [people, dayRows] = await Promise.all([agents(),rows(currentDate)]);
      if (!document.body.contains(root) || !root.classList.contains('pinned')) return;
      const byId = new Map(people.map(person => [String(person.id),person]));
      const items = dayRows.map(row => ({row,person:byId.get(String(row.agente)),service:cleanService(row.servizio)}))
        .filter(item => item.person && GROUND.has(item.service))
        .filter(item => String(item.row.residenza || item.person.residenza || '').trim().toUpperCase() === residence)
        .sort((a,b) => {
          const serviceOrder = groundPriority(residence,a.service)-groundPriority(residence,b.service);
          if (serviceOrder) return serviceOrder;
          const gradeOrder = grade(a.person).rank-grade(b.person).rank;
          return gradeOrder || String(a.person.nome_completo).localeCompare(String(b.person.nome_completo),'it');
        });
      const me = NaviV2PB.agent();
      list.innerHTML = items.length ? items.map(({person,service}) => {
        const g = grade(person), mine = String(person.id) === String(me?.id);
        const color = SERVICE_COLOR[service] || '#fbbf24';
        return `<div class="crew-preview-person terra-enhanced-person${mine ? ' is-me' : ''}" data-terra-signature="${signature}" style="--grade-color:${g.color};--ground-service-color:${color}"><span class="crew-preview-name">${esc(person.nome_completo)}${mine ? ' · TU' : ''}</span><span class="crew-preview-grade ground-service-label">${esc(pretty(service))}</span></div>`;
      }).join('') : `<div class="crew-preview-empty" data-terra-signature="${signature}">Nessun agente a terra per ${esc(residence)}.</div>`;
    } catch { /* il popup principale mantiene il fallback */ }
  }

  function inferDateFromPopup(root) {
    if (currentDate) return;
    const text = String(root.querySelector('.crew-popup-date')?.textContent || '').trim().toUpperCase();
    if (!text) return;
    const dates = [...document.querySelectorAll('.turni-table th.day[data-date]')].map(th => th.dataset.date);
    currentDate = dates.find(iso => dateLabel(iso) === text) || '';
  }

  function closeDatePicker() { document.querySelector('.crew-date-picker')?.remove(); }
  function openPinnedForDate(targetDate,followCourse) {
    const root = document.getElementById('crewPreview');
    root?.querySelector('.crew-popup-close')?.click();
    currentDate = targetDate;
    const cell = document.querySelector(`tr.logged-agent-row td[data-date="${targetDate}"]`) || document.querySelector(`th.day[data-date="${targetDate}"]`);
    if (!cell) return;
    setTimeout(() => {
      if (matchMedia('(hover:hover)').matches) {
        cell.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      } else {
        cell.dispatchEvent(new Event('touchend',{bubbles:true,cancelable:true}));
        setTimeout(() => cell.dispatchEvent(new Event('touchend',{bubbles:true,cancelable:true})),35);
      }
      if (followCourse) setTimeout(() => document.querySelector(`#crewPreview.pinned [data-view-shift="${followCourse}"]`)?.click(),180);
    },45);
  }
  function openDatePicker(root) {
    closeDatePicker();
    inferDateFromPopup(root);
    const dateButton = root.querySelector('.crew-popup-date');
    if (!dateButton) return;
    const dates = [...new Set([...document.querySelectorAll('.turni-table th.day[data-date]')].map(th => th.dataset.date).filter(Boolean))];
    if (!dates.length) return;
    const personMode = [...root.querySelectorAll('.crew-popup-mini-label')].some(node => String(node.textContent || '').toUpperCase().includes('SEGUI I MIEI TURNI'));
    const active = root.querySelector('.crew-view-shift.active[data-view-shift]');
    const followCourse = personMode ? '' : raw(active?.dataset.viewShift || '');
    const picker = document.createElement('div');
    picker.className = 'crew-date-picker';
    picker.innerHTML = dates.map(iso => `<button type="button" class="crew-date-choice${iso===currentDate ? ' active' : ''}" data-fast-date="${iso}"><small>${esc(new Intl.DateTimeFormat('it-IT',{weekday:'short'}).format(new Date(`${iso}T12:00:00`)).toUpperCase())}</small><strong>${new Date(`${iso}T12:00:00`).getDate()}</strong><span>${esc(new Intl.DateTimeFormat('it-IT',{month:'short'}).format(new Date(`${iso}T12:00:00`)).toUpperCase())}</span></button>`).join('');
    root.querySelector('.crew-popup-day')?.appendChild(picker);
    requestAnimationFrame(() => picker.querySelector('.active')?.scrollIntoView({block:'center'}));
    picker.addEventListener('click',event => {
      const choice = event.target.closest('[data-fast-date]');
      if (!choice) return;
      event.preventDefault(); event.stopPropagation();
      const date = choice.dataset.fastDate;
      closeDatePicker();
      openPinnedForDate(date,followCourse);
    });
  }

  function enhance() {
    scheduled = false;
    const root = document.getElementById('crewPreview');
    if (!root?.classList.contains('pinned')) { closeDatePicker(); return; }
    inferDateFromPopup(root);
    renderGroundCrew(root);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  document.addEventListener('pointerdown',event => {
    const cell = event.target.closest?.('td[data-date],th.day[data-date]');
    if (cell?.dataset.date) currentDate = cell.dataset.date;
  },true);
  document.addEventListener('click',event => {
    const root = document.getElementById('crewPreview');
    if (!root?.classList.contains('pinned')) return;
    if (event.target.closest('[data-day-step]') && currentDate) currentDate = addDay(currentDate,Number(event.target.closest('[data-day-step]').dataset.dayStep));
    if (event.target.closest('[data-day-today]')) currentDate = isoToday();
    if (event.target.closest('.crew-popup-date')) {
      event.preventDefault(); event.stopPropagation();
      if (root.querySelector('.crew-date-picker')) closeDatePicker(); else openDatePicker(root);
      return;
    }
    if (!event.target.closest('.crew-date-picker') && !event.target.closest('.crew-popup-date')) closeDatePicker();
    schedule();
  },true);

  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('load',schedule);
})();
