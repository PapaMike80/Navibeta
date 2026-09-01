(() => {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  function pinSelfRow() {
    const table = wrap.querySelector('.turni-table');
    const head = table?.querySelector('thead');
    const dateRow = head?.querySelector('.date-header');
    const selfRow = table?.querySelector('tr.logged-agent-row');
    if (!head || !dateRow || !selfRow) return;

    selfRow.classList.add('logged-agent-head');
    if (selfRow.parentElement !== head || selfRow.previousElementSibling !== dateRow) {
      dateRow.insertAdjacentElement('afterend', selfRow);
    }
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      pinSelfRow();
    });
  };

  new MutationObserver(schedule).observe(wrap, { childList:true, subtree:true });
  window.addEventListener('load', () => setTimeout(pinSelfRow, 60));
  schedule();
})();
