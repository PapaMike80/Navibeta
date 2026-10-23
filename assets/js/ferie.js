// Ferie: calendario del mese per scegliere i giorni da chiedere. Due scorte di ore separate, entrambe da spendere
// in ferie: le ferie maturate e la banca ore. Un tocco = ferie, due = banca ore, tre = tolto. Ogni giorno vale le
// ore del servizio di quel giorno (dal turno), 7:48 se non c'e' (39 h / 5). Pagina a se': i dati restano su questo
// dispositivo, per agente.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const G = window.NaviTurniGiorno;
  const GIORNATA = 7 * 60 + 48;
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hhmm = m => `${m < 0 ? '−' : ''}${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, '0')}`;
  // "120" = 1:20, "7:48", "104" = 1:04 (cifre da destra, come nella Distinta)
  const leggiOre = v => { const t = String(v || '').trim(); const m = t.match(/^(\d+):(\d{1,2})$/); if (m) return Number(m[1]) * 60 + Number(m[2]); const d = t.replace(/\D/g, ''); return d ? Math.floor(Number(d) / 100) * 60 + Number(d) % 100 : 0; };
  const profilo = (() => { try { return JSON.parse(localStorage.getItem('naviturni_logged_agent') || localStorage.getItem('navidiaria.activeAgent') || 'null'); } catch { return null; } })();
  const CHIAVE = `navisuite.ferie.v1.${profilo?.id || 'ospite'}`;
  const leggi = () => { try { return { ferie: 0, banca: 0, giorni: {}, ...JSON.parse(localStorage.getItem(CHIAVE) || '{}') }; } catch { return { ferie: 0, banca: 0, giorni: {} }; } };
  const dati = leggi();
  const salva = () => { try { localStorage.setItem(CHIAVE, JSON.stringify(dati)); } catch { /* niente */ } };
  const oggi = new Date();
  let mese = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
  let schedule = null;

  const turnoDi = day => { try { return schedule && profilo ? String(G?.turnoAgente(schedule, profilo, day)?.turno || '').trim().toUpperCase() : ''; } catch { return ''; } };
  const riposo = t => !t ? false : /^(RIP|RIPOSO|-{1,}|—|=+|#)/.test(t);
  const minutiDi = day => {
    const t = turnoDi(day);
    const ore = Number(window.NaviShiftCompetence?.shiftForCode?.(t, day)?.hours);
    return t && !riposo(t) && ore > 0 ? Math.round(ore * 60) : GIORNATA;
  };
  const usate = tipo => Object.entries(dati.giorni).filter(([, v]) => v === tipo).reduce((s, [d]) => s + minutiDi(d), 0);

  function riepilogo() {
    const uf = usate('f'), ub = usate('b'), rf = dati.ferie - uf, rb = dati.banca - ub;
    $('fe-ferie-usate').textContent = hhmm(uf); $('fe-ferie-res').textContent = hhmm(rf); $('fe-ferie-res').classList.toggle('neg', rf < 0);
    $('fe-banca-usate').textContent = hhmm(ub); $('fe-banca-res').textContent = hhmm(rb); $('fe-banca-res').classList.toggle('neg', rb < 0);
    const scelti = Object.keys(dati.giorni).sort();
    const nf = scelti.filter(d => dati.giorni[d] === 'f').length, nb = scelti.length - nf;
    $('fe-piede').innerHTML = scelti.length
      ? `<b>${scelti.length} ${scelti.length === 1 ? 'giorno scelto' : 'giorni scelti'}</b><small>${[nf ? `${nf} di ferie (${hhmm(uf)})` : '', nb ? `${nb} di banca ore (${hhmm(ub)})` : ''].filter(Boolean).join(' · ')}</small>`
      : '<b>Tocca i giorni da chiedere</b><small>Ogni giorno vale le ore del tuo servizio di quel giorno.</small>';
  }

  function render() {
    $('fe-mese').textContent = `${MESI[mese.getMonth()]} ${mese.getFullYear()}`;
    const primo = (mese.getDay() + 6) % 7, giorni = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate();
    let html = ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(x => `<div class="dn">${x}</div>`).join('') + '<div class="d vuoto"></div>'.repeat(primo);
    for (let n = 1; n <= giorni; n += 1) {
      const d = new Date(mese.getFullYear(), mese.getMonth(), n), day = iso(d), t = turnoDi(day), scelto = dati.giorni[day];
      const cls = ['d', d.getDay() === 0 ? 'dom' : '', riposo(t) ? 'rip' : '', scelto || '', day === iso(oggi) ? 'oggi' : ''].filter(Boolean).join(' ');
      const sotto = scelto === 'f' ? 'ferie' : scelto === 'b' ? 'banca' : riposo(t) ? 'riposo' : t;
      html += `<button type="button" class="${cls}" data-day="${day}"${riposo(t) && !scelto ? ' disabled' : ''}>${n}<i>${sotto || '&nbsp;'}</i></button>`;
    }
    $('fe-cal').innerHTML = html;
    riepilogo();
  }

  $('fe-cal').addEventListener('click', e => {
    const b = e.target.closest('[data-day]'); if (!b) return;
    const day = b.dataset.day, ora = dati.giorni[day];
    if (!ora) dati.giorni[day] = 'f'; else if (ora === 'f') dati.giorni[day] = 'b'; else delete dati.giorni[day];
    salva(); render();
  });
  const campo = (id, chiave) => {
    const el = $(id); el.value = dati[chiave] ? hhmm(dati[chiave]) : '';
    el.addEventListener('focus', () => setTimeout(() => el.select(), 0));
    el.addEventListener('change', () => { dati[chiave] = leggiOre(el.value); el.value = dati[chiave] ? hhmm(dati[chiave]) : ''; salva(); riepilogo(); });
  };
  campo('fe-ferie', 'ferie'); campo('fe-banca', 'banca');
  $('fe-prev').addEventListener('click', () => { mese = new Date(mese.getFullYear(), mese.getMonth() - 1, 1); render(); });
  $('fe-next').addEventListener('click', () => { mese = new Date(mese.getFullYear(), mese.getMonth() + 1, 1); render(); });

  render();
  window.NaviSharedData?.loadCacheFirst?.(data => { schedule = data || null; render(); })?.catch?.(() => {});
  G?.caricaModifiche?.(profilo)?.then?.(() => render())?.catch?.(() => {});
})();
