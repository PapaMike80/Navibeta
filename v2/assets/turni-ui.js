(() => {
  const OPERATIVE = [
    { key:'desenzano', label:'D', color:'#24b7f2' },
    { key:'maderno', label:'M', color:'#f59e0b' },
    { key:'riva', label:'R', color:'#a78bfa' },
    { key:'peschiera', label:'P', color:'#52c879' },
  ];

  const SHIFT_COLORS = {
    D1:['#3b6bcc','#1a2a4a'], D2:['#2d9e6b','#142a22'], D3:['#e07b3a','#2a1a0e'], D4:['#c45cba','#2a122a'],
    BIS:['#5ec4d4','#102a2e'], POND:['#f08080','#2a1212'], DT:['#e6d44a','#282200'],
    P1:['#86efac','#153524'], P2:['#4ade80','#123322'], P3:['#22c55e','#10301d'],
    R1:['#d8b4fe','#2d1b3e'], R2:['#c084fc','#29163a'], R3:['#a78bfa','#241635'], R4:['#8b5cf6','#211432'],
    T1:['#fdba74','#3a2414'], T2:['#fb923c','#352013'], M1:['#f59e0b','#332407'],
    CAR:['#f87171','#351717'], CAP:['#38bdf8','#102b38'], SR1:['#22d3ee','#103039'],
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
    const cell = document.querySelector('.turni-table .name-head');
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

  function enhance() {
    if (ensureOperativeResidence()) return;
    compactHeader();
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
