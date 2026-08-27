import assert from "node:assert/strict";
import test from "node:test";

import { createLinearStairStepDescriptors } from "../src/integrations/layout/structure-preview-3d.js";

function linearStair(overrides = {}) {
  return {
    id: "stairs",
    type: "rect",
    x: 100,
    y: 200,
    width: 160,
    height: 300,
    rotation: 0,
    ueBlockout: {
      kind: "parametric",
      blockType: "stairs-linear",
      parameters: {
        StairsSize: [160, 300, 180],
        NumberOfSteps: 10,
        StairsType: "CLOSED",
      },
    },
    ...overrides,
  };
}

test("linear stair preview reaches the target height with one box per step", () => {
  const steps = createLinearStairStepDescriptors(linearStair(), 40);

  assert.equal(steps.length, 10);
  assert.deepEqual(
    { width: steps[0].width, depth: steps[0].depth, height: steps[0].height },
    { width: 160, depth: 30, height: 18 },
  );
  assert.equal(steps[0].bottom, 40);
  assert.equal(steps[0].top, 58);
  assert.equal(steps.at(-1).top, 220);
  assert.equal(steps[0].z, 215);
  assert.equal(steps.at(-1).z, 485);
});

test("linear stair preview rotates its low-to-high axis around the web footprint center", () => {
  const steps = createLinearStairStepDescriptors(linearStair({ rotation: 315 }), 0);
  const first = steps[0];
  const last = steps.at(-1);

  assert.ok(last.x > first.x);
  assert.ok(last.z > first.z);
  assert.ok(Math.abs((last.x - first.x) - (last.z - first.z)) < 0.000001);
  assert.equal(last.top, 180);
});
