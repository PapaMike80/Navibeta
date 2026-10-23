// Battaglia sul Garda: battaglia navale su un tabellone a forma di lago (costa di orario-lago.js divisa in caselle d'acqua).
// Classica: navi nemiche a caso. Orario di adesso: le navi nemiche sono le corse in servizio, sulla loro rotta fra due scali,
// nel punto in cui le mette l'orario (come la mappa di Scali). La mia flotta e' sempre a caso; chi colpisce ritira.
(function (root) {
  'use strict';
  const MAPPA = root.NaviLagoMappa;
  const C = 3.4; // lato della casella in unita' della mappa
  const FLOTTA = [['Zanardelli', 4], ['Italia', 3], ['Brescia', 3], ['Agone', 2], ['Catullo', 2]];
  const COSTA = MAPPA.costa.slice(1, -1).split(' L').map(p => p.split(' ').map(Number));
  const LARGO = 76, ALTO = 140, COL = Math.ceil(LARGO / C), RIG = Math.ceil(ALTO / C);
  function inAcqua([x, y]) {
    let dentro = false;
    for (let i = 0, j = COSTA.length - 1; i < COSTA.length; j = i, i += 1) {
      const [xi, yi] = COSTA[i], [xj, yj] = COSTA[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }
  // Caselle d'acqua: indice = riga*COL+colonna
  const ACQUA = new Set();
  for (let r = 0; r < RIG; r++) for (let c = 0; c < COL; c++) if (inAcqua([c * C + C / 2, r * C + C / 2])) ACQUA.add(r * COL + c);
  const cellaDi = ([x, y]) => Math.floor(y / C) * COL + Math.floor(x / C);
  const centro = i => [(i % COL) * C + C / 2, Math.floor(i / COL) * C + C / 2];
  const passi = [1, -1, COL, -COL];
  const vicini = i => passi.map(p => i + p).filter(j => ACQUA.has(j) && (Math.abs(p(i) - p(j)) <= 1));
  function p(i) { return i % COL; } // colonna, per non passare da un bordo all'altro
  const intorno = i => { const out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const j = i + dr * COL + dc; if (ACQUA.has(j) && Math.abs(p(j) - p(i)) <= 1) out.push(j); } return out; };

  // Nave dritta di len caselle d'acqua partendo da i nella direzione passo (o null)
  function linea(i, passo, len) {
    const celle = [i];
    for (let k = 1; k < len; k++) { const j = celle[k - 1] + passo; if (!ACQUA.has(j) || Math.abs(p(j) - p(celle[k - 1])) > 1) return null; celle.push(j); }
    return celle;
  }
  const libera = (celle, occupate) => celle.every(x => intorno(x).every(y => !occupate.has(y)));

  function piazzaCasuale(rnd = Math.random) {
    const acqua = [...ACQUA];
    for (let tentativo = 0; tentativo < 200; tentativo++) {
      const occupate = new Set(), navi = [];
      const ok = FLOTTA.every(([nome, len]) => {
        for (let k = 0; k < 400; k++) {
          const celle = linea(acqua[Math.floor(rnd() * acqua.length)], rnd() < 0.5 ? 1 : COL, len);
          if (!celle || !libera(celle, occupate)) continue;
          celle.forEach(x => occupate.add(x));
          navi.push({ nome, len, celle, colpi: new Set() });
          return true;
        }
        return false;
      });
      if (ok) return navi;
    }
    throw new Error('Flotta non piazzata');
  }

  // ---- Orario: dove sono le navi all'ora t (stesso calcolo della mappa di Scali) ----
  const POS = Object.fromEntries(Object.entries(MAPPA.scali).map(([n, s]) => [n, s.boa]));
  const minuti = ora => { const [h, m] = String(ora).split(/[.:]/).map(Number); return h * 60 + (m || 0); };
  function rotta(a, b) { const via = MAPPA.rotte[`${a}|${b}`] || (MAPPA.rotte[`${b}|${a}`] || []).slice().reverse(); return [POS[a], ...via, POS[b]]; }
  function lungoRotta(punti, f) {
    const tratti = punti.slice(1).map((q, i) => Math.hypot(q[0] - punti[i][0], q[1] - punti[i][1]));
    let resto = f * tratti.reduce((s, l) => s + l, 0);
    for (let i = 0; i < tratti.length; i++) {
      if (resto <= tratti[i] || i === tratti.length - 1) {
        const k = tratti[i] ? Math.min(1, resto / tratti[i]) : 0;
        return { xy: [punti[i][0] + (punti[i + 1][0] - punti[i][0]) * k, punti[i][1] + (punti[i + 1][1] - punti[i][1]) * k], verso: [punti[i + 1][0] - punti[i][0], punti[i + 1][1] - punti[i][1]] };
      }
      resto -= tratti[i];
    }
    return { xy: punti[punti.length - 1], verso: [0, 1] };
  }
  // Navi in navigazione all'ora t: [{ turno, da, a, xy, verso }]
  function inNavigazione(corse, t) {
    const perTurno = {};
    corse.forEach(c => c.scali.forEach(([scalo, ora]) => { if (POS[scalo]) (perTurno[c.turno] ||= []).push({ scalo, t: minuti(ora) }); }));
    return Object.entries(perTurno).map(([turno, punti]) => {
      punti.sort((x, y) => x.t - y.t);
      let i = 0; while (i < punti.length - 1 && punti[i + 1].t <= t) i++;
      const a = punti[i], b = punti[i + 1];
      if (!b || t < a.t || a.scalo === b.scalo) return null;
      const r = lungoRotta(rotta(a.scalo, b.scalo), (t - a.t) / Math.max(1, b.t - a.t));
      return { turno, da: a.scalo, a: b.scalo, ...r };
    }).filter(Boolean);
  }
  // Navi nemiche dalle corse: 2 caselle (3 per le motonavi delle linee lunghe), sulla rotta, senza toccarsi
  function piazzaOrario(navigazione) {
    const occupate = new Set(), navi = [];
    navigazione.forEach(n => {
      const len = /^(D|R|P)\d/.test(n.turno) ? 3 : 2;
      const [vx, vy] = n.verso, passo = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 1 : -1) : (vy > 0 ? COL : -COL);
      let base = cellaDi(n.xy);
      if (!ACQUA.has(base)) base = [...ACQUA].sort((x, y) => Math.hypot(...centro(x).map((v, k) => v - n.xy[k])) - Math.hypot(...centro(y).map((v, k) => v - n.xy[k])))[0];
      for (const l of [len, 2]) {
        const prove = [linea(base, passo, l), linea(base, -passo, l), ...passi.map(q => linea(base, q, l))].filter(Boolean);
        const celle = prove.find(c => libera(c, occupate));
        if (celle) { celle.forEach(x => occupate.add(x)); navi.push({ nome: n.turno, tratta: `${n.da}→${n.a}`, len: celle.length, celle, colpi: new Set() }); return; }
      }
    });
    return navi;
  }

  function spara(navi, colpi, i) {
    if (colpi.has(i) || !ACQUA.has(i)) return null;
    colpi.add(i);
    const nave = navi.find(n => n.celle.includes(i));
    if (!nave) return { esito: 'acqua' };
    nave.colpi.add(i);
    return { esito: nave.colpi.size === nave.len ? 'affondata' : 'colpita', nave };
  }
  const finita = navi => navi.every(n => n.colpi.size === n.len);
  function mossaComputer(navi, colpi, rnd = Math.random) {
    const bloccate = new Set(navi.filter(n => n.colpi.size === n.len).flatMap(n => n.celle.flatMap(intorno)));
    const ok = i => !colpi.has(i) && !bloccate.has(i);
    const aperti = [...colpi].filter(i => navi.some(n => n.colpi.has(i) && n.colpi.size < n.len)).sort((a, b) => a - b);
    if (aperti.length) {
      let cand;
      if (aperti.length > 1) {
        const primo = aperti[0], ultimo = aperti[aperti.length - 1], passo = (aperti[1] - primo) % COL === 0 ? COL : 1;
        cand = [[primo - passo, primo], [ultimo + passo, ultimo]].filter(([j, da]) => ACQUA.has(j) && Math.abs(p(j) - p(da)) <= 1).map(([j]) => j);
      }
      else cand = vicini(aperti[0]);
      cand = cand.filter(ok);
      if (cand.length) return cand[Math.floor(rnd() * cand.length)];
    }
    let pool = [...ACQUA].filter(i => ok(i) && (p(i) + Math.floor(i / COL)) % 2 === 0);
    if (!pool.length) pool = [...ACQUA].filter(ok);
    if (!pool.length) pool = [...ACQUA].filter(i => !colpi.has(i));
    return pool[Math.floor(rnd() * pool.length)];
  }

  root.NaviBattagliaGarda = { C, COL, RIG, ACQUA, piazzaCasuale, piazzaOrario, inNavigazione, spara, finita, mossaComputer };
  if (typeof document === 'undefined' || !document.getElementById('bg-lago')) return;

  // ---- Pagina ----
  const $ = id => document.getElementById(id);
  const O = root.NaviOrarioGiorno;
  const STAT = 'navisuite.battagliaGarda.v1';
  const stat = (() => { try { return { vinte: 0, perse: 0, ...JSON.parse(localStorage.getItem(STAT) || '{}') }; } catch { return { vinte: 0, perse: 0 }; } })();
  const salvaStat = () => { try { localStorage.setItem(STAT, JSON.stringify(stat)); } catch { /* niente */ } };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const nomeCella = i => { const [x, y] = centro(i); const vicino = Object.entries(POS).sort((a, b) => Math.hypot(a[1][0] - x, a[1][1] - y) - Math.hypot(b[1][0] - x, b[1][1] - y))[0]; return `davanti a ${vicino[0]}`; };
  let modo = (() => { try { return localStorage.getItem(`${STAT}.modo`) || 'orario'; } catch { return 'orario'; } })();
  let g;

  function naviOrario() {
    const ora = new Date(), day = iso(ora);
    let corse = [];
    try { corse = O?.corseDelGiorno?.(day) || []; } catch { corse = []; }
    let t = ora.getHours() * 60 + ora.getMinutes(), navi = piazzaOrario(inNavigazione(corse, t)), nota = '';
    // di notte o a servizio fermo: le navi dell'ora di punta (11:00)
    if (navi.length < 3) { t = 11 * 60; navi = piazzaOrario(inNavigazione(corse, t)); nota = ' (ora nessuna nave in navigazione)'; }
    return navi.length >= 3 ? { navi, testo: `Le navi nemiche sono dove le mette l'orario delle <b>${hhmm(t)}</b>${nota}` } : null;
  }

  function nuova() {
    let sue, testo;
    if (modo === 'orario') { const o = naviOrario(); if (o) ({ navi: sue, testo } = o); }
    if (!sue) { sue = piazzaCasuale(); testo = modo === 'orario' ? 'Oggi l\'orario non ha navi in servizio: partita classica.' : 'Navi nemiche nascoste a caso nel lago.'; }
    g = { mie: piazzaCasuale(), sue, colpiMiei: new Set(), colpiSuoi: new Set(), turno: 'io', iniziata: false, ultimoMio: null, ultimoSuo: null, testo, log: 'Tocca una casella d\'acqua per sparare.', colore: 'var(--teal)' };
    render();
  }

  const NS = 'http://www.w3.org/2000/svg';
  function lago(svg, navi, colpi, mostraNavi, ultimo, conNomi) {
    let h = `<path d="${MAPPA.costa}" fill="#0d3446" stroke="#67d7e6" stroke-width=".4"/>`;
    ACQUA.forEach(i => {
      const x = p(i) * C, y = Math.floor(i / COL) * C, nave = navi.find(n => n.celle.includes(i)), colpita = colpi.has(i);
      let fill = '#124a61';
      if (mostraNavi && nave) fill = '#5b7280';
      if (colpita && nave) fill = nave.colpi.size === nave.len ? '#fb7185' : '#fbbf24';
      h += `<rect data-i="${i}" x="${x + .25}" y="${y + .25}" width="${C - .5}" height="${C - .5}" rx=".6" fill="${fill}"${i === ultimo ? ' stroke="#eaf2f4" stroke-width=".5"' : ''}/>`;
      if (colpita && !nave) h += `<circle cx="${x + C / 2}" cy="${y + C / 2}" r=".55" fill="#67d7e6" pointer-events="none"/>`;
      if (colpita && nave) h += `<text x="${x + C / 2}" y="${y + C / 2 + .9}" font-size="2.6" text-anchor="middle" fill="#3b0010" font-weight="900" pointer-events="none">✕</text>`;
    });
    if (conNomi) Object.entries(MAPPA.scali).forEach(([n, s]) => {
      // il nome va dalla parte della costa; se uscirebbe dal tabellone, dall'altra parte del pontile
      const [x, y] = s.porto, largo = n.length * 1.45;
      let est = s.lato === 'e';
      if (est && x + 1.3 + largo > LARGO) est = false; else if (!est && x - 1.3 - largo < 0) est = true;
      h += `<circle cx="${x}" cy="${y}" r=".7" fill="#eaf2f4" pointer-events="none"/><text x="${est ? x + 1.3 : x - 1.3}" y="${y + .9}" font-size="2.5" fill="#9fb8c2" font-weight="700" text-anchor="${est ? 'start' : 'end'}" pointer-events="none">${n}</text>`;
    });
    svg.innerHTML = h;
  }

  function render() {
    const fine = finita(g.sue) || finita(g.mie);
    document.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('on', b.dataset.modo === modo));
    $('bg-info').innerHTML = g.testo;
    $('bg-punti').innerHTML = `Vinte <b>${stat.vinte}</b> · Perse <b>${stat.perse}</b>`;
    const t = $('bg-turno');
    t.textContent = fine ? (finita(g.sue) ? 'Hai vinto!' : 'Hai perso') : g.turno === 'io' ? 'Tocca a te' : 'Tocca al computer';
    t.className = `turno${fine ? ' fine' : g.turno === 'io' ? '' : ' cpu'}`;
    lago($('bg-lago'), g.sue, g.colpiMiei, fine, g.ultimoMio, true);
    $('bg-lago').classList.toggle('attesa', fine || g.turno !== 'io');
    lago($('bg-mio'), g.mie, g.colpiSuoi, true, g.ultimoSuo, false);
    $('bg-flotta').innerHTML = g.sue.map(n => {
      const nome = n.tratta ? `<i>${n.nome}</i> ${n.colpi.size === n.len || fine ? n.tratta : ''}` : n.nome;
      return n.colpi.size === n.len ? `<div><s>${nome}</s><span>✕</span></div>` : `<div><span>${nome}</span><span>${n.len}</span></div>`;
    }).join('');
    $('bg-log').innerHTML = g.log; $('bg-log').style.setProperty('--c', g.colore);
    $('bg-mescola').disabled = g.iniziata; $('bg-mescola').style.opacity = g.iniziata ? .4 : 1;
  }

  const nomeNave = n => n.tratta ? `la ${n.nome} (${n.tratta})` : `il ${n.nome}`;
  const frase = (chi, r, i) => r.esito === 'acqua' ? `${chi} ${nomeCella(i)}: acqua` : r.esito === 'colpita' ? `${chi} ${nomeCella(i)}: <b>colpita!</b>` : `💥 ${chi} ${nomeCella(i)}: <b>affondata ${nomeNave(r.nave)}!</b>`;

  function turnoComputer() {
    const i = mossaComputer(g.mie, g.colpiSuoi), r = spara(g.mie, g.colpiSuoi, i);
    g.ultimoSuo = i;
    g.log += ` · ${frase('Computer', r, i)}`;
    if (finita(g.mie)) { stat.perse++; salvaStat(); g.log = 'Il computer ha affondato tutta la tua flotta.'; g.colore = 'var(--rose)'; render(); return; }
    if (r.esito !== 'acqua') { render(); setTimeout(turnoComputer, 700); return; }
    g.turno = 'io'; render();
  }

  $('bg-lago').addEventListener('click', e => {
    const el = e.target.closest('[data-i]');
    if (!el || g.turno !== 'io' || finita(g.sue) || finita(g.mie)) return;
    const i = Number(el.dataset.i), r = spara(g.sue, g.colpiMiei, i);
    if (!r) return;
    g.iniziata = true; g.ultimoMio = i;
    g.log = frase('Tu', r, i); g.colore = r.esito === 'acqua' ? 'var(--cyan)' : r.esito === 'colpita' ? 'var(--amber)' : 'var(--rose)';
    if (finita(g.sue)) { stat.vinte++; salvaStat(); g.log = '🏆 Hai affondato tutta la flotta nemica!'; g.colore = 'var(--green)'; render(); return; }
    if (r.esito !== 'acqua') { render(); return; }
    g.turno = 'cpu'; render();
    setTimeout(turnoComputer, 700);
  });
  document.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.modo === modo || (g.iniziata && !finita(g.sue) && !finita(g.mie) && !confirm('Abbandonare la partita in corso?'))) return;
    modo = b.dataset.modo; try { localStorage.setItem(`${STAT}.modo`, modo); } catch { /* niente */ }
    nuova();
  }));
  $('bg-mescola').addEventListener('click', () => { if (!g.iniziata) { g.mie = piazzaCasuale(); render(); } });
  $('bg-nuova').addEventListener('click', () => { if (!g.iniziata || finita(g.sue) || finita(g.mie) || confirm('Abbandonare la partita in corso?')) nuova(); });
  ['bg-lago', 'bg-mio'].forEach(id => { $(id).setAttribute('viewBox', `0 0 ${LARGO} ${ALTO}`); });
  nuova();
})(typeof window !== 'undefined' ? window : globalThis);
