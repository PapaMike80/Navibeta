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
    T1:'#38bdf8',T2:'#fb923c',M1:'#a78bfa',TERRA:'#fbbf24',LAV:'#fbbf24'
  };
  const cache = new Map();
  let agentsPromise = null;
  let hoverTimer = 0;
  let activeCell = null;

  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const norm = value => String(value || '').trim().toLowerCase().replace(/[_-]+/g,' ');
  const serviceKey = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'');
  const grade = agent => {
    if (norm(agent?.ruolo) === 'barista') return GRADE.barista;
    return GRADE[norm(agent?.grado || agent?.ruolo)] || {label:agent?.grado || 'Equipaggio',color:'#94a3b8',rank:99};
  };
  const dateLabel = iso => new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short'}).format(new Date(`${iso}T12:00:00`)).toUpperCase();

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
  function hide() {
    clearTimeout(hoverTimer);
    activeCell = null;
    tooltip().classList.remove('open');
  }
  function position(el, cell) {
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
  async function crew(date, service) {
    const key = `${date}|${serviceKey(service)}`;
    if (cache.has(key)) return cache.get(key);
    const start = `${date} 00:00:00.000Z`, end = `${date} 23:59:59.999Z`;
    const escaped = NaviV2PB.escapeFilter(service);
    const [people, rows] = await Promise.all([
      agents(),
      NaviV2PB.listAll('turni_effective',{
        filter:`data >= "${start}" && data <= "${end}" && servizio = "${escaped}" && stato != "annullato"`,
        fields:'agente,data,servizio,stato',sort:'agente'
      })
    ]);
    const byId = new Map(people.map(person => [String(person.id),person]));
    const result = rows.map(row => byId.get(String(row.agente))).filter(Boolean).sort((a,b) => {
      const ga = grade(a), gb = grade(b);
      return ga.rank-gb.rank || String(a.nome_completo).localeCompare(String(b.nome_completo),'it');
    });
    cache.set(key,result);
    return result;
  }
  async function show(cell) {
    const date = cell?.dataset.date;
    const service = cell?.dataset.service || cell?.querySelector('.cell-pill')?.textContent;
    const key = serviceKey(service);
    if (!date || NO_CREW.has(key)) { hide(); return; }
    activeCell = cell;
    const el = tooltip();
    const color = SERVICE_COLORS[key] || '#2dd4bf';
    el.style.setProperty('--crew-service',color);
    el.innerHTML = `<div class="crew-preview-head"><strong class="crew-preview-service">${esc(service)}</strong><span class="crew-preview-date">${esc(dateLabel(date))}</span></div><div class="crew-preview-empty">Caricamento equipaggio…</div>`;
    el.classList.add('open');
    position(el,cell);
    try {
      const list = await crew(date,service);
      if (activeCell !== cell) return;
      const me = NaviV2PB.agent();
      const content = list.length ? list.map(person => {
        const g = grade(person);
        const mine = String(person.id) === String(me?.id);
        return `<div class="crew-preview-person${mine ? ' is-me' : ''}" style="--grade-color:${g.color}"><span class="crew-preview-name">${esc(person.nome_completo)}${mine ? ' · TU' : ''}</span><span class="crew-preview-grade">${esc(g.label)}</span></div>`;
      }).join('') : '<div class="crew-preview-empty">Nessun equipaggio trovato.</div>';
      el.innerHTML = `<div class="crew-preview-head"><strong class="crew-preview-service">${esc(service)}</strong><span class="crew-preview-date">${esc(dateLabel(date))}</span></div><div class="crew-preview-list">${content}</div>`;
      requestAnimationFrame(() => position(el,cell));
    } catch (error) {
      if (activeCell !== cell) return;
      el.innerHTML = `<div class="crew-preview-head"><strong class="crew-preview-service">${esc(service)}</strong><span class="crew-preview-date">${esc(dateLabel(date))}</span></div><div class="crew-preview-empty">Equipaggio non disponibile.</div>`;
      requestAnimationFrame(() => position(el,cell));
    }
  }

  const wrap = document.getElementById('tableWrap');
  wrap?.addEventListener('mouseover', event => {
    if (!matchMedia('(hover:hover)').matches) return;
    const cell = event.target.closest('tbody td[data-date]');
    if (!cell || cell.contains(event.relatedTarget)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => show(cell),80);
  });
  wrap?.addEventListener('mouseout', event => {
    if (!matchMedia('(hover:hover)').matches) return;
    const cell = event.target.closest('tbody td[data-date]');
    if (!cell || cell.contains(event.relatedTarget)) return;
    hoverTimer = setTimeout(hide,90);
  });
  wrap?.addEventListener('click', event => {
    const cell = event.target.closest('tbody td[data-date]');
    if (!cell) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeCell === cell && tooltip().classList.contains('open')) hide();
    else show(cell);
  },true);
  document.addEventListener('click', event => {
    if (!event.target.closest('tbody td[data-date]')) hide();
  });
  window.addEventListener('scroll', hide,{passive:true});
  window.addEventListener('resize', hide,{passive:true});
})();
