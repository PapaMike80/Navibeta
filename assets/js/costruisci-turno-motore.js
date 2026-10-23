// Costruisci turno: motore della bozza automatica (modulo puro, niente DOM).
// Priorita': 1) coprire ogni posto di ogni turno nave del mese; 2) mai 7 giorni di fila se si puo' evitare;
// 3) niente trasferte se si puo' evitare; 4) non ripetere lo stesso servizio il giorno dopo;
// 5) lordo stimato del mese il piu' uniforme possibile tra agenti dello stesso ruolo.
// Le 39 ore settimanali non sono un limite: oltre sono straordinario, distribuito come le altre voci.
(function (root) {
  'use strict';

  // Ruoli di bordo (come l'anagrafica navi di Movimento) e posti che ciascuno puo' coprire oltre al proprio.
  const RUOLI = ['capitano', 'capo_timoniere', 'timoniere', 'motorista', 'aiuto_motorista', 'marinaio'];
  const COPRE = { capitano: ['capo_timoniere', 'timoniere', 'marinaio'], capo_timoniere: ['timoniere', 'marinaio'], timoniere: ['marinaio'],
    motorista: ['aiuto_motorista', 'marinaio'], aiuto_motorista: ['marinaio'], marinaio: [] };
  const puoCoprire = (ruolo, posto) => ruolo === posto || (COPRE[ruolo] || []).includes(posto);

  // Residenza di ogni turno nave
  function residenzaTurno(code) {
    const c = String(code || '').toUpperCase();
    if (/^(D\d|BIS)$/.test(c)) return 'DESENZANO';
    if (/^(P\d|CAP\d?|SR\d)$/.test(c)) return 'PESCHIERA';
    if (/^(R\d|CAR\d?)$/.test(c)) return 'RIVA';
    if (/^(M\d|T\d)$/.test(c)) return 'MADERNO';
    return '';
  }

  // Tariffe per la stima del lordo (modificabili dalla pagina). La diaria vale l'importo della competenza (24 o 9).
  const TARIFFE = { ora: 12.5, straordinario: 16, imbarco: 8, ticket: 7, domenica: 20 };
  // Pesi delle regole (piu' alto = evitato di piu')
  const PESI = { settimoGiorno: 5000, oltre39: 1500, trasferta: 1000, ripetuto: 300, gradoInferiore: 120, sestoGiorno: 25, fila: 4, straordinarioVoluto: 30 };

  const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const giornoSett = iso => new Date(`${iso}T12:00:00`).getDay();
  function pasqua(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
    return `${y}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
  }
  function festivo(iso) {
    if (giornoSett(iso) === 0) return true;
    const md = iso.slice(5);
    if (['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].includes(md)) return true;
    return addDays(pasqua(Number(iso.slice(0, 4))), 1) === iso;
  }
  // Lunedi' della settimana del giorno (le ore si contano per settimana, come nella Distinta)
  const lunedi = iso => addDays(iso, -((giornoSett(iso) + 6) % 7));

  /**
   * Lordo stimato e voci di un agente nel mese.
   * piano: {giorno: codice}; competenza(codice, giorno) -> {ore, imbarco, diaria, ticket, lavoro}
   */
  function stima(piano, giorni, competenza, tariffe = TARIFFE) {
    const v = { ore: 0, straord: 0, imbarchi: 0, diaria: 0, ticket: 0, domeniche: 0, giorniLavoro: 0, lordo: 0 };
    const sett = {};
    giorni.forEach(g => {
      const code = piano[g];
      if (!code) return;
      const c = competenza(code, g);
      if (!c || !c.lavoro) return;
      v.giorniLavoro += 1;
      sett[lunedi(g)] = (sett[lunedi(g)] || 0) + c.ore;
      if (c.imbarco) v.imbarchi += 1;
      v.diaria += c.diaria || 0;
      if (c.ticket) v.ticket += 1;
      if (festivo(g) && c.ore > 0) v.domeniche += 1;
    });
    Object.values(sett).forEach(ore => { v.ore += Math.min(ore, 39); v.straord += Math.max(0, ore - 39); });
    v.lordo = v.ore * tariffe.ora + v.straord * tariffe.straordinario + v.imbarchi * tariffe.imbarco + v.diaria + v.ticket * tariffe.ticket + v.domeniche * tariffe.domenica;
    return v;
  }

  // Giorni consecutivi di lavoro che finiscono in g (compreso), dato il piano
  function filaFinoA(piano, g, lavora) {
    let n = 0, d = g;
    while (lavora(piano[d], d)) { n += 1; d = addDays(d, -1); }
    return n;
  }

  /**
   * Genera la bozza.
   * input: {
   *   giorni: ['2026-09-01', ...],
   *   agenti: [{id, nome, ruolo, residenza, fissi: {giorno: codice}, prima: {giorno: codice}}]  (prima = giorni prima del mese, per la fila)
   *   posti: {giorno: [{turno, residenza, ruolo}]},
   *   competenza(codice, giorno) -> {ore, imbarco, diaria, ticket, lavoro},
   *   lavora(codice) -> bool (codici fissi che contano come giorno di lavoro),
   *   tariffe, iterazioni, seme
   * }
   */
  function genera(input) {
    const { giorni, agenti, posti } = input;
    // la competenza di un servizio in un giorno si calcola una volta sola
    const memo = new Map();
    const competenza = (code, g) => { const k = `${code}|${g}`; if (!memo.has(k)) memo.set(k, input.competenza(code, g)); return memo.get(k); };
    const tariffe = { ...TARIFFE, ...(input.tariffe || {}) };
    const pesi = { ...PESI, ...(input.pesi || {}) };
    let seme = input.seme || 7;
    const caso = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
    const isNave = code => !!residenzaTurno(String(code || '').replace(/^c|c$|\*$/g, ''));
    const lavoraFisso = input.lavora || (() => true);
    const piano = {}, assegnati = {};
    agenti.forEach(a => { piano[a.id] = { ...(a.prima || {}), ...(a.fissi || {}) }; });
    const lavoraDi = {};
    agenti.forEach(a => { lavoraDi[a.id] = (code, g) => !!code && (isNave(code) || lavoraFisso(code)); });
    // il lordo si confronta in proporzione ai giorni disponibili: chi ha congedi o ferie non deve "recuperare"
    const disponibili = {};
    agenti.forEach(a => { disponibili[a.id] = Math.max(1, giorni.filter(g => !a.fissi?.[g] || lavoraFisso(a.fissi[g])).length); });
    const valore = {};
    const ricalcola = id => { valore[id] = stima(piano[id], giorni, competenza, tariffe).lordo / disponibili[id] * giorni.length; };
    agenti.forEach(a => ricalcola(a.id));
    // gruppo di equita': stesso ruolo e residenza, stessa preferenza sulle ore; gli stagionali a parte
    const gruppo = a => a.gruppo || `${a.ruolo}|${a.residenza}`;
    const perGruppo = gr => agenti.filter(a => gruppo(a) === gr);
    const media = gr => { const l = perGruppo(gr); return l.length ? l.reduce((s, a) => s + valore[a.id], 0) / l.length : 0; };
    // ore della settimana (da lunedi') del giorno g gia' nel piano
    const lun = g => addDays(g, -((new Date(`${g}T12:00:00`).getDay() + 6) % 7));
    const oreSettimana = (id, g) => { let h = 0; for (let i = 0, d = lun(g); i < 7; i += 1, d = addDays(d, 1)) { const c = piano[id][d] && competenza(piano[id][d], d); if (c && c.lavoro) h += c.ore; } return h; };
    const scoperti = [], eccezioni = [];
    const libero = (a, g) => !(a.fissi && a.fissi[g]) && !(assegnati[g] && assegnati[g].has(a.id));

    // costo di mettere l'agente a sul posto p nel giorno g
    function costo(a, p, g) {
      let c = (valore[a.id] - media(gruppo(a))) / 40; // chi e' piu' indietro nel lordo del suo gruppo costa meno
      // ore oltre le 39 settimanali: «Solo 39 h» solo se non c'e' altro modo, «Piu' straordinario» preferito
      const extra = oreSettimana(a.id, g) + ((competenza(p.turno, g) || {}).ore || 0) > 39;
      if (extra && a.ore === '39') c += pesi.oltre39;
      if (extra && a.ore === 'max') c -= pesi.straordinarioVoluto;
      const ieri = piano[a.id][addDays(g, -1)];
      const fila = filaFinoA(piano[a.id], addDays(g, -1), lavoraDi[a.id]);
      // chi ha gia' lavorato piu' giorni di fila riposa prima: i riposi si spargono e non si arriva al 7° giorno
      c += fila * pesi.fila;
      if (fila >= 6) c += pesi.settimoGiorno; else if (fila === 5) c += pesi.sestoGiorno;
      if (a.residenza !== p.residenza) c += pesi.trasferta;
      if (ieri && String(ieri).replace(/^c|c$|\*$/g, '') === p.turno) c += pesi.ripetuto;
      if (a.ruolo !== p.ruolo) c += pesi.gradoInferiore;
      return c + caso() * 0.01;
    }

    giorni.forEach(g => {
      assegnati[g] = new Set();
      const lista = (posti[g] || []).map(p => ({ ...p, adatti: agenti.filter(a => puoCoprire(a.ruolo, p.ruolo)).length }))
        .sort((x, y) => RUOLI.indexOf(x.ruolo) - RUOLI.indexOf(y.ruolo) || x.adatti - y.adatti);
      lista.forEach(p => {
        const candidati = agenti.filter(a => puoCoprire(a.ruolo, p.ruolo) && libero(a, g));
        if (!candidati.length) { scoperti.push({ giorno: g, turno: p.turno, ruolo: p.ruolo }); return; }
        let best = null, bestC = Infinity;
        candidati.forEach(a => { const c = costo(a, p, g); if (c < bestC) { bestC = c; best = a; } });
        const code = best.residenza !== p.residenza ? `c${p.turno}c` : p.turno;
        piano[best.id][g] = code;
        assegnati[g].add(best.id);
        ricalcola(best.id);
      });
    });

    // Miglioramento: scambi nello stesso giorno tra due agenti dello stesso ruolo e residenza
    // (uno lavora, l'altro riposa, o lavorano su turni diversi) se l'equita' migliora senza peggiorare le regole.
    const penalita = (id, intorno) => {
      let n = 0;
      (intorno || giorni).forEach(g => {
        const code = piano[id][g];
        if (!code || !isNave(code)) return;
        const ieri = piano[id][addDays(g, -1)];
        if (ieri && String(ieri).replace(/^c|c$|\*$/g, '') === String(code).replace(/^c|c$|\*$/g, '')) n += pesi.ripetuto;
        if (filaFinoA(piano[id], g, lavoraDi[id]) >= 7) n += pesi.settimoGiorno;
        if (soloTrentanove.has(id) && oreSettimana(id, g) > 39) n += pesi.oltre39;
      });
      return n;
    };
    const soloTrentanove = new Set(agenti.filter(a => a.ore === '39').map(a => a.id));
    const dispersione = gr => { const l = perGruppo(gr), m = media(gr); return l.reduce((s, a) => s + (valore[a.id] - m) ** 2, 0); };
    const iter = input.iterazioni ?? 4000;
    for (let k = 0; k < iter; k += 1) {
      const g = giorni[Math.floor(caso() * giorni.length)];
      const a = agenti[Math.floor(caso() * agenti.length)];
      const pari = agenti.filter(b => b.id !== a.id && b.ruolo === a.ruolo && b.residenza === a.residenza && gruppo(b) === gruppo(a));
      if (!pari.length) continue;
      const b = pari[Math.floor(caso() * pari.length)];
      if (a.fissi?.[g] || b.fissi?.[g]) continue;
      const ca = piano[a.id][g] || '', cb = piano[b.id][g] || '';
      if (ca === cb) continue;
      // le regole contano prima dell'equita': uno scambio che le peggiora non si fa mai
      // le regole si ricontrollano solo nei giorni vicini allo scambio (una fila arriva al massimo a 7 giorni)
      const intorno = giorni.filter(x => x >= addDays(g, -7) && x <= addDays(g, 7));
      const regolePrima = penalita(a.id, intorno) + penalita(b.id, intorno), equitaPrima = dispersione(gruppo(a));
      const set = (id, c) => { if (c) piano[id][g] = c; else delete piano[id][g]; };
      set(a.id, cb); set(b.id, ca); ricalcola(a.id); ricalcola(b.id);
      const regoleDopo = penalita(a.id, intorno) + penalita(b.id, intorno), equitaDopo = dispersione(gruppo(a));
      if (regoleDopo > regolePrima || (regoleDopo === regolePrima && equitaDopo >= equitaPrima)) { set(a.id, ca); set(b.id, cb); ricalcola(a.id); ricalcola(b.id); }
    }

    // Eccezioni rimaste (regole allentate) e riepilogo per agente
    agenti.forEach(a => giorni.forEach(g => {
      const code = piano[a.id][g];
      if (!code || !isNave(code) || a.fissi?.[g]) return;
      const base = String(code).replace(/^c|c$|\*$/g, '');
      const ieri = piano[a.id][addDays(g, -1)];
      if (/^c/.test(code)) eccezioni.push({ giorno: g, agente: a.nome, tipo: 'trasferta', testo: `${a.nome} in trasferta su ${base}` });
      if (ieri && String(ieri).replace(/^c|c$|\*$/g, '') === base) eccezioni.push({ giorno: g, agente: a.nome, tipo: 'ripetuto', testo: `${a.nome} ripete ${base}` });
      if (filaFinoA(piano[a.id], g, lavoraDi[a.id]) >= 7) eccezioni.push({ giorno: g, agente: a.nome, tipo: 'settimo', testo: `${a.nome}: 7° giorno di fila` });
    }));
    // «Solo 39 h» oltre le 39 ore: una segnalazione per settimana
    agenti.filter(a => a.ore === '39').forEach(a => [...new Set(giorni.map(lun))].forEach(l => {
      const h = oreSettimana(a.id, l);
      if (h > 39) eccezioni.push({ giorno: l, agente: a.nome, tipo: 'oltre39', testo: `${a.nome} (Solo 39 h): ${Math.round(h * 10) / 10} h nella settimana` });
    }));
    const riepilogo = agenti.map(a => {
      const solo = Object.fromEntries(giorni.map(g => [g, piano[a.id][g]]).filter(([, c]) => c));
      const v = stima(solo, giorni, competenza, tariffe);
      // lordoMese: il lordo riportato a un mese intero di giorni disponibili (per confrontare chi ha congedi o ferie)
      return { id: a.id, nome: a.nome, ruolo: a.ruolo, residenza: a.residenza, preferenza: a.ore || 'normale', gruppo: gruppo(a), piano: solo, ...v, disponibili: disponibili[a.id], lordoMese: v.lordo / disponibili[a.id] * giorni.length };
    });
    const totPosti = giorni.reduce((s, g) => s + (posti[g] || []).length, 0);
    return { riepilogo, scoperti, eccezioni: eccezioni.sort((x, y) => x.giorno.localeCompare(y.giorno)), totPosti };
  }

  const api = { RUOLI, COPRE, puoCoprire, residenzaTurno, TARIFFE, PESI, festivo, stima, genera, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NaviCostruisciTurno = api;
})(typeof window !== 'undefined' ? window : globalThis);
