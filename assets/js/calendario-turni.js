(() => {
  const TOKEN_ENDPOINT = 'https://europe-west1-navisuite-f116f.cloudfunctions.net/calendarToken';
  const SESSION_KEYS = ['navidiaria.activeAgent', 'naviturni_logged_agent'];
  const $ = id => document.getElementById(id);
  let calendarUrl = '';

  function profile() {
    for (const key of SESSION_KEYS) {
      try { const item = JSON.parse(localStorage.getItem(key) || 'null'); if (item?.id) return item; } catch (_) {}
    }
    return null;
  }
  function pinHash(agent) { return String(localStorage.getItem(`navidiaria.pin.${agent.id}`) || '').toLowerCase(); }
  function savedUrl(agent) { return String(localStorage.getItem(`navibeta.calendarUrl.${agent.id}`) || ''); }
  function saveUrl(agent, url) { localStorage.setItem(`navibeta.calendarUrl.${agent.id}`, url); }
  async function requestToken(regenerate = false) {
    const agent = profile(), hash = agent && pinHash(agent);
    if (!agent || !/^[a-f0-9]{64}$/.test(hash)) {
      $('calendarIntro').textContent = 'Accedi nuovamente a NaviBeta per configurare il tuo calendario personale.';
      $('calendarCard').classList.add('calendar-locked');
      return;
    }
    $('calendarStatus').textContent = regenerate ? 'Rigenerazione del link…' : 'Preparazione del link personale…';
    const response = await fetch(TOKEN_ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({agentId:String(agent.id), pinHash:hash, regenerate}), cache:'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.calendarUrl) throw new Error(data.error || 'Impossibile preparare il calendario');
    calendarUrl = data.calendarUrl; saveUrl(agent, calendarUrl);
    $('calendarIntro').textContent = 'Questo è il tuo calendario personale. Le prossime modifiche dei turni verranno sincronizzate automaticamente.';
    $('calendarLink').textContent = calendarUrl;
    $('calendarLink').style.display = 'block';
    $('calendarActions').hidden = false;
    $('calendarStatus').textContent = 'Calendario pronto.';
  }
  async function copy() {
    try { await navigator.clipboard.writeText(calendarUrl); $('calendarStatus').textContent = 'Link copiato.'; }
    catch (_) { $('calendarStatus').textContent = 'Seleziona e copia il link mostrato qui sopra.'; }
  }
  $('appleButton').addEventListener('click', () => { if (calendarUrl) location.href = calendarUrl.replace(/^https:/, 'webcal:'); });
  $('copyButton').addEventListener('click', copy);
  $('downloadButton').addEventListener('click', () => { if (calendarUrl) window.open(`${calendarUrl}&download=1`, '_blank', 'noopener'); });
  $('regenerateButton').addEventListener('click', async () => {
    if (!confirm('Il vecchio link smetterà subito di funzionare. Continuare?')) return;
    try { await requestToken(true); $('calendarStatus').textContent = 'Nuovo link creato: aggiorna l’abbonamento sul telefono.'; }
    catch (error) { $('calendarStatus').textContent = error.message; }
  });
  const initialAgent = profile();
  if (initialAgent && savedUrl(initialAgent)) {
    calendarUrl = savedUrl(initialAgent);
    $('calendarIntro').textContent = 'Questo è il tuo calendario personale. Le prossime modifiche dei turni verranno sincronizzate automaticamente.';
    $('calendarLink').textContent = calendarUrl;
    $('calendarLink').style.display = 'block';
    $('calendarActions').hidden = false;
    $('calendarStatus').textContent = 'Calendario pronto.';
  } else requestToken().catch(error => { $('calendarIntro').textContent = 'Calendario non disponibile al momento.'; $('calendarStatus').textContent = error.message; });
})();
