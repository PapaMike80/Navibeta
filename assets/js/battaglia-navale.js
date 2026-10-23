// Battaglia navale contro il computer, con le navi del lago. Griglia 10x10, celle numerate 0..99 (riga*10+colonna).
// Le flotte si piazzano a caso (non si toccano, nemmeno in diagonale); il computer spara a scacchiera finche' non colpisce,
// poi cerca il resto della nave lungo la stessa linea. Le partite vinte e perse restano su questo dispositivo.
(function (root) {
  'use strict';
  const N = 10;
  const FLOTTA = [['Zanardelli', 5], ['Italia', 4], ['Brescia', 3], ['Agone', 3], ['Catullo', 2]];
  const COLONNE = 'ABCDEFGHIJ';
  const nomeCella = i => `${COLONNE[i % N]}${Math.floor(i / N) + 1}`;
  const vicini = i => { const r = Math.floor(i / N), c = i % N, out = []; if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N); if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1); return out; };
  const intorno = i => { const r = Math.floor(i / N), c = i % N, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc); } return out; };

  // Flotta piazzata a caso: [{ nome, len, celle: [..], colpi: Set }]
  function piazza(rnd = Math.random) {
    for (let tentativo = 0; tentativo < 200; tentativo++) {
      const occupate = new Set(), navi = [];
      const ok = FLOTTA.every(([nome, len]) => {
        for (let k = 0; k < 300; k++) {
          const orizz = rnd() < 0.5, r = Math.floor(rnd() * (orizz ? N : N - len + 1)), c = Math.floor(rnd() * (orizz ? N - len + 1 : N));
          const celle = Array.from({ length: len }, (_, j) => orizz ? r * N + c + j : (r + j) * N + c);
          if (celle.some(x => intorno(x).some(y => occupate.has(y)))) continue;
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

  // Colpo su una flotta: 'acqua' | 'colpita' | 'affondata' (con la nave) ; null se gia' sparato
  function spara(navi, colpi, i) {
    if (colpi.has(i)) return null;
    colpi.add(i);
    const nave = navi.find(n => n.celle.includes(i));
    if (!nave) return { esito: 'acqua' };
    nave.colpi.add(i);
    return { esito: nave.colpi.size === nave.len ? 'affondata' : 'colpita', nave };
  }
  const affondate = navi => navi.filter(n => n.colpi.size === n.len);
  const finita = navi => navi.every(n => n.colpi.size === n.len);

  // Computer: con navi colpite e non affondate prosegue sulla linea, altrimenti spara a scacchiera
  function mossaComputer(navi, colpi, rnd = Math.random) {
    const liberi = i => !colpi.has(i);
    const bloccate = new Set(affondate(navi).flatMap(n => n.celle.flatMap(intorno)));
    const aperti = [...colpi].filter(i => navi.some(n => n.colpi.has(i) && n.colpi.size < n.len));
    if (aperti.length) {
      let candidati = [];
      if (aperti.length > 1) {
        const orizz = Math.floor(aperti[0] / N) === Math.floor(aperti[1] / N);
        const ord = aperti.slice().sort((a, b) => a - b), passo = orizz ? 1 : N;
        const primo = ord[0], ultimo = ord[ord.length - 1];
        if (orizz ? primo % N > 0 : primo >= N) candidati.push(primo - passo);
        if (orizz ? ultimo % N < N - 1 : ultimo < N * (N - 1)) candidati.push(ultimo + passo);
      } else candidati = vicini(aperti[0]);
      candidati = candidati.filter(i => liberi(i) && !bloccate.has(i));
      if (candidati.length) return candidati[Math.floor(rnd() * candidati.length)];
    }
    const minimo = Math.min(...navi.filter(n => n.colpi.size < n.len).map(n => n.len));
    let pool = [...Array(N * N).keys()].filter(i => liberi(i) && !bloccate.has(i) && (Math.floor(i / N) + i % N) % Math.max(2, minimo) === 0);
    if (!pool.length) pool = [...Array(N * N).keys()].filter(i => liberi(i) && !bloccate.has(i));
    if (!pool.length) pool = [...Array(N * N).keys()].filter(liberi);
    return pool[Math.floor(rnd() * pool.length)];
  }

  const motore = { N, FLOTTA, nomeCella, piazza, spara, mossaComputer, affondate, finita };
  root.NaviBattagliaNavale = motore;
  if (typeof document === 'undefined' || !document.getElementById('bn-nemico')) return;

  // ---- Pagina ----
  const $ = id => document.getElementById(id);
  const STAT = 'navisuite.battagliaNavale.v1';
  const stat = (() => { try { return { vinte: 0, perse: 0, ...JSON.parse(localStorage.getItem(STAT) || '{}') }; } catch { return { vinte: 0, perse: 0 }; } })();
  const salvaStat = () => { try { localStorage.setItem(STAT, JSON.stringify(stat)); } catch { /* niente */ } };
  let p;

  function nuova() {
    p = { mie: piazza(), sue: piazza(), colpiMiei: new Set(), colpiSuoi: new Set(), turno: 'io', iniziata: false, ultimoMio: null, ultimoSuo: null, log: 'Tocca una casella delle acque nemiche per sparare. Puoi rimescolare la tua flotta prima del primo colpo.', logColore: 'var(--teal)' };
    render();
  }

  function griglia(el, navi, colpi, mostraNavi, ultimo) {
    let h = '<span></span>' + [...COLONNE].map(c => `<span class="h">${c}</span>`).join('');
    for (let r = 0; r < N; r++) {
      h += `<span class="h">${r + 1}</span>`;
      for (let c = 0; c < N; c++) {
        const i = r * N + c, nave = navi.find(n => n.celle.includes(i)), colpita = colpi.has(i);
        const cls = ['c'];
        if (mostraNavi && nave) cls.push('nave');
        if (colpita) cls.push(!nave ? 'acqua' : nave.colpi.size === nave.len ? 'affondata' : 'colpita');
        if (i === ultimo) cls.push('ultimo');
        h += `<button type="button" class="${cls.join(' ')}" data-i="${i}" aria-label="${nomeCella(i)}">${colpita ? (nave ? '✕' : '•') : ''}</button>`;
      }
    }
    el.innerHTML = h;
  }

  function render() {
    const fine = finita(p.sue) || finita(p.mie);
    $('bn-punti').innerHTML = `Vinte <b>${stat.vinte}</b> · Perse <b>${stat.perse}</b>`;
    const t = $('bn-turno');
    t.textContent = fine ? (finita(p.sue) ? 'Hai vinto!' : 'Hai perso') : p.turno === 'io' ? 'Tocca a te' : 'Tocca al computer';
    t.className = `turno${fine ? ' fine' : p.turno === 'io' ? '' : ' cpu'}`;
    griglia($('bn-nemico'), p.sue, p.colpiMiei, fine, p.ultimoMio);
    $('bn-nemico').classList.toggle('attesa', fine || p.turno !== 'io');
    griglia($('bn-mia'), p.mie, p.colpiSuoi, true, p.ultimoSuo);
    $('bn-flotta').innerHTML = p.sue.map(n => n.colpi.size === n.len ? `<div><s>${n.nome}</s><span>✕</span></div>` : `<div><span>${n.nome}</span><span>${n.len}</span></div>`).join('');
    $('bn-log').innerHTML = p.log; $('bn-log').style.setProperty('--c', p.logColore);
    $('bn-mescola').disabled = p.iniziata;
    $('bn-mescola').style.opacity = p.iniziata ? .4 : 1;
  }

  const frase = (chi, r, i) => r.esito === 'acqua' ? `${chi} in ${nomeCella(i)}: acqua` : r.esito === 'colpita' ? `${chi} in ${nomeCella(i)}: <b>colpita!</b>` : `💥 ${chi} in ${nomeCella(i)}: <b>affondato il ${r.nave.nome}!</b>`;

  function turnoComputer() {
    const i = mossaComputer(p.mie, p.colpiSuoi), r = spara(p.mie, p.colpiSuoi, i);
    p.ultimoSuo = i;
    p.log += ` · ${frase('Computer', r, i)}`;
    if (finita(p.mie)) { stat.perse++; salvaStat(); p.log = `Il computer ha affondato tutta la tua flotta. ${frase('Ultimo colpo', r, i)}`; p.logColore = 'var(--rose)'; render(); return; }
    if (r.esito !== 'acqua') { render(); setTimeout(turnoComputer, 700); return; } // chi colpisce ritira
    p.turno = 'io'; render();
  }

  $('bn-nemico').addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b || p.turno !== 'io' || finita(p.sue) || finita(p.mie)) return;
    const i = Number(b.dataset.i), r = spara(p.sue, p.colpiMiei, i);
    if (!r) return;
    p.iniziata = true; p.ultimoMio = i;
    p.log = frase('Tu', r, i); p.logColore = r.esito === 'acqua' ? 'var(--cyan)' : r.esito === 'colpita' ? 'var(--amber)' : 'var(--rose)';
    if (finita(p.sue)) { stat.vinte++; salvaStat(); p.log = `🏆 Hai affondato tutta la flotta nemica! Ultimo: ${r.nave.nome}.`; p.logColore = 'var(--green)'; render(); return; }
    if (r.esito !== 'acqua') { render(); return; } // colpito: spari ancora
    p.turno = 'cpu'; render();
    setTimeout(turnoComputer, 700);
  });
  $('bn-mescola').addEventListener('click', () => { if (!p.iniziata) { p.mie = piazza(); render(); } });
  $('bn-nuova').addEventListener('click', () => { if (!p.iniziata || finita(p.sue) || finita(p.mie) || confirm('Abbandonare la partita in corso?')) nuova(); });
  nuova();
})(typeof window !== 'undefined' ? window : globalThis);
