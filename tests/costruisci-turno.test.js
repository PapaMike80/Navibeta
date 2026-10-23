// Motore di Costruisci turno: copre tutti i posti, niente 7 giorni di fila, poche ripetizioni, lordo equo per ruolo.
const assert = require('assert');
const M = require('../assets/js/costruisci-turno-motore.js');

const giorni = Array.from({ length: 30 }, (_, i) => M.addDays('2026-09-01', i));
const equip = { capitano: 1, motorista: 1, marinaio: 2 };
const turni = ['D1', 'D2', 'D3', 'D4', 'BIS'];
const posti = {};
giorni.forEach(g => { posti[g] = turni.flatMap(t => Object.entries(equip).flatMap(([ruolo, n]) => Array(n).fill({ turno: t, residenza: 'DESENZANO', ruolo }))); });
const ruoli = { capitano: 8, motorista: 8, marinaio: 15 };
const agenti = [];
Object.entries(ruoli).forEach(([ruolo, n]) => { for (let i = 0; i < n; i += 1) agenti.push({ id: `${ruolo}${i}`, nome: `${ruolo.toUpperCase()} ${i}`, ruolo, residenza: 'DESENZANO', fissi: {} }); });
// un marinaio in congedo per una settimana, un capitano di Peschiera disponibile per le trasferte
agenti.find(a => a.id === 'marinaio0').fissi = Object.fromEntries(giorni.slice(7, 14).map(g => [g, 'CON']));
agenti.push({ id: 'capP', nome: 'CAPITANO PESCHIERA', ruolo: 'capitano', residenza: 'PESCHIERA', fissi: {} });
const ore = { D1: 12.1, D2: 11.2, D3: 12, D4: 12, BIS: 12.2 };
const competenza = (code, g) => {
  const base = String(code).replace(/^c|c$|\*$/g, '');
  if (ore[base]) return { ore: ore[base], imbarco: true, diaria: 24, ticket: true, lavoro: true };
  if (base === 'CON') return { ore: 8, imbarco: false, diaria: 0, ticket: false, lavoro: false };
  return null;
};
const t0 = Date.now();
const r = M.genera({ giorni, agenti, posti, competenza, lavora: c => c !== 'CON' });
const ms = Date.now() - t0;

assert.strictEqual(r.scoperti.length, 0, 'tutti i posti coperti');
assert.strictEqual(r.totPosti, 30 * 5 * 4);
const coperti = r.riepilogo.reduce((s, a) => s + Object.values(a.piano).filter(c => /D\d|BIS/.test(c)).length, 0);
assert.strictEqual(coperti, r.totPosti, 'ogni posto ha un agente');
assert.strictEqual(r.eccezioni.filter(e => e.tipo === 'settimo').length, 0, 'mai 7 giorni di fila');
assert.strictEqual(r.eccezioni.filter(e => e.tipo === 'trasferta').length, 0, 'nessuna trasferta se non serve');
assert.ok(r.eccezioni.filter(e => e.tipo === 'ripetuto').length <= 5, `poche ripetizioni (${r.eccezioni.filter(e => e.tipo === 'ripetuto').length})`);
// i congedi restano
assert.strictEqual(r.riepilogo.find(a => a.id === 'marinaio0').piano[giorni[8]], 'CON');
// equita': nello stesso ruolo lo scarto del lordo stimato resta sotto il valore di una giornata di servizio (~200 €)
['capitano', 'motorista', 'marinaio'].forEach(ruolo => {
  const l = r.riepilogo.filter(a => a.ruolo === ruolo && a.residenza === 'DESENZANO' && a.id !== 'marinaio0').map(a => a.lordo);
  const scarto = Math.max(...l) - Math.min(...l);
  console.log(`# ${ruolo}: lordo ${Math.min(...l).toFixed(0)}–${Math.max(...l).toFixed(0)} € (scarto ${scarto.toFixed(0)} €)`);
  assert.ok(scarto < 200, `${ruolo}: scarto ${scarto.toFixed(0)} € troppo alto`);
});
console.log(`# ${r.totPosti} posti in ${ms} ms, ripetizioni ${r.eccezioni.filter(e => e.tipo === 'ripetuto').length}`);
// senza abbastanza capitani di Desenzano si usa la trasferta e lo si segnala
const pochi = agenti.filter(a => !(a.ruolo === 'capitano' && a.residenza === 'DESENZANO' && Number(a.id.slice(-1)) > 4));
const r2 = M.genera({ giorni, agenti: pochi, posti, competenza, lavora: c => c !== 'CON', iterazioni: 2000 });
assert.ok(r2.eccezioni.some(e => e.tipo === 'trasferta'), 'trasferta segnalata quando serve');
console.log(`# con 5 capitani: scoperti ${r2.scoperti.length}, trasferte ${r2.eccezioni.filter(e => e.tipo === 'trasferta').length}, settimi giorni ${r2.eccezioni.filter(e => e.tipo === 'settimo').length}`);
console.log('costruisci-turno ok');
