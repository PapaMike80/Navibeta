(() => {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  const GROUND = new Set(['AGB','DT','POND','PT','AGM','AGT','PONM','LD','LAV']);
  const PRETTY = {AGB:'AgB',POND:'PonD',AGM:'AgM',AGT:'AgT',PONM:'PonM'};
  const GRADE = {
    capitano:{color:'#facc15'},comandante:{color:'#facc15'},'capo timoniere':{color:'#fb923c'},capotimoniere:{color:'#fb923c'},
    motorista:{color:'#a855f7'},timoniere:{color:'#22c55e'},'aiuto motorista':{color:'#3b82f6'},aiutomotorista:{color:'#3b82f6'},
    marinaio:{color:'#9ca3af'},operaio:{color:'#14b8a6'},barista:{color:'#f472b6'}
  };
  const ORDER = {
    DESENZANO:['AGB','POND','DT','LAV','LD','PT','AGM','AGT','PONM'],
    MADERNO:['AGM','AGT','PONM','LAV','LD','PT','AGB','POND','DT'],
    RIVA:['LAV','LD','PT','AGB','POND','DT','AGM','AGT','PONM'],
    PESCHIERA:['LAV','LD','PT','AGB','POND','DT','AGM','AGT','PONM']
  };

  const raw = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'').replace(/\*/g,'').replace(/--/g,'');
  const pretty = value => PRETTY[raw(value)] || raw(value);
  const norm = value => String(value || '').trim().toLowerCase().replace(/[_-]+/g,' ');
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const selectedResidence = () => String(document.getElementById('residence')?.value || '').trim().toUpperCase();
  const fixedResidence = service => {
    const s = raw(service);
    if (['AGB','POND','DT'].includes(s)) return 'DESENZANO';
    if (['AGM','AGT','PONM'].includes(s)) return 'MADERNO';
    return '';
  };
  const gradeColor = person => {
    const key = norm(person?.ruolo) === 'barista' ? 'barista' : norm(person?.grado || person?.ruolo);
    return GRADE[key]?.color || '#94a3b8';
  };

  let agentsPromise = null;
  const rowsCache = new Map();
  let activeGround = null;
  let patching = false;
  let patchQueued = false;

  const agents = () => agentsPromise ||= NaviV2PB.listAll('agenti',{filter:'attivo = true',fields:'id,legacy_id,nome_completo,residenza,grado,ruolo,attivo'});
  const rowsForDate = date => {
    if (!rowsCache.has(date)) {
      const start = `${date} 00:00:00.000Z`, end = `${date} 23:59:59.999Z`;
      rowsCache.set(date,NaviV2PB.listAll('turni_effective',{
        filter:`data >= "${start}" && data <= "${end}" && stato != "annullato"`,
        fields:'id,agente,data,servizio,residenza,stato',sort:'agente'
      }));
    }
    return rowsCache.get(date);
  };

  function groundResidence(service, fallback) {
    return fixedResidence(service) || String(fallback || '').trim().toUpperCase();
  }

  async function residenceForCell(cell, service) {
    const fixed = fixedResidence(service);
    if (fixed) return fixed;
    const legacy = cell?.closest('tr[data-agent-id]')?.dataset.agentId;
    if (legacy) {
      const person = (await agents()).find(item => String(item.legacy_id) === String(legacy));
      if (person?.residenza) return String(person.residenza).trim().toUpperCase();
    }
    return selectedResidence();
  }

  function rememberGround(cell) {
    const service = raw(cell?.dataset.service || cell?.querySelector('.cell-pill')?.textContent);
    const date = cell?.dataset.date;
    if (!date || !GROUND.has(service)) return;
    const token = Symbol('ground');
    activeGround = {cell,date,service,residence:'',token,at:Date.now()};
    residenceForCell(cell,service).then(residence => {
      if (!activeGround || activeGround.token !== token) return;
      activeGround.residence = residence;
      schedulePatch();
    });
  }

  async function scopedGroundCrew(date,residence) {
    const [people,rows] = await Promise.all([agents(),rowsForDate(date)]);
    const byId = new Map(people.map(person => [String(person.id),person]));
    const rank = new Map((ORDER[residence] || ORDER.DESENZANO).map((service,index) => [service,index]));
    return rows.map(row => ({row,person:byId.get(String(row.agente))}))
      .filter(({row,person}) => {
        if (!person) return false;
        const service = raw(row.servizio);
        if (!GROUND.has(service)) return false;
        const res = groundResidence(service,row.residenza || person.residenza);
        return res === residence;
      })
      .sort((a,b) => {
        const sa = raw(a.row.servizio), sb = raw(b.row.servizio);
        const ra = rank.has(sa) ? rank.get(sa) : 99, rb = rank.has(sb) ? rank.get(sb) : 99;
        return ra-rb || String(a.person.nome_completo).localeCompare(String(b.person.nome_completo),'it');
      });
  }

  async function patchGroundPreview() {
    patchQueued = false;
    if (patching || !activeGround?.residence || Date.now()-activeGround.at > 4000) return;
    const root = document.getElementById('crewPreview');
    if (!root?.classList.contains('open') || root.classList.contains('pinned')) return;
    const list = root.querySelector('.crew-preview-list');
    if (!list) return;
    const key = `${activeGround.date}|${activeGround.residence}`;
    if (list.dataset.groundResidenceScope === key) return;

    patching = true;
    try {
      const items = await scopedGroundCrew(activeGround.date,activeGround.residence);
      if (!activeGround || key !== `${activeGround.date}|${activeGround.residence}` || root.classList.contains('pinned')) return;
      const me = NaviV2PB.agent();
      list.dataset.groundResidenceScope = key;
      list.innerHTML = items.length ? items.map(({person,row}) => {
        const mine = String(person.id) === String(me?.id);
        return `<div class="crew-preview-person${mine ? ' is-me' : ''}" style="--grade-color:${gradeColor(person)}"><span class="crew-preview-name">${esc(person.nome_completo)}${mine ? ' · TU' : ''}</span><span class="crew-preview-grade">${esc(pretty(row.servizio))}</span></div>`;
      }).join('') : '<div class="crew-preview-empty">Nessun agente a terra per questa residenza.</div>';
    } finally {
      patching = false;
    }
  }

  function schedulePatch() {
    if (patchQueued) return;
    patchQueued = true;
    requestAnimationFrame(patchGroundPreview);
  }

  new MutationObserver(() => {
    if (!patching && activeGround) schedulePatch();
  }).observe(document.body,{childList:true,subtree:true});

  // La riga personale fissa vive fuori da #tableWrap. Inoltra gli stessi eventi
  // alla cella originale così hover/tap/click/doppio tap usano esattamente la
  // stessa logica del tooltip/popup già collaudato.
  function overlayCell(target) {
    return target?.closest?.('.turni-self-day-table td[data-date]') || null;
  }
  function sourceCell(overlay) {
    const date = overlay?.dataset.date;
    if (!date) return null;
    return wrap.querySelector(`.turni-table tr.logged-agent-row td[data-date="${CSS.escape(date)}"]`);
  }
  function forward(type,event,overlay) {
    const source = sourceCell(overlay);
    if (!source) return;
    if (type === 'mouseover' || type === 'mouseout' || type === 'click') {
      source.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:event.clientX || 0,clientY:event.clientY || 0,relatedTarget:null}));
    } else {
      source.dispatchEvent(new Event(type,{bubbles:true,cancelable:true}));
    }
  }

  document.addEventListener('mouseover',event => {
    const cell = overlayCell(event.target);
    if (cell) forward('mouseover',event,cell);
    const any = cell || event.target?.closest?.('#tableWrap td[data-date]');
    if (any) rememberGround(any);
  },true);
  document.addEventListener('mouseout',event => {
    const cell = overlayCell(event.target);
    if (cell) forward('mouseout',event,cell);
  },true);
  document.addEventListener('touchend',event => {
    const cell = overlayCell(event.target);
    if (!cell) {
      const any = event.target?.closest?.('#tableWrap td[data-date]');
      if (any) rememberGround(any);
      return;
    }
    rememberGround(cell);
    event.preventDefault();
    event.stopPropagation();
    forward('touchend',event,cell);
  },{capture:true,passive:false});
  document.addEventListener('click',event => {
    const cell = overlayCell(event.target);
    if (!cell) return;
    rememberGround(cell);
    event.preventDefault();
    event.stopPropagation();
    forward('click',event,cell);
  },true);
})();
