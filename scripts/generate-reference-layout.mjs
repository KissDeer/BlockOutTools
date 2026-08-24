import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPlacedBlock,
  createUnifiedBlockCatalog,
} from "../src/integrations/layout/block-catalog.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "layouts/reference-multilevel-layout.json");
const schema = JSON.parse(await readFile(resolve(ROOT, "config/ue-parametric-blocks.json"), "utf8"));
const catalog = createUnifiedBlockCatalog(schema);
const blocks = new Map(catalog.map((block) => [block.id, block]));

const COLORS = Object.freeze({
  lowest: "#B8C3CC",
  low: "#B8BFB2",
  middle: "#C8C0A9",
  high: "#B8AEA3",
  stair: "#777777",
  wall: "#171717",
});

const LAYERS = Object.freeze([
  { id: "height-000", name: "最低平台 0cm", height: 0, color: COLORS.lowest },
  { id: "height-100", name: "低平台 100cm", height: 100, color: COLORS.low },
  { id: "height-200", name: "中平台 200cm", height: 200, color: COLORS.middle },
  { id: "height-300", name: "高平台 300cm", height: 300, color: COLORS.high },
].map((layer) => ({ ...layer, visible: true, locked: false, showWalls: true })));

const layerById = new Map(LAYERS.map((layer) => [layer.id, layer]));
const shapes = [];
let serial = 0;

function colorVector(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).concat(1);
}

function nextId(prefix) {
  serial += 1;
  return `${prefix}-${String(serial).padStart(3, "0")}`;
}

function addParametric(blockId, center, layerId, parameters, options = {}) {
  const block = blocks.get(`ue-${blockId}`);
  if (!block) throw new Error(`Unknown parametric block: ${blockId}`);
  const placed = createPlacedBlock(block, center, layerId, parameters).item;
  placed.id = nextId(blockId);
  placed.rotation = options.rotation ?? 0;
  placed.opacity = options.opacity ?? 0.82;
  placed.name = options.name;
  placed.color = options.color ?? placed.color;
  shapes.push(placed);
  return placed;
}

function addBox(name, center, size, layerId, color) {
  return addParametric("box", center, layerId, {
    BoxSize: size,
    blockout_material_color: colorVector(color),
    blockout_material_top_color: colorVector(color),
    blockout_material_use_grid: true,
    blockout_world_aligned: true,
  }, { name, color });
}

function addCylinder(name, center, radius, layerId, color) {
  return addParametric("cylinder", center, layerId, {
    CylinderRadius: radius,
    CylinderHeight: 10,
    CylinderQuality: 3,
    blockout_material_color: colorVector(color),
    blockout_material_top_color: colorVector(color),
    blockout_material_use_grid: true,
    blockout_world_aligned: true,
  }, { name, color });
}

function addStairs(name, center, width, depth, fromLayerId, toLayerId, rotation = 0) {
  const from = layerById.get(fromLayerId);
  const to = layerById.get(toLayerId);
  const rise = Math.abs(to.height - from.height);
  const stair = addParametric("stairs-linear", center, fromLayerId, {
    StairsSize: [width, depth, rise],
    NumberOfSteps: Math.max(5, Math.round(rise / 10)),
    StairsType: "CLOSED",
    blockout_material_color: colorVector(COLORS.stair),
    blockout_material_top_color: colorVector(COLORS.stair),
    blockout_material_use_grid: false,
  }, { name, color: COLORS.stair, opacity: 1, rotation });

  Object.assign(stair, {
    isStairs: true,
    stairsType: "straight",
    stairsMode: "steps",
    stairsDirection: "vertical",
    stairsTargetLayerId: toLayerId,
    stairsCount: stair.ueBlockout.parameters.NumberOfSteps,
    floorCutMode: "none",
  });
  return stair;
}

function addWallSegment(name, start, end, layerId, height = 220, thickness = 24) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const offsetX = (-dy / length) * (thickness / 2);
  const offsetY = (dx / length) * (thickness / 2);
  const outline = [
    { x: start.x + offsetX, y: start.y + offsetY },
    { x: start.x - offsetX, y: start.y - offsetY },
    { x: end.x - offsetX, y: end.y - offsetY },
    { x: end.x + offsetX, y: end.y + offsetY },
  ];
  const minX = Math.min(...outline.map((point) => point.x));
  const minY = Math.min(...outline.map((point) => point.y));
  const maxX = Math.max(...outline.map((point) => point.x));
  const maxY = Math.max(...outline.map((point) => point.y));
  const pathData = `${outline.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`
  )).join(" ")} Z`;
  const wall = {
    id: nextId("wall"),
    name,
    type: "path",
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, thickness),
    height: Math.max(maxY - minY, thickness),
    rotation: 0,
    color: COLORS.wall,
    opacity: 1,
    area: length * thickness,
    layerId,
    pathData,
    wallThickness: thickness,
    wallHeight: height,
    wallCenterline: [start, end],
    strokeColor: "rgba(23,23,23,1)",
    strokeWidth: thickness,
  };
  shapes.push(wall);
  return wall;
}

function angularDistance(a, b) {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

function addCircularWall(name, center, radius, layerId, openings = [], segments = 20) {
  for (let index = 0; index < segments; index += 1) {
    const startAngle = (index / segments) * 360;
    const endAngle = ((index + 1) / segments) * 360;
    const middleAngle = (startAngle + endAngle) / 2;
    if (openings.some((opening) => angularDistance(middleAngle, opening) < 16)) continue;
    const point = (angle) => {
      const radians = (angle * Math.PI) / 180;
      return {
        x: Math.round(center.x + Math.cos(radians) * radius),
        y: Math.round(center.y + Math.sin(radians) * radius),
      };
    };
    addWallSegment(`${name} ${index + 1}`, point(startAngle), point(endAngle), layerId);
  }
}

// Lowest platforms and the continuous east-west spine.
addCylinder("西侧最低圆形平台", { x: 220, y: 500 }, 215, "height-000", COLORS.lowest);
addBox("西侧连接走廊", { x: 520, y: 500 }, [380, 180, 10], "height-000", COLORS.lowest);
addBox("东侧主走廊", { x: 1450, y: 500 }, [760, 180, 10], "height-000", COLORS.lowest);
addCylinder("东侧最低圆形平台", { x: 1990, y: 500 }, 220, "height-000", COLORS.lowest);
addBox("北侧连接走廊", { x: 1120, y: 300 }, [180, 260, 10], "height-000", COLORS.lowest);
addBox("北侧横向平台", { x: 1280, y: 270 }, [360, 160, 10], "height-000", COLORS.lowest);
addCylinder("北侧最低圆形平台", { x: 1120, y: 80 }, 150, "height-000", COLORS.lowest);

// Raised platform groups. Overlaps at landings keep every walkable surface continuous.
addCylinder("中央低圆形平台", { x: 850, y: 500 }, 245, "height-100", COLORS.low);
addBox("中央中层平台", { x: 830, y: 780 }, [300, 300, 10], "height-200", COLORS.middle);
addCylinder("中央高圆形平台", { x: 800, y: 1080 }, 195, "height-300", COLORS.high);
addBox("东侧低层连接台", { x: 1990, y: 750 }, [250, 300, 10], "height-100", COLORS.low);
addCylinder("东侧高圆形平台", { x: 2050, y: 1080 }, 195, "height-300", COLORS.high);

// Every stair overlaps both adjoining platform footprints by at least 20 cm.
addStairs("西侧至中央低平台", { x: 620, y: 500 }, 140, 240, "height-000", "height-100", 90);
addStairs("中央低平台至东侧走廊", { x: 1080, y: 500 }, 140, 240, "height-000", "height-100", -90);
addStairs("中央低平台至中层", { x: 850, y: 690 }, 150, 220, "height-100", "height-200");
addStairs("中央中层至高平台", { x: 815, y: 930 }, 150, 220, "height-200", "height-300");
addStairs("东侧最低平台至低层连接台", { x: 1990, y: 675 }, 150, 190, "height-000", "height-100");
addStairs("东侧低层连接台至高平台", { x: 2020, y: 900 }, 150, 260, "height-100", "height-300");

// Corridor walls. Open ends align with circular-platform and stair openings.
addWallSegment("西走廊北墙", { x: 390, y: 410 }, { x: 620, y: 410 }, "height-000");
addWallSegment("西走廊南墙", { x: 390, y: 590 }, { x: 620, y: 590 }, "height-000");
addWallSegment("东走廊北墙", { x: 1080, y: 410 }, { x: 1780, y: 410 }, "height-000");
addWallSegment("东走廊南墙", { x: 1080, y: 590 }, { x: 1780, y: 590 }, "height-000");
addWallSegment("北支路西墙", { x: 1030, y: 230 }, { x: 1030, y: 400 }, "height-000");
addWallSegment("北支路东墙", { x: 1210, y: 190 }, { x: 1210, y: 400 }, "height-000");
addWallSegment("北横台北墙", { x: 1210, y: 190 }, { x: 1460, y: 190 }, "height-000");
addWallSegment("北横台南墙", { x: 1210, y: 350 }, { x: 1460, y: 350 }, "height-000");
addWallSegment("北横台东墙", { x: 1460, y: 190 }, { x: 1460, y: 350 }, "height-000");
addWallSegment("中央中层西墙", { x: 680, y: 670 }, { x: 680, y: 870 }, "height-200");
addWallSegment("中央中层东墙", { x: 980, y: 670 }, { x: 980, y: 870 }, "height-200");
addWallSegment("东侧连接台西墙", { x: 1865, y: 650 }, { x: 1865, y: 850 }, "height-100");
addWallSegment("东侧连接台东墙", { x: 2115, y: 650 }, { x: 2115, y: 850 }, "height-100");

addCircularWall("西圆墙", { x: 220, y: 500 }, 215, "height-000", [0]);
addCircularWall("中央圆墙", { x: 850, y: 500 }, 245, "height-100", [0, 90, 180]);
addCircularWall("东圆墙", { x: 1990, y: 500 }, 220, "height-000", [90, 180]);
addCircularWall("北圆墙", { x: 1120, y: 80 }, 150, "height-000", [90]);
addCircularWall("中央高台圆墙", { x: 800, y: 1080 }, 195, "height-300", [270]);
addCircularWall("东侧高台圆墙", { x: 2050, y: 1080 }, 195, "height-300", [270]);

const layout = {
  name: "参考图_四级连通平台",
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

const stairShapes = shapes.filter((shape) => shape.isStairs);
for (const stair of stairShapes) {
  const fromHeight = layerById.get(stair.layerId)?.height;
  const toHeight = layerById.get(stair.stairsTargetLayerId)?.height;
  const expectedRise = Math.abs(toHeight - fromHeight);
  if (stair.ueBlockout.parameters.StairsSize[2] !== expectedRise) {
    throw new Error(`Stair ${stair.name} does not match its layer height difference.`);
  }
}

const floorShapes = shapes.filter((shape) => shape.ueBlockout && !shape.isStairs);
if (floorShapes.length !== 12 || stairShapes.length !== 6) {
  throw new Error(`Unexpected platform/stair count: ${floorShapes.length}/${stairShapes.length}`);
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
console.log(`Generated ${OUTPUT}`);
console.log(`Shapes: ${shapes.length}; platforms: ${floorShapes.length}; stairs: ${stairShapes.length}`);
