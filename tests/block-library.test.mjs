import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyBlockParametersToShape,
  createPlacedBlock,
  createUnifiedBlockCatalog,
  normalizeAiLayout,
  resizeParametricShape,
} from "../src/integrations/layout/block-catalog.js";

const schema = JSON.parse(await readFile(new URL("../config/ue-parametric-blocks.json", import.meta.url), "utf8"));
const catalog = createUnifiedBlockCatalog(schema);

test("catalog contains the 15 Blueprint tools and the original LayoutTools blocks", () => {
  assert.equal(catalog.filter((item) => item.source === "ue").length, 15);
  assert.ok(catalog.some((item) => item.blockType === "doorway"));
  assert.ok(catalog.some((item) => item.id === "original-wall"));
  assert.ok(catalog.some((item) => item.id === "module-port" && item.moduleOnly));
  assert.equal(catalog.some((item) => item.assetId), false);
});

test("places module ports as ordinary editable shapes", () => {
  const block = catalog.find((item) => item.id === "module-port");
  const placed = createPlacedBlock(block, { x: 250, y: 180 }, "module-layer", {
    name: "东门",
    z: 120,
  });

  assert.equal(placed.collection, "shapes");
  assert.equal(placed.item.type, "rect");
  assert.equal(placed.item.x + placed.item.width / 2, 250);
  assert.equal(placed.item.y + placed.item.height / 2, 180);
  assert.equal(placed.item.modulePort.name, "东门");
  assert.equal(placed.item.modulePort.z, 120);
  assert.equal(placed.item.ueBlockout, undefined);
});

test("places a parametric box with canonical Blueprint metadata", () => {
  const block = catalog.find((item) => item.blockType === "box");
  const placed = createPlacedBlock(block, { x: 500, y: 400 }, "base", {
    BoxSize: [200, 100, 300],
  });

  assert.equal(placed.collection, "shapes");
  assert.equal(placed.item.x, 400);
  assert.equal(placed.item.y, 350);
  assert.equal(placed.item.width, 200);
  assert.equal(placed.item.height, 100);
  assert.equal(placed.item.ueBlockout.kind, "parametric");
  assert.equal(placed.item.ueBlockout.blockType, "box");
  assert.equal(placed.item.ueBlockout.parameters.BoxSize[2], 300);
  assert.match(placed.item.ueBlockout.blueprintClassPath, /Blockout_Box_C$/);
});

test("doorway side thickness updates the web footprint without moving its center", () => {
  const block = catalog.find((item) => item.blockType === "doorway");
  const placed = createPlacedBlock(block, { x: 300, y: 200 }, "base").item;
  const changed = applyBlockParametersToShape(placed, block, {
    ...placed.ueBlockout.parameters,
    DoorwaySize: [60, 220, 260],
    SideThickness: 80,
  });

  assert.equal(changed.width, 60);
  assert.equal(changed.height, 380);
  assert.equal(changed.x + changed.width / 2, 300);
  assert.equal(changed.y + changed.height / 2, 200);
});

test("canvas resizing updates Box footprint and Blueprint size parameters", () => {
  const block = catalog.find((item) => item.blockType === "box");
  const placed = createPlacedBlock(block, { x: 500, y: 400 }, "base", {
    BoxSize: [200, 100, 300],
  }).item;
  const resized = resizeParametricShape(placed, block, 350, 250);

  assert.equal(resized.width, 350);
  assert.equal(resized.height, 250);
  assert.deepEqual(resized.ueBlockout.parameters.BoxSize, [350, 250, 300]);
  assert.equal(resized.x + resized.width / 2, 500);
  assert.equal(resized.y + resized.height / 2, 400);
});

test("canvas resizing preserves non-plan dimensions for stairs and doorway", () => {
  const stairs = catalog.find((item) => item.blockType === "stairs-linear");
  const resizedStairs = resizeParametricShape(
    createPlacedBlock(stairs, { x: 0, y: 0 }, "base", { StairsSize: [100, 200, 300] }).item,
    stairs,
    160,
    280,
  );
  assert.deepEqual(resizedStairs.ueBlockout.parameters.StairsSize, [160, 280, 300]);

  const doorway = catalog.find((item) => item.blockType === "doorway");
  const resizedDoorway = resizeParametricShape(
    createPlacedBlock(doorway, { x: 0, y: 0 }, "base", {
      DoorwaySize: [50, 200, 250], SideThickness: 40, TopThickness: 50,
    }).item,
    doorway,
    80,
    360,
  );
  assert.deepEqual(resizedDoorway.ueBlockout.parameters.DoorwaySize, [80, 280, 250]);
});

test("places original shapes and entities without UE metadata", () => {
  const rectangle = createPlacedBlock(catalog.find((item) => item.id === "original-rectangle"), { x: 100, y: 100 }, "base");
  const player = createPlacedBlock(catalog.find((item) => item.id === "original-player"), { x: 300, y: 200 }, "base");

  assert.equal(rectangle.item.type, "rect");
  assert.equal(rectangle.item.ueBlockout, undefined);
  assert.equal(player.collection, "entities");
  assert.deepEqual(player.item.position, { x: 300, y: 200 });
});

test("normalizes AI parametric output and rejects unknown Blueprint block types", () => {
  const level = {
    shapes: [
      { id: "known", type: "rect", x: 0, y: 0, width: 100, height: 100, ueBlockout: { blockType: "box", parameters: { BoxSize: [250, 150, 400] } } },
      { id: "unknown", type: "rect", x: 0, y: 0, width: 10, height: 10, ueBlockout: { blockType: "missing" } },
      { id: "original", type: "circle" },
    ],
    entities: [{ id: "enemy", type: "enemy" }],
  };
  const normalized = normalizeAiLayout(level, catalog);

  assert.equal(normalized.level.shapes[0].width, 250);
  assert.equal(normalized.level.shapes[0].ueBlockout.parameters.BoxSize[2], 400);
  assert.equal(normalized.level.shapes[1].ueBlockout, undefined);
  assert.equal(normalized.level.shapes[2].type, "circle");
  assert.equal(normalized.warnings.length, 1);
});
