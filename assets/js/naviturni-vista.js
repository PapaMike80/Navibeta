// NaviTurni, vista nello stile NaviSuite: in alto il turno scelto con l'equipaggio («Con chi navighi»), sotto la griglia
// dei turni in bolle colorate. Io sono sempre nella prima riga; si vedono 7 giorni e si scorre a destra e sinistra
// (niente selettore della data). Toccando una bolla si carica l'equipaggio di quel turno in quel giorno.
// La vecchia tabella di naviturni-page.js resta sotto (nascosta) per le funzioni di caricamento e bozza.
(function () {
  'use strict';
  const G = window.NaviTurniGiorno, C = window.NaviShiftCompetence;
  const box = document.getElementById('nt-vista');
  if (!G || !box) return;
  document.body.classList.add('nt-nuova');
  const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'], MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const SIGLA = { Capitano: 'Cap', 'Capo timoniere': 'CT', Motorista: 'Mot', 'Aiuto motorista': 'AM', Timoniere: 'Tim', Marinaio: 'Mar', Applicato: 'App' };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const settimana = s => { const d = parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const g = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - g) / 864e5 - 3 + ((g.getDay() + 6) % 7)) / 7); };
  const RIPOSO = /^(R|RIP\.?|RIPOSO|-{1,}|—|=+)$/i;
  const profilo = () => { try { return JSON.parse(localStorage.getItem('naviturni_logged_agent') || localStorage.getItem('navidiaria.activeAgent') || 'null'); } catch { return null; } };
  const oggi = iso(new Date());
  // giorni: tutto l'anno, dal 1 gennaio al 31 dicembre
  const ANNO = oggi.slice(0, 4), GG = [];
  for (let d = `${ANNO}-01-01`; d <= `${ANNO}-12-31`; d = addDays(d, 1)) GG.push(d);
  const MESE3 = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
  let schedule = null, residenza = '', scelta = null;
  const cache = new Map();

  const tuttiAgenti = () => Object.entries(schedule?.residenze || {}).flatMap(([res, list]) => (list || []).filter(a => a && !window.NaviRoles?.isBaristaAgent?.(a)).map(a => ({ a, res })));
  function turno(agent, day) {
    const k = `${agent.id || agent.agente}|${day}`;
    if (!cache.has(k)) { let t = ''; try { t = String(G.turnoAgente(schedule, { id: agent.id, name: agent.agente }, day)?.turno || '').trim(); } catch { t = ''; } cache.set(k, t); }
    return cache.get(k);
  }
  const io = () => { const p = profilo(); return p ? tuttiAgenti().find(({ a }) => String(a.id) === String(p.id)) : null; };
  const grado = agent => G.gradoOf(agent);
  const giornoLungo = day => { const d = parse(day); return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`; };

  function bolla(code, day, me) {
    if (!code || RIPOSO.test(code)) return '<span class="nt-rip">—</span>';
    const col = G.coloreTurno(code), testo = G.testoSu(col), sel = scelta && scelta.day === day && scelta.code === code;
    if (code.startsWith('#')) return `<button type="button" class="nt-b imp${sel ? ' sel' : ''}" data-day="${day}" data-code="${esc(code)}">${esc(code)}</button>`;
    const tr = /^C.+|.+C\*?$/.test(code) && G.naveCode(code) ? ' tr' : '';
    return `<button type="button" class="nt-b${tr}${sel ? ' sel' : ''}${me ? ' me' : ''}" style="--t:${col};color:${testo}" data-day="${day}" data-code="${esc(code)}">${esc(code)}</button>`;
  }

  // Riquadro in alto: il turno scelto (di default il mio di oggi) e chi c'e' a bordo
  function scheda() {
    const mio = io();
    const day = scelta?.day || oggi, code = scelta?.code || (mio ? turno(mio.a, oggi) : '');
    const titolo = `${day === oggi ? 'OGGI · ' : ''}${giornoLungo(day).toUpperCase()}`;
    if (!code || RIPOSO.test(code)) return `<div class="nt-sez"><h2>${titolo}</h2><div class="nt-mio"><span class="nt-code rip">—</span><div><b>Riposo</b><small>Tocca un turno nella tabella per vedere l'equipaggio.</small></div></div></div>`;
    const nave = G.naveCode(code), ore = Number(C?.shiftForCode?.(nave || code, day)?.hours) || 0;
    const riga = (schedule?.turni_navi || []).filter(r => String(r?.data || '').slice(0, 10) === day && G.naveCode(r?.corsa) === nave && r?.attiva !== false).pop();
    const dettagli = [ore ? `${Math.floor(ore)} h${Math.round((ore % 1) * 60) ? ` ${String(Math.round((ore % 1) * 60)).padStart(2, '0')}'` : ''}` : '', riga?.nave ? `nave ${esc(riga.nave)}` : ''].filter(Boolean).join(' · ');
    let crew = [];
    try { const eq = G.equipaggi(schedule, day); crew = nave ? (eq.navi[nave] || []) : (eq.terra[G.terraCode(code)] || []).map(name => ({ name, grado: ['', '#94a3b8', 9] })); } catch { crew = []; }
    const mioId = String(profilo()?.id || '');
    const ord = m => { const i = ORDINE_GRADI.indexOf(m.grado[0]); return i < 0 ? 99 : i; };
    crew = crew.slice().sort((x, y) => ord(x) - ord(y) || anzianita({ agente: x.name }) - anzianita({ agente: y.name }) || x.name.localeCompare(y.name, 'it'));
    const righe = crew.map(m => `<div class="nt-cw${m.id && m.id === mioId ? ' io' : ''}"><span class="nt-gr" style="--g:${m.grado[1]}">${esc(SIGLA[m.grado[0]] || '·')}</span><b>${esc(m.name)}</b>${m.grado[0] === 'Applicato' ? '<small class="nt-ruolo">bigliettaio</small>' : ''}${m.id && m.id === mioId ? '<em>tu</em>' : ''}</div>`).join('');
    return `<div class="nt-sez"><h2>${titolo}${scelta ? ' <button type="button" class="nt-x" data-oggi>il mio oggi</button>' : ''}</h2>
      <div class="nt-mio"><span class="nt-code" style="--t:${G.coloreTurno(code)};color:${G.testoSu(G.coloreTurno(code))}">${esc(code)}</span><div><b>${nave ? 'Equipaggio' : 'Servizio a terra'}</b><small>${dettagli || '&nbsp;'}</small></div></div>
      <div class="nt-nave"><span>${nave ? 'CON CHI NAVIGHI' : 'IN SERVIZIO'}</span><span><b>${crew.length}</b> ${nave ? 'a bordo' : ''}</span></div><div class="nt-crew">${righe || '<p class="nt-vuoto">Nessuno trovato.</p>'}</div></div>`;
  }

  // Nascosti: chi da oggi in avanti ha solo congedo (CON...), riposi o nessun turno (servizio terminato)
  const FUTURI = GG.filter(d => d >= oggi);
  // in servizio: almeno un giorno di lavoro da oggi in avanti (non riposo, non congedo)
  const inServizio = a => FUTURI.some(day => { const t = turno(a, day); return t && !RIPOSO.test(t) && !/^CON/i.test(t); });
  // Cambio di residenza (import turni: residenzaDal, residenzaPrecedente, residenzaNuova): ogni giorno l'agente sta
  // nella residenza in cui e' davvero; nelle altre quei giorni compaiono come «A <residenza>»
  const RES = r => String(r || '').toUpperCase();
  const resDi = ({ a, res }, day) => a.residenzaDal && a.residenzaNuova ? (day >= a.residenzaDal ? RES(a.residenzaNuova) : RES(a.residenzaPrecedente || res)) : RES(res);
  const nomeRes = r => r.charAt(0) + r.slice(1).toLowerCase();
  // ordine: per grado (come in Movimento) e poi per anzianita' (graduatoria di NaviSuite)
  const ORDINE_GRADI = ['Capitano', 'Capo timoniere', 'Motorista', 'Timoniere', 'Aiuto motorista', 'Applicato', 'Marinaio']; // l'applicato e' sopra il marinaio
  const ordineGrado = a => { const i = ORDINE_GRADI.indexOf(grado(a)[0]); return i < 0 ? 99 : i; };
  const anzianita = a => { const r = Number(window.NaviSharedData?.seniorityRank?.(a.agente)); return Number.isFinite(r) ? r : 1e9; };
  function griglia() {
    const mio = io(), mioId = String(mio?.a?.id || '');
    const visti = new Set();
    const altri = tuttiAgenti().filter(x => { const k = String(x.a.id || x.a.agente); if (visti.has(k)) return false; visti.add(k); return true; })
      .filter(x => String(x.a.id) !== mioId && inServizio(x.a) && GG.some(day => resDi(x, day) === RES(residenza)))
      .sort((x, y) => ordineGrado(x.a) - ordineGrado(y.a) || anzianita(x.a) - anzianita(y.a) || String(x.a.agente).localeCompare(String(y.a.agente), 'it'));
    const righe = [...(mio ? [mio] : []), ...altri];
    const testa = GG.map(day => { const d = parse(day), lunedi = d.getDay() === 1, primo = d.getDate() === 1; return `<th class="${day === oggi ? 'oggi ' : ''}${d.getDay() === 0 ? 'dom ' : ''}${lunedi ? 'lun ' : ''}${primo ? 'mese' : ''}">${primo ? `<i class="nt-mese">${MESE3[d.getMonth()]}</i>` : ''}${lunedi ? `<i class="nt-sw">${settimana(day)}</i>` : ''}<small>${GIORNI[d.getDay()].charAt(0).toUpperCase()}</small><b>${d.getDate()}</b></th>`; }).join('');
    const corpo = righe.map(x => {
      const { a } = x, me = String(a.id) === mioId, cognome = String(a.agente || '').replace(/\s+\S{1,3}\.?$/, '');
      return `<tr class="${me ? 'mia' : ''}"><th class="nm"><span class="nt-dot" style="--g:${grado(a)[1]}"></span>${esc(cognome)}</th>${GG.map(day => { const r = resDi(x, day), altrove = !me && r !== RES(residenza); return `<td class="${day === oggi ? 'oggi ' : ''}${parse(day).getDay() === 1 ? 'lun ' : ''}${day.endsWith('-01') ? 'mese' : ''}">${altrove ? `<span class="nt-altrove" title="In servizio a ${esc(nomeRes(r))}">A ${esc(r.slice(0, 3))}</span>` : bolla(turno(a, day), day, me)}</td>`; }).join('')}</tr>`;
    }).join('');
    return `<div class="nt-strip" id="nt-strip"><table class="nt-g"><thead><tr><th class="nm"></th>${testa}</tr></thead><tbody>${corpo}</tbody></table></div>`;
  }

  // giorno da tenere come primo visibile dopo la colonna dei nomi: all'apertura oggi
  let primoGiorno = oggi;
  const misure = s => { const ths = [...s.querySelectorAll('thead th')].slice(1), nm = ths[0].offsetLeft; return { ths, nm, pos: i => ths[i].offsetLeft - nm }; };
  function allinea() {
    const s = document.getElementById('nt-strip'); if (!s) return;
    const { pos } = misure(s), i = GG.indexOf(primoGiorno);
    if (i >= 0) s.scrollLeft = pos(i);
    meseInVista();
  }
  // il mese dei giorni in vista, sopra la tabella
  function meseInVista() {
    const s = document.getElementById('nt-strip'), el = document.getElementById('nt-mese-vista'); if (!s || !el) return;
    const { ths, nm } = misure(s), k = Math.max(0, ths.findIndex(th => th.offsetLeft - nm >= s.scrollLeft - 3)), d = parse(GG[Math.min(GG.length - 1, k + 3)]);
    el.textContent = `${MESI[d.getMonth()].charAt(0).toUpperCase()}${MESI[d.getMonth()].slice(1)} ${d.getFullYear()}`;
  }
  function render() {
    const residenze = Object.keys(schedule?.residenze || {});
    box.innerHTML = `<div id="nt-scheda">${scheda()}</div>
      <div class="nt-res">${residenze.map(r => `<button type="button" class="${r === residenza ? 'on' : ''}" data-res="${esc(r)}">${esc(r.charAt(0) + r.slice(1).toLowerCase())}</button>`).join('')}</div>
      <div class="nt-sez nt-tab"><p class="nt-mese-vista" id="nt-mese-vista"></p>${griglia()}<p class="nt-hint">← scorri i giorni →</p></div>`;
    allinea(); requestAnimationFrame(allinea); setTimeout(allinea, 300); // dopo che la tabella ha preso le misure definitive
    // Scatto: lasciato lo scorrimento, la tabella si ferma allineata a un giorno. Verso il futuro si scorre libero;
    // verso il passato ci si ferma su oggi; da oggi, con un nuovo gesto, uno «scalino»: tirando meno di due giorni si torna su oggi.
    const s = document.getElementById('nt-strip'), iOggi = GG.indexOf(oggi), SCALINO = 2;
    let fermo = null, utente = false, eraFuturo = false, daOggi = true, bloccato = false, sblocco = null;
    // a fine gesto (dito alzato, o rotella ferma) lo scorrimento torna libero, fermo su oggi: per il passato serve un nuovo gesto
    const sblocca = () => { if (!bloccato) return; clearTimeout(sblocco); sblocco = setTimeout(() => { s.style.overflowX = ''; bloccato = false; utente = false; primoGiorno = oggi; s.scrollLeft = misure(s).pos(iOggi); }, 80); };
    const tocca = () => { if (bloccato) return; utente = true; eraFuturo = GG.indexOf(primoGiorno) > iOggi; daOggi = GG.indexOf(primoGiorno) === iOggi; };
    s.addEventListener('pointerdown', tocca, { passive: true }); s.addEventListener('touchstart', tocca, { passive: true });
    s.addEventListener('wheel', () => { if (bloccato) { clearTimeout(sblocco); sblocco = setTimeout(sblocca, 350); return; } if (!utente) tocca(); }, { passive: true });
    ['touchend', 'touchcancel', 'pointerup', 'pointercancel'].forEach(ev => s.addEventListener(ev, sblocca, { passive: true }));
    s.addEventListener('scroll', () => {
      meseInVista();
      if (!utente) return; // gli scorrimenti fatti dal programma non contano
      // arrivando dal futuro ci si ferma su oggi (anche con l'abbrivio del dito): per il passato serve un nuovo gesto da oggi
      // blocco deciso: lo scorrimento orizzontale si spegne (anche lo slancio del dito su iPhone) fino a fine gesto
      if (eraFuturo) {
        const p0 = misure(s).pos(iOggi);
        if (s.scrollLeft < p0) { if (!bloccato) { bloccato = true; s.style.overflowX = 'hidden'; } s.scrollLeft = p0; primoGiorno = oggi; }
      }
      if (bloccato) return;
      clearTimeout(fermo);
      fermo = setTimeout(() => {
        const { ths, pos } = misure(s), w = ths[1].offsetLeft - ths[0].offsetLeft;
        let k = Math.max(0, Math.min(GG.length - 1, Math.round(s.scrollLeft / w)));
        k = ths.reduce((best, _, i) => Math.abs(pos(i) - s.scrollLeft) < Math.abs(pos(best) - s.scrollLeft) ? i : best, k);
        if (eraFuturo && k < iOggi) k = iOggi;
        if (daOggi && k < iOggi && (pos(iOggi) - s.scrollLeft) / w < SCALINO) k = iOggi; // scalino da oggi: non abbastanza forte
        primoGiorno = GG[k]; utente = false;
        s.scrollTo({ left: pos(k), behavior: 'smooth' });
      }, 140);
    }, { passive: true });
  }

  box.addEventListener('click', e => {
    const b = e.target.closest('.nt-b');
    if (b) { scelta = { day: b.dataset.day, code: b.dataset.code }; document.getElementById('nt-scheda').innerHTML = scheda(); box.querySelectorAll('.nt-b.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); window.scrollTo({ top: box.offsetTop - 10, behavior: 'smooth' }); return; }
    if (e.target.closest('[data-oggi]')) { scelta = null; document.getElementById('nt-scheda').innerHTML = scheda(); box.querySelectorAll('.nt-b.sel').forEach(x => x.classList.remove('sel')); return; }
    const r = e.target.closest('[data-res]');
    if (r) { residenza = r.dataset.res; render(); }
  });

  function carica(data) {
    schedule = data || { residenze: {} }; cache.clear();
    if (!residenza) { const mio = io(); residenza = mio ? Object.keys(schedule.residenze || {}).find(k => RES(k) === resDi(mio, oggi)) || mio.res : Object.keys(schedule.residenze || {})[0] || ''; }
    render();
  }
  document.fonts?.ready?.then(() => allinea());
  window.NaviSharedData?.loadCacheFirst?.(data => carica(data))?.catch?.(() => {});
  G.caricaModifiche?.(profilo())?.then?.(() => { if (schedule) { cache.clear(); render(); } })?.catch?.(() => {});
})();
