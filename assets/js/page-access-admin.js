// Pagina Agenti · sezione "Accesso alle pagine": per ogni pagina i ruoli che la possono aprire (gli admin sempre) e la sezione
// del menu in cui sta (si sposta trascinando). Salva in private/adminUpdates/pageAccess {pagina: [ruoli], sezioni: {pagina: sezione}};
// il controllo vale su ogni pagina (shared-roles.js).
(() => {
  const list = document.getElementById('page-access-list');
  const R = window.NaviRoles;
  if (!list || !R?.PAGINE) return;
  const status = document.getElementById('page-access-status');
  const count = document.getElementById('page-access-count');
  let access = {};
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uguali = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  // Stessi icone e colori del menu (assets/js/shared-menu.js)
  const VOCI = { 'mio-turno.html': ['⚑', '#2dd4bf'], 'orario.html': ['⚓', '#38bdf8'], 'naviturni.html': ['▦', '#2dd4bf'], 'oggi.html': ['☀', '#facc15'], 'navidiaria.html': ['≈', '#fb923c'],
    'orari.html': ['🕒', '#fbbf24'], 'cambi_turno.html': ['⇄', '#a78bfa'], 'documenti.html': ['▤', '#f59e0b'], 'controllo_cassa.html': ['$', '#27a9b6'], 'backup-dati.html': ['⤓', '#67d7e6'],
    'impostazioni.html': ['⚙', '#94a3b8'], 'quiz.html': ['✎', '#f472b6'], 'comitive.html': ['⛴', '#67d7e6'], 'verifica-busta.html': ['✔', '#4ade80'] };
  if (!document.getElementById('pa-style')) {
    const style = document.createElement('style');
    style.id = 'pa-style';
    style.textContent = '.pa-titolo{margin:16px 2px 8px;color:#9fb8c2;font:800 11px Manrope,system-ui,sans-serif;letter-spacing:.14em}' +
      '.pa-guida{margin:0 0 4px;color:#9fb8c2;font-size:12px}' +
      '.pa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:9px;min-height:64px;padding:4px;border:1px dashed transparent;border-radius:18px}' +
      '.pa-grid:empty::before{content:"Trascina qui una pagina";display:grid;place-items:center;min-height:56px;color:#6f8d96;font-size:12px}' +
      '.pa-grid.pa-over{border-color:#2dd4bf;background:rgba(45,212,191,.07)}' +
      '.pa-tile{display:flex;flex-direction:column;gap:10px;padding:13px 12px;border:1px solid #285560;border-radius:16px;background:rgba(255,255,255,.025);color:#e8f7f7;min-width:0}' +
      '.pa-tile.diversa{border-color:#f59e0b;background:rgba(245,158,11,.08)}.pa-tile.pa-dragging{opacity:.35}' +
      '.pa-ghost{box-shadow:0 14px 34px rgba(0,0,0,.45);background:#0d2a35;transform:rotate(1.5deg)}' +
      '.pa-head{display:flex;align-items:center;gap:10px}.pa-head>span{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--c) 18%,transparent);color:var(--c);font-size:19px;flex:none}' +
      '.pa-head>div{flex:1;min-width:0}.pa-head b{font:800 16px/1.15 Manrope,system-ui,sans-serif}.pa-head small{display:block;margin-top:2px;color:#f59e0b;font:700 11px Manrope,system-ui,sans-serif}' +
      '.pa-grip{flex:none;width:34px;height:38px;border:0;border-radius:10px;background:transparent;color:#7fa3ad;font-size:20px;cursor:grab;touch-action:none}.pa-grip:hover{background:rgba(255,255,255,.07)}' +
      '.pa-tile .page-access-roles{justify-content:flex-start}' +
      'html.navisuite-light .pa-tile{background:#fff;border-color:#bdd8dc;color:#17323a}html.navisuite-light .pa-titolo,html.navisuite-light .pa-guida{color:#547078}';
    document.head.append(style);
  }
  const sezioneDi = file => R.sezioneDi(file, access);
  function tessera([file, nome]) {
    const ruoli = R.consentiti(file, access), sezione = sezioneDi(file), spostata = sezione !== R.sezionePredefinita(file);
    const diversa = !uguali(ruoli, R.predefiniti(file)) || spostata, [icona, colore] = VOCI[file] || ['•', '#94a3b8'];
    return { diversa, html: `<div class="pa-tile${diversa ? ' diversa' : ''}" data-file="${esc(file)}" style="--c:${colore}"><div class="pa-head"><span>${esc(icona)}</span><div><b>${esc(nome)}</b>${diversa ? '<small>diversa dal normale</small>' : ''}</div>` +
      `<button type="button" class="pa-grip" aria-label="Sposta ${esc(nome)} in un'altra sezione" title="Trascina in un'altra sezione">⠿</button></div><div class="page-access-roles">` +
      '<label class="pa-role on fixed" title="Gli admin vedono sempre tutte le pagine"><input type="checkbox" checked disabled>Admin</label>' +
      R.RUOLI.map(([ruolo, etichetta]) => `<label class="pa-role${ruoli.includes(ruolo) ? ' on' : ''}"><input type="checkbox" data-page="${esc(file)}" data-ruolo="${ruolo}"${ruoli.includes(ruolo) ? ' checked' : ''}>${esc(etichetta)}</label>`).join('') +
      '</div></div>' };
  }
  function render() {
    let cambiate = 0;
    const sezioni = R.SEZIONI.map(([chiave, titolo]) => {
      const t = R.PAGINE.filter(([f]) => sezioneDi(f) === chiave).map(tessera);
      cambiate += t.filter(x => x.diversa).length;
      return `<p class="pa-titolo">${titolo}</p><div class="pa-grid" data-sez="${chiave}">${t.map(x => x.html).join('')}</div>`;
    });
    list.innerHTML = '<p class="pa-guida">Trascina ⠿ per spostare una pagina in un\'altra sezione del menu e della Home.</p>' + sezioni.join('');
    count.textContent = String(cambiate);
  }
  async function salva(prima) {
    render();
    status.textContent = 'Salvataggio…';
    try {
      access = await window.NaviAdminFirebase.savePageAccess(access);
      localStorage.setItem('navisuite.pageAccess', JSON.stringify(access));
      status.textContent = 'Salvato: vale per tutti dal prossimo caricamento della pagina.';
    } catch (error) {
      access = prima; render();
      status.textContent = `Non salvato: ${error.message}`;
    }
  }
  list.addEventListener('change', async event => {
    const box = event.target.closest('[data-ruolo]');
    if (!box) return;
    const file = box.dataset.page;
    const ruoli = [...list.querySelectorAll(`[data-page="${file}"][data-ruolo]`)].filter(x => x.checked).map(x => x.dataset.ruolo);
    const prima = { ...access };
    const { updatedAt, ...resto } = access;
    access = { ...resto, [file]: ruoli };
    if (uguali(ruoli, R.predefiniti(file))) delete access[file]; // come di default: niente da salvare
    await salva(prima);
  });

  // Trascinamento (mouse e dito): si afferra ⠿, si rilascia su una sezione
  let drag = null;
  const zonaSotto = e => document.elementFromPoint(e.clientX, e.clientY)?.closest('.pa-grid') || null;
  const fine = () => { if (!drag) return; drag.ghost.remove(); drag.tile.classList.remove('pa-dragging'); list.querySelectorAll('.pa-over').forEach(z => z.classList.remove('pa-over')); drag = null; };
  list.addEventListener('pointerdown', e => {
    const grip = e.target.closest('.pa-grip');
    if (!grip || (e.button !== undefined && e.button > 0)) return;
    e.preventDefault();
    const tile = grip.closest('.pa-tile'), r = tile.getBoundingClientRect(), ghost = tile.cloneNode(true);
    ghost.classList.add('pa-ghost');
    ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;pointer-events:none;z-index:9999`;
    document.body.append(ghost);
    tile.classList.add('pa-dragging');
    drag = { tile, ghost, file: tile.dataset.file, dx: e.clientX - r.left, dy: e.clientY - r.top };
  });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.ghost.style.left = `${e.clientX - drag.dx}px`;
    drag.ghost.style.top = `${e.clientY - drag.dy}px`;
    const zona = zonaSotto(e);
    list.querySelectorAll('.pa-grid').forEach(z => z.classList.toggle('pa-over', z === zona));
  });
  window.addEventListener('pointerup', async e => {
    if (!drag) return;
    const file = drag.file, zona = zonaSotto(e);
    fine();
    if (!zona || zona.dataset.sez === sezioneDi(file)) return;
    const prima = { ...access, sezioni: { ...(access.sezioni || {}) } };
    const sezioni = { ...(access.sezioni || {}), [file]: zona.dataset.sez };
    if (zona.dataset.sez === R.sezionePredefinita(file)) delete sezioni[file]; // come di default: niente da salvare
    access = { ...access, sezioni };
    await salva(prima);
  });
  window.addEventListener('pointercancel', fine);

  (async () => {
    try {
      await window.NaviAdminFirebase.ready;
      access = await window.NaviAdminFirebase.getPageAccess() || {};
    } catch (error) { status.textContent = `Accessi non letti: ${error.message}`; }
    render();
  })();
})();
