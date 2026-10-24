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
  // giorni: dal lunedi' di due settimane fa a cinque settimane avanti
  const lun = (() => { const d = parse(oggi); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 14); return iso(d); })();
  const GG = Array.from({ length: 49 }, (_, i) => addDays(lun, i));
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
    const righe = crew.map(m => `<div class="nt-cw${m.id && m.id === mioId ? ' io' : ''}"><span class="nt-gr" style="--g:${m.grado[1]}">${esc(SIGLA[m.grado[0]] || '·')}</span><b>${esc(m.name)}</b>${m.id && m.id === mioId ? '<em>tu</em>' : ''}</div>`).join('');
    return `<div class="nt-sez"><h2>${titolo}${scelta ? ' <button type="button" class="nt-x" data-oggi>il mio oggi</button>' : ''}</h2>
      <div class="nt-mio"><span class="nt-code" style="--t:${G.coloreTurno(code)};color:${G.testoSu(G.coloreTurno(code))}">${esc(code)}</span><div><b>${nave ? 'Equipaggio' : 'Servizio a terra'}</b><small>${dettagli || '&nbsp;'}</small></div></div>
      <div class="nt-nave"><span>${nave ? 'CON CHI NAVIGHI' : 'IN SERVIZIO'}</span><span><b>${crew.length}</b> ${nave ? 'a bordo' : ''}</span></div><div class="nt-crew">${righe || '<p class="nt-vuoto">Nessuno trovato.</p>'}</div></div>`;
  }

  function griglia() {
    const mio = io(), mioId = String(mio?.a?.id || '');
    const altri = tuttiAgenti().filter(({ a, res }) => res === residenza && String(a.id) !== mioId)
      .sort((x, y) => grado(x.a)[2] - grado(y.a)[2] || String(x.a.agente).localeCompare(String(y.a.agente), 'it'));
    const righe = [...(mio ? [mio] : []), ...altri];
    const testa = GG.map(day => { const d = parse(day), lunedi = d.getDay() === 1; return `<th class="${day === oggi ? 'oggi ' : ''}${d.getDay() === 0 ? 'dom ' : ''}${lunedi ? 'lun' : ''}">${lunedi ? `<i class="nt-sw">${settimana(day)}</i>` : ''}<small>${GIORNI[d.getDay()].charAt(0).toUpperCase()}</small><b>${d.getDate()}</b></th>`; }).join('');
    const corpo = righe.map(({ a }) => {
      const me = String(a.id) === mioId, cognome = String(a.agente || '').replace(/\s+\S{1,3}\.?$/, '');
      return `<tr class="${me ? 'mia' : ''}"><th class="nm"><span class="nt-dot" style="--g:${grado(a)[1]}"></span>${esc(cognome)}</th>${GG.map(day => `<td class="${day === oggi ? 'oggi ' : ''}${parse(day).getDay() === 1 ? 'lun' : ''}">${bolla(turno(a, day), day, me)}</td>`).join('')}</tr>`;
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
  }
  function render() {
    const residenze = Object.keys(schedule?.residenze || {});
    box.innerHTML = `<div id="nt-scheda">${scheda()}</div>
      <div class="nt-res">${residenze.map(r => `<button type="button" class="${r === residenza ? 'on' : ''}" data-res="${esc(r)}">${esc(r.charAt(0) + r.slice(1).toLowerCase())}</button>`).join('')}</div>
      <div class="nt-sez nt-tab">${griglia()}<p class="nt-hint">← scorri i giorni →</p></div>`;
    allinea(); requestAnimationFrame(allinea); setTimeout(allinea, 300); // dopo che la tabella ha preso le misure definitive
    // Scatto: lasciato lo scorrimento, la tabella si ferma allineata a un giorno. Verso il futuro si scorre libero;
    // verso il passato c'e' uno «scalino» su oggi: tirando meno di due giorni oltre oggi si torna su oggi.
    const s = document.getElementById('nt-strip'), iOggi = GG.indexOf(oggi), SCALINO = 2;
    let fermo = null, utente = false, eraFuturo = true;
    const tocca = () => { utente = true; eraFuturo = GG.indexOf(primoGiorno) >= iOggi; };
    s.addEventListener('pointerdown', tocca, { passive: true }); s.addEventListener('touchstart', tocca, { passive: true }); s.addEventListener('wheel', tocca, { passive: true });
    s.addEventListener('scroll', () => {
      if (!utente) return; // gli scorrimenti fatti dal programma non contano
      clearTimeout(fermo);
      fermo = setTimeout(() => {
        const { ths, pos } = misure(s), w = ths[1].offsetLeft - ths[0].offsetLeft;
        let k = Math.max(0, Math.min(GG.length - 1, Math.round(s.scrollLeft / w)));
        k = ths.reduce((best, _, i) => Math.abs(pos(i) - s.scrollLeft) < Math.abs(pos(best) - s.scrollLeft) ? i : best, k);
        if (eraFuturo && k < iOggi && (pos(iOggi) - s.scrollLeft) / w < SCALINO) k = iOggi; // scalino: non abbastanza forte
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
    if (!residenza) residenza = io()?.res || Object.keys(schedule.residenze || {})[0] || '';
    render();
  }
  document.fonts?.ready?.then(() => allinea());
  window.NaviSharedData?.loadCacheFirst?.(data => carica(data))?.catch?.(() => {});
  G.caricaModifiche?.(profilo())?.then?.(() => { if (schedule) { cache.clear(); render(); } })?.catch?.(() => {});
})();
