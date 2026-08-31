import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BLOCKOUT_PROFILE, validateBlockoutLevel } from "../src/integrations/layout/blockout-rules.js";

test("validates doorway, stairs, ramp and tagged corridor dimensions", () => {
  const level = {
    shapes: [
      { id: "door", name: "窄门", ueBlockout: { blockType: "doorway", parameters: { DoorwaySize: [40, 80, 180] } } },
      { id: "stairs", ueBlockout: { blockType: "stairs-linear", parameters: { StairsSize: [100, 200, 200], NumberOfSteps: 5 } } },
      { id: "ramp", ueBlockout: { blockType: "ramp", parameters: { RampSize: [100, 100, 100] } } },
      { id: "corridor", layoutRole: "corridor", width: 500, height: 80 },
    ],
  };
  const result = validateBlockoutLevel(level, DEFAULT_BLOCKOUT_PROFILE);
  assert.equal(result.errorCount, 5);
  assert.equal(result.warningCount, 2);
  assert.ok(result.findings.some((item) => item.code === "door-width"));
  assert.ok(result.findings.some((item) => item.code === "stair-riser"));
  assert.ok(result.findings.some((item) => item.code === "ramp-slope"));
  assert.ok(result.findings.some((item) => item.code === "corridor-width"));
});

test("accepts compliant recognized traversal blocks", () => {
  const result = validateBlockoutLevel({
    shapes: [
      { id: "door", ueBlockout: { blockType: "doorway", parameters: { DoorwaySize: [40, 120, 220] } } },
      { id: "stairs", ueBlockout: { blockType: "stairs-linear", parameters: { StairsSize: [140, 300, 180], NumberOfSteps: 10 } } },
      { id: "ramp", ueBlockout: { blockType: "ramp", parameters: { RampSize: [500, 140, 100] } } },
    ],
  });
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});
