(() => {
  const OPERATIVE = [
    { key:'desenzano', label:'D', color:'#24b7f2' },
    { key:'maderno', label:'M', color:'#f59e0b' },
    { key:'riva', label:'R', color:'#a78bfa' },
    { key:'peschiera', label:'P', color:'#52c879' },
  ];

  const SHIFT_COLORS = {
    // Desenzano: palette storica NaviSuite.
    D1:['#3b6bcc','#1a2a4a'], D2:['#2d9e6b','#142a22'], D3:['#e07b3a','#2a1a0e'], D4:['#c45cba','#2a122a'],
    BIS:['#5ec4d4','#102a2e'], POND:['#f08080','#2a1212'], DT:['#e6d44a','#282200'],

    // Peschiera: tinte volutamente lontane tra loro per lettura immediata.
    P1:['#60a5fa','#10233d'], P2:['#34d399','#102d25'], P3:['#fbbf24','#322607'],
    CAP:['#f472b6','#351629'], SR1:['#22d3ee','#103038'],

    // Riva: niente più quattro tonalità viola/rosa quasi identiche.
    R1:['#38bdf8','#102a38'], R2:['#f59e0b','#332307'], R3:['#22c55e','#10301d'],
    R4:['#f472b6','#351629'], CAR:['#fb7185','#35151e'],

    // Maderno: tre famiglie cromatiche nettamente separate.
    T1:['#38bdf8','#102a38'], T2:['#fb923c','#352013'], M1:['#a78bfa','#241635'],

    AGB:['#60a5fa','#102040'], AGM:['#2dd4bf','#103530'], AGT:['#34d399','#103227'],
    RIP:['#6b7280','#1a1c22'], CON:['#a78bfa','#1e1530'], TERRA:['#fbbf24','#302407'], LAV:['#fbbf24','#302407'],
    'F.P.':['#94a3b8','#1a1e28'], FP:['#94a3b8','#1a1e28'], 'S.S.':['#cbd5e1','#252a34'], MAL:['#fb7185','#35141d'], CORSO:['#67e8f9','#10313a']
  };

  const normalize = value => String(value || '').trim().toLowerCase();
  const normalizeShift = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'');

  function optionFor(key) {
    const select = document.getElementById('residence');
    if (!select) return null;
    return [...select.options].find(option => normalize(option.value) === key || normalize(option.textContent) === key) || null;
  }

  function currentResidenceKey() {
    const select = document.getElementById('residence');
    return normalize(select?.value);
  }

  function ensureOperativeResidence() {
    const select = document.getElementById('residence');
    if (!select) return false;
    if (OPERATIVE.some(item => item.key === currentResidenceKey())) return false;
    const first = optionFor('desenzano') || OPERATIVE.map(item => optionFor(item.key)).find(Boolean);
    if (!first) return false;
    select.value = first.value;
    select.dispatchEvent(new Event('change', { bubbles:true }));
    return true;
  }

  function renderResidenceBubbles() {
    const cell = document.querySelector('.turni-table .date-header .name-head');
    if (!cell) return;
    const active = currentResidenceKey();
    const available = OPERATIVE.filter(item => optionFor(item.key));
    const signature = `${active}|${available.map(item => item.key).join(',')}`;
    if (cell.dataset.resUi === signature && cell.querySelector('.header-residence-bubbles')) return;
    cell.dataset.resUi = signature;
    cell.innerHTML = `<div class="header-residence-bubbles" aria-label="Residenza">${available.map(item => {
      const option = optionFor(item.key);
      return `<button type="button" class="header-residence-btn${active === item.key ? ' active' : ''}" data-res-key="${item.key}" style="--quick-res-color:${item.color}" title="${option.textContent}">${item.label}</button>`;
    }).join('')}</div>`;
    cell.querySelectorAll('.header-residence-btn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const option = optionFor(button.dataset.resKey);
        const select = document.getElementById('residence');
        if (!option || !select || select.value === option.value) return;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles:true }));
      });
    });
  }

  function renderMonthMenu() {
    const cell = document.querySelector('.turni-table .month-header .name-head.month-corner');
    if (!cell || cell.querySelector('.month-menu-bubble')) return;
    cell.classList.add('month-menu-cell');
    cell.innerHTML = '<a class="month-menu-bubble" href="index.html" aria-label="Apri menu NaviSuite">Menu</a>';
  }

  function colorShiftPills() {
    document.querySelectorAll('.turni-table .cell-pill').forEach(pill => {
      const key = normalizeShift(pill.textContent);
      const palette = SHIFT_COLORS[key];
      if (!palette) return;
      pill.style.setProperty('--service-color', palette[0]);
      pill.style.setProperty('--service-bg', palette[1]);
      pill.classList.add('service-colored');
    });
  }

  function compactHeader() {
    document.querySelectorAll('.date-head-markers,.week-draft-label').forEach(node => node.remove());
  }

  function compactMonthLabels() {
    document.querySelectorAll('.month-group').forEach(cell => {
      if (cell.dataset.monthUi === '1') return;
      const full = String(cell.textContent || '').trim().toLocaleUpperCase('it');
      if (!full) return;
      const parts = full.split(/\s+/);
      const month = parts[0] || '';
      const year = parts[1] || '';
      let label = full;
      if (cell.colSpan <= 2) label = month.slice(0, 3);
      else if (cell.colSpan <= 4) label = `${month.slice(0, 3)} ${year.slice(-2)}`.trim();
      cell.title = full;
      cell.textContent = label;
      cell.dataset.monthUi = '1';
    });
  }

  function enhance() {
    if (ensureOperativeResidence()) return;
    compactHeader();
    compactMonthLabels();
    renderMonthMenu();
    renderResidenceBubbles();
    colorShiftPills();
  }

  const wrap = document.getElementById('tableWrap');
  if (wrap) {
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; enhance(); });
    }).observe(wrap, { childList:true, subtree:true });
  }
  window.addEventListener('load', () => setTimeout(enhance, 50));
})();
