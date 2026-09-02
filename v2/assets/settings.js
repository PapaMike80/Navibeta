(() => {
  const $ = id => document.getElementById(id);
  const ROUTE = '/api/navisuite/v2/calendar';
  let settings = null;
  let saveTimer = null;

  function setStatus(message, isError = false) {
    const el = $('saveStatus');
    el.textContent = message || '';
    el.style.color = isError ? 'var(--danger)' : '';
  }

  function webcalUrl(httpUrl) {
    try {
      const url = new URL(httpUrl);
      url.protocol = 'webcal:';
      return url.toString();
    } catch {
      return httpUrl;
    }
  }

  function googleUrl(feedUrl) {
    return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`;
  }

  function bindValue(id, value) {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);
  }

  function render(data) {
    settings = data;
    bindValue('calendarEnabled', data.attivo);
    bindValue('includeShip', data.includi_nave);
    bindValue('includeCrew', data.includi_equipaggio);
    bindValue('includeMooring', data.includi_ormeggio);
    bindValue('includeFuel', data.includi_rifornimento);
    bindValue('pastDays', data.giorni_passati || 120);
    bindValue('futureDays', data.giorni_futuri || 400);

    $('feedUrl').value = data.feed_url || '';
    $('iphoneSubscribe').href = webcalUrl(data.feed_url || '');
    $('googleSubscribe').href = googleUrl(data.feed_url || '');
    $('downloadIcs').href = `${data.feed_url || ''}${String(data.feed_url || '').includes('?') ? '&' : '?'}download=1`;
    $('googleWarning').hidden = Boolean(data.public_base_configured);
    $('calendarLoading').hidden = true;
    $('calendarContent').hidden = false;
  }

  function payload() {
    return {
      attivo: $('calendarEnabled').checked,
      includi_nave: $('includeShip').checked,
      includi_equipaggio: $('includeCrew').checked,
      includi_ormeggio: $('includeMooring').checked,
      includi_rifornimento: $('includeFuel').checked,
      giorni_passati: Number($('pastDays').value),
      giorni_futuri: Number($('futureDays').value),
    };
  }

  async function save() {
    if (!settings) return;
    setStatus('Salvataggio…');
    try {
      const updated = await NaviV2PB.request(`${ROUTE}/settings`, {
        method: 'POST',
        body: payload(),
      });
      render(updated);
      setStatus('Impostazioni salvate.');
    } catch (error) {
      setStatus(error.message || 'Errore durante il salvataggio.', true);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  }

  async function copyFeed() {
    const value = $('feedUrl').value;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Link copiato.');
    } catch {
      $('feedUrl').focus();
      $('feedUrl').select();
      setStatus('Link selezionato: usa Copia dal menu del dispositivo.');
    }
  }

  async function regenerate() {
    const ok = confirm('Rigenerare il link? Il vecchio link calendario smetterà subito di funzionare.');
    if (!ok) return;
    $('regenerateFeed').disabled = true;
    setStatus('Rigenerazione link…');
    try {
      const updated = await NaviV2PB.request(`${ROUTE}/regenerate`, { method: 'POST' });
      render(updated);
      setStatus('Nuovo link creato. Il precedente non è più valido.');
    } catch (error) {
      setStatus(error.message || 'Impossibile rigenerare il link.', true);
    } finally {
      $('regenerateFeed').disabled = false;
    }
  }

  ['calendarEnabled', 'includeShip', 'includeCrew', 'includeMooring', 'includeFuel', 'pastDays', 'futureDays']
    .forEach(id => $(id).addEventListener('change', scheduleSave));

  $('copyFeed').addEventListener('click', copyFeed);
  $('regenerateFeed').addEventListener('click', regenerate);
  $('logout').addEventListener('click', () => {
    NaviV2PB.logout();
    location.replace('index.html');
  });

  (async () => {
    if (!(await NaviV2PB.requireSession())) return;
    const me = NaviV2PB.agent();
    $('who').textContent = `${me?.nome_completo || ''}${me?.residenza ? ` · ${me.residenza}` : ''}`;
    try {
      render(await NaviV2PB.request(`${ROUTE}/settings`));
    } catch (error) {
      $('calendarLoading').textContent = error.message || 'Impossibile caricare le impostazioni calendario.';
      $('calendarLoading').classList.add('warning');
    }
  })();
})();
