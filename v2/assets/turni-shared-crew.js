(() => {
  const GROUND = new Set(['AGB','DT','POND','PT','AGM','AGT','PONM','LD','LAV']);
  const NO_CREW = new Set(['','—','RIP','RIPOSO','CON','F.P.','FP','S.S.','SS','MAL','CORSO']);

  const raw = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'').replace(/\*/g,'').replace(/--/g,'');
  const clean = value => {
    const v = raw(value);
    if (NO_CREW.has(v)) return '';
    const match = v.match(/(?:^C)?([DRMP]\d|BIS|POND|PONM|AGB|AGM|AGT|T1|M1|DT|T2|CAR|CAP|SR1)(?:C|$)/i);
    return match?.[1] ? match[1].toUpperCase() : v;
  };
  const crewKey = value => {
    const v = clean(value);
    return GROUND.has(v) ? 'TERRA' : v;
  };
  const groundResidence = (service, fallback) => {
    const v = clean(service);
    if (['AGB','POND','DT'].includes(v)) return 'DESENZANO';
    if (['AGM','AGT','PONM'].includes(v)) return 'MADERNO';
    return String(fallback || '').trim().toUpperCase();
  };

  function apply() {
    const table = document.querySelector('.turni-table');
    const mine = table?.querySelector('tr.logged-agent-row');
    if (!table || !mine) return;

    table.querySelectorAll('td.shared-with-me').forEach(cell => cell.classList.remove('shared-with-me'));

    const myResidence = String(NaviV2PB.agent()?.residenza || '').trim().toUpperCase();
    const selectedResidence = String(document.getElementById('residence')?.value || '').trim().toUpperCase();

    mine.querySelectorAll('td[data-date]').forEach(myCell => {
      const date = myCell.dataset.date;
      const myService = myCell.dataset.service || myCell.querySelector('.cell-pill')?.textContent || '';
      const target = crewKey(myService);
      if (!date || !target) return;

      if (target === 'TERRA' && groundResidence(myService,myResidence) !== selectedResidence) return;

      table.querySelectorAll(`tbody td[data-date="${date}"]`).forEach(cell => {
        const other = cell.dataset.service || cell.querySelector('.cell-pill')?.textContent || '';
        if (crewKey(other) === target) cell.classList.add('shared-with-me');
      });
    });
  }

  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  };
  new MutationObserver(schedule).observe(wrap,{childList:true,subtree:true});
  document.getElementById('residence')?.addEventListener('change',schedule);
  window.addEventListener('load',() => setTimeout(apply,80));
  schedule();
})();
