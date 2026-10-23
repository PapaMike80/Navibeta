// Costruisci turno (admin): prepara i dati veri per il motore (costruisci-turno-motore.js) e mostra la bozza.
// Posti da coprire: turni nave in servizio ogni giorno (orario e stagione di Movimento), con l'equipaggio
// minimo della nave che fa quel turno (anagrafica navi di Movimento; se manca l'assegnazione del giorno,
// l'ultima nave nota per quel turno). Restano fissi i codici gia' nel turno che non sono turni nave ne' riposi.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const M = window.NaviCostruisciTurno, G = window.NaviTurniGiorno, O = window.NaviOrarioGiorno, C = window.NaviShiftCompetence, ST = window.NaviServiziTerra;
  const RESIDENZE = ['DESENZANO', 'MADERNO', 'RIVA', 'PESCHIERA'];
  const RUOLO = { Capitano: 'capitano', 'Capo timoniere': 'capo_timoniere', Timoniere: 'timoniere', Motorista: 'motorista', 'Aiuto motorista': 'aiuto_motorista', Marinaio: 'marinaio' };
  const RUOLO_INFO = { capitano: ['Cap', '#facc15', 'Capitani'], capo_timoniere: ['CT', '#fb923c', 'Capi timonieri'], timoniere: ['Tim', '#22c55e', 'Timonieri'],
    motorista: ['Mot', '#a855f7', 'Motoristi'], aiuto_motorista: ['AM', '#3b82f6', 'Aiuto motoristi'], marinaio: ['Mar', '#e8f3f6', 'Marinai'] };
  const EQUIPAGGIO_BASE = { capitano: 1, motorista: 1, marinaio: 2 };
  const GIORNI = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const state = { data: null, rows: [], fleet: {}, profili: {}, prefs: {}, aggiungi: '', dal: '', settimane: 4, res: 'DESENZANO', vista: 'bozza', risultato: null, attuale: null, input: null };

  const profilo = () => { try { return JSON.parse(localStorage.getItem('navidiaria.activeAgent') || localStorage.getItem('naviturni_logged_agent') || 'null'); } catch { return null; } };
  if (!window.NaviRoles?.isAdminAgent?.(profilo())) { location.replace('index.html'); return; }

  const base = code => String(code || '').trim().replace(/^c|c$|\*$/g, '');
  const isNave = code => !!M.residenzaTurno(G.naveCode(code) || base(code));
  const isRiposo = code => /^(|R|RIP\.?|RIP-+|RIPOSO|-+|—+|·)$/i.test(String(code || '').trim());
  // codici fissi che non sono giorni di lavoro: congedo, ferie, malattia, giornata impegnata (#), RF
  const lavoraFisso = code => { const c = String(code || '').trim(); return c !== '·' && !c.startsWith('#') && !/^F$/i.test(c) && !/^(CONG?|FERIE|MAL|MALATTIA|RF)(\b|[;.\/]|$)/i.test(c); };
  const norma = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Competenza di un servizio: ore, imbarco, diaria, ticket (tabella delle competenze della Distinta)
  function competenza(code, day) {
    const c0 = G.naveCode(code) || base(code), c = /^BIS\d$/i.test(c0) ? 'BIS' : c0; // BIS2: ore e competenze del BIS
    if (isRiposo(c)) return null;
    const s = C.shiftForCode(c, day);
    if (!s || !(Number(s.hours) > 0)) return null;
    const conge = s.code === 'CON';
    return { ore: Number(s.hours), imbarco: !!(s.embark ?? s.allowance), diaria: s.allowance ? Number(s.allowanceRate) || 0 : 0, ticket: !!s.meal, lavoro: !conge };
  }

  // Nave di un turno in un giorno: quella assegnata, altrimenti l'ultima nota prima di quel giorno
  function naveDi(code, day) {
    const oggi = ST.naviDelGiorno(state.rows, day)[code];
    if (oggi) return oggi;
    const prima = state.rows.filter(r => String(r.corsa || '').toUpperCase().replace(/\s+/g, '').split('/').includes(code) && r.nave && String(r.data) < day)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
    return prima ? String(prima.nave).replace(/\s*(\([A-Z]\)|©)/g, '').trim() : '';
  }
  function equipaggioDi(nave, day) {
    const ship = Object.values(state.fleet).find(n => norma(n?.nome) === norma(nave)) || Object.values(state.fleet).find(n => norma(nave).includes(norma(n?.nome)) && norma(n?.nome));
    const periodi = (Array.isArray(ship?.periodi) ? ship.periodi : Object.values(ship?.periodi || {})).filter(Boolean).sort((a, b) => String(a.dal || '').localeCompare(String(b.dal || '')));
    const p = periodi.filter(x => String(x.dal || '') <= day).pop();
    const eq = p?.equipaggio && Object.values(p.equipaggio).some(n => Number(n) > 0) ? p.equipaggio : null;
    return { equipaggio: eq || EQUIPAGGIO_BASE, stimato: !eq };
  }

  // Periodo del turno: settimane intere da lunedi' a domenica (2 o 4), come i turni dell'ufficio
  const giorniDelPeriodo = () => Array.from({ length: state.settimane * 7 }, (_, i) => M.addDays(state.dal, i));
  const lunediDi = iso => M.addDays(iso, -((new Date(`${iso}T12:00:00`).getDay() + 6) % 7));

  // Agenti di bordo con grado e residenza (stagionali dalla scheda agente: categoria e date del contratto)
  function elencoAgenti() {
    const out = [], visti = new Set();
    Object.entries(state.data?.residenze || {}).forEach(([res, list]) => (list || []).forEach(a => {
      const id = String(a?.id || ''), ruolo = RUOLO[G.gradoOf(a)[0]];
      const sv = (state.profili[id] || Object.values(state.profili).find(p => String(p?.id) === id) || {}).servizio;
      const stagionale = sv?.categoria === 'stagionali' ? sv : null;
      if (!id || (!ruolo && !stagionale) || visti.has(id) || window.NaviRoles?.isBaristaAgent?.(a)) return;
      visti.add(id);
      out.push({ a, id, ruolo: ruolo || 'marinaio', residenza: RESIDENZE.find(r => norma(res).includes(r)) || norma(res), stagionale });
    }));
    return out;
  }
  // Ferie e ore: le compila l'ufficio. In beta restano su questo dispositivo (navibeta non salva online).
  const PREFS_KEY = 'navisuite.costruisciTurno.prefs.v1';
  try { state.prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { state.prefs = {}; }
  function salvaPrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch { /* memoria piena o bloccata */ } }

  // ---------------- Navi e corse del periodo (piano dell'ufficio; le navi vere le assegnano gli ODS) ----------------
  // piano[codice] = { attivo: true|false|undefined, nave: '', corseTolte: [n], giorni: { iso: { nave, fermo } } }
  const NAVI_KEY = 'navisuite.costruisciTurno.navi.v1';
  const chiavePeriodo = () => `${state.dal}|${state.settimane}`;
  function pianoNavi() {
    try { const tutti = JSON.parse(localStorage.getItem(NAVI_KEY) || '{}') || {}; return tutti[chiavePeriodo()] || {}; } catch { return {}; }
  }
  function salvaPianoNavi(piano) {
    try { const tutti = JSON.parse(localStorage.getItem(NAVI_KEY) || '{}') || {}; tutti[chiavePeriodo()] = piano; localStorage.setItem(NAVI_KEY, JSON.stringify(tutti)); } catch { /* memoria non disponibile */ }
  }
  const estateDi = day => day >= O.ESTATE[0] && day <= O.ESTATE[1];
  // turni nave possibili nel periodo (orario estivo e invernale, BIS e BIS2 di supporto)
  const turniDelPeriodo = () => [...new Set([...O.TURNI_ESTATE, ...O.TURNI, 'BIS', 'BIS2'])].filter(c => M.residenzaTurno(c));
  // in servizio secondo l'orario (prima delle scelte dell'ufficio)
  function inServizioOrario(code, day) {
    if (code === 'BIS2') return false; // si accende a mano, in stagione, a supporto del BIS
    if (code === 'BIS') return estateDi(day) || !!ST.naviDelGiorno(state.rows, day).BIS;
    return (estateDi(day) ? O.TURNI_ESTATE : O.TURNI).includes(code) && O.inServizio(code, day);
  }
  function inServizioPiano(code, day) {
    const r = pianoNavi()[code] || {};
    if (r.giorni?.[day]?.fermo) return false;
    return r.attivo === undefined ? inServizioOrario(code, day) : r.attivo;
  }
  function navePiano(code, day) {
    const r = pianoNavi()[code] || {};
    return r.giorni?.[day]?.nave || r.nave || naveDi(code === 'BIS2' ? 'BIS' : code, day);
  }
  // corse del turno secondo l'orario ("14–19", "91–93 · 95–98" -> [14..19], [91..93, 95..98])
  function corseDi(code, day) {
    const trips = String(window.NaviCourseInfo?.info?.(code, day)?.trips || '');
    return trips.split('·').flatMap(part => { const m = part.match(/(\d+)\s*[–-]\s*(\d+)/); if (m) { const out = []; for (let n = +m[1]; n <= +m[2]; n += 1) out.push(n); return out; } const k = part.match(/\d+/); return k ? [+k[0]] : []; });
  }
  // firma dell'equipaggio (per proporre prima le navi «simili»)
  const firma = eq => M.RUOLI.map(r => Number(eq?.[r]) || 0).join('-');

  // Dati per il motore
  function preparaInput() {
    const giorni = giorniDelPeriodo();
    O.stagioneDaRighe(state.rows);
    const posti = {}, senzaNave = new Set();
    giorni.forEach(day => {
      posti[day] = turniDelPeriodo().filter(code => inServizioPiano(code, day)).flatMap(code => {
        const residenza = M.residenzaTurno(code);
        if (!residenza) return [];
        const { equipaggio, stimato } = equipaggioDi(navePiano(code, day), day);
        if (stimato) senzaNave.add(code);
        return Object.entries(equipaggio).flatMap(([ruolo, n]) => Array(Number(n) || 0).fill({ turno: code, residenza, ruolo }));
      });
    });
    const prima = Array.from({ length: 7 }, (_, i) => M.addDays(giorni[0], -7 + i));
    const agenti = [], visti = new Set();
    elencoAgenti().forEach(({ a, id, residenza, ruolo, stagionale }) => {
      const pref = state.prefs[id] || {}, ore = pref.ore || 'normale';
      const fissi = {}, attuale = {}, precedenti = {};
      giorni.forEach(g => {
        const code = String(a.turni?.[g] ?? '').trim();
        if (code) attuale[g] = code;
        if (code && !isRiposo(code) && !isNave(code)) fissi[g] = code;
        // ferie inserite dall'ufficio: giorni fissi di congedo
        if ((pref.ferie || []).some(f => g >= f.dal && g <= f.al)) fissi[g] = 'Cong';
        // stagionali: fuori dal contratto non sono disponibili
        if (stagionale && (g < (stagionale.inizio || '0000') || g > (stagionale.fine || '9999'))) fissi[g] = '·';
      });
      prima.forEach(g => { const code = String(a.turni?.[g] ?? '').trim(); if (code && !isRiposo(code)) precedenti[g] = G.naveCode(code) || code; });
      agenti.push({ id, nome: String(a.agente || a.name || id).trim(), ruolo: stagionale ? 'marinaio' : ruolo, residenza, fissi, prima: precedenti, attuale,
        ore, stagionale: !!stagionale, gruppo: `${stagionale ? 'marinaio' : ruolo}|${residenza}|${ore}|${stagionale ? 'stagionali' : 'stabili'}` });
    });
    return { giorni, posti, agenti, senzaNave: [...senzaNave] };
  }

  // ---------------- Disegno ----------------
  const eur = n => `${Math.round(n).toLocaleString('it-IT')} €`;
  function cella(code, { fisso, ecc } = {}) {
    if (!code || isRiposo(code)) return '<span class="c rip">·</span>';
    const b = G.naveCode(code) || base(code), trasf = /^c|c$/.test(String(code)) && isNave(code);
    if (fisso || !isNave(code)) return `<span class="c fisso" title="${esc(code)}">${esc(String(code).slice(0, 4))}</span>`;
    const col = G.coloreTurno(b);
    return `<span class="c${trasf ? ' tr' : ''}${ecc ? ' warn' : ''}" style="background:${col};color:${G.testoSu(col)}" title="${esc(code)}">${esc(b)}</span>`;
  }
  function statistiche(riep) {
    const perRuolo = {};
    riep.filter(a => a.giorniLavoro > 0).forEach(a => { (perRuolo[a.ruolo + '|' + a.residenza] = perRuolo[a.ruolo + '|' + a.residenza] || []).push(a); });
    const scarti = Object.values(perRuolo).filter(l => l.length > 1).map(l => Math.max(...l.map(a => a.lordoMese)) - Math.min(...l.map(a => a.lordoMese)));
    return { scartoMedio: scarti.length ? scarti.reduce((s, x) => s + x, 0) / scarti.length : 0, straord: riep.length ? riep.reduce((s, a) => s + a.straord, 0) / Math.max(1, riep.filter(a => a.giorniLavoro).length) : 0 };
  }
  // ---------------- Ferie e ore · Stagionali ----------------
  const ORE = [['39', 'Solo 39 h'], ['normale', 'Normale'], ['max', 'Più straordinario']];
  const dm = iso => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
  function seg(id) {
    const ore = state.prefs[id]?.ore || 'normale';
    return `<span class="seg">${ORE.map(([v, l]) => `<button type="button" data-ore="${v}" data-id="${esc(id)}" class="${v === ore ? 'on' : ''}">${l}</button>`).join('')}</span>`;
  }
  function ferieHtml(id) {
    const ferie = state.prefs[id]?.ferie || [];
    const pills = ferie.map((f, i) => `<span class="fer">${f.dal === f.al ? dm(f.dal) : `${dm(f.dal)}–${dm(f.al)}`}<button type="button" data-togli="${esc(id)}|${i}" aria-label="Togli">✕</button></span>`).join('');
    const form = state.aggiungi === id
      ? `<span class="agg"><input type="date" id="ct-f-dal" value="${esc(state.dal)}"> – <input type="date" id="ct-f-al" value="${esc(state.dal)}"><button type="button" class="mini ok" data-conferma="${esc(id)}">Aggiungi</button><button type="button" class="mini" data-annulla>Annulla</button></span>`
      : `<button type="button" class="mini" data-agg="${esc(id)}">＋ ferie</button>`;
    return pills + form;
  }
  function navePianoHtml(giorni) {
    const piano = pianoNavi(), flotta = Object.values(state.fleet || {}).filter(n => n?.nome && n.attiva !== false);
    const codici = turniDelPeriodo().filter(c => M.residenzaTurno(c) === state.res);
    const breve = n => String(n || '').replace(/^(S\.|SAN|SANTA)\s*/i, '').slice(0, 3).toUpperCase() || '—';
    const righe = codici.map(code => {
      const r = piano[code] || {}, on = giorni.some(g => inServizioPiano(code, g));
      const nave = r.nave || naveDi(code === 'BIS2' ? 'BIS' : code, giorni[0]);
      const { equipaggio, stimato } = equipaggioDi(nave, giorni[0]);
      const sig = firma(equipaggio);
      const opzioni = flotta.map(n => ({ nome: n.nome, simile: firma(equipaggioDi(n.nome, giorni[0]).equipaggio) === sig }))
        .sort((a, b) => (b.simile - a.simile) || a.nome.localeCompare(b.nome, 'it'));
      const sel = `<select data-nave-turno="${code}"><option value="">${esc(nave || 'Nave non indicata')}</option>${opzioni.map(o => `<option value="${esc(o.nome)}"${o.nome === r.nave ? ' selected' : ''}>${esc(o.nome)}${o.simile ? ' · simile' : ''}</option>`).join('')}</select>`;
      const eqTxt = stimato ? 'equipaggio di base (nave non in anagrafica)' : M.RUOLI.filter(k => Number(equipaggio[k]) > 0).map(k => `${RUOLO_INFO[k][0]} ${equipaggio[k]}`).join(' · ');
      const corse = code === 'BIS2' ? '<span class="nota">a supporto del BIS</span>' : (() => {
        const l = corseDi(code, giorni[0]);
        return l.length ? l.map(n => `<button type="button" class="cr${(r.corseTolte || []).includes(n) ? ' no' : ''}" data-corsa="${code}|${n}">${n}</button>`).join('') : '<span class="nota">a disposizione</span>';
      })();
      const striscia = giorni.map((g, i) => {
        const gg = r.giorni?.[g] || {}, va = inServizioPiano(code, g), nv = navePiano(code, g);
        const cls = !va ? (gg.fermo ? 'g off' : 'g spento') : gg.nave ? 'g ecc' : 'g';
        return `${i && new Date(`${g}T12:00:00`).getDay() === 1 ? '<span class="sepg"></span>' : ''}<button type="button" class="${cls}" data-giorno-turno="${code}|${g}" title="${esc(g.split('-').reverse().join('/'))} · ${va ? esc(nv || '—') : 'fermo'}">${va ? esc(breve(nv)) : '—'}</button>`;
      }).join('');
      const eccezioni = Object.entries(r.giorni || {}).filter(([, v]) => v.nave || v.fermo);
      const nAltra = eccezioni.filter(([, v]) => v.nave).length, nFermo = eccezioni.filter(([, v]) => v.fermo).length, gg = n => `${n} ${n === 1 ? 'giorno' : 'giorni'}`;
      const nota = [nAltra ? `${gg(nAltra)} su un'altra nave` : '', nFermo ? `fermo ${gg(nFermo)}` : '', (r.corseTolte || []).length ? `corse tolte: ${r.corseTolte.join(', ')}` : ''].filter(Boolean).join(' · ');
      let editor = '';
      if (state.giornoAperto?.startsWith(code + '|')) {
        const g = state.giornoAperto.split('|')[1], gg = r.giorni?.[g] || {};
        editor = `<div class="edit-g"><b>${code} · ${esc(g.split('-').reverse().join('/'))}</b> Nave quel giorno <select id="ct-g-nave"><option value="">come il periodo (${esc(nave || '—')})</option>${opzioni.map(o => `<option value="${esc(o.nome)}"${o.nome === gg.nave ? ' selected' : ''}>${esc(o.nome)}${o.simile ? ' · simile' : ''}</option>`).join('')}</select>
          <label><input type="checkbox" id="ct-g-fermo"${gg.fermo ? ' checked' : ''}> turno fermo quel giorno</label><label><input type="checkbox" id="ct-g-fino"> fino a fine periodo</label>
          <button type="button" class="mini ok" data-giorno-applica="${code}|${g}">Applica</button><button type="button" class="mini" data-giorno-chiudi>Chiudi</button></div>`;
      }
      const chip = `<span class="chip-t" style="background:${G.coloreTurno(code === 'BIS2' ? 'BIS' : code)};color:${G.testoSu(G.coloreTurno(code === 'BIS2' ? 'BIS' : code))}">${code}</span>`;
      return `<div class="nriga${on ? '' : ' spenta'}"><div class="nt"><button type="button" class="tg${on ? ' on' : ''}" data-attivo="${code}" aria-pressed="${on}" aria-label="${code} in servizio"></button>${chip}</div>
        <div class="nv">${sel}<small>${esc(eqTxt)}</small></div><div class="cs">${corse}</div><div class="nstrip"><div class="strip">${striscia}</div>${nota ? `<small class="nota">${esc(nota)}</small>` : ''}</div>${editor}</div>`;
    }).join('');
    return `<details class="sez" style="--c:#38bdf8" ${state.apriNavi === false ? '' : 'open'} data-sez="navi"><summary><h3>⚓ Navi e corse · ${esc(state.res.charAt(0) + state.res.slice(1).toLowerCase())}</h3></summary>
      <p>Per ogni turno nave: se va, quale nave lo fa (il suo equipaggio minimo sono i posti da coprire) e quali corse fa. Di partenza: orario in vigore e ultima nave assegnata. Tocca un giorno per un'altra nave o per fermare il turno; tocca una corsa per toglierla (le ore del turno non cambiano). Le navi vere le assegnano gli ODS: qui servono solo a costruire il turno. In beta restano su questo dispositivo.</p>
      ${righe || '<p>Nessun turno nave in questa residenza.</p>'}</details>`;
  }
  function renderRichieste() {
    const box = $('ct-richieste');
    if (!state.data) { box.innerHTML = ''; return; }
    const giorni = giorniDelPeriodo(), nomeRes = state.res.charAt(0) + state.res.slice(1).toLowerCase();
    const lista = elencoAgenti().filter(x => x.residenza === state.res)
      .sort((x, y) => M.RUOLI.indexOf(x.ruolo) - M.RUOLI.indexOf(y.ruolo) || String(x.a.agente).localeCompare(String(y.a.agente), 'it'));
    const badge = ruolo => { const [sig, col] = RUOLO_INFO[ruolo]; return `<span class="gr" style="--g:${col}">${sig}</span>`; };
    const stabili = lista.filter(x => !x.stagionale), stag = lista.filter(x => x.stagionale);
    const righe = stabili.map(x => `<tr><td>${badge(x.ruolo)}${esc(x.a.agente)}</td><td>${seg(x.id)}</td><td>${ferieHtml(x.id)}</td></tr>`).join('');
    const righeS = stag.map(x => {
      const sv = x.stagionale, n = giorni.filter(g => g >= (sv.inizio || '0000') && g <= (sv.fine || '9999')).length;
      const nota = n === 0 ? '<span class="tag ro">fuori contratto</span>' : sv.fine && sv.fine < giorni[giorni.length - 1] ? `<span class="tag wa">finisce il ${dm(sv.fine)}</span>` : sv.inizio && sv.inizio > giorni[0] ? `<span class="tag ok">arriva il ${dm(sv.inizio)}</span>` : '';
      const grado = x.ruolo !== 'marinaio' ? ` <span class="tag wa">registrato come ${esc({ capitano: 'capitano', capo_timoniere: 'capo timoniere', timoniere: 'timoniere', motorista: 'motorista', aiuto_motorista: 'aiuto motorista' }[x.ruolo] || x.ruolo)}: conta come marinaio</span>` : '';
      return `<tr><td>${badge('marinaio')}${esc(x.a.agente)}</td><td class="mono">${sv.inizio ? dm(sv.inizio) + '/' + sv.inizio.slice(0, 4) : '—'} – ${sv.fine ? dm(sv.fine) + '/' + sv.fine.slice(0, 4) : '—'}</td><td>${n} su ${giorni.length} ${nota}</td><td>${seg(x.id)}</td><td>solo marinaio${grado}</td><td>${ferieHtml(x.id)}</td></tr>`;
    }).join('');
    box.innerHTML = navePianoHtml(giorni) + `<details class="sez" style="--c:var(--violet)" ${state.apriFerie === false ? '' : 'open'} data-sez="ferie"><summary><h3>🗂 Ferie e ore · ${esc(nomeRes)}</h3></summary>
      <p>Le compila l'ufficio. «Quanto lavora» vale anche per i periodi successivi finché non la cambi; le ferie diventano giorni fissi di congedo (Cong). In beta restano su questo dispositivo.</p>
      ${righe ? `<div class="scroll" style="max-height:360px"><table class="tab"><tr><th>AGENTE</th><th>QUANTO LAVORA</th><th>FERIE</th></tr>${righe}</table></div>` : '<p>Nessun agente.</p>'}</details>
      <details class="sez" style="--c:#4ade80" ${stag.length ? 'open' : ''} data-sez="stag"><summary><h3>🌊 Stagionali · ${esc(nomeRes)}</h3><b class="pill">${stag.length}</b></summary>
      <p>Dalla scheda agente (categoria «Stagionali» con data di inizio e fine). Coprono solo posti da marinaio e solo nei giorni del contratto; il loro lordo si confronta tra stagionali.</p>
      ${righeS ? `<div class="scroll" style="max-height:300px"><table class="tab"><tr><th>AGENTE</th><th>CONTRATTO</th><th>GIORNI NEL PERIODO</th><th>QUANTO LAVORA</th><th>POSTO</th><th>FERIE</th></tr>${righeS}</table></div>` : '<p>Nessuno stagionale in questa residenza.</p>'}</details>`;
  }
  function cambiato() {
    salvaPrefs();
    if (state.risultato) $('ct-stato').textContent = 'Ferie e ore cambiate: premi «Genera bozza» per aggiornare la bozza.';
    renderRichieste();
  }
  $('ct-richieste').addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    const piano = pianoNavi(), riga = code => (piano[code] = piano[code] || {});
    const salvaNavi = () => { salvaPianoNavi(piano); if (state.risultato) $('ct-stato').textContent = 'Navi e corse cambiate: premi «Genera bozza» per aggiornare la bozza.'; renderRichieste(); };
    if (t.dataset.attivo) { const code = t.dataset.attivo; riga(code).attivo = t.getAttribute('aria-pressed') !== 'true'; salvaNavi(); return; }
    if (t.dataset.corsa) { const [code, n] = t.dataset.corsa.split('|'), r = riga(code), k = Number(n); r.corseTolte = (r.corseTolte || []).includes(k) ? r.corseTolte.filter(x => x !== k) : [...(r.corseTolte || []), k].sort((a, b) => a - b); salvaNavi(); return; }
    if (t.dataset.giornoTurno) { state.giornoAperto = state.giornoAperto === t.dataset.giornoTurno ? '' : t.dataset.giornoTurno; renderRichieste(); return; }
    if ('giornoChiudi' in t.dataset) { state.giornoAperto = ''; renderRichieste(); return; }
    if (t.dataset.giornoApplica) {
      const [code, g] = t.dataset.giornoApplica.split('|'), r = riga(code), nave = $('ct-g-nave').value, fermo = $('ct-g-fermo').checked;
      const giorni = $('ct-g-fino').checked ? giorniDelPeriodo().filter(x => x >= g) : [g];
      r.giorni = r.giorni || {};
      giorni.forEach(x => { if (!nave && !fermo) delete r.giorni[x]; else r.giorni[x] = { ...(nave ? { nave } : {}), ...(fermo ? { fermo: true } : {}) }; });
      state.giornoAperto = ''; salvaNavi(); return;
    }
    if (t.dataset.ore) { const id = t.dataset.id; state.prefs[id] = { ...(state.prefs[id] || {}), ore: t.dataset.ore }; cambiato(); }
    else if (t.dataset.agg) { state.aggiungi = t.dataset.agg; renderRichieste(); }
    else if ('annulla' in t.dataset) { state.aggiungi = ''; renderRichieste(); }
    else if (t.dataset.conferma) {
      const id = t.dataset.conferma, dal = $('ct-f-dal').value, al = $('ct-f-al').value || dal;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dal) || al < dal) { $('ct-stato').textContent = 'Ferie: controlla le date (la fine non può essere prima dell’inizio).'; return; }
      const p = state.prefs[id] || {};
      state.prefs[id] = { ...p, ferie: [...(p.ferie || []), { dal, al }].sort((x, y) => x.dal.localeCompare(y.dal)) };
      state.aggiungi = ''; cambiato();
    } else if (t.dataset.togli) {
      const [id, i] = t.dataset.togli.split('|');
      const p = state.prefs[id] || {};
      state.prefs[id] = { ...p, ferie: (p.ferie || []).filter((_, k) => k !== Number(i)) };
      cambiato();
    }
  });
  $('ct-richieste').addEventListener('toggle', e => { if (e.target.dataset?.sez === 'ferie') state.apriFerie = e.target.open; if (e.target.dataset?.sez === 'navi') state.apriNavi = e.target.open; }, true);
  $('ct-richieste').addEventListener('change', e => {
    const code = e.target.dataset?.naveTurno;
    if (!code) return;
    const piano = pianoNavi();
    piano[code] = { ...(piano[code] || {}), nave: e.target.value || undefined };
    salvaPianoNavi(piano);
    if (state.risultato) $('ct-stato').textContent = 'Navi e corse cambiate: premi «Genera bozza» per aggiornare la bozza.';
    renderRichieste();
  });

  function render() {
    const r = state.vista === 'bozza' ? state.risultato : state.attuale;
    $('ct-res').querySelectorAll('[data-res]').forEach(b => b.classList.toggle('on', b.dataset.res === state.res));
    renderRichieste();
    $('ct-vista').querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('on', b.dataset.vista === state.vista));
    if (!r) { $('ct-kpi').innerHTML = ''; $('ct-griglia').innerHTML = '<p class="vuoto">Scegli il periodo e premi «Genera bozza».</p>'; $('ct-lati').innerHTML = ''; return; }
    const { giorni } = state.input;
    const st = statistiche(r.riepilogo);
    const tr = r.eccezioni.filter(e => e.tipo === 'trasferta').length;
    const coperti = r.totPosti - r.scoperti.length;
    $('ct-kpi').innerHTML = [
      ['var(--green)', 'Posti coperti', `${coperti}/${r.totPosti}`, `turni nave × equipaggio · ${giorni.length} giorni`],
      ['var(--rose)', 'Posti scoperti', String(r.scoperti.length), r.scoperti.length ? 'da sistemare a mano' : 'nessuna corsa a rischio'],
      ['var(--amber)', 'Trasferte', String(tr), tr ? 'solo dove serviva' : 'nessuna'],
      ['var(--violet)', 'Straordinari', `≈ ${Math.round(st.straord)} h`, 'media del periodo per agente'],
      ['var(--teal)', 'Equità', `±${Math.round(st.scartoMedio / 2)} €`, 'scarto medio dentro i gradi']
    ].map(([c, t, v, s]) => `<div class="k" style="--c:${c}"><small>${t}</small><b>${esc(v)}</b><span>${esc(s)}</span></div>`).join('');
    const ecc = new Set(r.eccezioni.filter(e => e.tipo !== 'trasferta').map(e => `${e.agente}|${e.giorno}`));
    const lista = r.riepilogo.filter(a => a.residenza === state.res).sort((a, b) => M.RUOLI.indexOf(a.ruolo) - M.RUOLI.indexOf(b.ruolo) || a.nome.localeCompare(b.nome, 'it'));
    const agentiInput = Object.fromEntries(state.input.agenti.map(a => [a.id, a]));
    const testa = giorni.map(g => { const d = new Date(`${g}T12:00:00`), dom = M.festivo(g); return `<th class="${dom ? 'dom' : ''}">${GIORNI[d.getDay()]}<br>${d.getDate()}</th>`; }).join('');
    const righe = lista.map(a => {
      const [sig, col] = RUOLO_INFO[a.ruolo];
      return `<tr><td class="n"><span class="gr" style="--g:${col}">${sig}</span>${esc(a.nome)}</td>` +
        giorni.map(g => `<td>${cella(a.piano[g], { fisso: !!agentiInput[a.id]?.fissi?.[g], ecc: ecc.has(`${a.nome}|${g}`) })}</td>`).join('') + '</tr>';
    }).join('');
    const dd = g => `${Number(g.slice(8, 10))} ${MESI[Number(g.slice(5, 7)) - 1].slice(0, 3)}`;
    const titolo = `${state.vista === 'bozza' ? 'Bozza' : 'Turno attuale'} · dal ${dd(giorni[0])} al ${dd(giorni[giorni.length - 1])} · ${state.res.charAt(0) + state.res.slice(1).toLowerCase()}`;
    $('ct-griglia').innerHTML = `<h3>📋 ${esc(titolo)}</h3><p>${state.vista === 'bozza' ? 'Congedi, lavori e giornate impegnate già nel turno restano fissi (in viola). Bordo giallo tratteggiato = trasferta, bordo rosso = regola allentata.' : 'Il turno com’è adesso nei dati di NaviTurni, valutato con gli stessi conti della bozza.'}</p>` +
      (lista.length ? `<div class="scroll"><table><tr><th></th>${testa}</tr>${righe}</table></div>` : '<p class="vuoto">Nessun agente con grado di bordo in questa residenza.</p>') +
      `<div class="leg"><span class="c" style="background:#3b6bcc;color:#fff">D1</span>turno nave <span class="c rip">·</span>riposo <span class="c fisso">Cong</span>fisso <span class="c tr" style="background:#60a5fa">P1</span>trasferta <span class="c warn" style="background:#2d9e6b;color:#fff">D2</span>regola allentata</div>`;
    // Da guardare
    const nomiRes = new Set(lista.map(a => a.nome));
    const guarda = [
      ...r.scoperti.filter(s => M.residenzaTurno(s.turno) === state.res).map(s => ({ c: 'var(--rose)', g: s.giorno, t: `${s.turno}: manca ${(RUOLO_INFO[s.ruolo] || [s.ruolo])[0]} — nessuno libero` })),
      ...r.eccezioni.filter(e => nomiRes.has(e.agente)).map(e => ({ c: e.tipo === 'trasferta' ? 'var(--amber)' : 'var(--rose)', g: e.giorno, t: e.testo }))
    ].sort((a, b) => a.g.localeCompare(b.g));
    const gg = g => { const d = new Date(`${g}T12:00:00`); return `${['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()]} ${d.getDate()}`; };
    const senza = state.vista === 'bozza' && state.input.senzaNave.length ? `<p>Equipaggio di base (1 Cap, 1 Mot, 2 Mar) per ${esc(state.input.senzaNave.join(', '))}: manca la nave in Movimento.</p>` : '';
    const guardaHtml = `<div class="sez" style="--c:var(--rose)"><h3>⚠ Da guardare</h3>${senza}${guarda.length ? `<div class="list">${guarda.slice(0, 60).map(x => `<div class="it" style="--c:${x.c}"><b>${gg(x.g)}</b><span>${esc(x.t)}</span></div>`).join('')}${guarda.length > 60 ? `<p>… e altri ${guarda.length - 60}</p>` : ''}</div>` : '<p>Niente da segnalare.</p>'}</div>`;
    // Equita'
    const gruppi = M.RUOLI.map(ruolo => [ruolo, lista.filter(a => a.ruolo === ruolo && a.giorniLavoro > 0)]).filter(([, l]) => l.length);
    const eq = gruppi.map(([ruolo, l]) => {
      const [, col, nome] = RUOLO_INFO[ruolo], max = Math.max(...l.map(a => a.lordoMese)), min = Math.min(...l.map(a => a.lordoMese));
      return `<div class="gq"><div class="gqh"><b style="color:${col}">${nome}</b><span class="pill">scarto ${eur(max - min)}</span></div>` +
        l.sort((a, b) => b.lordoMese - a.lordoMese).map(a => `<div class="bar"><span>${esc(a.nome)}</span><i style="--w:${max ? Math.round(a.lordoMese / max * 100) : 0}%;--c:${col}"></i><b class="mono">≈ ${eur(a.lordoMese)}</b><small>${a.giorniLavoro} gg lavorati su ${a.disponibili} disponibili${a.disponibili < giorni.length ? ` (lordo vero ≈ ${eur(a.lordo)})` : ''} · ${Math.round(a.straord)} h straord. · ${a.imbarchi} imbarchi · ${a.domeniche} dom/fest</small></div>`).join('') + '</div>';
    }).join('');
    $('ct-lati').innerHTML = guardaHtml + `<div class="sez" style="--c:var(--violet)"><h3>⚖ Equità del periodo · lordo stimato</h3><p>Ore (oltre 39 a settimana come straordinario), imbarchi, diarie, ticket e domeniche, confrontati dentro lo stesso grado e riportati a un mese intero di giorni disponibili (chi ha congedi o ferie non va «recuperato»). È una stima per confrontare, non la busta.</p>${eq || '<p>Nessun dato.</p>'}</div>`;
  }

  // ---------------- Azioni ----------------
  function genera() {
    if (!state.data) return;
    const btn = $('ct-genera');
    btn.disabled = true; btn.textContent = 'Calcolo…';
    setTimeout(() => {
      try {
        state.input = preparaInput();
        const { giorni, posti, agenti } = state.input;
        state.risultato = M.genera({ giorni, posti, agenti, competenza, lavora: lavoraFisso });
        // turno attuale valutato con gli stessi conti
        const riep = agenti.map(a => {
          const v = M.stima(a.attuale, giorni, competenza), disp = Math.max(1, giorni.filter(g => !a.fissi[g] || lavoraFisso(a.fissi[g])).length);
          return { id: a.id, nome: a.nome, ruolo: a.ruolo, residenza: a.residenza, piano: a.attuale, ...v, disponibili: disp, lordoMese: v.lordo / disp * giorni.length };
        });
        const coperti = {};
        agenti.forEach(a => giorni.forEach(g => { const c = G.naveCode(a.attuale[g]); if (c) coperti[`${g}|${c}`] = (coperti[`${g}|${c}`] || 0) + 1; }));
        const scop = [];
        giorni.forEach(g => { const need = {}; (posti[g] || []).forEach(p => { need[p.turno] = (need[p.turno] || 0) + 1; }); Object.entries(need).forEach(([t, n]) => { for (let i = coperti[`${g}|${t}`] || 0; i < n; i += 1) scop.push({ giorno: g, turno: t, ruolo: 'posto' }); }); });
        const eccA = [];
        agenti.forEach(a => giorni.forEach(g => { const c = String(a.attuale[g] || ''); if (isNave(c) && /^c|c$/i.test(c) && !/^C(AR|AP)/.test(c)) eccA.push({ giorno: g, agente: a.nome, tipo: 'trasferta', testo: `${a.nome} in trasferta su ${G.naveCode(c) || c}` }); }));
        state.attuale = { riepilogo: riep, scoperti: scop, eccezioni: eccA, totPosti: state.risultato.totPosti };
        state.vista = 'bozza';
        $('ct-pdf').disabled = false;
        render();
      } catch (error) {
        console.error(error);
        $('ct-griglia').innerHTML = `<p class="vuoto">Non riesco a costruire la bozza: ${esc(error.message)}</p>`;
      } finally { btn.disabled = false; btn.textContent = '⚡ Genera bozza'; }
    }, 30);
  }

  // PDF come quello dell'ufficio: tutte le residenze, agenti nell'ordine di NaviTurni, la bozza (o il turno attuale)
  function esportaPdf() {
    const r = state.vista === 'bozza' ? state.risultato : state.attuale;
    if (!r || !window.NaviTurnoPdf) return;
    const giorni = state.input.giorni, piano = Object.fromEntries(r.riepilogo.map(a => [a.id, a.piano]));
    const residenze = ['RIVA', 'MADERNO', 'DESENZANO', 'PESCHIERA'].map(nome => {
      const agenti = [];
      Object.entries(state.data?.residenze || {}).filter(([res]) => norma(res).includes(nome)).forEach(([, list]) => (list || []).forEach(a => {
        if (window.NaviRoles?.isBaristaAgent?.(a)) return;
        const id = String(a?.id || ''), mio = piano[id];
        const turni = {};
        giorni.forEach(g => {
          const code = mio ? mio[g] : a.turni?.[g];
          const c = String(code ?? '').trim();
          if (c && !isRiposo(c)) turni[g] = c;
          else if (c && !mio) turni[g] = c; // nel turno attuale restano rip., rip--, ---- come scritti
        });
        agenti.push({ nome: String(a.agente || a.name || id), ruolo: RUOLO[G.gradoOf(a)[0]] || '', turni });
      }));
      return { nome, agenti };
    }).filter(x => x.agenti.length);
    window.NaviTurnoPdf.scarica({ titolo: state.vista === 'bozza' ? 'BOZZA TURNO DEL PERSONALE' : 'TURNO DEL PERSONALE', dal: giorni[0], settimane: state.settimane, residenze });
  }

  function init() {
    // di partenza: il primo lunedi' del mese prossimo
    const oggi = new Date(), primo = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1);
    const iso = `${primo.getFullYear()}-${String(primo.getMonth() + 1).padStart(2, '0')}-01`;
    state.dal = M.addDays(iso, (8 - new Date(`${iso}T12:00:00`).getDay()) % 7);
    $('ct-dal').value = state.dal;
    const azzera = () => { state.risultato = state.attuale = null; $('ct-pdf').disabled = true; render(); };
    $('ct-dal').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { state.dal = lunediDi(e.target.value); e.target.value = state.dal; azzera(); } });
    $('ct-sett').addEventListener('change', e => { state.settimane = Number(e.target.value) || 4; azzera(); });
    $('ct-pdf').addEventListener('click', esportaPdf);
    $('ct-res').addEventListener('click', e => { const b = e.target.closest('[data-res]'); if (b) { state.res = b.dataset.res; render(); } });
    $('ct-vista').addEventListener('click', e => { const b = e.target.closest('[data-vista]'); if (b) { state.vista = b.dataset.vista; render(); } });
    $('ct-genera').addEventListener('click', genera);
    render();
    (async () => {
      $('ct-stato').textContent = 'Carico turni, navi e assegnazioni…';
      try {
        state.data = await window.NaviSharedData.load('', { force: true });
        const fb = window.NaviAdminFirebase;
        await fb?.ready;
        const [righe, flotta] = await Promise.all([fb?.getTurniNavi?.().catch(() => []), fb?.getFleet?.().catch(() => null)]);
        state.rows = [...(state.data?.turni_navi || []), ...(righe || [])];
        state.fleet = flotta?.navi || {};
        try { state.profili = (await fb?.getAgentAdminData?.())?.profiles || {}; } catch { state.profili = {}; }
        render();
        $('ct-stato').textContent = `Pronto: ${Object.values(state.data?.residenze || {}).reduce((s, l) => s + (l || []).length, 0)} agenti, ${Object.keys(state.fleet).length} navi in anagrafica.`;
        $('ct-genera').disabled = false;
      } catch (error) {
        $('ct-stato').textContent = `Dati non disponibili: ${error.message}`;
      }
    })();
  }
  init();
})();
