(() => {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  let metaTable = null;
  let daysTable = null;
  let queued = false;
  let rebuilding = false;

  function ensureTables() {
    if (!metaTable?.isConnected) {
      metaTable = document.createElement('table');
      metaTable.className = 'turni-self-fixed-meta';
      metaTable.setAttribute('aria-label','Il mio turno');
      wrap.appendChild(metaTable);
    }
    if (!daysTable?.isConnected) {
      daysTable = document.createElement('table');
      daysTable.className = 'turni-self-fixed-days';
      daysTable.setAttribute('aria-label','I miei turni');
      wrap.appendChild(daysTable);
    }
  }

  function cloneCell(cell) {
    const copy = cell.cloneNode(true);
    copy.removeAttribute('style');
    for (const [name,value] of Object.entries(cell.dataset || {})) copy.dataset[name] = value;
    const srcPill = cell.querySelector('.cell-pill');
    const dstPill = copy.querySelector('.cell-pill');
    if (srcPill && dstPill) dstPill.setAttribute('style',srcPill.getAttribute('style') || '');
    return copy;
  }

  function sync() {
    queued = false;
    if (rebuilding) return;
    ensureTables();

    const table = wrap.querySelector('.turni-table');
    const dateRow = table?.querySelector('.date-header');
    const source = table?.querySelector('tr.logged-agent-row');
    const dayHeads = dateRow ? [...dateRow.querySelectorAll('th.day[data-date]')] : [];
    const sourceDays = source ? [...source.querySelectorAll('td[data-date]')] : [];
    const num = source?.querySelector('.td-num');
    const name = source?.querySelector('.td-name');
    if (!table || !dateRow || !source || !dayHeads.length || !sourceDays.length || !num || !name) {
      document.body.classList.remove('turni-self-overlay-visible');
      return;
    }

    const tableRect = table.getBoundingClientRect();
    const dateRect = dateRow.getBoundingClientRect();
    const visible = tableRect.bottom > dateRect.bottom + 2 && dateRect.bottom > 0 && dateRect.top < window.innerHeight;
    if (!visible) {
      document.body.classList.remove('turni-self-overlay-visible');
      return;
    }

    const sourceRect = source.getBoundingClientRect();
    const height = Math.max(38, Math.round(sourceRect.height || 44));
    const numHead = dateRow.querySelector('.num-head')?.getBoundingClientRect();
    const nameHead = dateRow.querySelector('.name-head')?.getBoundingClientRect();
    const firstDayRect = dayHeads[0].getBoundingClientRect();
    const top = Math.round(dateRect.bottom);

    rebuilding = true;
    try {
      const metaRow = document.createElement('tr');
      metaRow.dataset.agentId = source.dataset.agentId || '';
      metaRow.className = 'logged-agent-row self-overlay-row';
      metaRow.append(cloneCell(num),cloneCell(name));
      metaTable.replaceChildren(document.createElement('tbody'));
      metaTable.tBodies[0].appendChild(metaRow);

      const daysRow = document.createElement('tr');
      daysRow.dataset.agentId = source.dataset.agentId || '';
      daysRow.className = 'logged-agent-row self-overlay-row';
      sourceDays.forEach((cell,index) => {
        const copy = cloneCell(cell);
        const width = Math.max(1, Math.round(dayHeads[index]?.getBoundingClientRect().width || cell.getBoundingClientRect().width || 47));
        copy.style.width = `${width}px`;
        copy.style.minWidth = `${width}px`;
        copy.style.maxWidth = `${width}px`;
        daysRow.appendChild(copy);
      });
      daysTable.replaceChildren(document.createElement('tbody'));
      daysTable.tBodies[0].appendChild(daysRow);

      const numW = Math.round(numHead?.width || num.getBoundingClientRect().width || 42);
      const nameW = Math.round(nameHead?.width || name.getBoundingClientRect().width || 165);
      metaTable.style.setProperty('--self-overlay-h',`${height}px`);
      daysTable.style.setProperty('--self-overlay-h',`${height}px`);
      metaTable.style.top = `${top}px`;
      metaTable.style.left = '0px';
      metaTable.style.width = `${numW + nameW}px`;
      daysTable.style.top = `${top}px`;
      daysTable.style.left = `${Math.round(firstDayRect.left)}px`;
      daysTable.style.width = `${sourceDays.reduce((sum,cell,index) => sum + Math.max(1,Math.round(dayHeads[index]?.getBoundingClientRect().width || cell.getBoundingClientRect().width || 47)),0)}px`;
      document.body.classList.add('turni-self-overlay-visible');
    } finally {
      rebuilding = false;
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }

  const observer = new MutationObserver(mutations => {
    if (rebuilding) return;
    const external = mutations.some(m => !metaTable?.contains(m.target) && !daysTable?.contains(m.target));
    if (external) schedule();
  });
  observer.observe(wrap,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','data-service']});
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  document.getElementById('residence')?.addEventListener('change',() => setTimeout(schedule,30));
  window.addEventListener('load',() => setTimeout(schedule,100));
  schedule();
})();
