(() => {
  const $ = id => document.getElementById(id);
  let directory = [];
  let optionMap = new Map();

  const formatLabel = item => `${item.nome_visualizzato}${item.residenza ? ` — ${item.residenza}` : ''}`;

  function showMenu() {
    const agent = NaviV2PB.agent();
    $('loginCard').hidden = true;
    $('menuCard').hidden = false;
    $('welcome').textContent = agent ? `Ciao ${agent.nome_completo}` : 'NaviSuite V2';
    $('sessionInfo').textContent = agent ? `${agent.residenza || ''}${agent.grado ? ` · ${agent.grado}` : ''}` : '';
  }

  async function init() {
    if (NaviV2PB.token() && NaviV2PB.agent()) {
      showMenu();
      return;
    }
    try {
      directory = await NaviV2PB.loginDirectory();
      optionMap = new Map(directory.map(item => [formatLabel(item), item]));
      $('agentList').innerHTML = directory.map(item => `<option value="${formatLabel(item).replaceAll('&','&amp;').replaceAll('"','&quot;')}"></option>`).join('');
      $('loginStatus').textContent = `${directory.length} agenti disponibili`;
    } catch (error) {
      $('loginMessage').textContent = `PocketBase non raggiungibile: ${error.message}`;
      $('loginSubmit').disabled = true;
    }
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const label = $('agentSearch').value.trim();
    const selected = optionMap.get(label);
    if (!selected) {
      $('loginMessage').textContent = 'Seleziona un agente dall’elenco.';
      return;
    }
    const button = $('loginSubmit');
    button.disabled = true;
    $('loginMessage').textContent = '';
    $('loginStatus').textContent = 'Accesso a PocketBase…';
    try {
      await NaviV2PB.login(selected.login_id, $('agentPin').value);
      $('agentPin').value = '';
      showMenu();
    } catch (error) {
      $('loginMessage').textContent = error.status === 400 ? 'PIN non corretto o account non ancora attivato.' : error.message;
      $('loginStatus').textContent = 'Accesso non riuscito';
    } finally {
      button.disabled = false;
    }
  });

  $('logoutButton').addEventListener('click', () => {
    NaviV2PB.logout();
    location.reload();
  });

  init();
})();
