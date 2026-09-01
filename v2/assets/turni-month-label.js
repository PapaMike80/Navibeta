(() => {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  let label = null;
  let ticking = false;

  function pxVar(name, fallback) {
    const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function fixedTop() {
    return document.body.classList.contains('smart-topbar-visible') ? pxVar('--smartbar-h',58) : 0;
  }

  function ensureLabel() {
    if (label?.isConnected) return label;
    label = document.createElement('div');
    label.id = 'turniMonthStickyLabel';
    label.className = 'turni-month-sticky-label';
    label.setAttribute('aria-hidden','true');
    document.body.appendChild(label);
    return label;
  }

  function monthKey(iso) {
    return String(iso || '').slice(0,7);
  }

  function monthText(iso, compact = false) {
    if (!iso) return '';
    const date = new Date(`${iso}T12:00:00`);
    if (compact) {
      return new Intl.DateTimeFormat('it-IT',{month:'short'})
        .format(date)
        .replace('.','')
        .toLocaleUpperCase('it');
    }
    return new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'})
      .format(date)
      .toLocaleUpperCase('it');
  }

  function markBoundaries(table, days) {
    table.querySelectorAll('.month-boundary').forEach(node => node.classList.remove('month-boundary'));
    days.forEach((day,index) => {
      if (!index) return;
      const previous = days[index - 1];
      if (monthKey(day.dataset.date) === monthKey(previous.dataset.date)) return;
      const date = day.dataset.date;
      day.classList.add('month-boundary');
      table.querySelectorAll(`td[data-date="${date}"]`).forEach(cell => cell.classList.add('month-boundary'));
    });
  }

  function visibleSegments(days, anchorX) {
    const rightEdge = window.innerWidth;
    const groups = [];

    for (const day of days) {
      const rect = day.getBoundingClientRect();
      if (rect.right <= anchorX || rect.left >= rightEdge) continue;
      const key = monthKey(day.dataset.date);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = {
          key,
          iso:day.dataset.date,
          left:Math.max(anchorX,rect.left),
          right:Math.min(rightEdge,rect.right)
        };
        groups.push(group);
      } else {
        group.right = Math.min(rightEdge,rect.right);
      }
    }
    return groups;
  }

  function update() {
    ticking = false;
    const table = wrap.querySelector('.turni-table');
    const dateRow = table?.querySelector('.date-header');
    const days = dateRow ? [...dateRow.querySelectorAll('th.day[data-date]')] : [];
    const el = ensureLabel();

    if (!table || !dateRow || !days.length) {
      el.style.display = 'none';
      return;
    }

    markBoundaries(table,days);

    const tableRect = table.getBoundingClientRect();
    const viewportTop = fixedTop();
    const monthH = pxVar('--month-h',30);
    const dateH = pxVar('--date-h',42);
    const headerTop = Math.max(viewportTop,Math.round(tableRect.top));

    if (tableRect.bottom <= headerTop + monthH + dateH || tableRect.top >= window.innerHeight) {
      el.style.display = 'none';
      return;
    }

    const numHead = dateRow.querySelector('.num-head');
    const nameHead = dateRow.querySelector('.name-head');
    const numW = Math.round(numHead?.offsetWidth || pxVar('--num-w',42));
    const nameW = Math.round(nameHead?.offsetWidth || pxVar('--name-w',165));
    const stickyLeft = Math.max(0,Math.round(tableRect.left));
    const anchorX = Math.min(window.innerWidth - 64,stickyLeft + numW + nameW);
    const segments = visibleSegments(days,anchorX);

    if (!segments.length) {
      el.style.display = 'none';
      return;
    }

    el.replaceChildren();
    segments.forEach((segment,index) => {
      const width = Math.max(1,Math.round(segment.right - segment.left));
      const item = document.createElement('div');
      item.className = `turni-month-segment${index ? ' has-divider' : ''}`;
      item.style.left = `${Math.round(segment.left - anchorX)}px`;
      item.style.width = `${width}px`;
      item.textContent = monthText(segment.iso,width < 125);
      el.appendChild(item);
    });

    el.style.display = 'block';
    el.style.top = `${Math.round(headerTop)}px`;
    el.style.left = `${Math.round(anchorX)}px`;
    el.style.height = `${Math.round(monthH)}px`;
    el.style.width = `${Math.max(64,Math.round(window.innerWidth - anchorX))}px`;
    el.style.maxWidth = 'none';
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  new MutationObserver(schedule).observe(wrap,{childList:true,subtree:true});
  new MutationObserver(() => {
    schedule();
    setTimeout(schedule,230);
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('load',() => setTimeout(schedule,80));
  schedule();
})();
