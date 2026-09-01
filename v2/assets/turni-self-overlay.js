(() => {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  let metaTable = null;
  let daysTable = null;
  let queued = false;
  let rebuilding = false;

  function pxVar(name, fallback) {
    const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function fixedTop() {
    return document.body.classList.contains('smart-topbar-visible') ? pxVar('--smartbar-h',58) : 0;
  }

  function ensureTables() {
    if (!metaTable?.isConnected) {
      metaTable = document.createElement('table');
      metaTable.className = 'turni-self-fixed-meta';
      metaTable.setAttribute('aria-label','Il mio turno');
      document.body.appendChild(metaTable);
    }
    if (!daysTable?.isConnected) {
      daysTable = document.createElement('table');
      daysTable.className = 'turni-self-fixed-days';
      daysTable.setAttribute('aria-label','I miei turni');
      document.body.appendChild(daysTable);
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

  function hide() {
    document.body.classList.remove('turni-self-overlay-visible');
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
      hide();
      return;
    }

    const tableRect = table.getBoundingClientRect();
    const viewportTop = fixedTop();
    const monthH = pxVar('--month-h',30);
    const dateH = pxVar('--date-h',42);
    const headerTop = Math.max(viewportTop,Math.round(tableRect.top));
    const sourceHeight = Math.max(38,Math.round(source.offsetHeight || source.getBoundingClientRect().height || 44));
    const top = headerTop + monthH + dateH;

    // La visibilità dipende solo dall'intera tabella, mai dalla posizione sticky
    // della riga originale. Questo evita la sparizione dopo scroll lunghi.
    if (tableRect.top >= window.innerHeight || tableRect.bottom <= top + 2) {
      hide();
      return;
    }

    const numHead = dateRow.querySelector('.num-head');
    const nameHead = dateRow.querySelector('.name-head');
    const numW = Math.round(numHead?.offsetWidth || num.offsetWidth || pxVar('--num-w',42));
    const nameW = Math.round(nameHead?.offsetWidth || name.offsetWidth || pxVar('--name-w',165));
    const stickyLeft = Math.max(0,Math.round(tableRect.left));
    const firstDayRect = dayHeads[0].getBoundingClientRect();

    rebuilding = true;
    try {
      const metaRow = document.createElement('tr');
      metaRow.dataset.agentId = source.dataset.agentId || '';
      metaRow.className = 'logged-agent-row self-overlay-row';
      metaRow.append(cloneCell(num),cloneCell(name));
      const metaBody = document.createElement('tbody');
      metaBody.appendChild(metaRow);
      metaTable.replaceChildren(metaBody);

      const daysRow = document.createElement('tr');
      daysRow.dataset.agentId = source.dataset.agentId || '';
      daysRow.className = 'logged-agent-row self-overlay-row';
      let totalDaysWidth = 0;
      sourceDays.forEach((cell,index) => {
        const copy = cloneCell(cell);
        const width = Math.max(1,Math.round(dayHeads[index]?.offsetWidth || cell.offsetWidth || 47));
        totalDaysWidth += width;
        copy.style.width = `${width}px`;
        copy.style.minWidth = `${width}px`;
        copy.style.maxWidth = `${width}px`;
        daysRow.appendChild(copy);
      });
      const daysBody = document.createElement('tbody');
      daysBody.appendChild(daysRow);
      daysTable.replaceChildren(daysBody);

      metaTable.style.setProperty('--self-overlay-h',`${sourceHeight}px`);
      daysTable.style.setProperty('--self-overlay-h',`${sourceHeight}px`);
      metaTable.style.top = `${Math.round(top)}px`;
      metaTable.style.left = `${stickyLeft}px`;
      metaTable.style.width = `${numW + nameW}px`;
      daysTable.style.top = `${Math.round(top)}px`;
      daysTable.style.left = `${Math.round(firstDayRect.left)}px`;
      daysTable.style.width = `${totalDaysWidth}px`;
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

  const observer = new MutationObserver(() => {
    if (!rebuilding) schedule();
  });
  observer.observe(wrap,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','data-service']});
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  document.getElementById('residence')?.addEventListener('change',() => setTimeout(schedule,30));
  window.addEventListener('load',() => setTimeout(schedule,100));
  schedule();
})();
