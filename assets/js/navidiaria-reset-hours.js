(() => {
  let scheduled = 0;
  document.addEventListener('click', event => {
    const cell = event.target.closest('td[data-row="hours"][data-date]');
    if (!cell) return;
    const entry = entries.find(item => item.date === cell.dataset.date);
    scheduled = entry ? (Number(entry.serviceMinutes) || Math.round((Number(shiftFor(entry.shift).hours) || 0) * 60)) : 0;
  }, true);

  function updateMonthlyTicketValue() {
    const hero = document.getElementById('heroBp');
    const month = document.getElementById('monthFilter')?.value;
    if (!hero || !month || typeof entries === 'undefined' || typeof shiftFor !== 'function') return;
    const monthEntries = entries.filter(entry => String(entry.date || '').startsWith(month) && entry.date <= todayIso() && shiftFor(entry.shift).meal);
    const used = monthEntries.filter(entry => entry.mealUsed).length;
    const credit = monthEntries.length - used;
    const count = used + credit;
    const euro = (count * 8).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
    const base = typeof bpSummary === 'function' ? bpSummary(used, credit) : `${count} ticket`;
    const wanted = count ? `${base} · ${euro}` : base;
    if (hero.textContent !== wanted) hero.textContent = wanted;
  }

  let ticketUpdatePending = false;
  function scheduleTicketUpdate() {
    if (ticketUpdatePending) return;
    ticketUpdatePending = true;
    requestAnimationFrame(() => {
      ticketUpdatePending = false;
      updateMonthlyTicketValue();
    });
  }

  new MutationObserver(() => {
    const dialog = document.getElementById('monthlyValueDialog');
    const actions = dialog?.querySelector('.monthly-dialog-actions');
    if (dialog && actions && !actions.querySelector('.monthly-dialog-reset')) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'monthly-dialog-reset'; button.textContent = 'Ripristina ore corsa';
      actions.prepend(button);
      button.addEventListener('click', () => {
        const input = dialog.querySelector('input');
        if (!input || !scheduled) return;
        input.value = String(Math.floor(scheduled / 60)).padStart(2, '0') + ':' + String(scheduled % 60).padStart(2, '0');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
    }
    scheduleTicketUpdate();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  document.getElementById('monthFilter')?.addEventListener('change', scheduleTicketUpdate);
  scheduleTicketUpdate();
})();
