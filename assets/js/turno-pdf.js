// PDF del turno identico a quello dell'ufficio (Calc/OpenOffice, Arial, A4): 2 settimane in verticale,
// 4 settimane in orizzontale (stessa impaginazione ridotta all'81%). Una residenza per pagina; se gli agenti
// non ci stanno, la residenza continua nella pagina dopo con la stessa intestazione.
// Misure prese dai PDF «TURNO DAL 07-09 AL 20-09-2026» (verticale) e «BOZZA TURNO DAL 02-11 AL 29-11-2026» (orizzontale).
(function (root) {
  'use strict';

  // Colore della cella del numero per grado: i colori dei gradi di NaviSuite (docs/STILE-NAVISUITE.md)
  const COLORE_GRADO = { capitano: '#facc15', capo_timoniere: '#fb923c', timoniere: '#22c55e', motorista: '#a855f7', aiuto_motorista: '#3b82f6', marinaio: '#e8f3f6' };
  const BLU_IMPEGNATA = '#83caff';
  const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

  // Impaginazione verticale (2 settimane); quella orizzontale e' la stessa scalata e spostata
  const BASE = {
    numCx: 22.3, numL: 14.6, nameL: 30, nameX: 34.5, iniR: 144.1, x0: 145.1, col: 31.17,
    titoloY: 64.1, turnoY: 80.2, dalY: 92.9, settY: 106.4, resY: 119.6, nomiY: 119.7, numeriY: 132.8,
    headTop: 95.5, headNomi: 110.1, headNumeri: 123.4, rigaTop: 138.8, riga: 17.65,
    titoloX: 34.5, turnoX: 149, dalX: 146.1,
    f: { titolo: 12.3, turno: 10.6, dal: 9.6, sett: 9.6, res: 9.6, nomeGiorno: 9.6, numGiorno: 10.6, cella: 10.6, nome: 9.6, num: 9.6, piede: 8.7 },
    righe: 36, pagina: [595.28, 841.89], orient: 'p'
  };
  function layout(settimane) {
    if (settimane <= 2) return BASE;
    const s = 0.8125, dx = 1, dy = 34.6, L = { ...BASE, f: {}, righe: 25, pagina: [841.89, 595.28], orient: 'l' };
    ['numCx', 'numL', 'nameL', 'nameX', 'iniR', 'x0', 'titoloX', 'turnoX', 'dalX'].forEach(k => { L[k] = BASE[k] * s + dx; });
    ['titoloY', 'turnoY', 'dalY', 'settY', 'resY', 'nomiY', 'numeriY', 'headTop', 'headNomi', 'headNumeri', 'rigaTop'].forEach(k => { L[k] = BASE[k] * s + dy; });
    L.col = BASE.col * s; L.riga = BASE.riga * s;
    Object.entries(BASE.f).forEach(([k, v]) => { L.f[k] = v * s; });
    return L;
  }

  const ggmm = iso => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
  const ggmmaaaa = iso => `${ggmm(iso)}-${iso.slice(0, 4)}`;
  const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const rgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

  // Nome "COGNOME" e iniziale "N." come nel PDF (l'iniziale allineata a destra nella cella del nome)
  function divideNome(nome) {
    const t = String(nome || '').trim().replace(/\s+/g, ' ');
    const m = t.match(/^(.*?)\s+([A-Za-zÀ-ÿ']{1,3}\.)$/);
    return m ? [m[1].toUpperCase(), m[2]] : [t.toUpperCase(), ''];
  }

  /**
   * dati: { titolo: 'BOZZA TURNO DEL PERSONALE', dal: '2026-11-02', settimane: 4, piede: 'testo facoltativo',
   *         residenze: [{ nome: 'RIVA', agenti: [{ nome: 'CANDOLFO N.', ruolo: 'capitano', turni: { '2026-11-02': 'Lav', ... } }] }] }
   */
  function crea(dati) {
    const { jsPDF } = root.jspdf;
    const L = layout(dati.settimane);
    const giorni = Array.from({ length: dati.settimane * 7 }, (_, i) => addDays(dati.dal, i));
    const al = giorni[giorni.length - 1];
    const doc = new jsPDF({ orientation: L.orient, unit: 'pt', format: 'a4' });
    const base = (y, size) => y - 0.212 * size; // da "fondo del riquadro del testo" alla linea di base (Arial)
    const testo = (t, x, y, size, bold, opts) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.text(String(t), x, y, opts); };
    const centro = (t, cx, yBase, size, bold) => testo(t, cx, yBase, size, bold, { align: 'center' });
    const xGiorno = i => L.x0 + i * L.col;
    let prima = true;

    dati.residenze.forEach(res => {
      for (let start = 0; start < Math.max(1, res.agenti.length); start += L.righe) {
        if (!prima) doc.addPage('a4', L.orient);
        prima = false;
        doc.setTextColor(0, 0, 0);
        // Intestazione
        testo('NAVIGAZIONE SUL LAGO DI GARDA', L.titoloX, base(L.titoloY + 3, L.f.titolo), L.f.titolo, true);
        testo(dati.titolo || 'TURNO DEL PERSONALE', L.turnoX, base(L.turnoY + 2.5, L.f.turno), L.f.turno, true);
        testo(`DAL ${ggmm(dati.dal)} AL ${ggmmaaaa(al)}`, L.dalX, base(L.dalY + 2.2, L.f.dal), L.f.dal, true);
        testo('Residenza di', L.nameX, base(L.settY + 2.2, L.f.res), L.f.res, false);
        testo(res.nome.toUpperCase(), L.nameX, base(L.resY + 2.2, L.f.res), L.f.res, true);
        // Testata delle settimane
        doc.setDrawColor(0, 0, 0);
        const fine = xGiorno(giorni.length), top = L.headTop, rigaY = i => L.rigaTop + i * L.riga;
        for (let w = 0; w < dati.settimane; w += 1) {
          const x = xGiorno(w * 7), x2 = xGiorno(w * 7 + 7);
          centro(`Settimana dal ${ggmm(giorni[w * 7])} al ${ggmmaaaa(giorni[w * 7 + 6])}`, (x + x2) / 2, base(L.settY + 2.2, L.f.sett), L.f.sett, false);
          for (let d = 0; d < 7; d += 1) {
            const g = giorni[w * 7 + d], cx = xGiorno(w * 7 + d) + L.col / 2;
            centro(GIORNI[new Date(`${g}T12:00:00`).getDay()], cx, base(L.nomiY + 2.2, L.f.nomeGiorno), L.f.nomeGiorno, false);
            centro(String(Number(g.slice(8, 10))), cx, base(L.numeriY + 2.5, L.f.numGiorno), L.f.numGiorno, true);
          }
        }
        // righe dell'intestazione: settimana, nomi dei giorni, numeri
        doc.setLineWidth(0.5);
        doc.line(xGiorno(0), top, fine, top);
        doc.line(xGiorno(0), L.headNomi, fine, L.headNomi);
        doc.line(xGiorno(0), L.headNumeri, fine, L.headNumeri);
        // Righe degli agenti
        const lista = res.agenti.slice(start, start + L.righe);
        lista.forEach((a, k) => {
          const y = rigaY(k), cy = y + L.riga / 2, n = start + k + 1;
          const colore = a.colore || COLORE_GRADO[a.ruolo];
          if (colore) { doc.setFillColor(...rgb(colore)); doc.rect(L.numL, y, L.nameL - L.numL, L.riga, 'F'); }
          // numero bianco sui colori scuri (motorista, aiuto motorista), nero sugli altri
          const [r, gg, bb] = colore ? rgb(colore) : [255, 255, 255];
          if (0.299 * r + 0.587 * gg + 0.114 * bb < 150) doc.setTextColor(255, 255, 255);
          centro(String(n), L.numCx, cy + L.f.num * 0.36, L.f.num, true);
          doc.setTextColor(0, 0, 0);
          const [cognome, iniziale] = divideNome(a.nome);
          testo(cognome, L.nameX, cy + L.f.nome * 0.36, L.f.nome, true);
          if (iniziale) testo(iniziale, L.iniR, cy + L.f.nome * 0.36, L.f.nome, true, { align: 'right' });
          giorni.forEach((g, i) => {
            const code = String(a.turni?.[g] ?? '').trim();
            if (!code) return;
            if (code.startsWith('#')) { doc.setFillColor(...rgb(BLU_IMPEGNATA)); doc.rect(xGiorno(i), y, L.col, L.riga, 'F'); }
            centro(code, xGiorno(i) + L.col / 2, cy + L.f.cella * 0.36, L.f.cella, false);
          });
        });
        // Griglia: righe orizzontali, verticali sottili e piu' spesse tra le settimane e attorno a numero e nome
        const fondo = rigaY(lista.length);
        doc.setLineWidth(0.5);
        for (let k = 0; k <= lista.length; k += 1) doc.line(L.numL, rigaY(k), fine, rigaY(k));
        for (let i = 0; i <= giorni.length; i += 1) {
          doc.setLineWidth(i % 7 === 0 ? 1 : 0.5);
          doc.line(xGiorno(i), i % 7 === 0 ? top : L.headNomi, xGiorno(i), fondo);
        }
        doc.setLineWidth(1);
        doc.line(L.numL, L.rigaTop, L.numL, fondo);
        doc.line(L.nameL, L.rigaTop, L.nameL, fondo);
        doc.line(L.numL, L.rigaTop, xGiorno(0), L.rigaTop);
        doc.line(L.numL, fondo, fine, fondo);
        doc.line(fine, top, fine, fondo);
        doc.line(xGiorno(0), top, fine, top);
        // Piede: legenda della giornata impegnata e nota facoltativa
        const py = fondo + (L.orient === 'p' ? 15 : 12);
        const bx = L.orient === 'p' ? 124 : 101.5, bw = L.col * 0.55, bh = L.riga * 0.72;
        doc.setFillColor(...rgb(BLU_IMPEGNATA)); doc.rect(bx, py, bw, bh, 'F');
        doc.setLineWidth(0.5); doc.rect(bx, py, bw, bh);
        centro('#', bx + bw / 2, py + bh / 2 + L.f.cella * 0.36, L.f.cella, false);
        testo('Giornata impegnata', bx + bw + 3, py + bh / 2 + L.f.piede * 0.36, L.f.piede, false);
        if (dati.piede) testo(dati.piede, L.orient === 'p' ? 270.7 : 230, py + bh / 2 + L.f.piede * 0.36, L.f.piede, false);
      }
    });
    return doc;
  }

  function scarica(dati, nomeFile) {
    const doc = crea(dati);
    doc.save(nomeFile || `${dati.titolo && /BOZZA/i.test(dati.titolo) ? 'BOZZA_' : ''}TURNO_DAL_${ggmm(dati.dal)}_AL_${ggmmaaaa(addDays(dati.dal, dati.settimane * 7 - 1))}.pdf`);
    return doc;
  }

  root.NaviTurnoPdf = { crea, scarica, COLORE_GRADO, layout };
})(typeof window !== 'undefined' ? window : globalThis);
