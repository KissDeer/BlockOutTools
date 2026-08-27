import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPlacedBlock,
  createUnifiedBlockCatalog,
} from "../src/integrations/layout/block-catalog.js";
import { createModuleFromLayer } from "../src/integrations/layout/structure-module-model.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "layouts/lothric-high-wall-layout-v2.json");
const schema = JSON.parse(await readFile(resolve(ROOT, "config/ue-parametric-blocks.json"), "utf8"));
const catalog = createUnifiedBlockCatalog(schema);
const blocks = new Map(catalog.map((block) => [block.id, block]));

const COLORS = Object.freeze({
  lowest: "#AEBECB",
  low: "#AEBE9F",
  middle: "#C9B879",
  high: "#AD9B88",
  stair: "#8D8D88",
  wall: "#111312",
});

const FLOOR_THICKNESS = 30;
const WALL_THICKNESS = 52;
const WALL_HEIGHT = 420;
const MAX_WALL_SEGMENT = 180;
const WALL_OVERLAP = 8;

const LAYERS = Object.freeze([
  { id: "height-000", name: "最低平台 0cm", height: 0, color: COLORS.lowest },
  { id: "height-180", name: "低平台 180cm", height: 180, color: COLORS.low },
  { id: "height-360", name: "中平台 360cm", height: 360, color: COLORS.middle },
  { id: "height-540", name: "高平台 540cm", height: 540, color: COLORS.high },
].map((layer) => ({ ...layer, visible: true, locked: false, showWalls: true })));

const layerById = new Map(LAYERS.map((layer) => [layer.id, layer]));
const shapes = [];
const stairSpecs = [];
let serial = 0;

function colorVector(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).concat(1);
}

function nextId(prefix) {
  serial += 1;
  return `${prefix}-${String(serial).padStart(4, "0")}`;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function addParametric(blockId, center, layerId, parameters, options = {}) {
  const block = blocks.get(`ue-${blockId}`);
  if (!block) throw new Error(`Unknown parametric block: ${blockId}`);
  const placed = createPlacedBlock(block, center, layerId, parameters).item;
  placed.id = nextId(blockId);
  placed.rotation = normalizeDegrees(options.rotation ?? 0);
  placed.opacity = options.opacity ?? 0.86;
  placed.name = options.name;
  placed.color = options.color ?? placed.color;
  shapes.push(placed);
  return placed;
}

function addBox(name, center, size, layerId, color, options = {}) {
  return addParametric("box", center, layerId, {
    BoxSize: size,
    blockout_material_color: colorVector(color),
    blockout_material_top_color: colorVector(options.topColor ?? color),
    blockout_material_use_grid: options.useGrid ?? false,
    blockout_world_aligned: true,
  }, {
    name,
    color,
    opacity: options.opacity,
    rotation: options.rotation,
  });
}

function addFloorBox(name, center, size, layerId, color, rotation = 0) {
  const floor = addBox(name, center, [size[0], size[1], FLOOR_THICKNESS], layerId, color, {
    rotation,
    opacity: 0.9,
  });
  floor.layoutRole = "floor";
  return floor;
}

function addCylinder(name, center, radius, layerId, color) {
  const floor = addParametric("cylinder", center, layerId, {
    CylinderRadius: radius,
    CylinderHeight: FLOOR_THICKNESS,
    CylinderQuality: 3,
    blockout_material_color: colorVector(color),
    blockout_material_top_color: colorVector(color),
    blockout_material_use_grid: false,
    blockout_world_aligned: true,
  }, { name, color, opacity: 0.9 });
  floor.layoutRole = "floor";
  return floor;
}

function addWallSegment(name, start, end, layerId, options = {}) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return [];
  const segmentCount = Math.max(1, Math.ceil(length / (options.maxLength ?? MAX_WALL_SEGMENT)));
  const segmentLength = length / segmentCount;
  const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
  const result = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const ratio = (index + 0.5) / segmentCount;
    const wall = addBox(
      `${name} ${index + 1}`,
      { x: start.x + dx * ratio, y: start.y + dy * ratio },
      [segmentLength + (segmentCount > 1 ? WALL_OVERLAP : 0), options.thickness ?? WALL_THICKNESS, options.height ?? WALL_HEIGHT],
      layerId,
      COLORS.wall,
      { rotation, opacity: 1, useGrid: false },
    );
    wall.layoutRole = "wall";
    result.push(wall);
  }
  return result;
}

function angularDistance(left, right) {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

function addCircularWall(name, center, radius, layerId, openings = [], options = {}) {
  const segmentCount = options.segments ?? 32;
  const openingHalfAngle = options.openingHalfAngle ?? 13;
  const pointAt = (angle) => {
    const radians = angle * Math.PI / 180;
    return { x: center.x + Math.cos(radians) * radius, y: center.y + Math.sin(radians) * radius };
  };

  for (let index = 0; index < segmentCount; index += 1) {
    const startAngle = index * 360 / segmentCount;
    const endAngle = (index + 1) * 360 / segmentCount;
    const middleAngle = (startAngle + endAngle) / 2;
    if (openings.some((angle) => angularDistance(middleAngle, angle) <= openingHalfAngle)) continue;
    addWallSegment(`${name} ${index + 1}`, pointAt(startAngle), pointAt(endAngle), layerId, options);
  }
}

function addButtress(name, center, layerId, rotation = 0) {
  const buttress = addBox(name, center, [86, 86, WALL_HEIGHT + 90], layerId, COLORS.wall, {
    rotation,
    opacity: 1,
    useGrid: false,
  });
  buttress.layoutRole = "wall";
}

function addStairConnection(name, lowAnchor, highAnchor, width, fromLayerId, toLayerId) {
  const from = layerById.get(fromLayerId);
  const to = layerById.get(toLayerId);
  if (!from || !to || to.height <= from.height) throw new Error(`Invalid stair layers for ${name}.`);

  const rise = to.height - from.height;
  const steps = Math.ceil(rise / 18);
  const overlap = 20;
  const dx = highAnchor.x - lowAnchor.x;
  const dy = highAnchor.y - lowAnchor.y;
  const landingDistance = Math.hypot(dx, dy);
  const depth = landingDistance + overlap * 2;
  const stepRise = rise / steps;
  const stepDepth = depth / steps;
  const slope = Math.atan2(rise, depth) * 180 / Math.PI;
  const direction = Math.atan2(dy, dx) * 180 / Math.PI;

  if (stepRise > 18.01 || stepDepth < 28 || stepDepth > 34 || slope > 33) {
    throw new Error(`${name} is not walkable: ${stepRise.toFixed(1)}cm rise, ${stepDepth.toFixed(1)}cm tread, ${slope.toFixed(1)}deg slope.`);
  }

  const stair = addParametric("stairs-linear", {
    x: (lowAnchor.x + highAnchor.x) / 2,
    y: (lowAnchor.y + highAnchor.y) / 2,
  }, fromLayerId, {
    StairsSize: [width, depth, rise],
    NumberOfSteps: steps,
    StairsType: "CLOSED",
    blockout_material_color: colorVector(COLORS.stair),
    blockout_material_top_color: colorVector(COLORS.stair),
    blockout_material_use_grid: false,
  }, {
    name,
    color: COLORS.stair,
    opacity: 1,
    rotation: direction - 90,
  });

  Object.assign(stair, {
    layoutRole: "stair",
    isStairs: true,
    stairsType: "straight",
    stairsMode: "steps",
    stairsDirection: "vertical",
    stairsTargetLayerId: toLayerId,
    stairsCount: steps,
    floorCutMode: "none",
    connectionSpec: {
      lowAnchor,
      highAnchor,
      overlap,
      rise,
      run: depth,
      stepRise: Number(stepRise.toFixed(2)),
      stepDepth: Number(stepDepth.toFixed(2)),
      slopeDegrees: Number(slope.toFixed(2)),
    },
  });
  stairSpecs.push({
    name,
    fromLayerId,
    toLayerId,
    lowAnchor,
    highAnchor,
    rise,
    depth,
    steps,
    stepRise,
    stepDepth,
    slope,
  });
  return stair;
}

function pointInsideFloor(point, floor) {
  if (floor.type === "circle") {
    return Math.hypot(point.x - floor.x, point.y - floor.y) <= floor.radius + 0.01;
  }
  const centerX = floor.x + floor.width / 2;
  const centerY = floor.y + floor.height / 2;
  const radians = -normalizeDegrees(floor.rotation) * Math.PI / 180;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
  return Math.abs(localX) <= floor.width / 2 + 0.01 && Math.abs(localY) <= floor.height / 2 + 0.01;
}

function anchorHasFloor(point, layerId) {
  return shapes.some((shape) => (
    shape.layoutRole === "floor"
    && shape.layerId === layerId
    && pointInsideFloor(point, shape)
  ));
}

// Lowest layer: the long battlement spine and its three blue tower platforms.
addCylinder("西侧圆塔平台", { x: 400, y: 0 }, 320, "height-000", COLORS.lowest);
addFloorBox("西段城墙通道", { x: 1050, y: 0 }, [980, 260], "height-000", COLORS.lowest);
addFloorBox("中央背部通道", { x: 1800, y: 0 }, [650, 260], "height-000", COLORS.lowest);
addFloorBox("东段城墙通道", { x: 2660, y: 0 }, [1460, 260], "height-000", COLORS.lowest);
addCylinder("东侧圆塔平台", { x: 3550, y: 0 }, 330, "height-000", COLORS.lowest);
addFloorBox("北塔连接廊", { x: 2200, y: -360 }, [260, 560], "height-000", COLORS.lowest);
addFloorBox("北侧横向露台", { x: 2500, y: -430 }, [620, 220], "height-000", COLORS.lowest);
addCylinder("北侧圆塔平台", { x: 2200, y: -820 }, 205, "height-000", COLORS.lowest);

// Low layer: the central rotunda and the east tower's lower landing block.
addCylinder("中央低层圆形庭院", { x: 1800, y: 80 }, 320, "height-180", COLORS.low);
addFloorBox("东塔低层北登陆台", { x: 3550, y: 500 }, [360, 300], "height-180", COLORS.low);
addFloorBox("东塔低层连接庭院", { x: 3550, y: 700 }, [470, 360], "height-180", COLORS.low);

// Middle layer: overlapping boxes preserve the irregular southern court without floor gaps.
addFloorBox("中央中层北登陆台", { x: 1800, y: 525 }, [390, 330], "height-360", COLORS.middle);
addFloorBox("中央中层斜向庭院", { x: 1700, y: 790 }, [520, 450], "height-360", COLORS.middle, 8);
addFloorBox("中央中层南登陆台", { x: 1620, y: 1030 }, [330, 300], "height-360", COLORS.middle, 10);

// High layer: large tower roofs reached from the two lower courtyards.
addCylinder("中央高层多边形塔台", { x: 1550, y: 1450 }, 310, "height-540", COLORS.high);
addCylinder("东侧高层圆塔平台", { x: 3550, y: 1530 }, 320, "height-540", COLORS.high);

// Stairs are solved from height first. Every flight lands 20cm inside both adjoining floors.
addStairConnection("西廊至中央低层庭院", { x: 1430, y: -60 }, { x: 1620, y: 130 }, 160, "height-000", "height-180");
addStairConnection("中央低层至中层庭院", { x: 1800, y: 380 }, { x: 1800, y: 640 }, 170, "height-180", "height-360");
addStairConnection("中央中层至高层塔台", { x: 1620, y: 1050 }, { x: 1580, y: 1310 }, 170, "height-360", "height-540");
addStairConnection("东侧最低层至低层庭院", { x: 3550, y: 300 }, { x: 3550, y: 560 }, 170, "height-000", "height-180");
addStairConnection("东侧低层庭院至高层塔台", { x: 3550, y: 720 }, { x: 3550, y: 1300 }, 180, "height-180", "height-540");

// Short Box walls and edging. Openings align with corridors and stair landings.
addCircularWall("西侧圆塔外墙", { x: 400, y: 0 }, 320, "height-000", [0], { height: 500 });
addCircularWall("东侧圆塔外墙", { x: 3550, y: 0 }, 330, "height-000", [90, 180], { height: 500 });
addCircularWall("北侧圆塔外墙", { x: 2200, y: -820 }, 205, "height-000", [90], { height: 500, segments: 24 });
addCircularWall("中央低层庭院包边", { x: 1800, y: 80 }, 320, "height-180", [90, 155], { height: 360 });
addCircularWall("中央高层塔台外墙", { x: 1550, y: 1450 }, 310, "height-540", [278], { height: 500 });
addCircularWall("东侧高层塔台外墙", { x: 3550, y: 1530 }, 320, "height-540", [270], { height: 500 });

addWallSegment("西段通道北墙", { x: 700, y: -130 }, { x: 1320, y: -130 }, "height-000");
addWallSegment("西段通道南墙", { x: 700, y: 130 }, { x: 1500, y: 130 }, "height-000");
addWallSegment("东段通道北墙", { x: 2330, y: -130 }, { x: 3240, y: -130 }, "height-000");
addWallSegment("东段通道南墙", { x: 2100, y: 130 }, { x: 3230, y: 130 }, "height-000");
addWallSegment("北连接廊西墙", { x: 2070, y: -620 }, { x: 2070, y: -180 }, "height-000");
addWallSegment("北连接廊东墙", { x: 2330, y: -620 }, { x: 2330, y: -540 }, "height-000");
addWallSegment("北露台北墙", { x: 2330, y: -540 }, { x: 2810, y: -540 }, "height-000");
addWallSegment("北露台南墙", { x: 2330, y: -320 }, { x: 2810, y: -320 }, "height-000");
addWallSegment("北露台东墙", { x: 2810, y: -540 }, { x: 2810, y: -320 }, "height-000");

// Central middle court perimeter, with deliberate gaps at the north and south stair mouths.
addWallSegment("中层庭院西北墙", { x: 1590, y: 390 }, { x: 1510, y: 720 }, "height-360", { height: 380 });
addWallSegment("中层庭院西南墙", { x: 1510, y: 720 }, { x: 1450, y: 1070 }, "height-360", { height: 380 });
addWallSegment("中层庭院东墙", { x: 1960, y: 620 }, { x: 1870, y: 1040 }, "height-360", { height: 380 });
addWallSegment("中层庭院南西包边", { x: 1450, y: 1070 }, { x: 1510, y: 1160 }, "height-360", { height: 380 });
addWallSegment("中层庭院南东包边", { x: 1730, y: 1160 }, { x: 1870, y: 1040 }, "height-360", { height: 380 });

// East low court perimeter, open at both stair mouths.
addWallSegment("东塔低层庭院西墙", { x: 3315, y: 480 }, { x: 3315, y: 820 }, "height-180", { height: 380 });
addWallSegment("东塔低层庭院东墙", { x: 3785, y: 480 }, { x: 3785, y: 820 }, "height-180", { height: 380 });
addWallSegment("东塔低层庭院南西包边", { x: 3315, y: 820 }, { x: 3455, y: 880 }, "height-180", { height: 380 });
addWallSegment("东塔低层庭院南东包边", { x: 3645, y: 880 }, { x: 3785, y: 820 }, "height-180", { height: 380 });

// Sparse buttresses reproduce the High Wall rhythm without obstructing walkable surfaces.
[
  [900, -185], [1180, -185], [900, 185], [1180, 185],
  [2500, -185], [2800, -185], [2500, 185], [2800, 185],
].forEach(([x, y], index) => addButtress(`主通道扶壁 ${index + 1}`, { x, y }, "height-000"));

let layout = {
  name: "洛斯里克高墙_四级平台_改进版",
  gridSize: 50,
  showDimensions: false,
  rotationStep: 15,
  shapes,
  entities: [],
  layers: LAYERS,
  layerGroups: [],
  groups: [],
  doorColorConfigs: [],
  windowColorConfigs: [],
  polygonData: [],
};

// Publish each height band as a reusable module so the default infinite canvas can preview the whole layout.
for (const layer of LAYERS) {
  layout = createModuleFromLayer(layout, layer.id, {
    moduleId: `module-${layer.id}`,
    instanceId: `instance-${layer.id}`,
    name: layer.name,
    instanceName: layer.name,
  }).level;
}

for (const spec of stairSpecs) {
  if (spec.stepRise > 18.01 || spec.stepDepth < 28 || spec.stepDepth > 34 || spec.slope > 33) {
    throw new Error(`Invalid stair specification: ${spec.name}`);
  }
  if (!anchorHasFloor(spec.lowAnchor, spec.fromLayerId)) {
    throw new Error(`${spec.name} has no floor beneath its low landing.`);
  }
  if (!anchorHasFloor(spec.highAnchor, spec.toLayerId)) {
    throw new Error(`${spec.name} has no floor beneath its high landing.`);
  }
}

const wallBoxes = shapes.filter((shape) => shape.layoutRole === "wall");
const longestWall = wallBoxes.reduce((longest, shape) => {
  const length = shape.ueBlockout?.parameters?.BoxSize?.[0] ?? 0;
  return length > longest.length ? { name: shape.name, length } : longest;
}, { name: "", length: 0 });
const maximumWallLength = longestWall.length;
if (maximumWallLength > MAX_WALL_SEGMENT + WALL_OVERLAP + 0.01) {
  throw new Error(`${longestWall.name} is ${maximumWallLength.toFixed(1)}cm and exceeds the ${MAX_WALL_SEGMENT}cm design limit.`);
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
console.log(`Generated ${OUTPUT}`);
console.log(`Shapes: ${shapes.length}; walls/edging: ${wallBoxes.length}; stairs: ${stairSpecs.length}`);
for (const spec of stairSpecs) {
  console.log(`${spec.name}: ${spec.steps} steps, ${spec.stepRise.toFixed(1)}cm rise, ${spec.stepDepth.toFixed(1)}cm tread, ${spec.slope.toFixed(1)}deg`);
}
