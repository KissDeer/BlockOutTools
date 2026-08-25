import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  actorSnapshotToLayoutLevel,
  buildImportPlan,
  createBlockPaletteLevel,
} from "../src/integrations/ue/bridge-converter.js";

const projectConfig = {
  projectName: "MYMY",
  actorFolder: "BlockOutToolsBridge",
  actorTag: "BlockOutToolsBridge",
  defaults: {
    blockHeightCm: 100,
    wallHeightCm: 280,
    layerMergeToleranceCm: 0.1,
  },
};

const parametricSchema = JSON.parse(
  await readFile(new URL("../config/ue-parametric-blocks.json", import.meta.url), "utf8"),
);

const mapping = {
  fallbacks: {
    rect: "cube-corner",
    circle: "sphere",
    wall: "cube-center",
    stairsRamp: "cube-corner",
    stairsSteps: "cube-corner",
  },
  assets: [
    { id: "cube-corner", assetPath: "/Game/CubeCorner", webType: "rect", category: "box" },
    { id: "cube-center", assetPath: "/Game/CubeCenter", webType: "rect", category: "box" },
    { id: "sphere", assetPath: "/Game/Sphere", webType: "circle", category: "sphere" },
  ],
};

const catalog = {
  assets: [
    {
      path: "/Game/CubeCorner",
      bounds_min: [0, 0, 0],
      bounds_max: [100, 100, 100],
    },
    {
      path: "/Game/CubeCenter",
      bounds_min: [-50, -50, -50],
      bounds_max: [50, 50, 50],
    },
    {
      path: "/Game/Sphere",
      bounds_min: [-50, -50, -50],
      bounds_max: [50, 50, 50],
    },
  ],
};

function baseLevel(shapes) {
  return {
    name: "Bridge Test",
    shapes,
    entities: [],
    layers: [{ id: "base", name: "Base", height: 0, visible: true }],
  };
}

test("converts LayoutTools coordinates and bottom-corner pivot to a UE actor plan", () => {
  const level = baseLevel([{
    id: "rect-1",
    type: "rect",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    layerId: "base",
  }]);

  const plan = buildImportPlan(level, mapping, catalog, projectConfig, parametricSchema);
  assert.equal(plan.actorCount, 1);
  assert.deepEqual(plan.actors[0].scale3d, [2, 1, 1]);
  assert.deepEqual(plan.actors[0].location, [0, -100, 0]);
  assert.deepEqual(plan.actors[0].rotation, [0, 0, 0]);
});

test("compensates a centered sphere pivot and round-trips the web footprint", () => {
  const level = baseLevel([{
    id: "sphere-1",
    type: "circle",
    x: 200,
    y: 300,
    radius: 50,
    rotation: 30,
    layerId: "base",
    ueBlockout: { assetId: "sphere", heightCm: 100 },
  }]);

  const plan = buildImportPlan(level, mapping, catalog, projectConfig, parametricSchema);
  assert.deepEqual(plan.actors[0].location, [200, -300, 50]);
  assert.deepEqual(plan.actors[0].rotation, [0, -30, 0]);

  const exported = actorSnapshotToLayoutLevel({ actors: [{
    ...plan.actors[0],
    path: "/Game/Test.Sphere_1",
  }] }, mapping, catalog, projectConfig, parametricSchema);
  assert.equal(exported.level.shapes.length, 1);
  assert.equal(exported.level.shapes[0].x, 200);
  assert.equal(exported.level.shapes[0].y, 300);
  assert.equal(exported.level.shapes[0].radius, 50);
  assert.equal(exported.level.shapes[0].rotation, 30);
  assert.equal(exported.level.shapes[0].ueBlockout.assetId, "sphere");
});

test("decomposes a legacy wall centerline into scoped UE box actors", () => {
  const level = baseLevel([{
    id: "wall-1",
    type: "path",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    layerId: "base",
    wallThickness: 20,
    wallHeight: 300,
    wallCenterline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
  }]);

  const plan = buildImportPlan(level, mapping, catalog, projectConfig, parametricSchema);
  assert.equal(plan.actorCount, 2);
  assert.deepEqual(plan.actors.map((actor) => actor.desiredSizeCm), [
    [100, 20, 300],
    [100, 20, 300],
  ]);
  assert.deepEqual(plan.actors.map((actor) => actor.rotation[1]), [0, -90]);
});

test("applies the LayoutTools export scale to UE transforms and static geometry", () => {
  const level = baseLevel([{
    id: "rect-scaled",
    type: "rect",
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    rotation: 0,
    layerId: "base",
  }]);
  level.layers[0].height = 30;
  level.exportScale = { unitsPerPixel: 50, unit: "uu" };

  const plan = buildImportPlan(level, mapping, catalog, projectConfig, parametricSchema);
  assert.deepEqual(plan.unitConversion, {
    sourceUnitsPerCentimeter: 50,
    sourceUnit: "uu",
    unrealCentimetersPerLayoutCentimeter: 50,
  });
  assert.deepEqual(plan.actors[0].desiredSizeCm, [10000, 5000, 5000]);
  assert.deepEqual(plan.actors[0].scale3d, [100, 50, 50]);
  assert.deepEqual(plan.actors[0].location, [500, -6000, 1500]);
});

test("scales only centimeter-valued parametric properties", () => {
  const level = baseLevel([{
    id: "stairs-scaled",
    type: "rect",
    x: 100,
    y: 200,
    width: 100,
    height: 200,
    rotation: 15,
    layerId: "base",
    ueBlockout: {
      kind: "parametric",
      blockType: "stairs-linear",
      parameters: {
        StairsSize: [100, 200, 300],
        NumberOfSteps: 12,
        StairsType: "SLOPED",
        blockout_material_grid_size: 200,
      },
    },
  }]);
  level.exportScale = { unitsPerPixel: 2, unit: "m" };

  const plan = buildImportPlan(level, mapping, catalog, projectConfig, parametricSchema);
  assert.equal(plan.unitConversion.unrealCentimetersPerLayoutCentimeter, 200);
  assert.deepEqual(plan.actors[0].location, [30000, -60000, 0]);
  assert.deepEqual(plan.actors[0].parameters.StairsSize, [20000, 40000, 60000]);
  assert.equal(plan.actors[0].parameters.blockout_material_grid_size, 40000);
  assert.equal(plan.actors[0].parameters.NumberOfSteps, 12);
  assert.equal(plan.actors[0].parameters.StairsType, "SLOPED");
});

test("creates one web palette shape for every parametric Blueprint tool", () => {
  const palette = createBlockPaletteLevel(mapping, catalog, projectConfig, parametricSchema);
  assert.equal(palette.level.shapes.length, 15);
  assert.deepEqual(
    palette.level.shapes.map((shape) => shape.ueBlockout.blockType),
    parametricSchema.blocks.map((entry) => entry.id),
  );
});

test("builds and round-trips a parameterized Blueprint actor plan", () => {
  const level = baseLevel([{
    id: "door-1",
    type: "rect",
    x: 100,
    y: 200,
    width: 60,
    height: 380,
    rotation: 15,
    layerId: "base",
    ueBlockout: {
      kind: "parametric",
      blockType: "doorway",
      parameters: { DoorwaySize: [60, 220, 260], SideThickness: 80, TopThickness: 40 },
    },
  }]);

  const plan = buildImportPlan(level, mapping, catalog, projectConfig, parametricSchema);
  assert.equal(plan.actorCount, 1);
  assert.equal(plan.actors[0].actorKind, "parametric");
  assert.equal(plan.actors[0].blockType, "doorway");
  assert.deepEqual(plan.actors[0].parameters.DoorwaySize, [60, 220, 260]);
  assert.match(plan.actors[0].blueprintClassPath, /Blockout_Doorway_C$/);

  const exported = actorSnapshotToLayoutLevel({ actors: [{
    ...plan.actors[0],
    path: "/Game/Test.Blockout_Doorway_C_1",
  }] }, mapping, catalog, projectConfig, parametricSchema);
  assert.equal(exported.level.shapes[0].ueBlockout.blockType, "doorway");
  assert.deepEqual(exported.level.shapes[0].ueBlockout.parameters.DoorwaySize, [60, 220, 260]);
  assert.equal(exported.level.shapes[0].height, 380);
});
