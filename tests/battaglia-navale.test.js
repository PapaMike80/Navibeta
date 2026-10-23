// Battaglia navale: flotta valida e computer che finisce sempre la partita.
const assert = require('assert');
require('../assets/js/battaglia-navale.js');
const B = globalThis.NaviBattagliaNavale;

for (let k = 0; k < 200; k++) {
  const navi = B.piazza();
  assert.strictEqual(navi.length, 5);
  const tutte = navi.flatMap(n => n.celle);
  assert.strictEqual(new Set(tutte).size, 17, 'navi sovrapposte');
  navi.forEach(n => {
    const righe = new Set(n.celle.map(i => Math.floor(i / 10))), col = new Set(n.celle.map(i => i % 10));
    assert.ok(righe.size === 1 || col.size === 1, 'nave non dritta');
    navi.filter(m => m !== n).forEach(m => m.celle.forEach(j => n.celle.forEach(i => {
      assert.ok(Math.abs(Math.floor(i / 10) - Math.floor(j / 10)) > 1 || Math.abs(i % 10 - j % 10) > 1, 'navi che si toccano');
    })));
  });
}

let mosse = 0;
for (let k = 0; k < 100; k++) {
  const navi = B.piazza(), colpi = new Set();
  let n = 0;
  while (!B.finita(navi)) {
    const i = B.mossaComputer(navi, colpi);
    assert.ok(i >= 0 && i < 100 && !colpi.has(i), 'mossa non valida');
    B.spara(navi, colpi, i);
    n++;
  }
  mosse += n;
}
assert.ok(mosse / 100 < 70, `il computer gioca male: ${mosse / 100} mosse in media`);
assert.strictEqual(B.nomeCella(0), 'A1');
assert.strictEqual(B.nomeCella(99), 'J10');
console.log(`battaglia-navale: ok (computer ${Math.round(mosse / 100)} mosse in media)`);
