// Impostazioni › Guide popup › card "📊 Sondaggi" (solo admin): anteprima, attiva/chiudi, nuovo sondaggio,
// risultati in percentuale, ultimi commenti ed esportazione Excel. Le risposte sono anonime.
(function () {
  'use strict';
  if (!/(?:^|\/)impostazioni\.html$/i.test(location.pathname)) return;
  const FREQ = ['Ogni giorno', 'Qualche volta a settimana', 'Qualche volta al mese', 'Quasi mai'];
  const EASE = ['Molto facile', 'Abbastanza facile', "Un po' difficile", 'Difficile'];
  const FEAT = ['Turni', 'Oggi', 'Cambio turno', 'Diaria', 'Documenti', 'Orario', 'Ponte Radio', 'Segnalazioni'];
  const sessione = () => { try { return JSON.parse(localStorage.getItem('navidiaria.activeAgent') || localStorage.getItem('naviturni_logged_agent') || 'null'); } catch (_) { return null; } };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const oggi = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  const nuovaVersione = () => { const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = new Uint8Array(3); crypto.getRandomValues(b); return `S${oggi()}${Array.from(b, x => a[x % a.length]).join('')}`; };
  let config = null, risposte = [], completati = 0;

  function injectStyle() {
    if (document.getElementById('survey-admin-style')) return;
    const s = el('style'); s.id = 'survey-admin-style';
    s.textContent = '#survey-admin-card{--c:#fbbf24;margin-top:14px;padding:16px;border-radius:16px;border:1px solid color-mix(in srgb,var(--c) 40%,transparent);background:color-mix(in srgb,var(--c) 10%,#102733);color:#eaf2f4}'
      + '#survey-admin-card h3{margin:0 0 4px;color:var(--c)}#survey-admin-card .sa-stato{margin:0 0 10px;color:#9fb8c2;font-size:13px}'
      + '#survey-admin-card .sa-azioni{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}'
      + '#survey-admin-card .sa-azioni button{padding:8px 12px;border-radius:999px;border:1px solid #1f4250;background:#102733;color:#eaf2f4;font-weight:800;cursor:pointer}'
      + '#survey-admin-card .sa-azioni .sa-primario{border:0;background:linear-gradient(90deg,#2dd4bf,#67d7e6);color:#06231f}'
      + '#survey-admin-card .sa-num{display:flex;gap:16px;flex-wrap:wrap;margin:6px 0 12px}#survey-admin-card .sa-num b{display:block;font-size:24px;color:#2dd4bf}#survey-admin-card .sa-num span{color:#9fb8c2;font-size:12px}'
      + '#survey-admin-card h4{margin:12px 0 6px;color:var(--k);font-size:13px}'
      + '#survey-admin-card .sa-riga{display:grid;grid-template-columns:minmax(110px,170px) 1fr 70px;gap:8px;align-items:center;margin:4px 0;font-size:12px}'
      + '#survey-admin-card .sa-barra{height:10px;border-radius:99px;background:#143140;overflow:hidden}#survey-admin-card .sa-barra i{display:block;height:100%;background:var(--k)}'
      + '#survey-admin-card .sa-riga em{font-style:normal;color:#9fb8c2;text-align:right}'
      + '#survey-admin-card .sa-commento{margin:5px 0;padding:8px 10px;border-radius:10px;border:1px solid color-mix(in srgb,#fb923c 40%,transparent);background:color-mix(in srgb,#fb923c 10%,#102733);font-size:13px;white-space:pre-wrap}'
      + '#survey-admin-card .sa-msg{min-height:16px;color:#9fb8c2;font-size:12px}';
    document.head.appendChild(s);
  }

  const conta = (lista, chiave, opzioni) => opzioni.map(o => [o, lista.filter(r => Array.isArray(r[chiave]) ? r[chiave].includes(o) : r[chiave] === o).length]);
  const conDati = r => r && (r.frequency || r.ease || (r.features || []).length || r.comment);

  function blocco(box, titolo, colore, righe, totale) {
    const h = el('h4', '', titolo); h.style.setProperty('--k', colore); box.appendChild(h);
    righe.forEach(([nome, n]) => {
      const riga = el('div', 'sa-riga'); riga.style.setProperty('--k', colore);
      const barra = el('div', 'sa-barra'), fill = el('i'); fill.style.width = `${totale ? Math.round(n / totale * 100) : 0}%`; barra.appendChild(fill);
      riga.append(el('span', '', nome), barra, el('em', '', `${n} · ${totale ? Math.round(n / totale * 100) : 0}%`));
      box.appendChild(riga);
    });
  }

  function disegna(card) {
    const stato = card.querySelector('.sa-stato'), ris = card.querySelector('.sa-risultati'), attiva = card.querySelector('[data-sa="attiva"]');
    const v = config?.version || '';
    stato.textContent = v ? `Versione ${v} · ${config.enabled ? 'aperto: gli agenti lo vedono' : 'chiuso'}` : 'Nessun sondaggio creato';
    attiva.textContent = config?.enabled ? 'Chiudi' : 'Attiva';
    ris.replaceChildren();
    if (!v) return;
    const validi = risposte.filter(conDati);
    const num = el('div', 'sa-num');
    [[completati, 'agenti che hanno completato'], [validi.length, 'con almeno una risposta']].forEach(([n, t]) => { const d = el('div'); d.append(el('b', '', String(n)), el('span', '', t)); num.appendChild(d); });
    ris.appendChild(num);
    blocco(ris, '🕒 Frequenza d’uso', '#67d7e6', conta(validi, 'frequency', FREQ), validi.filter(r => r.frequency).length);
    blocco(ris, '🧭 Facilità di trovare le cose', '#fbbf24', conta(validi, 'ease', EASE), validi.filter(r => r.ease).length);
    blocco(ris, '⭐ Sezioni più usate', '#a78bfa', conta(validi, 'features', FEAT), validi.filter(r => (r.features || []).length).length);
    const commenti = validi.filter(r => r.comment).sort((a, b) => String(b.day).localeCompare(String(a.day))).slice(0, 20);
    const h = el('h4', '', `💬 Ultimi commenti (${commenti.length})`); h.style.setProperty('--k', '#fb923c'); ris.appendChild(h);
    commenti.forEach(r => ris.appendChild(el('div', 'sa-commento', `${r.day || ''} · ${r.comment}`)));
  }

  async function aggiorna(card) {
    const F = window.NaviAdminFirebase, msg = card.querySelector('.sa-msg');
    msg.textContent = 'Caricamento…';
    try {
      config = await F.getSurveyConfig();
      const v = config?.version;
      [risposte, completati] = v ? await Promise.all([F.listSurveyResponses(v), F.countSurveyDone(v)]) : [[], 0];
      msg.textContent = '';
    } catch (e) { msg.textContent = `Dati non disponibili: ${e.message}`; }
    disegna(card);
  }

  function esporta() {
    const v = config?.version; if (!v) { alert('Nessun sondaggio da esportare.'); return; }
    const validi = risposte.filter(conDati);
    const tab = (titolo, chiave, opzioni) => { const tot = validi.filter(r => Array.isArray(r[chiave]) ? r[chiave].length : r[chiave]).length; return conta(validi, chiave, opzioni).map(([o, n]) => [titolo, o, n, { v: tot ? n / tot : 0, pct: true }]); };
    const riepilogo = [['Sondaggio NaviSuite', ''], ['Versione', v], ['Agenti che hanno completato il popup', completati], ['Risposte con almeno un dato', validi.length], [],
      ['Domanda', 'Risposta', 'N.', '%'],
      ...tab('Frequenza d’uso', 'frequency', FREQ), ...tab('Facilità di trovare le cose', 'ease', EASE), ...tab('Sezioni più usate', 'features', FEAT)];
    const righe = [['Data', 'Frequenza d’uso', 'Facilità di trovare le cose', 'Sezioni più usate', 'Cosa manca o non funziona'],
      ...validi.slice().sort((a, b) => String(a.day).localeCompare(String(b.day))).map(r => [r.day || '', r.frequency || '', r.ease || '', (r.features || []).join(', '), r.comment || ''])];
    window.NaviSurveyXlsx.download(`sondaggio-${v}-${oggi()}.xlsx`, [
      { name: 'Riepilogo', rows: riepilogo, widths: [34, 30, 8, 8], headerRows: [0, 5] },
      { name: 'Risposte', rows: righe, widths: [12, 26, 26, 40, 60], headerRows: 1 }
    ]);
  }

  function crea() {
    injectStyle();
    const card = el('div'); card.id = 'survey-admin-card';
    card.append(el('h3', '', '📊 Sondaggi'), el('p', 'sa-stato', 'Caricamento…'));
    const az = el('div', 'sa-azioni'), msg = el('div', 'sa-msg'), ris = el('div', 'sa-risultati');
    const btn = (testo, chiave, primario) => { const b = el('button', primario ? 'sa-primario' : '', testo); b.type = 'button'; b.dataset.sa = chiave; az.appendChild(b); return b; };
    const F = () => window.NaviAdminFirebase;
    btn('👁 Anteprima', 'anteprima').addEventListener('click', () => window.NaviSurvey?.preview?.());
    btn('Attiva', 'attiva', true).addEventListener('click', async () => {
      try { config = await F().saveSurveyConfig({ enabled: !config?.enabled, version: config?.version || nuovaVersione() }); await aggiorna(card); }
      catch (e) { msg.textContent = `Non salvato: ${e.message}`; }
    });
    btn('Nuovo sondaggio', 'nuovo').addEventListener('click', async () => {
      if (!confirm('Creare un nuovo sondaggio?\nTutti gli agenti lo rivedranno; le risposte di quello attuale restano archiviate.')) return;
      try { config = await F().saveSurveyConfig({ enabled: true, version: nuovaVersione() }); await aggiorna(card); }
      catch (e) { msg.textContent = `Non salvato: ${e.message}`; }
    });
    btn('⬇ Esporta Excel', 'esporta').addEventListener('click', esporta);
    btn('↻ Aggiorna', 'aggiorna').addEventListener('click', () => aggiorna(card));
    card.append(az, msg, ris);
    return card;
  }

  let tentativi = 0;
  const timer = setInterval(() => {
    tentativi++;
    const sez = document.getElementById('gestione-avvisi'), grid = document.getElementById('announcement-grid');
    if (tentativi > 40) { clearInterval(timer); return; }
    if (!sez || sez.hidden || !grid || !window.NaviRoles?.isAdminAgent?.(sessione()) || !window.NaviAdminFirebase?.getSurveyConfig) return;
    clearInterval(timer);
    if (document.getElementById('survey-admin-card')) return;
    // dopo la griglia (fratello): il re-render della griglia non la cancella
    const card = crea(); grid.after(card); aggiorna(card);
  }, 500);
})();
