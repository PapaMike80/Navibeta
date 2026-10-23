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
  const state = { data: null, rows: [], fleet: {}, mese: '', res: 'DESENZANO', vista: 'bozza', risultato: null, attuale: null, input: null };

  const profilo = () => { try { return JSON.parse(localStorage.getItem('navidiaria.activeAgent') || localStorage.getItem('naviturni_logged_agent') || 'null'); } catch { return null; } };
  if (!window.NaviRoles?.isAdminAgent?.(profilo())) { location.replace('index.html'); return; }

  const base = code => String(code || '').trim().replace(/^c|c$|\*$/g, '');
  const isNave = code => !!M.residenzaTurno(G.naveCode(code) || base(code));
  const isRiposo = code => /^(|R|RIP\.?|RIP-+|RIPOSO|-+|—+|·)$/i.test(String(code || '').trim());
  // codici fissi che non sono giorni di lavoro: congedo, ferie, malattia, giornata impegnata (#), RF
  const lavoraFisso = code => { const c = String(code || '').trim(); return !c.startsWith('#') && !/^F$/i.test(c) && !/^(CONG?|FERIE|MAL|MALATTIA|RF)(\b|[;.\/]|$)/i.test(c); };
  const norma = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Competenza di un servizio: ore, imbarco, diaria, ticket (tabella delle competenze della Distinta)
  function competenza(code, day) {
    const c = G.naveCode(code) || base(code);
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

  function giorniDelMese(mese) {
    const [y, m] = mese.split('-').map(Number), n = new Date(y, m, 0).getDate();
    return Array.from({ length: n }, (_, i) => `${mese}-${String(i + 1).padStart(2, '0')}`);
  }

  // Dati per il motore
  function preparaInput() {
    const giorni = giorniDelMese(state.mese);
    O.stagioneDaRighe(state.rows);
    const posti = {}, senzaNave = new Set();
    giorni.forEach(day => {
      const estate = day >= O.ESTATE[0] && day <= O.ESTATE[1];
      const codici = [...new Set([...(estate ? O.TURNI_ESTATE : O.TURNI), 'BIS'])].filter(code => code === 'BIS' ? (estate || !!ST.naviDelGiorno(state.rows, day).BIS) : O.inServizio(code, day));
      posti[day] = codici.flatMap(code => {
        const residenza = M.residenzaTurno(code);
        if (!residenza) return [];
        const { equipaggio, stimato } = equipaggioDi(naveDi(code, day), day);
        if (stimato) senzaNave.add(code);
        return Object.entries(equipaggio).flatMap(([ruolo, n]) => Array(Number(n) || 0).fill({ turno: code, residenza, ruolo }));
      });
    });
    const prima = Array.from({ length: 7 }, (_, i) => M.addDays(giorni[0], -7 + i));
    const agenti = [], visti = new Set();
    Object.entries(state.data?.residenze || {}).forEach(([res, list]) => (list || []).forEach(a => {
      const id = String(a?.id || ''), ruolo = RUOLO[G.gradoOf(a)[0]];
      if (!id || !ruolo || visti.has(id) || window.NaviRoles?.isBaristaAgent?.(a)) return;
      visti.add(id);
      const residenza = RESIDENZE.find(r => norma(res).includes(r)) || norma(res);
      const fissi = {}, attuale = {}, precedenti = {};
      giorni.forEach(g => {
        const code = String(a.turni?.[g] ?? '').trim();
        if (code) attuale[g] = code;
        if (code && !isRiposo(code) && !isNave(code)) fissi[g] = code;
      });
      prima.forEach(g => { const code = String(a.turni?.[g] ?? '').trim(); if (code && !isRiposo(code)) precedenti[g] = G.naveCode(code) || code; });
      agenti.push({ id, nome: String(a.agente || a.name || id).trim(), ruolo, residenza, fissi, prima: precedenti, attuale });
    }));
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
  function render() {
    const r = state.vista === 'bozza' ? state.risultato : state.attuale;
    $('ct-res').querySelectorAll('[data-res]').forEach(b => b.classList.toggle('on', b.dataset.res === state.res));
    $('ct-vista').querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('on', b.dataset.vista === state.vista));
    if (!r) { $('ct-kpi').innerHTML = ''; $('ct-griglia').innerHTML = '<p class="vuoto">Scegli il mese e premi «Genera bozza».</p>'; $('ct-lati').innerHTML = ''; return; }
    const { giorni } = state.input;
    const st = statistiche(r.riepilogo);
    const tr = r.eccezioni.filter(e => e.tipo === 'trasferta').length;
    const coperti = r.totPosti - r.scoperti.length;
    $('ct-kpi').innerHTML = [
      ['var(--green)', 'Posti coperti', `${coperti}/${r.totPosti}`, `turni nave × equipaggio · ${giorni.length} giorni`],
      ['var(--rose)', 'Posti scoperti', String(r.scoperti.length), r.scoperti.length ? 'da sistemare a mano' : 'nessuna corsa a rischio'],
      ['var(--amber)', 'Trasferte', String(tr), tr ? 'solo dove serviva' : 'nessuna'],
      ['var(--violet)', 'Straordinari', `≈ ${Math.round(st.straord)} h`, 'media del mese per agente'],
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
    const titolo = `${state.vista === 'bozza' ? 'Bozza' : 'Turno attuale'} · ${MESI[Number(state.mese.slice(5)) - 1]} ${state.mese.slice(0, 4)} · ${state.res.charAt(0) + state.res.slice(1).toLowerCase()}`;
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
    $('ct-lati').innerHTML = guardaHtml + `<div class="sez" style="--c:var(--violet)"><h3>⚖ Equità del mese · lordo stimato</h3><p>Ore (oltre 39 a settimana come straordinario), imbarchi, diarie, ticket e domeniche, confrontati dentro lo stesso grado e riportati a un mese intero di giorni disponibili (chi ha congedi o ferie non va «recuperato»). È una stima per confrontare, non la busta.</p>${eq || '<p>Nessun dato.</p>'}</div>`;
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
        render();
      } catch (error) {
        console.error(error);
        $('ct-griglia').innerHTML = `<p class="vuoto">Non riesco a costruire la bozza: ${esc(error.message)}</p>`;
      } finally { btn.disabled = false; btn.textContent = '⚡ Genera bozza'; }
    }, 30);
  }

  function init() {
    const oggi = new Date(), prossimo = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1);
    state.mese = `${prossimo.getFullYear()}-${String(prossimo.getMonth() + 1).padStart(2, '0')}`;
    $('ct-mese').value = state.mese;
    $('ct-mese').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { state.mese = e.target.value; state.risultato = state.attuale = null; render(); } });
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
        $('ct-stato').textContent = `Pronto: ${Object.values(state.data?.residenze || {}).reduce((s, l) => s + (l || []).length, 0)} agenti, ${Object.keys(state.fleet).length} navi in anagrafica.`;
        $('ct-genera').disabled = false;
      } catch (error) {
        $('ct-stato').textContent = `Dati non disponibili: ${error.message}`;
      }
    })();
  }
  init();
})();
