import assert from "node:assert/strict";
import test from "node:test";

import { buildIncrementalImportPlan } from "../src/integrations/ue/incremental-sync.js";

function actor(overrides = {}) {
  return {
    actorKind: "parametric",
    blueprintClassPath: "/Game/Box_C",
    sourceId: "shape-1",
    syncKey: "stable-1",
    label: "墙 A",
    folder: "BlockOutToolsBridge/Test",
    location: [0, 0, 0],
    rotation: [0, 0, 0],
    scale3d: [1, 1, 1],
    parameters: { BoxSize: [100, 20, 300] },
    ...overrides,
  };
}

test("matches changed web ids by stable sync tag and updates in place", () => {
  const desired = actor({ sourceId: "new-id", location: [100, 0, 0] });
  const current = actor({ path: "/Game/Map.Actor_1", sourceId: "old-id" });
  const plan = buildIncrementalImportPlan({ actors: [desired] }, { actors: [current] });
  assert.deepEqual(plan.sync.counts, { create: 0, update: 1, unchanged: 0, delete: 0, retain: 0 });
  assert.equal(plan.sync.operations[0].currentActorPath, current.path);
  assert.equal(plan.sync.operations[0].reason, "sync-key");
});

test("uses a unique typed name as a controlled fallback", () => {
  const desired = actor({ syncKey: "", sourceId: "new-id", location: [100, 0, 0] });
  const current = actor({ path: "/Game/Map.Actor_1", syncKey: "", sourceId: "old-id" });
  const plan = buildIncrementalImportPlan({ actors: [desired] }, { actors: [current] });
  assert.equal(plan.sync.counts.update, 1);
  assert.equal(plan.sync.operations[0].reason, "unique-name");
});

test("blocks ambiguous fallback names instead of creating overlapping actors", () => {
  const desired = [actor({ syncKey: "", sourceId: "new-a" }), actor({ syncKey: "", sourceId: "new-b" })];
  const current = [actor({ path: "/Game/A", syncKey: "", sourceId: "old-a" }), actor({ path: "/Game/B", syncKey: "", sourceId: "old-b" })];
  const plan = buildIncrementalImportPlan({ actors: desired }, { actors: current });
  assert.equal(plan.sync.conflictCount, 1);
  assert.equal(plan.sync.conflicts[0].code, "ambiguous-name");
});

test("deletes unmatched bridge actors only when explicitly enabled", () => {
  const current = actor({ path: "/Game/Map.Actor_1" });
  assert.equal(buildIncrementalImportPlan({ actors: [] }, { actors: [current] }).sync.counts.retain, 1);
  assert.equal(buildIncrementalImportPlan({ actors: [] }, { actors: [current] }, { deleteMissing: true }).sync.counts.delete, 1);
});

test("never plans deletion outside the current level bridge folder", () => {
  const current = actor({ path: "/Game/Other.Actor_1", folder: "BlockOutToolsBridge/Other" });
  const plan = buildIncrementalImportPlan({ actorFolder: "BlockOutToolsBridge/Current", actors: [] }, { actors: [current] }, { deleteMissing: true });
  assert.equal(plan.sync.counts.delete, 0);
  assert.equal(plan.sync.operations.length, 0);
});
