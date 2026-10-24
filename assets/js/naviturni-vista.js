// NaviTurni nello stile NaviSuite: sopra la tabella di naviturni-page.js (con il suo scorrimento, i giorni passati nascosti,
// la mia riga fissata, i cambi di residenza e chi ha terminato) un riquadro con il turno scelto e «Con chi navighi».
// La tabella cambia solo grafica (naviturni-vista.css): toccando una bolla si carica qui l'equipaggio di quel turno.
(function () {
  'use strict';
  const G = window.NaviTurniGiorno, C = window.NaviShiftCompetence;
  const box = document.getElementById('nt-vista');
  if (!G || !box) return;
  document.body.classList.add('nt-stile');
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
  let schedule = null, scelta = null;
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

  // Riquadro in alto: il turno scelto (di default il mio di oggi) e chi c'e' a bordo
  function scheda() {
    const mio = io();
    const day = scelta?.day || oggi, code = scelta?.code || (mio ? turno(mio.a, oggi) : '');
    
    if (!code || RIPOSO.test(code)) return `<div class="nt-sez"><div class="nt-mio"><span class="nt-code rip">—</span><div><b>Riposo</b><small>Tocca un turno nella tabella per vedere l'equipaggio.</small></div></div></div>`;
    const nave = G.naveCode(code), ore = Number(C?.shiftForCode?.(nave || code, day)?.hours) || 0;
    const riga = (schedule?.turni_navi || []).filter(r => String(r?.data || '').slice(0, 10) === day && G.naveCode(r?.corsa) === nave && r?.attiva !== false).pop();
    const dettagli = [ore ? `${Math.floor(ore)} h${Math.round((ore % 1) * 60) ? ` ${String(Math.round((ore % 1) * 60)).padStart(2, '0')}'` : ''}` : '', riga?.nave ? `nave ${esc(riga.nave)}` : ''].filter(Boolean).join(' · ');
    let crew = [];
    try { const eq = G.equipaggi(schedule, day); crew = nave ? (eq.navi[nave] || []) : (eq.terra[G.terraCode(code)] || []).map(name => ({ name, grado: ['', '#94a3b8', 9] })); } catch { crew = []; }
    const mioId = String(profilo()?.id || '');
    const ord = m => { const i = ORDINE_GRADI.indexOf(m.grado[0]); return i < 0 ? 99 : i; };
    crew = crew.slice().sort((x, y) => ord(x) - ord(y) || anzianita({ agente: x.name }) - anzianita({ agente: y.name }) || x.name.localeCompare(y.name, 'it'));
    // righe come nel Mio turno: nome nel colore del grado, ruolo a destra, la mia riga bordata
    const RUOLO = { Applicato: 'Bigliettaio' };
    const righe = crew.map(m => `<div class="nt-cw${m.id && m.id === mioId ? ' io' : ''}"><b style="color:${m.grado[0] === 'Marinaio' || !m.grado[0] ? '#eaf2f4' : m.grado[1]}">${esc(m.name)}${m.id && m.id === mioId ? ' <em>(tu)</em>' : ''}</b><small class="nt-ruolo">${esc(RUOLO[m.grado[0]] || m.grado[0] || '')}</small></div>`).join('');
    return `<div class="nt-sez"><div class="nt-mio"><span class="nt-code" style="--t:${G.coloreTurno(code)};color:${G.testoSu(G.coloreTurno(code))}">${esc(code)}</span><div><b>${nave ? 'Equipaggio' : 'Servizio a terra'}</b><small>${dettagli || '&nbsp;'}</small></div></div><div class="nt-crew">${righe || '<p class="nt-vuoto">Nessuno trovato.</p>'}</div></div>`;
  }

  // ordine dell'equipaggio: per grado (l'applicato sopra il marinaio) e poi per anzianita'
  const ORDINE_GRADI = ['Capitano', 'Capo timoniere', 'Motorista', 'Timoniere', 'Aiuto motorista', 'Applicato', 'Marinaio'];
  const anzianita = a => { const r = Number(window.NaviSharedData?.seniorityRank?.(a.agente)); return Number.isFinite(r) ? r : 1e9; };
  const disegnaScheda = () => { box.innerHTML = `<div id="nt-scheda">${scheda()}</div>`; };

  // Tocco su una bolla della tabella: l'equipaggio di quel turno in quel giorno (date e turni dalla tabella stessa)
  document.addEventListener('click', e => {
    const td = e.target.closest('#tbody td[data-col]');
    if (!td || typeof dateCalendario === 'undefined') return;
    const cal = dateCalendario.find(c => c.col === Number(td.dataset.col));
    let agente = null; try { agente = getAgentForTableRow(td.closest('tr')); } catch { agente = null; }
    if (!cal || !agente) return;
    let code = ''; try { code = String(ottieniTurnoPulito(getAgentShiftOnDate(agente, cal.iso)) || '').trim(); } catch { code = td.textContent.trim(); }
    if (!code || RIPOSO.test(code)) return;
    e.stopPropagation(); e.preventDefault();
    scelta = { day: cal.iso, code };
    document.querySelectorAll('#tbody td.nt-sel').forEach(x => x.classList.remove('nt-sel'));
    td.classList.add('nt-sel');
    disegnaScheda();
    // tutta la scheda in vista, sotto la tacca dell'iPhone
    const tacca = document.createElement('div'); tacca.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px)';
    document.body.appendChild(tacca); const alto = tacca.offsetHeight + 16; tacca.remove();
    window.scrollTo({ top: Math.max(0, box.getBoundingClientRect().top + scrollY - alto), behavior: 'smooth' });
  }, true);
  // la vecchia scheda equipaggio della tabella si apriva al rilascio del dito: non le arriva piu' nulla
  ['pointerdown', 'pointerup'].forEach(t => document.addEventListener(t, e => { if (e.target.closest('#tbody td[data-col]')) e.stopPropagation(); }, true));
  box.addEventListener('click', e => { if (e.target.closest('[data-oggi]')) { scelta = null; document.querySelectorAll('#tbody td.nt-sel').forEach(x => x.classList.remove('nt-sel')); disegnaScheda(); } });

  // Oggi in evidenza nella tabella (che si ridisegna da sola: si rimette il segno ogni volta)
  // altezze vere di mese e date: la mia riga si incolla subito sotto, senza spazi
  function altezze() {
    const m = document.querySelector('.month-header')?.offsetHeight || 0, d = document.querySelector('.date-header')?.offsetHeight || 0;
    if (!d) return;
    const r = document.documentElement.style;
    if (r.getPropertyValue('--nt-mia') !== `${m + d}px` || r.getPropertyValue('--nt-mese') !== `${m}px`) { r.setProperty('--nt-mese', `${m}px`); r.setProperty('--nt-mia', `${m + d}px`); }
  }
  function segnaOggi() {
    altezze();
    if (typeof dateCalendario === 'undefined') return;
    const cal = dateCalendario.find(c => c.iso === oggi); if (!cal) return;
    document.querySelectorAll(`.date-header th[data-col="${cal.col}"]:not(.nt-oggi), #tbody td[data-col="${cal.col}"]:not(.nt-oggi)`).forEach(x => x.classList.add('nt-oggi'));
  }
  new MutationObserver(() => segnaOggi()).observe(document.getElementById('turni-operativi') || document.body, { childList: true, subtree: true });

  function carica(data) { schedule = data || { residenze: {} }; cache.clear(); disegnaScheda(); segnaOggi(); }
  window.NaviSharedData?.loadCacheFirst?.(data => carica(data))?.catch?.(() => {});
  G.caricaModifiche?.(profilo())?.then?.(() => { if (schedule) { cache.clear(); disegnaScheda(); } })?.catch?.(() => {});
})();
