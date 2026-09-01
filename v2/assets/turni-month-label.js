(() => {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  let label = null;
  let ticking = false;

  function pxVar(name, fallback) {
    const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function fixedTop() {
    return document.body.classList.contains('smart-topbar-visible') ? pxVar('--smartbar-h',58) : 0;
  }

  function ensureLabel() {
    if (label?.isConnected) return label;
    label = document.createElement('div');
    label.id = 'turniMonthStickyLabel';
    label.className = 'turni-month-sticky-label';
    label.setAttribute('aria-hidden','true');
    document.body.appendChild(label);
    return label;
  }

  function monthText(iso) {
    if (!iso) return '';
    const date = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'})
      .format(date)
      .toLocaleUpperCase('it');
  }

  function update() {
    ticking = false;
    const table = wrap.querySelector('.turni-table');
    const dateRow = table?.querySelector('.date-header');
    const days = dateRow ? [...dateRow.querySelectorAll('th.day[data-date]')] : [];
    const el = ensureLabel();

    if (!table || !dateRow || !days.length) {
      el.style.display = 'none';
      return;
    }

    const tableRect = table.getBoundingClientRect();
    const viewportTop = fixedTop();
    const monthH = pxVar('--month-h',30);
    const dateH = pxVar('--date-h',42);
    const headerTop = Math.max(viewportTop,Math.round(tableRect.top));

    // Non guardare mai la posizione della month-header sticky originale.
    // Il mese resta presente finché la tabella continua sotto la testata.
    if (tableRect.bottom <= headerTop + monthH + dateH || tableRect.top >= window.innerHeight) {
      el.style.display = 'none';
      return;
    }

    const numHead = dateRow.querySelector('.num-head');
    const nameHead = dateRow.querySelector('.name-head');
    const numW = Math.round(numHead?.offsetWidth || pxVar('--num-w',42));
    const nameW = Math.round(nameHead?.offsetWidth || pxVar('--name-w',165));
    const stickyLeft = Math.max(0,Math.round(tableRect.left));
    const anchorX = Math.min(window.innerWidth - 64,stickyLeft + numW + nameW);
    const firstVisible = days.find(day => day.getBoundingClientRect().right > anchorX + 3) || days[days.length - 1];

    el.textContent = monthText(firstVisible?.dataset.date);
    el.style.display = 'flex';
    el.style.top = `${Math.round(headerTop)}px`;
    el.style.left = `${Math.round(anchorX)}px`;
    el.style.height = `${Math.round(monthH)}px`;
    el.style.width = `${Math.max(64,Math.round(window.innerWidth - anchorX))}px`;
    el.style.maxWidth = 'none';
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  new MutationObserver(schedule).observe(wrap,{childList:true,subtree:true});
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('load',() => setTimeout(schedule,80));
  schedule();
})();
