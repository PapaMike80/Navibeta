// Pagina Agenti · sezione "Accesso alle pagine": per ogni pagina i ruoli che la possono aprire (gli admin sempre).
// Salva in private/adminUpdates/pageAccess {pagina: [ruoli]}; il controllo vale su ogni pagina (shared-roles.js).
(() => {
  const list = document.getElementById('page-access-list');
  const R = window.NaviRoles;
  if (!list || !R?.PAGINE) return;
  const status = document.getElementById('page-access-status');
  const count = document.getElementById('page-access-count');
  let access = {};
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uguali = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  // Stessi gruppi, icone e colori del menu (assets/js/shared-menu.js)
  const VOCI = { 'mio-turno.html': ['⚑', '#2dd4bf'], 'orario.html': ['⚓', '#38bdf8'], 'naviturni.html': ['▦', '#2dd4bf'], 'oggi.html': ['☀', '#facc15'], 'navidiaria.html': ['≈', '#fb923c'],
    'orari.html': ['🕒', '#fbbf24'], 'cambi_turno.html': ['⇄', '#a78bfa'], 'documenti.html': ['▤', '#f59e0b'], 'controllo_cassa.html': ['$', '#27a9b6'], 'backup-dati.html': ['⤓', '#67d7e6'],
    'impostazioni.html': ['⚙', '#94a3b8'], 'quiz.html': ['✎', '#f472b6'], 'comitive.html': ['⛴', '#67d7e6'], 'verifica-busta.html': ['✔', '#4ade80'] };
  const GRUPPI = [['PAGINE PRINCIPALI', ['mio-turno.html', 'orario.html', 'naviturni.html', 'oggi.html', 'navidiaria.html']],
    ['ALTRE PAGINE', ['orari.html', 'cambi_turno.html', 'documenti.html', 'controllo_cassa.html', 'backup-dati.html', 'impostazioni.html']],
    ['AMMINISTRAZIONE', ['quiz.html', 'comitive.html', 'verifica-busta.html']]];
  if (!document.getElementById('pa-style')) {
    const style = document.createElement('style');
    style.id = 'pa-style';
    style.textContent = '.pa-titolo{margin:16px 2px 8px;color:#9fb8c2;font:800 11px Manrope,system-ui,sans-serif;letter-spacing:.14em}' +
      '.pa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:9px}' +
      '.pa-tile{display:flex;flex-direction:column;gap:10px;padding:13px 12px;border:1px solid #285560;border-radius:16px;background:rgba(255,255,255,.025);color:#e8f7f7;min-width:0}' +
      '.pa-tile.diversa{border-color:#f59e0b;background:rgba(245,158,11,.08)}' +
      '.pa-head{display:flex;align-items:center;gap:10px}.pa-head>span{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--c) 18%,transparent);color:var(--c);font-size:19px;flex:none}' +
      '.pa-head b{font:800 16px/1.15 Manrope,system-ui,sans-serif}.pa-head small{display:block;margin-top:2px;color:#f59e0b;font:700 11px Manrope,system-ui,sans-serif}' +
      '.pa-tile .page-access-roles{justify-content:flex-start}' +
      'html.navisuite-light .pa-tile{background:#fff;border-color:#bdd8dc;color:#17323a}html.navisuite-light .pa-titolo{color:#547078}';
    document.head.append(style);
  }
  function tessera([file, nome]) {
    const ruoli = R.consentiti(file, access), diversa = !uguali(ruoli, R.predefiniti(file)), [icona, colore] = VOCI[file] || ['•', '#94a3b8'];
    return { diversa, html: `<div class="pa-tile${diversa ? ' diversa' : ''}" style="--c:${colore}"><div class="pa-head"><span>${esc(icona)}</span><div><b>${esc(nome)}</b>${diversa ? '<small>diversa dal normale</small>' : ''}</div></div><div class="page-access-roles">` +
      '<label class="pa-role on fixed" title="Gli admin vedono sempre tutte le pagine"><input type="checkbox" checked disabled>Admin</label>' +
      R.RUOLI.map(([ruolo, etichetta]) => `<label class="pa-role${ruoli.includes(ruolo) ? ' on' : ''}"><input type="checkbox" data-page="${esc(file)}" data-ruolo="${ruolo}"${ruoli.includes(ruolo) ? ' checked' : ''}>${esc(etichetta)}</label>`).join('') +
      '</div></div>' };
  }
  function render() {
    let cambiate = 0;
    const note = new Map(R.PAGINE), usate = new Set();
    const sezioni = GRUPPI.map(([titolo, file], i) => {
      const voci = file.filter(f => note.has(f)); voci.forEach(f => usate.add(f));
      // le pagine nuove non ancora in un gruppo finiscono tra le altre
      if (i === 1) R.PAGINE.forEach(([f]) => { if (!GRUPPI.some(([, l]) => l.includes(f)) && !usate.has(f)) { voci.push(f); usate.add(f); } });
      const t = voci.map(f => tessera([f, note.get(f)]));
      cambiate += t.filter(x => x.diversa).length;
      return t.length ? `<p class="pa-titolo">${titolo}</p><div class="pa-grid">${t.map(x => x.html).join('')}</div>` : '';
    });
    list.innerHTML = sezioni.join('');
    count.textContent = String(cambiate);
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
  });
  (async () => {
    try {
      await window.NaviAdminFirebase.ready;
      access = await window.NaviAdminFirebase.getPageAccess() || {};
    } catch (error) { status.textContent = `Accessi non letti: ${error.message}`; }
    render();
  })();
})();
