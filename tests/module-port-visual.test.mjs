import test from "node:test";
import assert from "node:assert/strict";

import {
  modulePortArrowPath,
  modulePortArrowPoints,
} from "../src/integrations/layout/module-port-visual.js";

test("module port arrow points toward local positive X", () => {
  const points = modulePortArrowPoints({ x: 10, y: 20, width: 100, height: 24, rotation: 0 });
  assert.deepEqual(points[3], { x: 110, y: 32 });
  assert.ok(points.slice(0, 3).every((point) => point.x < points[3].x));
  assert.match(modulePortArrowPath({ x: 10, y: 20, width: 100, height: 24 }), /^M/);
});

test("module port arrow rotates its positive direction around the shape center", () => {
  const points = modulePortArrowPoints({ x: 10, y: 20, width: 100, height: 24, rotation: 90 });
  assert.deepEqual(points[3], { x: 60, y: 82 });
  assert.ok(points.slice(0, 3).every((point) => point.y < points[3].y));
});
