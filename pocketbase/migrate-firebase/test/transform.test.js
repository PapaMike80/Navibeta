import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan, transformDiaria, transformShips, transformShipTurns, transformTurns } from "../src/transform.js";

const fixture = { public:{ schedule:{ residenze:{ DESENZANO:[{ id:"91", agente:"Pedroni M.", qualifica:"Marinaio" }] } } }, private:{ changeRequests:{ R1:{ id:"R1", agentId:"91", date:"2026-08-30", shift:"DT" } }, adminUpdates:{ agentProfiles:{ "91":{ id:"91", role:"admin" } }, diaria:{ "91":{ entries:[{ id:"day1", date:"2026-08-30", shift:"DT", serviceMinutes:565, workedMinutes:480, overtimeMeta:{ workedMode:"manual" } }] } } } } };

test("ore lavorate inferiori alle ore servizio restano valide", () => {
  const [entry] = transformDiaria(fixture);
  assert.equal(entry.ore_servizio_minuti, 565);
  assert.equal(entry.ore_lavorate_minuti, 480);
  assert.equal(entry.ore_lavorate_override, true);
});

test("il piano è deterministico e non scrive", () => {
  const plan = buildPlan(fixture);
  assert.equal(plan.find(group => group.collection === "agenti").records.length, 1);
  assert.equal(plan.find(group => group.collection === "diaria").records.length, 1);
  assert.equal(plan.find(group => group.collection === "cambi_turno").records.length, 1);
  assert.equal(plan.find(group => group.collection === "segnalazioni").records.length, 0);
  assert.equal(new Set(plan.map(group => group.collection)).size, plan.length);
});

test("gli identificativi diaria includono agente e data", () => {
  const root = structuredClone(fixture);
  root.private.adminUpdates.diaria["92"] = {
    agentId:"92",
    entries:[{ id:"day1", date:"2026-08-30", shift:"DT", serviceMinutes:565 }],
  };
  const records = transformDiaria(root);
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map(record => record.legacy_id)).size, 2);
  assert.notEqual(records[0].legacy_id, records[1].legacy_id);
});

test("i turni hanno una chiave univoca per agente e data", () => {
  const root = structuredClone(fixture);
  root.public.schedule.residenze.DESENZANO[0].turni = { "2026-08-30":"DT", "2026-08-31":"Riposo" };
  const records = transformTurns(root);
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map(record => record.legacy_id)).size, 2);
});

test("i turni nave pubblici escludono righe amministrative corrotte", () => {
  const root = structuredClone(fixture);
  root.public.schedule.turni_navi = [{ nave:"AGONE", data:"2026-08-30", corsa:"D3" }];
  root.private.adminUpdates.turniNavi = [{ nave:"AGENTE RIP. RIP. D1 RIP.", data:"2026-08-30", corsa:"D1" }];
  assert.deepEqual(transformShips(root).map(record => record.nome), ["AGONE"]);
  assert.equal(transformShipTurns(root).length, 1);
});
