import assert from "node:assert/strict";
import test from "node:test";

import { createModulePackage, mergeModulePackage } from "../src/integrations/layout/module-package.js";

function level() {
  return {
    layers: [{ id: "layer-a", name: "模块 A · 内部", height: 0, visible: true, locked: false }],
    shapes: [{ id: "box-a", type: "rect", layerId: "layer-a", x: 0, y: 0, width: 100, height: 100 }],
    entities: [],
    structureGraph: {
      schemaVersion: 2,
      modules: [{ id: "module-a", name: "模块 A", sourceLayerId: "layer-a", ownsSourceLayer: true, origin: { x: 0, y: 0, z: 0 }, ports: [] }],
      instances: [],
      connections: [],
    },
  };
}

test("three-way module merge keeps independent local and incoming edits", () => {
  const base = level();
  const modulePackage = createModulePackage(base, "module-a");
  modulePackage.content.module.name = "模块 A 远端";
  const current = level();
  current.shapes[0].x = 50;
  const result = mergeModulePackage(current, modulePackage);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.level.structureGraph.modules[0].name, "模块 A 远端");
  assert.equal(result.level.shapes[0].x, 50);
});

test("reports same-field module conflicts and applies explicit resolution", () => {
  const base = level();
  const modulePackage = createModulePackage(base, "module-a");
  modulePackage.content.shapes[0].x = 100;
  const current = level();
  current.shapes[0].x = 50;
  const preview = mergeModulePackage(current, modulePackage);
  assert.ok(preview.conflicts.some((conflict) => conflict.path.endsWith(".x")));
  const accepted = mergeModulePackage(current, modulePackage, { resolution: "incoming" });
  assert.equal(accepted.level.shapes[0].x, 100);
});
