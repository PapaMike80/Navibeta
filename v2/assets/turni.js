(() => {
  const $ = id => document.getElementById(id);
  let allAgents = [];
  let residence = '';
  let rangeStart = mondayOf(new Date());

  const PDF_SENIORITY_NAMES = `CANDOLFO N.|RONCAGALLI M.|CASTELLARI M.|RASPOLINI F.|GARIANO A.|CINGARLINI N.|MESSINA G.|STEFANI D.|BERNARDELLI M.|VALENTI M.|GAVIOLI D.|LORENZINI F.|DAL BOSCO G.|MAROGNA S.|BARZOI A.|FERRARI M.|KARPATI L.|SERVINO S.|COLO' J.|PINCELLI A.|OMEZZOLLI O.|GAROFALO A.|GUADAGNOLO O.|PERINI N.|TAMBURINI A.|MAFFEI K.|POLETTINI T.|AMATO M.|MIORELLI A.|GUARISE R.|MESSINA GNI.|BERNARDELLI S.|FACCOLI A.|DEFANT M.|RIGOBELLO M.|BOCCOLA G.|CARLETTI A.|SCARMIGLIATI M.|TONONI R.|FERTONANI GL.|SISTO S.|GENOCCHIO PC.|MEMINI I.|FERRARO V.|ALGERI A.|TONELLI D.|RAMBALDINI M.|ZANINI GL.|VINCIATI C.|GONZALEZ E.|FORESTI A.|TOSINI GL.|DA FORNO F.|BOTTURI D.|CENTONZA P.F.|FERRARI P.|BUCCHIERI N.|MORETTO A.C.|STRINGHINI G.|MODENA L.|LUGOBONI A.|VERTUA F.|AMADORI D.|CIVETTINI G.|TIBILETTI F.|BITTURINI D.|GASPARINI F.|BURDO A.|GRUMELLI M.|BETTINI M.|GIACCI GL.|AVANZINI A.|GHIZZI E.|ZENEGAGLIA D.|COSTAMAGNA S.|PROSPERO L.|SCANNAPIECO A.|CEFARIELLO G.|SQUARZONI P.|LA BELLA V.|CAMPOSTRINI E.|CHIMINELLI M.|BARBIERI G.|TANZI E.|VALOTTI G.|MONACO S.|PEROTTI F.|CAMPAGNARO R.|FRANZONI F.|DOLCERA L.|PEDRONI M.|STUMPO D.|BARTOLI F.|LONARDI N.|SCALA L.|BUTTURINI C.|GARDANI R.|BERSANELLI S.|SCARMIGLIATI A.|CACEFFO M.|SPILLER M.|BERGAMINI D.|PAIOLA D.|VERITA' M.|PITTIGLIANI F.|VALLE M.|PUSINELLI L.|CASTELLINI F.|LAVELLI D.|LUGO G.|PEGORARI C.|MOSCATELLI A.|CENZON A.|PEROTTI D.|SAMBERO A.|BERTAJOLA D.|BERTUZZO F.|CHIGNOLA M.|TAMIOZZO M.|GOLA M.|FONTANA A.|FORTE D.|SCHIPPERS E.|CALANCHI N.|HARRABI S.|RIGHETTI M.|POLLONI G.|REGA F.|TURRINI M.|BITTURINI N.|VULTAGGIO F.|NIZI M.|MARCOLINI A.|PEGORARI L.|CHIMINI M.|BUTTITTA A.|MOSELE M.|MENEGHETTI G.|PERINELLI A.|GHIDINELLI F.|MEDA M.|DALLA BONA M.|MALVONE S.|PRADELLA P.|MOSELE S.|BIGNOTTI F.|CUPOLILLO M.`.split('|');
  const normalizeName = value => String(value || '').trim().toLocaleUpperCase('it').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
  const SENIORITY = new Map(PDF_SENIORITY_NAMES.map((name, index) => [normalizeName(name), index]));

  const GRADE_CLASS = {
    capitano:'grado-capitano', comandante:'grado-capitano',
    'capo timoniere':'grado-capo', capotimoniere:'grado-capo',
    motorista:'grado-motorista', timoniere:'grado-timoniere',
    'aiuto motorista':'grado-aiuto', aiutomotorista:'grado-aiuto',
    marinaio:'grado-marinaio', operaio:'grado-operaio', barista:'grado-barista',
    movimento:'grado-ufficio-movimento', amministrazione:'grado-ufficio-amministrazione',
    personale:'grado-ufficio-personale', controllo:'grado-ufficio-controllo', direzione:'grado-ufficio-direzione'
  };
  const GRADE_RANK = {
    'grado-capitano':1, 'grado-capo':1, 'grado-motorista':2, 'grado-timoniere':3,
    'grado-aiuto':4, 'grado-marinaio':5, 'grado-operaio':6, 'grado-barista':7,
    'grado-ufficio-movimento':8, 'grado-ufficio-amministrazione':9,
    'grado-ufficio-personale':10, 'grado-ufficio-controllo':11, 'grado-ufficio-direzione':12
  };
  const GRADE_LABEL = {
    'grado-capitano':'Capitano','grado-capo':'Capo Timoniere','grado-motorista':'Motorista',
    'grado-timoniere':'Timoniere','grado-aiuto':'Aiuto Motorista','grado-marinaio':'Marinaio',
    'grado-operaio':'Operaio','grado-barista':'Barista','grado-ufficio-movimento':'Movimento',
    'grado-ufficio-amministrazione':'Amministrazione','grado-ufficio-personale':'Personale',
    'grado-ufficio-controllo':'Controllo','grado-ufficio-direzione':'Direzione'
  };

  function gradeClass(agent) {
    const q = String(agent?.grado || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
    return GRADE_CLASS[q] || 'grado-altro';
  }
  function seniorityRank(agent) { return SENIORITY.get(normalizeName(agent?.nome_completo)) ?? Number.POSITIVE_INFINITY; }
  function compareAgents(a, b) {
    const ga = gradeClass(a), gb = gradeClass(b);
    const rank = (GRADE_RANK[ga] || 99) - (GRADE_RANK[gb] || 99);
    if (rank) return rank;
    if ((GRADE_RANK[ga] || 99) === 1 && ga !== gb) return ga === 'grado-capitano' ? -1 : 1;
    const seniority = seniorityRank(a) - seniorityRank(b);
    if (Number.isFinite(seniority) && seniority) return seniority;
    if (Number.isFinite(seniorityRank(a)) !== Number.isFinite(seniorityRank(b))) return Number.isFinite(seniorityRank(a)) ? -1 : 1;
    return String(a.nome_completo || '').localeCompare(String(b.nome_completo || ''), 'it');
  }

  function toIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
  function mondayOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function daysInRange() { return Array.from({ length:28 }, (_, i) => addDays(rangeStart, i)); }
  function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
  function pbDate(iso) { return `${iso} 00:00:00.000Z`; }
  function labelRange() {
    const end = addDays(rangeStart, 27);
    const fmt = new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'short', year:'numeric' });
    return `${fmt.format(rangeStart)} → ${fmt.format(end)}`;
  }
  function shiftClass(service) {
    const s = String(service || '').toUpperCase();
    if (s === 'RIP') return 'shift-rip';
    if (/^D\d|^BIS/.test(s)) return 'shift-d';
    if (/^P\d|^PON/.test(s)) return 'shift-p';
    if (/^R\d/.test(s)) return 'shift-r';
    if (/^T\d|^M\d|^CAR|^CAP|^SR/.test(s)) return 'shift-t';
    if (/^DT|^LAV|^TERRA/.test(s)) return 'shift-terra';
    if (/^CON|^F\.P\.|^S\.S\.|^MAL/.test(s)) return 'shift-special';
    return 'shift-other';
  }

  async function loadAgents() {
    allAgents = await NaviV2PB.listAll('agenti', {
      filter:'attivo = true',
      fields:'id,legacy_id,nome_completo,residenza,grado,ruolo,attivo',
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
    const me = NaviV2PB.agent();
    const meAgent = allAgents.find(agent => String(agent.id) === String(me?.id));
    const residenceAgents = allAgents.filter(agent => String(agent.residenza || '') === residence);
    const agents = meAgent && !residenceAgents.some(agent => String(agent.id) === String(meAgent.id))
      ? [meAgent, ...residenceAgents]
      : residenceAgents;
    const meId = NaviV2PB.escapeFilter(me?.id || '');
    const scope = meId
      ? `(residenza = "${escapedResidence}" || agente = "${meId}")`
      : `residenza = "${escapedResidence}"`;
    const filter = `data >= "${pbDate(startIso)}" && data <= "${pbDate(endIso)}" && ${scope} && stato != "annullato"`;
    try {
      const rows = await NaviV2PB.listAll('turni_effective', {
        filter,
        sort:'data',
        fields:'id,agente,data,servizio,servizio_base,origine_effective,stato,versione,residenza',
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
    const mine = agents.find(agent => String(agent.id) === String(me?.id));
    const rest = agents.filter(agent => String(agent.id) !== String(me?.id)).sort(compareAgents);
    const sorted = mine ? [mine, ...rest] : rest;
    const fmtDow = new Intl.DateTimeFormat('it-IT', { weekday:'short' });
    const fmtMonth = new Intl.DateTimeFormat('it-IT', { month:'long', year:'numeric' });

    const dateMeta = new Map(days.map(day => {
      const iso = toIso(day);
      const dayRows = rows.filter(row => String(row.data).slice(0,10) === iso);
      return [iso, {
        bozza:dayRows.some(row => String(row.stato) === 'bozza'),
        changed:dayRows.some(row => String(row.origine_effective) !== 'turno_importato'),
        sunday:day.getDay() === 0,
      }];
    }));

    const monthGroups = [];
    days.forEach(day => {
      const key = `${day.getFullYear()}-${day.getMonth()}`;
      const last = monthGroups[monthGroups.length - 1];
      if (last?.key === key) last.count += 1;
      else monthGroups.push({ key, count:1, label:fmtMonth.format(day).toLocaleUpperCase('it') });
    });
    const monthHeader = monthGroups.map(group => `<th class="month-group" colspan="${group.count}">${escapeHtml(group.label)}</th>`).join('');

    const header = days.map(day => {
      const iso = toIso(day), meta = dateMeta.get(iso);
      const cls = [meta.sunday ? 'dom' : '', meta.bozza ? 'bozza-col' : ''].filter(Boolean).join(' ');
      return `<th class="day ${cls}" data-date="${iso}"><span class="day-name">${escapeHtml(fmtDow.format(day))}</span><span class="day-number">${day.getDate()}</span><span class="date-head-markers">${meta.changed ? '<i class="date-head-ods" title="Sono presenti variazioni effettive"></i>' : ''}</span><span class="week-draft-label ${meta.bozza ? '' : 'is-empty'}">BOZZA</span></th>`;
    }).join('');

    let previousGrade = null;
    const body = sorted.map(agent => {
      const gClass = gradeClass(agent);
      const startsGrade = previousGrade !== null && gClass !== previousGrade;
      previousGrade = gClass;
      const cells = days.map(day => {
        const iso = toIso(day);
        const row = byAgentDate.get(`${agent.id}|${iso}`);
        const service = String(row?.servizio || '—').toUpperCase();
        const changed = row && row.origine_effective !== 'turno_importato';
        const meta = dateMeta.get(iso);
        const tdClass = [meta?.sunday ? 'dom' : '', meta?.bozza ? 'bozza-col' : ''].filter(Boolean).join(' ');
        return `<td class="${tdClass}" data-date="${iso}" data-service="${escapeHtml(service)}"><span class="cell-pill ${shiftClass(service)} ${changed ? `changed origin-${escapeHtml(row.origine_effective)}` : ''}">${escapeHtml(service)}</span></td>`;
      }).join('');
      const isMine = String(agent.id) === String(me?.id);
      const crossResidence = isMine && String(agent.residenza || '') !== String(residence || '');
      const rowClasses = [gClass, isMine ? 'logged-agent-row' : '', crossResidence ? 'cross-residence-self' : '', startsGrade && !isMine ? 'grade-separator' : ''].filter(Boolean).join(' ');
      return `<tr class="${rowClasses}" data-agent-id="${escapeHtml(agent.legacy_id)}">
        <td class="td-num" title="${escapeHtml(GRADE_LABEL[gClass] || agent.grado || '')}">${escapeHtml(agent.legacy_id || '')}</td>
        <td class="td-name" title="${escapeHtml(GRADE_LABEL[gClass] || agent.grado || '')}"><span class="agent-name">${escapeHtml(agent.nome_completo)}</span><span class="grade-dot" title="${escapeHtml(GRADE_LABEL[gClass] || agent.grado || '')}"></span></td>
        ${cells}
      </tr>`;
    }).join('');

    $('tableWrap').innerHTML = sorted.length
      ? `<table class="turni-table"><thead><tr class="month-header"><th class="num-head month-corner"></th><th class="name-head month-corner"></th>${monthHeader}</tr><tr class="date-header"><th class="num-head">N.</th><th class="name-head">${escapeHtml(residence)}</th>${header}</tr></thead><tbody>${body}</tbody></table>`
      : '<div class="empty">Nessun agente in questa residenza.</div>';
  }

  $('residence').addEventListener('change', event => { residence = event.target.value; load(); });
  $('prev').addEventListener('click', () => { rangeStart = addDays(rangeStart, -28); load(); });
  $('next').addEventListener('click', () => { rangeStart = addDays(rangeStart, 28); load(); });
  $('today').addEventListener('click', () => { rangeStart = mondayOf(new Date()); load(); });
  $('logout')?.addEventListener('click', () => { NaviV2PB.logout(); location.replace('index.html'); });

  (async () => {
    if (!(await NaviV2PB.requireSession())) return;
    const me = NaviV2PB.agent();
    $('who').textContent = `${me?.nome_completo || ''}${me?.residenza ? ` · ${me.residenza}` : ''}`;
    try { await loadAgents(); await load(); }
    catch (error) { $('status').textContent = error.message; }
  })();
})();
