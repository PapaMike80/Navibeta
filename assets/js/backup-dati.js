// Backup e fonti dei dati: confronta la Distinta con un file (NaviSuite o Ore NaviG), la copia online o una copia automatica
// del telefono, mostra le differenze giorno per giorno e applica solo i giorni scelti.
(() => {
  const $ = id => document.getElementById(id);
  const D = window.NaviBackupDiff;
  let agent = null;
  try { agent = JSON.parse(localStorage.getItem('navidiaria.activeAgent') || localStorage.getItem('naviturni_logged_agent') || 'null'); } catch { agent = null; }
  const root = $('bdMain');
  if (!agent?.id) { $('bdLogin').hidden = false; return; }
  const id = String(agent.id);
  const K = { entries: `navidiaria.entries.v1.${id}`, meta: `navidiaria.entries.meta.${id}`, history: `navidiaria.entries.history.${id}`,
    dirty: `navidiaria.cloudDirty.${id}`, conv: `navidiaria.conversioni.${id}` };
  const leggi = (key, ripiego) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? ripiego; } catch { return ripiego; } };
  const locali = () => { const l = leggi(K.entries, []); return Array.isArray(l) ? l.filter(Boolean) : []; };
  const el = (tag, attrs = {}, ...figli) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); }
    n.append(...figli.flat().filter(f => f != null && f !== false));
    return n;
  };
  const data = iso => { const d = new Date(`${iso}T12:00:00`); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(d); };
  const quando = v => { const d = new Date(v); return v && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : '—'; };
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const nomeMese = tag => { const [y, m] = tag.split('-').map(Number); return `${MESI[m - 1]} ${y}`; };

  const state = { fonte: null, righe: [], uguali: 0, scelte: new Set(), mese: '', conv: false };

  // ---------- Fonti dei dati ----------
  function disegnaFonti() {
    const lista = locali(), meta = leggi(K.meta, {}), sporco = localStorage.getItem(K.dirty) === '1';
    const storia = leggi(K.history, []);
    const pb = (() => { try { return localStorage.getItem('navisuite.pbBase') || ''; } catch { return ''; } })();
    const card = (titolo, righe, azioni) => el('article', { class: 'bd-card' }, el('h3', {}, titolo), el('p', {}, ...righe), azioni ? el('div', { class: 'bd-azioni' }, azioni) : null);
    const sezione = $('bdFonti');
    sezione.replaceChildren(
      card('📱 Questo telefono', [`${lista.length} giorni · ultimo salvataggio ${quando(meta.updatedAt)}`, sporco ? el('b', { class: 'bd-warn' }, ' · modifiche non ancora online') : ' · allineato'], null),
      card('☁ Copia online (Firebase)', [el('span', { id: 'bdCloudInfo' }, 'Non ancora controllata')],
        [el('button', { type: 'button', class: 'chip', onclick: () => caricaCloud() }, 'Confronta con la copia online')]),
      card('🕘 Copie automatiche del telefono', [Array.isArray(storia) && storia.length ? `${storia.length} copie conservate` : 'Nessuna copia conservata'], null),
      pb ? card('🗄 Server PocketBase', [pb], null) : null,
      ...(Array.isArray(storia) ? storia.slice(-8).reverse().map((s, i) => card(`Copia del ${quando(s.savedAt)}`, [`${s.entryCount ?? s.entries?.length ?? 0} giorni · ${s.reason || 'salvataggio'}`],
        [el('button', { type: 'button', class: 'chip', onclick: () => impostaFonte({ nome: `Copia del ${quando(s.savedAt)}`, tipo: 'copia', entries: (s.entries || []).filter(Boolean), conversioni: {} }) }, 'Confronta')])) : []));
  }

  async function caricaCloud() {
    const info = $('bdCloudInfo');
    info.textContent = 'Lettura in corso…';
    try {
      await window.NaviAdminFirebase.ready;
      const remoto = await window.NaviAdminFirebase.loadDiaria(id);
      info.textContent = `${remoto.entries.length} giorni · aggiornata ${quando(remoto.updatedAt)}`;
      impostaFonte({ nome: 'Copia online', tipo: 'cloud', entries: remoto.entries, conversioni: {} });
    } catch (errore) { info.textContent = `Non raggiungibile: ${errore.message || errore}`; }
  }

  // ---------- File ----------
  async function leggiFile(file) {
    const B = window.NaviDiariaBackup;
    let dati;
    if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
      const files = B.unzip(new Uint8Array(await file.arrayBuffer())), nome = Object.keys(files).find(n => /\.json$/i.test(n));
      if (!nome) throw new Error('Nello zip non c’è il file .json del backup');
      dati = JSON.parse(files[nome]);
    } else dati = JSON.parse(await file.text());
    if (window.NaviDiariaBackupK.riconosci(dati)) {
      const gia = new Map(locali().map(e => [e.date, e]));
      const totali = window.NaviDistintaTotals.create();
      const k = window.NaviDiariaBackupK.converti(dati, gia, { servizio: e => totali.serviceMinutes(e) });
      return { nome: `Ore NaviG · ${file.name}`, tipo: 'k', entries: k.entries, conversioni: k.conversioni, saltati: k.saltati };
    }
    if (dati?.tipo !== 'navidiaria-backup' || !Array.isArray(dati.entries)) throw new Error('Non è un backup della Distinta né di Ore NaviG');
    return { nome: `NaviSuite · ${file.name}`, tipo: 'navisuite', entries: dati.entries.filter(Boolean), conversioni: dati.conversioni || {}, agente: dati.agente };
  }

  // ---------- Differenze ----------
  function impostaFonte(fonte) {
    const { righe, uguali } = D.confronta(locali(), fonte.entries);
    const conv = leggi(K.conv, { map: {} }).map || {};
    fonte.convDiverse = Object.entries(fonte.conversioni || {}).filter(([m, v]) => Number(conv[m]) !== Number(v));
    Object.assign(state, { fonte, righe, uguali, scelte: new Set(righe.map(r => r.date)), mese: '', conv: fonte.convDiverse.length > 0 });
    disegnaDiff();
    $('bdDiff').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function disegnaDiff() {
    const { fonte, righe } = state, box = $('bdDiff');
    box.hidden = false;
    const mesi = [...new Set(righe.map(r => r.date.slice(0, 7)))];
    const viste = righe.filter(r => !state.mese || r.date.startsWith(state.mese));
    const nuovi = righe.filter(r => r.stato === 'nuovo').length;
    const intestazione = el('header', { class: 'bd-diff-head' },
      el('h2', {}, fonte.nome),
      el('p', {}, `${nuovi} giorni nuovi · ${righe.length - nuovi} diversi · ${state.uguali} già uguali`, fonte.saltati?.length ? ` · ${fonte.saltati.length} saltati (nessun turno in Distinta)` : ''),
      fonte.agente?.id && String(fonte.agente.id) !== id ? el('p', { class: 'bd-warn' }, `⚠ Il backup è di ${fonte.agente.nome || fonte.agente.id}, non tuo.`) : null);
    const barra = el('div', { class: 'bd-barra' },
      mesi.length > 1 ? el('select', { 'aria-label': 'Mese', onchange: e => { state.mese = e.target.value; disegnaDiff(); } },
        el('option', { value: '' }, 'Tutti i mesi'), ...mesi.map(m => el('option', { value: m, selected: m === state.mese }, nomeMese(m)))) : null,
      el('button', { type: 'button', class: 'chip', onclick: () => { viste.forEach(r => state.scelte.add(r.date)); disegnaDiff(); } }, 'Seleziona tutti'),
      el('button', { type: 'button', class: 'chip', onclick: () => { viste.forEach(r => state.scelte.delete(r.date)); disegnaDiff(); } }, 'Nessuno'));
    const elenco = el('div', { class: 'bd-lista' }, ...(viste.length ? viste.map(riga) : [el('p', { class: 'bd-vuoto' }, righe.length ? 'Nessun giorno in questo mese.' : 'Nessuna differenza: la Distinta è già uguale a questa fonte.')]));
    const conv = fonte.convDiverse.length ? el('label', { class: 'bd-conv' },
      el('input', { type: 'checkbox', checked: state.conv, onchange: e => { state.conv = e.target.checked; } }),
      ` Applica anche le ore trasformate in banca ore: ${fonte.convDiverse.map(([m, v]) => `${nomeMese(m)} ${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`).join(', ')}`) : null;
    const applica = el('button', { type: 'button', class: 'chip on bd-applica', disabled: !righe.length && !fonte.convDiverse.length, onclick: applicaScelte }, `Applica ${state.scelte.size} giorni`);
    box.replaceChildren(intestazione, barra, elenco, conv, applica);
  }

  function riga(r) {
    return el('label', { class: `bd-riga ${r.stato}` },
      el('input', { type: 'checkbox', checked: state.scelte.has(r.date), onchange: e => { if (e.target.checked) state.scelte.add(r.date); else state.scelte.delete(r.date); $('bdDiff').querySelector('.bd-applica').textContent = `Applica ${state.scelte.size} giorni`; } }),
      el('div', {},
        el('b', {}, data(r.date)), el('span', { class: `bd-tag ${r.stato}` }, r.stato === 'nuovo' ? 'Nuovo' : 'Diverso'),
        r.stato === 'nuovo' ? el('small', {}, `Turno ${r.entry.shift || '—'}`)
          : el('ul', {}, ...r.campi.map(c => el('li', {}, el('span', {}, c.label), ' ', el('s', {}, c.testoPrima), ' → ', el('strong', {}, c.testoDopo))))));
  }

  // ---------- Applicazione ----------
  async function applicaScelte() {
    if (window.__naviBetaReadOnly) return alert('NaviBeta è in sola lettura: puoi guardare le differenze, ma non applicarle.');
    const { fonte, righe } = state;
    const quanti = righe.filter(r => state.scelte.has(r.date)).length, convs = state.conv ? fonte.convDiverse : [];
    if (!quanti && !convs.length) return;
    if (!confirm(`Applicare ${quanti} giorni${convs.length ? ` e ${convs.length} mesi di ore trasformate` : ''} dalla fonte “${fonte.nome}”?\nPrima si salva una copia automatica della Distinta attuale.`)) return;
    const attuali = locali();
    try { // copia di sicurezza, come fa la Distinta
      const storia = leggi(K.history, []);
      storia.push({ savedAt: new Date().toISOString(), reason: 'prima di importare un backup', entryCount: attuali.length, entries: attuali });
      localStorage.setItem(K.history, JSON.stringify(storia.slice(-35)));
    } catch { /* memoria piena: si prosegue */ }
    const { entries } = D.applica(attuali, righe, state.scelte);
    const adesso = Date.now();
    entries.forEach(e => { if (state.scelte.has(e.date) && !e.modificatoIl) e.modificatoIl = adesso; });
    localStorage.setItem(K.entries, JSON.stringify(entries));
    localStorage.setItem(K.meta, JSON.stringify({ updatedAt: new Date().toISOString(), entryCount: entries.length }));
    localStorage.setItem(K.dirty, '1');
    if (convs.length) {
      const stato = leggi(K.conv, { map: {} });
      stato.map = { ...(stato.map || {}), ...Object.fromEntries(convs) }; stato.updatedAt = new Date().toISOString();
      localStorage.setItem(K.conv, JSON.stringify(stato));
      window.NaviAdminFirebase?.saveDiariaConversioni?.(id, stato).catch(e => console.warn('Ore trasformate non salvate online', e));
    }
    let esito = 'salvate su questo telefono';
    try { await window.NaviAdminFirebase.ready; await window.NaviAdminFirebase.saveDiaria(id, entries); localStorage.removeItem(K.dirty); esito = 'salvate anche online'; }
    catch (errore) { console.warn(errore); esito = 'salvate sul telefono, online al prossimo accesso alla Distinta'; }
    $('bdDiff').replaceChildren(el('p', { class: 'bd-ok' }, `✓ ${quanti} giorni applicati, ${esito}.`), el('a', { class: 'chip on', href: 'navidiaria.html' }, 'Apri la Distinta'));
    disegnaFonti();
  }

  $('bdFile').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    $('bdFileInfo').textContent = 'Lettura…';
    try { const fonte = await leggiFile(f); $('bdFileInfo').textContent = ''; impostaFonte(fonte); }
    catch (errore) { $('bdFileInfo').textContent = `File non leggibile: ${errore.message || errore}`; }
    e.target.value = '';
  });
  $('bdScarica').addEventListener('click', () => {
    const B = window.NaviDiariaBackup, lista = locali();
    const base = `Distinta-${B.nomeFile(agent.name)}-${B.oggi()}`;
    const json = { tipo: 'navidiaria-backup', versione: 1, creato: new Date().toISOString(), agente: { id, nome: agent.name || '', residenza: agent.residence || '' },
      entries: lista, conversioni: (leggi(K.conv, { map: {} }).map) || {} };
    B.scarica(`${base}.zip`, B.zip([{ name: `${base}.json`, data: JSON.stringify(json, null, 1) }, { name: `${base}.csv`, data: B.csv([{ id, nome: agent.name, entries: lista, conversioni: json.conversioni }]) }]), 'application/zip');
  });
  if (!window.NaviDiariaOvertime) window.NaviDiariaOvertime = { setOrdinary: (e, v, s) => window.NaviOvertimeComponents.setOrdinary(e, v, s) };
  root.hidden = false;
  if (window.__naviBetaReadOnly) $('bdBeta').hidden = false;
  disegnaFonti();
})();
