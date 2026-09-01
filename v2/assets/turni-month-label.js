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
    label.setAttribute('aria-hidden', 'true');
    document.body.appendChild(label);
    return label;
  }

  function monthText(iso) {
    if (!iso) return '';
    const date = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat('it-IT', { month:'long', year:'numeric' })
      .format(date)
      .toLocaleUpperCase('it');
  }

  function update() {
    ticking = false;
    const table = wrap.querySelector('.turni-table');
    const monthRow = table?.querySelector('.month-header');
    const nameHead = table?.querySelector('.date-header .name-head');
    const days = table ? [...table.querySelectorAll('.date-header th.day[data-date]')] : [];
    const el = ensureLabel();

    if (!monthRow || !nameHead || !days.length) {
      el.style.display = 'none';
      return;
    }

    const monthRect = monthRow.getBoundingClientRect();
    const nameRect = nameHead.getBoundingClientRect();
    if (monthRect.bottom <= 0 || monthRect.top >= window.innerHeight) {
      el.style.display = 'none';
      return;
    }

    const anchorX = Math.max(0, Math.min(window.innerWidth - 70, nameRect.right));
    const firstVisible = days.find(day => day.getBoundingClientRect().right > anchorX + 3) || days[days.length - 1];
    el.textContent = monthText(firstVisible?.dataset.date);
    el.style.display = 'flex';
    el.style.top = `${Math.max(0, monthRect.top)}px`;
    el.style.left = `${anchorX}px`;
    el.style.height = `${Math.max(16, monthRect.height)}px`;
    el.style.maxWidth = `${Math.max(80, window.innerWidth - anchorX)}px`;
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  new MutationObserver(schedule).observe(wrap, { childList:true, subtree:true });
  window.addEventListener('scroll', schedule, { passive:true });
  window.addEventListener('resize', schedule, { passive:true });
  window.addEventListener('load', () => setTimeout(schedule, 80));
  schedule();
})();
