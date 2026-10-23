// Pontile perfetto: scuola di manovra d'attracco. Nave bielica vista dall'alto con due manette (motore di sinistra e di
// dritta, da indietro tutta ad avanti tutta) e timone; vento e corrente spostano la nave. Si attracca di fianco al pontile e
// si danno le cime; alla fine il voto e il consiglio del comandante. Fisica semplificata (non e' un simulatore): metri e secondi.
(function (root) {
  'use strict';
  const KN = 0.514;
  const NAVE = { lung: 40, larg: 8 };
  const PONTILE = { x1: 30, x2: 110, y: 20 }; // fronte del pontile (la nave attracca sotto, lato sinistro verso il pontile)
  const MARE = { w: 140, h: 150 };
  // Livelli: scalo, vento (kn, da dove soffia: 'terra' spinge via dal pontile, 'lago' spinge verso), corrente laterale (kn, + verso est)
  const LIVELLI = [
    { scalo: 'Gardone', nome: 'Lago calmo', vento: 0, da: 'terra', corrente: 0, cimaGiusta: 'prua',
      consiglio: 'Senza vento arriva parallelo al pontile, lento: le manette poco avanti e poi indietro per fermarti. Dai la cima di prua e poi quella di poppa.' },
    { scalo: 'Salò', nome: 'Vento da terra', vento: 12, da: 'terra', corrente: 0, cimaGiusta: 'prua',
      consiglio: 'Con il vento da terra la nave viene spinta via dal pontile e la prua si allontana per prima: arriva con un angolo un po\' più chiuso, dai subito la cima di prua, poi con la manetta esterna avanti adagio porti a ridosso la poppa.' },
    { scalo: 'Sirmione', nome: 'Vento dal lago e corrente', vento: 10, da: 'lago', corrente: 0.6, cimaGiusta: 'poppa',
      consiglio: 'Con il vento dal lago la nave viene spinta sul pontile: arriva parallela e più lenta, tenendoti un po\' al largo, e lascia che il vento ti accosti. La corrente laterale ti fa scadere: contrastala con le manette, poi dai prima la cima di poppa (quella che lavora contro la corrente) e dopo la prua.' },
  ];
  const PAROLE = [
    ['Spring', 'cima che lavora in diagonale lungo la fiancata e impedisce alla nave di avanzare o arretrare.'],
    ['Bitta', 'colonnina del pontile (o della nave) a cui si danno volta le cime.'],
    ['Abbrivio', 'velocità che la nave conserva per inerzia dopo aver fermato i motori.'],
    ['Scadere', 'essere spostati di lato dal vento o dalla corrente rispetto alla rotta voluta.'],
    ['Accostare', 'cambiare direzione con il timone o con le macchine.'],
    ['Bielica', 'nave con due eliche e due motori: con le manette separate si gira anche da fermi.'],
  ];

  // Stato iniziale della nave per il livello: al largo, a sud-ovest del pontile, prua a est
  const nuovaNave = () => ({ x: 25, y: 110, rotta: -20 * Math.PI / 180, u: 1.2, v: 0, r: 0 });

  // Un passo di simulazione (dt in secondi). sx, dx: manette da -1 (indietro tutta) a 1 (avanti tutta); timone da -1 a 1
  function passo(n, cmd, liv, dt) {
    const spinta = (cmd.sx + cmd.dx) * 0.55;               // m/s^2 con entrambe avanti tutta
    const coppia = (cmd.sx - cmd.dx) * 0.14;               // rad/s^2: sinistra avanti e dritta indietro = accosta a dritta
    const timone = cmd.timone * (0.035 * n.u + 0.05 * (cmd.sx + cmd.dx) / 2); // effetto del timone (abbrivio e scia delle eliche)
    // vento e corrente nel riferimento del lago (y in giu' = verso il largo)
    const vento = liv.vento * KN * 0.011 * (liv.da === 'terra' ? 1 : -1);    // spinta laterale: +y via dal pontile
    const cs = Math.cos(n.rotta), sn = Math.sin(n.rotta);
    const fu = vento * sn, fv = vento * cs;                // vento proiettato su prua e fianco
    n.u += (spinta + fu * 0.3 - 0.35 * n.u * Math.abs(n.u) - 0.05 * n.u) * dt;
    n.v += (fv - 0.9 * n.v * Math.abs(n.v) - 0.4 * n.v) * dt;
    n.r += (coppia + timone - 0.9 * n.r) * dt;
    n.rotta += n.r * dt;
    const corr = liv.corrente * KN;
    n.x += (n.u * cs - n.v * sn + corr) * dt;
    n.y += (n.u * sn + n.v * cs) * dt;
    return n;
  }
  // Angoli dello scafo (prua a punta) nel riferimento del lago
  function scafo(n) {
    const L = NAVE.lung / 2, B = NAVE.larg / 2, cs = Math.cos(n.rotta), sn = Math.sin(n.rotta);
    return [[L + 4, 0], [L - 4, -B], [-L, -B], [-L, B], [L - 4, B]].map(([a, b]) => [n.x + a * cs - b * sn, n.y + a * sn + b * cs]);
  }
  const velocita = n => Math.hypot(n.u, n.v);
  // Distanza del fianco piu' vicino dal pontile (negativa = dentro) e angolo con il pontile in gradi
  function rispettoPontile(n) {
    const punti = scafo(n), sopra = punti.filter(([x]) => x > PONTILE.x1 - 5 && x < PONTILE.x2 + 5);
    const dist = sopra.length ? Math.min(...sopra.map(([, y]) => y - PONTILE.y)) : Infinity;
    let ang = Math.abs(((n.rotta * 180 / Math.PI) % 180 + 180) % 180); if (ang > 90) ang = 180 - ang;
    return { dist, ang };
  }
  // Voto finale (0-10) e controlli
  function voto(r) {
    let v = 10;
    const vel = r.velArrivo, ang = r.angArrivo;
    if (vel > 0.5 * KN) v -= Math.min(3, (vel / KN - 0.5) * 3);
    if (ang > 8) v -= Math.min(2.5, (ang - 8) / 6);
    v -= Math.min(4, r.urti * 2);
    if (r.primaCima && r.primaCima !== r.cimaGiusta) v -= 1.5;
    if (r.tempo > 150) v -= Math.min(1.5, (r.tempo - 150) / 60);
    return Math.max(0, Math.round(v * 2) / 2);
  }

  const motore = { KN, NAVE, PONTILE, MARE, LIVELLI, PAROLE, nuovaNave, passo, scafo, velocita, rispettoPontile, voto };
  root.NaviPontilePerfetto = motore;
  if (typeof document === 'undefined' || !document.getElementById('pp-mare')) return;

  // ---- Pagina ----
  const $ = id => document.getElementById(id);
  const svg = $('pp-mare');
  const STAT = 'navisuite.pontilePerfetto.v1';
  const migliori = (() => { try { return JSON.parse(localStorage.getItem(STAT) || '{}') || {}; } catch { return {}; } })();
  let livello = 0, n, cmd, stato, ultimo = 0, giro = 0;
  const STEP = { '-2': -1, '-1': -0.45, '0': 0, '1': 0.45, '2': 1 };

  function inizia(k) {
    livello = k; n = nuovaNave(); cmd = { sx: 0.45, dx: 0.45, timone: 0 };
    stato = { t: 0, urti: 0, inUrto: false, cime: [], fine: false, velArrivo: 0, angArrivo: 0 };
    $('pp-sx').value = 1; $('pp-dx').value = 1; $('pp-timone').value = 0;
    $('pp-esito').hidden = true; $('pp-gioco').hidden = false;
    const L = LIVELLI[k];
    $('pp-info').innerHTML = `<span>⚓ <b>${L.scalo}</b> · livello ${k + 1}</span><span>💨 ${L.vento ? `vento ${L.vento} kn ${L.da === 'terra' ? 'da terra' : 'dal lago'}` : 'calma'}</span>${L.corrente ? `<span>🌊 corrente ${L.corrente} kn</span>` : ''}<span id="pp-tempo">0:00</span>`;
    disegnaFisso();
    ultimo = performance.now();
    cancelAnimationFrame(giro); giro = requestAnimationFrame(ciclo);
  }

  // scala: il mare (140 x 150 m) nella larghezza del riquadro
  const S = 2.6;
  function disegnaFisso() {
    const L = LIVELLI[livello];
    svg.setAttribute('viewBox', `0 0 ${MARE.w * S} ${MARE.h * S}`);
    const frecciaVento = L.vento ? `<g transform="translate(${118 * S} ${125 * S})"><circle r="26" fill="#0b1c26" stroke="#1f4250"/><path d="${L.da === 'terra' ? 'M0 -16 L0 14 M-7 6 L0 16 L7 6' : 'M0 16 L0 -14 M-7 -6 L0 -16 L7 -6'}" stroke="#67d7e6" stroke-width="3" fill="none"/><text y="42" text-anchor="middle" fill="#9fb8c2" font-size="11">vento</text></g>` : '';
    const frecciaCorr = L.corrente ? `<g transform="translate(${22 * S} ${125 * S})"><circle r="26" fill="#0b1c26" stroke="#1f4250"/><path d="M-16 0 L14 0 M6 -7 L16 0 L6 7" stroke="#a78bfa" stroke-width="3" fill="none"/><text y="42" text-anchor="middle" fill="#9fb8c2" font-size="11">corrente</text></g>` : '';
    $('pp-fisso').innerHTML = `<rect width="${MARE.w * S}" height="${(PONTILE.y - 8) * S}" fill="#2e4a35"/><rect y="${(PONTILE.y - 9) * S}" width="${MARE.w * S}" height="${3 * S}" fill="#6b5a44"/>
      <text x="12" y="26" fill="#cfe3d1" font-size="13" font-weight="700">${L.scalo.toUpperCase()} · riva</text>
      <rect x="${PONTILE.x1 * S}" y="${(PONTILE.y - 7) * S}" width="${(PONTILE.x2 - PONTILE.x1) * S}" height="${7 * S}" fill="#8a7a62" stroke="#cbb994"/>
      <text x="${(PONTILE.x1 + PONTILE.x2) / 2 * S}" y="${(PONTILE.y - 2.5) * S}" text-anchor="middle" fill="#1c1408" font-size="12" font-weight="800">PONTILE</text>
      <circle cx="${(PONTILE.x1 + 6) * S}" cy="${PONTILE.y * S}" r="5" fill="#fbbf24"/><circle cx="${(PONTILE.x2 - 6) * S}" cy="${PONTILE.y * S}" r="5" fill="#fbbf24"/>${frecciaVento}${frecciaCorr}`;
  }
  function disegnaNave() {
    const p = scafo(n).map(([x, y]) => `${(x * S).toFixed(1)},${(y * S).toFixed(1)}`).join(' ');
    const cs = Math.cos(n.rotta), sn = Math.sin(n.rotta), L = NAVE.lung / 2;
    const prua = [n.x + L * cs, n.y + L * sn], poppa = [n.x - L * cs, n.y - L * sn];
    const cima = (c, da) => stato.cime.includes(c) ? `<line x1="${da[0] * S}" y1="${da[1] * S}" x2="${(c === 'prua' ? PONTILE.x2 - 6 : PONTILE.x1 + 6) * S}" y2="${PONTILE.y * S}" stroke="#a78bfa" stroke-width="3"/>` : '';
    $('pp-nave').innerHTML = `${cima('prua', prua)}${cima('poppa', poppa)}<polygon points="${p}" fill="#eaf2f4" stroke="${stato.inUrto ? '#fb7185' : '#67d7e6'}" stroke-width="3"/>
      <circle cx="${prua[0] * S}" cy="${prua[1] * S}" r="4" fill="#fb7185"/><circle cx="${n.x * S}" cy="${n.y * S}" r="9" fill="#2dd4bf"/>`;
    const r = rispettoPontile(n);
    $('pp-dati').textContent = `velocità ${(velocita(n) / KN).toFixed(1)} kn · distanza ${Number.isFinite(r.dist) ? Math.max(0, r.dist).toFixed(0) : '—'} m · angolo ${r.ang.toFixed(0)}°`;
    const vicino = r.dist < 4 && velocita(n) < 0.9 * KN;
    document.querySelectorAll('[data-cima]').forEach(b => { b.disabled = !vicino || stato.cime.includes(b.dataset.cima) || stato.fine; });
  }

  function ciclo(ora) {
    const dt = Math.min(0.05, (ora - ultimo) / 1000); ultimo = ora;
    if (!stato.fine) {
      const L = LIVELLI[livello];
      // con le cime date la nave resta legata al pontile
      if (stato.cime.length) { n.u *= 0.9; n.v *= 0.9; n.r *= 0.9; if (stato.cime.length === 2) { n.u = n.v = n.r = 0; } }
      for (let k = 0; k < 4; k++) passo(n, cmd, L, dt / 4);
      stato.t += dt;
      // urto: lo scafo entra nel pontile o nella riva
      const r = rispettoPontile(n), riva = Math.min(...scafo(n).map(([, y]) => y)) < PONTILE.y - 8;
      const urta = r.dist < -0.5 || riva;
      if (urta && !stato.inUrto) stato.urti += 1;
      stato.inUrto = urta;
      if (urta) { const sp = Math.max(0.5, -r.dist); n.y += sp; n.v = Math.abs(n.v) * 0.3; n.u *= 0.5; }
      // fuori dal mare: si ricomincia
      if (n.x < -20 || n.x > MARE.w + 20 || n.y > MARE.h + 20) { $('pp-avviso').textContent = 'Sei uscito dalla zona di manovra: la nave torna al punto di partenza.'; n = nuovaNave(); }
      if (stato.t > 300) finisci(false);
      $('pp-tempo') && ($('pp-tempo').textContent = `⏱ ${Math.floor(stato.t / 60)}:${String(Math.floor(stato.t % 60)).padStart(2, '0')}`);
      disegnaNave();
    }
    if (!stato.fine) giro = requestAnimationFrame(ciclo);
  }

  function daiCima(c) {
    const r = rispettoPontile(n);
    if (stato.fine || stato.cime.includes(c) || !(r.dist < 4 && velocita(n) < 0.9 * KN)) return;
    if (!stato.cime.length) { stato.velArrivo = velocita(n); stato.angArrivo = r.ang; stato.primaCima = c; }
    stato.cime.push(c);
    $('pp-avviso').textContent = c === 'prua' ? 'Cima di prua data.' : 'Cima di poppa data.';
    if (stato.cime.length === 2) setTimeout(() => finisci(true), 600);
  }

  function finisci(riuscito) {
    stato.fine = true; cancelAnimationFrame(giro);
    const L = LIVELLI[livello];
    const ris = { velArrivo: stato.velArrivo, angArrivo: stato.angArrivo, urti: stato.urti, primaCima: stato.primaCima, cimaGiusta: L.cimaGiusta, tempo: stato.t };
    const v = riuscito ? voto(ris) : 0;
    if (riuscito && v > (migliori[livello] || 0)) { migliori[livello] = v; try { localStorage.setItem(STAT, JSON.stringify(migliori)); } catch { /* niente */ } }
    const riga = (t, val, ok) => `<div class="pp-riga"><span>${t}</span><b class="${ok}">${val}</b></div>`;
    const [parola, def] = PAROLE[Math.floor(Math.random() * PAROLE.length)];
    $('pp-esito').innerHTML = `<div class="pp-voto ${riuscito ? '' : 'ko'}"><b>${riuscito ? String(v).replace('.', ',') : '—'}</b><div>${riuscito ? 'Attracco riuscito' : 'Tempo scaduto'}<small>${L.scalo} · livello ${livello + 1} · ${Math.floor(stato.t / 60)}:${String(Math.floor(stato.t % 60)).padStart(2, '0')}</small></div></div>
      ${riuscito ? riga('Velocità all\'arrivo', `${(ris.velArrivo / KN).toFixed(1)} kn ${ris.velArrivo <= 0.5 * KN ? '✓' : '✗'}`, ris.velArrivo <= 0.5 * KN ? 'ok' : 'no')
        + riga('Angolo col pontile', `${ris.angArrivo.toFixed(0)}° ${ris.angArrivo <= 8 ? '✓' : '~'}`, ris.angArrivo <= 8 ? 'ok' : 'mid')
        + riga('Urti', ris.urti ? `${ris.urti} ✗` : 'nessuno ✓', ris.urti ? 'no' : 'ok')
        + riga('Prima cima', `${ris.primaCima} ${ris.primaCima === L.cimaGiusta ? '✓' : '✗'}`, ris.primaCima === L.cimaGiusta ? 'ok' : 'no') : ''}
      <div class="pp-tip">💡 <b>Il consiglio del comandante</b><br>${L.consiglio}</div>
      <div class="pp-tip parola">📘 <b>Parola del giorno</b><br><b>${parola}</b>: ${def}</div>
      <div class="pp-azioni"><button type="button" data-rifai>Riprova</button>${livello < LIVELLI.length - 1 ? '<button type="button" class="ok" data-avanti>Prossimo scalo →</button>' : ''}</div>`;
    $('pp-esito').hidden = false; $('pp-gioco').hidden = true;
    $('pp-esito').querySelector('[data-rifai]').onclick = () => inizia(livello);
    const av = $('pp-esito').querySelector('[data-avanti]'); if (av) av.onclick = () => inizia(livello + 1);
    renderLivelli();
  }

  function renderLivelli() {
    $('pp-livelli').innerHTML = LIVELLI.map((L, k) => `<button type="button" data-liv="${k}" class="${k === livello ? 'on' : ''}">${k + 1} · ${L.scalo}${migliori[k] ? ` <small>${String(migliori[k]).replace('.', ',')}</small>` : ''}</button>`).join('');
    $('pp-livelli').querySelectorAll('[data-liv]').forEach(b => b.onclick = () => { inizia(Number(b.dataset.liv)); renderLivelli(); });
  }

  ['sx', 'dx'].forEach(k => $(`pp-${k}`).addEventListener('input', e => { cmd[k] = STEP[e.target.value]; }));
  $('pp-timone').addEventListener('input', e => { cmd.timone = Number(e.target.value) / 35; });
  document.querySelectorAll('[data-cima]').forEach(b => b.addEventListener('click', () => daiCima(b.dataset.cima)));
  renderLivelli();
  inizia(0);
})(typeof window !== 'undefined' ? window : globalThis);
