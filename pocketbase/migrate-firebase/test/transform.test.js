import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan, transformDiaria } from "../src/transform.js";

const fixture = { public:{ schedule:{ residenze:{ DESENZANO:[{ id:"91", agente:"Pedroni M.", qualifica:"Marinaio" }] } } }, private:{ changeRequests:{ R1:{ id:"R1", agentId:"91", date:"2026-08-30", shift:"DT" } }, adminUpdates:{ agentProfiles:{ "91":{ id:"91", role:"admin" } }, diaria:{ "91":{ entries:[{ id:"day1", date:"2026-08-30", shift:"DT", serviceMinutes:565, workedMinutes:480, overtimeMeta:{ workedMode:"manual" } }] } } } } };

test("ore lavorate inferiori alle ore servizio restano valide", () => {
  const [entry] = transformDiaria(fixture);
  assert.equal(entry.ore_servizio_minuti, 565);
  assert.equal(entry.ore_lavorate_minuti, 480);
  assert.equal(entry.ore_lavorate_override, true);
});

test("il piano è deterministico e non scrive", () => {
  const plan = buildPlan(fixture);
  assert.deepEqual(plan.map(group => [group.collection, group.records.length]), [["agenti",1],["diaria",1],["cambi_turno",1],["segnalazioni",0]]);
});
