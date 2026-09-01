(() => {
  const GROUND = [
    ['LAV','LAV'],
    ['LD','LD'],
    ['AGB','AgB'],
    ['DT','DT'],
    ['POND','PonD'],
    ['PT','PT'],
    ['AGM','AgM'],
    ['AGT','AgT'],
    ['PONM','PonM'],
  ];
  const GROUND_SET = new Set(GROUND.map(([key]) => key));
  const GROUND_COLOR = '#fbbf24';
  let viewOpen = false;
  let editOpen = false;
  let scheduled = false;

  const key = value => String(value || '').trim().toUpperCase().replace(/\s+/g,'');
  const pretty = value => {
    const k = key(value);
    return GROUND.find(([id]) => id === k)?.[1] || k;
  };

  function followedService(root) {
    const label = [...root.querySelectorAll('.crew-popup-mini-label')].find(node => {
      const text = String(node.textContent || '').trim().toUpperCase();
      return text.startsWith('VEDI CORSA · SEGUI ') && !text.includes('I MIEI TURNI');
    });
    if (!label) return '';
    return key(String(label.textContent || '').split('SEGUI').pop());
  }

  function groundButtons(attribute, active) {
    return GROUND.map(([service,label]) => {
      const cls = attribute === 'data-view-shift' ? 'crew-view-shift' : 'crew-edit-shift';
      return `<button type="button" class="${cls} crew-ground-item${service === active ? ' active' : ''}" ${attribute}="${service}" style="--shift-color:${GROUND_COLOR}">${label}</button>`;
    }).join('');
  }

  function enhanceGroup(container, mode, selected) {
    if (!container) return;
    const attr = mode === 'view' ? 'data-view-shift' : 'data-edit-shift';
    let terra = container.querySelector(`[data-ground-toggle="${mode}"]`);
    const oldLav = container.querySelector(`[${attr}="LAV"]`);

    if (!terra) {
      terra = document.createElement('button');
      terra.type = 'button';
      terra.className = mode === 'view' ? 'crew-view-shift crew-terra-toggle' : 'crew-edit-shift crew-terra-toggle';
      terra.dataset.groundToggle = mode;
      terra.style.setProperty('--shift-color',GROUND_COLOR);
      terra.textContent = 'TERRA';
      if (oldLav) oldLav.replaceWith(terra);
      else container.appendChild(terra);
    } else if (oldLav) {
      oldLav.remove();
    }

    const activeGround = GROUND_SET.has(selected);
    terra.classList.toggle('active',activeGround);

    let menu = container.querySelector(`.crew-ground-services[data-ground-menu="${mode}"]`);
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'crew-ground-services';
      menu.dataset.groundMenu = mode;
      container.appendChild(menu);
    }
    const open = mode === 'view' ? (viewOpen || activeGround) : editOpen;
    menu.classList.toggle('open',open);
    menu.innerHTML = groundButtons(attr,selected);
  }

  function decorate() {
    scheduled = false;
    const root = document.getElementById('crewPreview');
    if (!root?.classList.contains('pinned')) {
      viewOpen = false;
      editOpen = false;
      return;
    }

    const strong = root.querySelector('.crew-current-service strong');
    if (!strong) return;
    if (!strong.dataset.actualService) strong.dataset.actualService = key(strong.textContent);

    const follow = followedService(root);
    const actual = key(strong.dataset.actualService);
    const shown = follow || actual;
    const shownLabel = pretty(shown);
    if (strong.textContent !== shownLabel) strong.textContent = shownLabel;
    strong.dataset.shownService = shown;

    // Se stiamo guardando una corsa diversa dal turno personale, la testata segue la corsa visualizzata.
    // TERRA è solo un raggruppamento UI: il servizio effettivo resta sempre LAV/LD/AgB/DT/PonD/etc.
    if (GROUND_SET.has(shown)) root.style.setProperty('--crew-service',GROUND_COLOR);

    enhanceGroup(root.querySelector('.crew-view-shifts'),'view',follow || actual);
    enhanceGroup(root.querySelector('.crew-edit-services'),'edit',actual);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-ground-toggle]');
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (toggle.dataset.groundToggle === 'view') viewOpen = !viewOpen;
      else editOpen = !editOpen;
      schedule();
      return;
    }

    const view = event.target.closest('[data-view-shift]');
    if (view) viewOpen = GROUND_SET.has(key(view.dataset.viewShift));
    const edit = event.target.closest('[data-edit-shift]');
    if (edit) editOpen = GROUND_SET.has(key(edit.dataset.editShift));
  },true);

  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('load',schedule);
})();
