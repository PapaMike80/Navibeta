// Pontile perfetto: la fisica semplificata risponde alle manette, al timone e al vento; il voto premia l'attracco lento.
const assert = require('assert');
require('../assets/js/pontile-perfetto.js');
const P = globalThis.NaviPontilePerfetto;
const corri = (cmd, liv, sec, n = P.nuovaNave()) => { n.u = 0; n.r = 0; n.rotta = 0; for (let k = 0; k < sec * 50; k++) P.passo(n, cmd, liv, 0.02); return n; };
const calmo = P.LIVELLI[0], terra = P.LIVELLI[1];
let n = corri({ sx: 1, dx: 1, timone: 0 }, calmo, 20);
assert.ok(n.u > 0.8 && n.u < 2, `avanti tutta: ${n.u.toFixed(2)} m/s`);
assert.ok(Math.abs(n.rotta) < 0.01, 'dritto con le manette pari');
n = corri({ sx: 1, dx: -1, timone: 0 }, calmo, 5);
assert.ok(n.rotta > 0.3 && Math.abs(n.u) < 0.3, 'sinistra avanti e dritta indietro: gira a dritta quasi da ferma');
n = corri({ sx: 0.45, dx: 0.45, timone: 1 }, calmo, 10);
assert.ok(n.rotta > 0.2, 'timone a dritta: accosta a dritta');
const y0 = P.nuovaNave().y; n = corri({ sx: 0, dx: 0, timone: 0 }, terra, 20);
assert.ok(n.y > y0 + 1, 'il vento da terra spinge via dal pontile');
assert.strictEqual(P.voto({ velArrivo: 0.2, angArrivo: 3, urti: 0, primaCima: 'prua', cimaGiusta: 'prua', tempo: 60 }), 10);
assert.ok(P.voto({ velArrivo: 1, angArrivo: 25, urti: 2, primaCima: 'poppa', cimaGiusta: 'prua', tempo: 200 }) < 4);
console.log('pontile-perfetto: ok');
