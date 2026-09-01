(() => {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  let label = null;
  let ticking = false;

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
    const nameHead = dateRow?.querySelector('.name-head');
    const days = dateRow ? [...dateRow.querySelectorAll('th.day[data-date]')] : [];
    const el = ensureLabel();

    if (!table || !dateRow || !nameHead || !days.length) {
      el.style.display = 'none';
      return;
    }

    const tableRect = table.getBoundingClientRect();
    const dateRect = dateRow.getBoundingClientRect();
    const nameRect = nameHead.getBoundingClientRect();
    if (tableRect.bottom <= dateRect.top || dateRect.bottom <= 0 || dateRect.top >= window.innerHeight) {
      el.style.display = 'none';
      return;
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const monthHeight = Math.max(20,parseFloat(rootStyle.getPropertyValue('--month-h')) || 30);
    const anchorX = Math.max(0,Math.min(window.innerWidth - 70,nameRect.right));
    const firstVisible = days.find(day => day.getBoundingClientRect().right > anchorX + 3) || days[days.length - 1];

    el.textContent = monthText(firstVisible?.dataset.date);
    el.style.display = 'flex';
    el.style.top = `${Math.max(0,Math.round(dateRect.top - monthHeight))}px`;
    el.style.left = `${Math.round(anchorX)}px`;
    el.style.height = `${Math.round(monthHeight)}px`;
    el.style.width = `${Math.max(80,Math.round(window.innerWidth - anchorX))}px`;
    el.style.maxWidth = 'none';
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  new MutationObserver(schedule).observe(wrap,{childList:true,subtree:true});
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('load',() => setTimeout(schedule,80));
  schedule();
})();
