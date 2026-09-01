(() => {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  let metaTable = null;
  let daysTable = null;
  let refs = null;
  let buildQueued = false;
  let positionQueued = false;
  let rebuilding = false;
  let lastSignature = '';

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

  function collect() {
    const table = wrap.querySelector('.turni-table');
    const dateRow = table?.querySelector('.date-header');
    const source = table?.querySelector('tr.logged-agent-row');
    const dayHeads = dateRow ? [...dateRow.querySelectorAll('th.day[data-date]')] : [];
    const sourceDays = source ? [...source.querySelectorAll('td[data-date]')] : [];
    const num = source?.querySelector('.td-num');
    const name = source?.querySelector('.td-name');
    if (!table || !dateRow || !source || !dayHeads.length || !sourceDays.length || !num || !name) return null;
    return {table,dateRow,source,dayHeads,sourceDays,num,name};
  }

  function signatureOf(ctx) {
    const services = ctx.sourceDays.map(cell => `${cell.dataset.date || ''}:${cell.dataset.service || cell.querySelector('.cell-pill')?.textContent || ''}`).join('|');
    return `${ctx.source.dataset.agentId || ''}|${ctx.sourceDays.length}|${services}`;
  }

  function build(force = false) {
    buildQueued = false;
    if (rebuilding) return;
    ensureTables();

    const ctx = collect();
    if (!ctx) {
      refs = null;
      lastSignature = '';
      hide();
      return;
    }

    const signature = signatureOf(ctx);
    refs = ctx;
    if (!force && signature === lastSignature && metaTable?.rows.length && daysTable?.rows.length) {
      schedulePosition();
      return;
    }

    rebuilding = true;
    try {
      const sourceHeight = Math.max(38,Math.round(ctx.source.offsetHeight || ctx.source.getBoundingClientRect().height || 44));
      const numHead = ctx.dateRow.querySelector('.num-head');
      const nameHead = ctx.dateRow.querySelector('.name-head');
      const numW = Math.round(numHead?.offsetWidth || ctx.num.offsetWidth || pxVar('--num-w',42));
      const nameW = Math.round(nameHead?.offsetWidth || ctx.name.offsetWidth || pxVar('--name-w',165));

      const metaRow = document.createElement('tr');
      metaRow.dataset.agentId = ctx.source.dataset.agentId || '';
      metaRow.className = 'logged-agent-row self-overlay-row';
      metaRow.append(cloneCell(ctx.num),cloneCell(ctx.name));
      const metaBody = document.createElement('tbody');
      metaBody.appendChild(metaRow);
      metaTable.replaceChildren(metaBody);

      const daysRow = document.createElement('tr');
      daysRow.dataset.agentId = ctx.source.dataset.agentId || '';
      daysRow.className = 'logged-agent-row self-overlay-row';
      let totalDaysWidth = 0;
      ctx.sourceDays.forEach((cell,index) => {
        const copy = cloneCell(cell);
        const width = Math.max(1,Math.round(ctx.dayHeads[index]?.offsetWidth || cell.offsetWidth || 47));
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
      metaTable.style.width = `${numW + nameW}px`;
      daysTable.style.width = `${totalDaysWidth}px`;
      lastSignature = signature;
    } finally {
      rebuilding = false;
    }

    position();
  }

  function setPx(el, prop, value) {
    const next = `${Math.round(value)}px`;
    if (el.style[prop] !== next) el.style[prop] = next;
  }

  function position() {
    positionQueued = false;
    if (!refs?.table?.isConnected || !refs?.dateRow?.isConnected || !refs?.dayHeads?.[0]?.isConnected) {
      scheduleBuild(true);
      return;
    }

    const tableRect = refs.table.getBoundingClientRect();
    const viewportTop = fixedTop();
    const monthH = pxVar('--month-h',30);
    const dateH = pxVar('--date-h',42);
    const headerTop = Math.max(viewportTop,Math.round(tableRect.top));
    const rowTop = headerTop + monthH + dateH;

    if (tableRect.top >= window.innerHeight || tableRect.bottom <= rowTop + 2) {
      hide();
      return;
    }

    const metaLeft = Math.max(0,Math.round(tableRect.left));
    const daysLeft = Math.round(refs.dayHeads[0].getBoundingClientRect().left);

    setPx(metaTable,'top',rowTop);
    setPx(daysTable,'top',rowTop);
    setPx(metaTable,'left',metaLeft);
    setPx(daysTable,'left',daysLeft);
    document.body.classList.add('turni-self-overlay-visible');
  }

  function scheduleBuild(force = false) {
    if (buildQueued) return;
    buildQueued = true;
    requestAnimationFrame(() => build(force));
  }

  function schedulePosition() {
    if (positionQueued) return;
    positionQueued = true;
    requestAnimationFrame(position);
  }

  const wrapObserver = new MutationObserver(mutations => {
    if (rebuilding) return;
    const meaningful = mutations.some(mutation => {
      if (mutation.type === 'childList') return true;
      return mutation.type === 'attributes' && mutation.attributeName === 'data-service';
    });
    if (meaningful) scheduleBuild();
  });
  wrapObserver.observe(wrap,{childList:true,subtree:true,attributes:true,attributeFilter:['data-service']});

  new MutationObserver(() => {
    schedulePosition();
    requestAnimationFrame(schedulePosition);
    setTimeout(schedulePosition,230);
  }).observe(document.body,{attributes:true,attributeFilter:['class']});

  window.addEventListener('scroll',schedulePosition,{passive:true});
  window.addEventListener('resize',() => scheduleBuild(true),{passive:true});
  document.getElementById('residence')?.addEventListener('change',() => setTimeout(() => scheduleBuild(true),30));
  window.addEventListener('load',() => setTimeout(() => scheduleBuild(true),100));
  scheduleBuild(true);
})();
