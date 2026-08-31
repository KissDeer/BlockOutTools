import assert from "node:assert/strict";
import test from "node:test";

import { alignSelection, distributeSelection, moveSelection, resizeSingleSelection, selectionBounds } from "../src/integrations/layout/editor-workflow-model.js";

const base = {
  shapes: [
    { id: "a", type: "rect", x: 0, y: 0, width: 100, height: 50, ueBlockout: { blockType: "box", parameters: { BoxSize: [100, 50, 300] } } },
    { id: "b", type: "rect", x: 200, y: 100, width: 100, height: 50 },
    { id: "c", type: "rect", x: 500, y: 200, width: 100, height: 50 },
  ],
  entities: [],
};

test("moves a multi-selection by its shared center with grid snapping", () => {
  const moved = moveSelection(base, ["a", "b"], { x: 500, y: 500 }, 50);
  const bounds = selectionBounds(moved, ["a", "b"]);
  assert.equal(bounds.centerX, 500);
  assert.equal(bounds.centerY, 500);
});

test("numeric box resize keeps BoxSize synchronized", () => {
  const resized = resizeSingleSelection(base, ["a"], 240, 120, 10);
  assert.deepEqual(resized.shapes[0].ueBlockout.parameters.BoxSize, [240, 120, 300]);
  assert.equal(resized.shapes[0].width, 240);
});

test("aligns and distributes selected objects", () => {
  const aligned = alignSelection(base, ["a", "b", "c"], "y");
  assert.equal(new Set(aligned.shapes.map((item) => item.y)).size, 1);
  const distributed = distributeSelection(base, ["a", "b", "c"], "x");
  const centers = distributed.shapes.map((item) => item.x + item.width / 2);
  assert.equal(centers[1] - centers[0], centers[2] - centers[1]);
});
