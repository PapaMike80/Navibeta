/*
 * Tab "Confronta turno" di Aggiornamenti.
 * Legge il PDF del nuovo turno (stesso parser dell'importazione), lo confronta con i turni
 * attuali (bozza) e li mostra in una replica della tabella della pagina Turni:
 * le celle diverse dalla bozza sono in rosso. Sola lettura: non salva nulla.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const ORDINE = ['RIVA', 'MADERNO', 'DESENZANO', 'PESCHIERA'];

  let view = null; // { cols, groups, stats } dell'ultimo confronto
  let onlyDiff = false;
  let resFilter = 'TUTTE';

  // Stesse classi colore della pagina Turni (naviturni-page.js: classify / pill)
  const isRip = v => ['', 'RIP', 'RIP.', 'RIPOSO', '----'].includes(String(v || '').toUpperCase().trim().replace(/\*/g, '').replace(/--/g, ''));
  function pulito(v) {
    if (isRip(v)) return '';
    const txt = String(v).toUpperCase().trim().replace(/\*/g, '').replace(/--/g, '');
    const m = txt.match(/(?:^C)?([DRMP]\d|BIS|PO(?:ND?|D)|PONM|AGB|AGM|AGT[12]?|T1|M1|DT|T2|CAR|CAP|SR[12])(?:C|$)/i);
    return m && m[1] ? m[1].toUpperCase().replace(/^PO[ND]$/, 'POND') : txt;
  }
  function classe(v) {
    const u = pulito(v);
    if (u === '') return 'c-rip';
    if (/^[DRP]1/.test(u) || /^T1/.test(u)) return 'c-d1';
    if (/^[DRP]2/.test(u) || /^T2/.test(u)) return 'c-d2';
    if (/^[DRP]3/.test(u) || /^M1/.test(u)) return 'c-d3';
    if (/^[DRP]4/.test(u)) return 'c-d4';
    if (/^DT/.test(u)) return 'c-dt';
    if (/^BIS/.test(u)) return 'c-bis';
    if (/^POND/.test(u)) return 'c-pond';
    if (/^AGB/.test(u)) return 'c-agb';
    if (u.startsWith('CONG') || u === 'CON;') return 'c-cong';
    if (u === 'FP' || u === 'F.P.' || u === 'CORSO') return 'c-fp';
    if (u === 'RF') return 'c-rf';
    if (/^(LAV|TERRA)/.test(u)) return 'c-lav';
    if (/^AGM/.test(u)) return 'c-agm';
    if (/^AGT/.test(u)) return 'c-agt';
    return 'c-other';
  }
  function pill(v) {
    if (v === '' || v == null) return '<span class="cell-pill c-rip">—</span>';
    if (isRip(v)) return '<span class="cell-pill c-rip">rip</span>';
    const txt = /^(?:LAV|TERRA)$/i.test(String(v).trim().replace(/[;,.]+$/, '')) ? 'LAV' : v;
    return `<span class="cell-pill ${classe(v)}">${esc(txt)}</span>`;
  }

  const sameShift = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();

  function costruisci(batch, hook) {
    const known = new Set((hook.schedule()?.date || []).map(d => d.iso));
    const byUid = new Map(hook.agents().map(a => [String(a.agent_uid), a]));
    const cols = batch.dates.map((iso, i) => {
      const d = new Date(`${iso}T12:00:00`);
      return { iso, i, giorno: GIORNI[d.getDay()], num: d.getDate(), mese: d.getMonth(), anno: d.getFullYear(), dow: d.getDay(), inBozza: known.has(iso) };
    });
    const groups = new Map();
    let diffCells = 0, diffAgents = 0, newAgents = 0, missing = 0;
    batch.rows.forEach(row => {
      const current = byUid.get(String(row.agent_uid));
      const cells = cols.map(c => {
        const nuovo = row.turni[c.i] ?? 'RIP';
        const vecchio = current && c.inBozza ? hook.shift(current.turni?.[c.iso]) : null;
        return { nuovo, vecchio, diff: current ? (c.inBozza ? !sameShift(nuovo, vecchio) : false) : true };
      });
      const nDiff = cells.filter(c => c.diff).length;
      if (!current) newAgents++;
      if (row.assente) missing++;
      if (current) diffCells += nDiff;
      if (current && nDiff) diffAgents++;
      const res = String(row.residenzaNuova || row.residenza || current?.residence || '').toUpperCase();
      if (!groups.has(res)) groups.set(res, []);
      groups.get(res).push({ row, current, cells, nDiff, res });
    });
    const newDays = cols.filter(c => !c.inBozza).length;
    const ordered = [...groups.keys()].sort((a, b) => {
      const x = ORDINE.indexOf(a), y = ORDINE.indexOf(b);
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.localeCompare(b);
    }).map(res => ({ res, rows: groups.get(res) }));
    return { cols, groups: ordered, stats: { diffCells, diffAgents, newAgents, missing, newDays, agents: batch.rows.length, days: cols.length }, batch };
  }

  function intestazioneMesi(cols) {
    const gruppi = [];
    cols.forEach(c => {
      const key = `${c.anno}-${c.mese}`, last = gruppi[gruppi.length - 1];
      if (last && last.key === key) last.n++; else gruppi.push({ key, n: 1, label: `${MESI[c.mese]} ${c.anno}` });
    });
    return `<tr class="month-header"><th></th>${gruppi.map(g => `<th colspan="${g.n}">${esc(g.label)}</th>`).join('')}</tr>`;
  }

  function disegna() {
    const box = $('cmp-result');
    if (!view) { box.hidden = true; return; }
    const { cols, groups, stats } = view;
    const visibleGroups = groups.filter(g => resFilter === 'TUTTE' || g.res === resFilter);
    const head = `${intestazioneMesi(cols)}<tr class="date-header"><th>Agente</th>${cols.map(c => {
      const cls = [c.dow === 1 ? 'week-start' : '', c.dow === 0 ? 'week-end' : '', c.inBozza ? '' : 'senza-bozza'].filter(Boolean).join(' ');
      return `<th class="${cls}"><span class="date-head-day">${c.giorno}</span><span class="date-head-num">${c.num}</span></th>`;
    }).join('')}</tr>`;
    let body = '';
    visibleGroups.forEach(g => {
      const rows = g.rows.filter(r => !onlyDiff || r.nDiff > 0 || !r.current);
      if (!rows.length) return;
      body += `<tr class="res-row"><td colspan="${cols.length + 1}">${esc(g.res || 'SENZA RESIDENZA')} <small>${rows.length} agenti</small></td></tr>`;
      rows.forEach(r => {
        const badges = [
          !r.current && '<span class="cmp-badge cmp-new">nuovo agente</span>',
          r.row.assente && '<span class="cmp-badge cmp-warn">non nel PDF</span>',
          r.row.residenzaNuova && `<span class="cmp-badge cmp-move">da ${esc(r.row.residenzaPrecedente)}</span>`,
          r.nDiff && r.current && `<span class="cmp-badge cmp-diff">${r.nDiff} diff.</span>`
        ].filter(Boolean).join('');
        body += `<tr class="${r.nDiff && r.current ? 'has-diff' : ''}${r.current ? '' : ' agente-nuovo'}"><td class="td-name"><span class="agent-name-text">${esc(r.row.agente)}</span>${badges}</td>${r.cells.map((c, i) => {
          const cls = [cols[i].dow === 1 ? 'week-start' : '', cols[i].dow === 0 ? 'week-end' : '', c.diff && r.current ? 'cmp-cell-diff' : '', cols[i].inBozza ? '' : 'senza-bozza'].filter(Boolean).join(' ');
          const was = c.diff && r.current && c.vecchio !== null ? `<span class="cmp-was" title="Nella bozza">era ${esc(isRip(c.vecchio) ? 'rip' : c.vecchio)}</span>` : '';
          return `<td class="${cls}">${pill(c.nuovo)}${was}</td>`;
        }).join('')}</tr>`;
      });
    });
    if (!body) body = `<tr><td colspan="${cols.length + 1}" class="empty">Nessuna differenza rispetto alla bozza${resFilter === 'TUTTE' ? '' : ' in questa residenza'}.</td></tr>`;
    const summary = stats.diffCells
      ? `<strong class="cmp-red">${stats.diffCells} celle diverse</strong> in ${stats.diffAgents} agenti`
      : '<strong class="cmp-ok">Nessuna differenza</strong> con la bozza';
    const extra = [
      stats.newAgents && `${stats.newAgents} agenti nuovi`,
      stats.missing && `${stats.missing} agenti non presenti nel PDF`,
      stats.newDays && `${stats.newDays} giornate non ancora in bozza (evidenziate in tratteggio)`
    ].filter(Boolean).join(' · ');
    box.hidden = false;
    box.innerHTML = `<article class="card full"><div class="cmp-summary">${summary} · ${stats.agents} agenti · ${stats.days} giornate${extra ? `<br><small>${esc(extra)}</small>` : ''}</div>
      <div class="cmp-tools">
        <label class="cmp-switch"><input type="checkbox" id="cmp-only"${onlyDiff ? ' checked' : ''}> Solo agenti con differenze</label>
        <div class="cmp-res">${['TUTTE', ...groups.map(g => g.res)].map(r => `<button type="button" class="${r === resFilter ? 'active' : ''}" data-res="${esc(r)}">${esc(r || '—')}</button>`).join('')}</div>
      </div>
      <div class="scroll-wrap"><table class="cmp-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <div class="cmp-legend"><span class="legend-item"><span class="legend-dot cmp-dot-diff"></span>Diverso dalla bozza (sotto: com'era)</span><span class="legend-item"><span class="legend-dot cmp-dot-new"></span>Agente non presente in anagrafica</span><span class="legend-item"><span class="legend-dot cmp-dot-nobozza"></span>Giornata non ancora in bozza</span></div></article>`;
    $('cmp-only').addEventListener('change', e => { onlyDiff = e.target.checked; disegna(); });
    box.querySelectorAll('[data-res]').forEach(b => b.addEventListener('click', () => { resFilter = b.dataset.res; disegna(); }));
  }

  async function esegui() {
    const hook = window.NaviConfrontoHook, file = $('cmp-file').files?.[0], status = $('status');
    if (!hook) return alert('La pagina è ancora in caricamento: riprova tra un istante.');
    if (!file) return;
    const run = $('cmp-run');
    run.disabled = true;
    status.className = 'status'; status.textContent = `Lettura e confronto di ${file.name}…`;
    try {
      const { batch, inferred } = await hook.parse(file, $('cmp-start').value, $('cmp-end').value);
      if (inferred?.inizio && !$('cmp-start').value) $('cmp-start').value = inferred.inizio;
      if (inferred?.fine && !$('cmp-end').value) $('cmp-end').value = inferred.fine;
      view = costruisci(batch, hook);
      onlyDiff = false; resFilter = 'TUTTE';
      disegna();
      status.className = 'status ok';
      status.textContent = view.stats.diffCells ? `Confronto pronto: ${view.stats.diffCells} celle diverse dalla bozza.` : 'Confronto pronto: nessuna differenza con la bozza.';
      $('cmp-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      view = null; disegna();
      status.className = 'status bad'; status.textContent = `Errore nel confronto: ${error.message}`;
    } finally { run.disabled = !$('cmp-file').files?.[0]; }
  }

  function mostraTab(nome) {
    const conf = nome === 'confronto';
    $('confronto-turno').hidden = !conf;
    $('aggiornamenti-grid').hidden = conf;
    document.querySelectorAll('[data-agg-tab]').forEach(b => {
      const on = b.dataset.aggTab === nome;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
    });
    try { history.replaceState(null, '', conf ? '#confronto' : location.pathname + location.search); } catch (_) {}
  }

  document.querySelectorAll('[data-agg-tab]').forEach(b => b.addEventListener('click', () => mostraTab(b.dataset.aggTab)));
  $('cmp-file').addEventListener('change', () => { $('cmp-run').disabled = !$('cmp-file').files?.[0]; view = null; disegna(); });
  $('cmp-run').addEventListener('click', esegui);
  if (location.hash === '#confronto') mostraTab('confronto');
})();
