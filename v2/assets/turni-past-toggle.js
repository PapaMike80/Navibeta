(() => {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  let showPast = false;
  let applying = false;
  let scheduled = false;

  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  function updateButton() {
    const button = document.querySelector('.header-past-btn');
    if (!button) return;
    button.classList.toggle('is-active', showPast);
    button.setAttribute('aria-pressed', showPast ? 'true' : 'false');
    button.setAttribute('aria-label', showPast ? 'Nascondi il passato' : 'Mostra il passato');
    button.title = showPast ? 'Nascondi passato' : 'Mostra passato';
  }

  function updateMonthGroups(table, days, today) {
    const groups = [...table.querySelectorAll('.month-header .month-group')];
    if (!groups.length) return;
    let dayIndex = 0;
    groups.forEach(group => {
      if (!group.dataset.originalColspan) group.dataset.originalColspan = String(group.colSpan || 1);
      const original = Number(group.dataset.originalColspan || 1);
      const groupDays = days.slice(dayIndex, dayIndex + original);
      dayIndex += original;
      const visible = showPast ? groupDays.length : groupDays.filter(day => String(day.dataset.date || '') >= today).length;
      group.style.display = visible ? '' : 'none';
      if (visible) group.colSpan = visible;
    });
  }

  function apply() {
    scheduled = false;
    if (applying) return;
    const table = wrap.querySelector('.turni-table');
    const dateRow = table?.querySelector('.date-header');
    if (!table || !dateRow) return;

    applying = true;
    try {
      const today = todayIso();
      const days = [...dateRow.querySelectorAll('th.day[data-date]')];
      days.forEach(day => {
        const date = String(day.dataset.date || '');
        const hide = !showPast && date && date < today;
        day.classList.toggle('past-day-hidden', hide);
        day.style.display = hide ? 'none' : '';
        table.querySelectorAll(`td[data-date="${CSS.escape(date)}"]`).forEach(cell => {
          cell.classList.toggle('past-day-hidden', hide);
          cell.style.display = hide ? 'none' : '';
        });
      });
      updateMonthGroups(table, days, today);
      updateButton();
    } finally {
      applying = false;
    }

    // I componenti sticky/overlay misurano le colonne reali: una resize
    // sintetica li fa riallineare dopo che le colonne passate sono cambiate.
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  function schedule() {
    if (scheduled || applying) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('.header-past-btn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showPast = !showPast;
    apply();
    // Quando si cambia modalità si parte dall'inizio dell'orizzontale:
    // con passato nascosto la prima colonna è oggi; con passato visibile
    // si vedono subito le colonne storiche appena riattivate.
    window.scrollTo({ left:0, top:window.scrollY, behavior:'auto' });
  }, true);

  new MutationObserver(schedule).observe(wrap, { childList:true, subtree:true });
  window.addEventListener('load', () => setTimeout(apply, 80));
  schedule();
})();
