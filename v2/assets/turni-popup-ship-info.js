(() => {
  const COURSE = new Set(['D1','D2','D3','D4','BIS','P1','P2','P3','CAP','SR1','R1','R2','R3','R4','CAR','T1','T2','M1']);
  const cache = new Map();
  let shipsPromise = null;
  let currentDate = '';
  let scheduled = false;
  let requestSeq = 0;

  const raw = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'').replace(/\*/g,'').replace(/--/g,'');
  const cleanService = value => {
    const v = raw(value);
    const match = v.match(/(?:^C)?([DRMP]\d|BIS|T1|T2|M1|CAR|CAP|SR1)(?:C|$)/i);
    return match?.[1] ? match[1].toUpperCase() : v;
  };
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const addDay = (iso,delta) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate()+delta);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const dateLabel = iso => new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${iso}T12:00:00`)).toUpperCase();

  async function ships() {
    if (!shipsPromise) shipsPromise = NaviV2PB.listAll('navi',{filter:'attiva = true',fields:'id,nome,residenza,attiva'});
    return shipsPromise;
  }

  async function shipInfo(date,service) {
    const key = `${date}|${service}`;
    if (cache.has(key)) return cache.get(key);
    const promise = Promise.all([
      ships(),
      NaviV2PB.listAll('turni_navi',{
        filter:`data >= "${date} 00:00:00.000Z" && data <= "${date} 23:59:59.999Z" && servizio = "${NaviV2PB.escapeFilter(service)}"`,
        sort:'-updated',
        fields:'id,nave,data,servizio,ormeggio_serale,rifornimento_mattina,updated'
      })
    ]).then(([shipList,rows]) => {
      const byId = new Map(shipList.map(ship => [String(ship.id),ship]));
      const usable = rows.map(row => ({row,ship:byId.get(String(row.nave))})).filter(item => item.ship);
      const picked = usable[0] || (rows[0] ? {row:rows[0],ship:null} : null);
      if (!picked) return null;
      return {
        nave:picked.ship?.nome || '—',
        ormeggio:String(picked.row.ormeggio_serale || '').trim() || '—',
        rifornimento:Boolean(picked.row.rifornimento_mattina)
      };
    }).catch(() => null);
    cache.set(key,promise);
    return promise;
  }

  function inferDate(root) {
    if (currentDate) return currentDate;
    const label = String(root.querySelector('.crew-popup-date')?.textContent || '').trim().toUpperCase();
    if (!label) return '';
    const match = [...document.querySelectorAll('.turni-table th.day[data-date]')].find(th => dateLabel(th.dataset.date) === label);
    currentDate = match?.dataset.date || '';
    return currentDate;
  }

  function ensureStrip(root) {
    let strip = root.querySelector(':scope > .crew-ship-strip');
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'crew-ship-strip';
      const list = root.querySelector(':scope > .crew-preview-list');
      if (list) root.insertBefore(strip,list);
      else root.appendChild(strip);
    }
    return strip;
  }

  async function render() {
    scheduled = false;
    const root = document.getElementById('crewPreview');
    if (!root?.classList.contains('pinned')) return;
    const date = inferDate(root);
    const service = cleanService(root.querySelector('.crew-current-service strong')?.textContent || '');
    const strip = ensureStrip(root);

    if (!date || !COURSE.has(service)) {
      strip.hidden = true;
      strip.removeAttribute('data-signature');
      return;
    }

    const signature = `${date}|${service}`;
    if (strip.dataset.signature === signature && !strip.classList.contains('loading')) return;
    strip.hidden = false;
    strip.dataset.signature = signature;
    strip.classList.add('loading');
    strip.innerHTML = '<span class="crew-ship-loading">Caricamento dati corsa…</span>';

    const seq = ++requestSeq;
    const info = await shipInfo(date,service);
    if (seq !== requestSeq || !document.body.contains(root) || !root.classList.contains('pinned')) return;
    if (strip.dataset.signature !== signature) return;
    strip.classList.remove('loading');

    if (!info) {
      strip.innerHTML = `<span class="crew-ship-item"><small>Nave</small><strong>—</strong></span><span class="crew-ship-item"><small>Ormeggio serale</small><strong>—</strong></span>`;
      return;
    }

    strip.innerHTML = `<span class="crew-ship-item"><small>Nave</small><strong>${esc(info.nave)}</strong></span><span class="crew-ship-item"><small>Ormeggio serale</small><strong>${esc(info.ormeggio)}</strong></span>${info.rifornimento ? '<span class="crew-ship-item refuel"><small>Rifornimento</small><strong>Previsto</strong></span>' : ''}`;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  document.addEventListener('pointerdown',event => {
    const cell = event.target.closest?.('td[data-date],th.day[data-date]');
    if (cell?.dataset.date) currentDate = cell.dataset.date;
  },true);

  document.addEventListener('click',event => {
    const root = document.getElementById('crewPreview');
    if (!root?.classList.contains('pinned')) return;
    const fast = event.target.closest?.('[data-fast-date]');
    if (fast?.dataset.fastDate) currentDate = fast.dataset.fastDate;
    const step = event.target.closest?.('[data-day-step]');
    if (step && currentDate) currentDate = addDay(currentDate,Number(step.dataset.dayStep || 0));
    if (event.target.closest?.('[data-day-today]')) currentDate = todayIso();
    setTimeout(schedule,0);
  },true);

  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
  window.addEventListener('load',schedule);
})();
