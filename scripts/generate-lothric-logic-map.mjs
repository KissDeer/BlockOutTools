import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  addModulePort,
  connectModulePorts,
  createEmptyStructureModule,
  materializeModulePortShapes,
  resolveStructureAssemblyGraph,
  structureGraph,
  worldPort,
} from "../src/integrations/layout/structure-module-model.js";
import {
  createPlacedBlock,
  createUnifiedBlockCatalog,
} from "../src/integrations/layout/block-catalog.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUTS = [
  resolve(ROOT, "layouts/lothric-high-wall-logic-map.json"),
  resolve(ROOT, "data/levels/洛斯里克高墙_全图逻辑关系.json"),
];
const schema = JSON.parse(await readFile(resolve(ROOT, "config/ue-parametric-blocks.json"), "utf8"));
const catalog = createUnifiedBlockCatalog(schema);
const blocks = new Map(catalog.map((block) => [block.id, block]));

const COLORS = Object.freeze({
  floor: "#AEB3B7",
  wall: "#111111",
  stair: "#D6B64A",
  door: "#E0C55B",
});
const FLOOR_THICKNESS = 30;
const WALL_THICKNESS = 42;
const WALL_HEIGHT = 420;
const MAX_WALL_LENGTH = 360;
const WALL_OVERLAP = 8;

let serial = 0;
let level = {
  name: "洛斯里克高墙_全图逻辑关系",
  gridSize: 50,
  showDimensions: false,
  rotationStep: 15,
  shapes: [],
  entities: [],
  layers: [],
  layerGroups: [],
  groups: [],
  doorColorConfigs: [],
  windowColorConfigs: [],
  polygonData: [],
};

function nextId(prefix) {
  serial += 1;
  return `${prefix}-${String(serial).padStart(4, "0")}`;
}

function colorVector(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).concat(1);
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function addParametric(builder, blockId, name, center, parameters, options = {}) {
  const block = blocks.get(`ue-${blockId}`);
  if (!block) throw new Error(`Unknown parametric block: ${blockId}`);
  const placed = createPlacedBlock(block, center, builder.layerId, parameters).item;
  placed.id = nextId(blockId);
  placed.name = name;
  placed.rotation = normalizeDegrees(options.rotation ?? 0);
  placed.color = options.color ?? placed.color;
  placed.opacity = options.opacity ?? 0.9;
  if (options.layoutRole) placed.layoutRole = options.layoutRole;
  level.shapes.push(placed);
  return placed;
}

function addBox(builder, name, center, size, color, options = {}) {
  return addParametric(builder, "box", name, center, {
    BoxSize: size,
    blockout_material_color: colorVector(color),
    blockout_material_top_color: colorVector(options.topColor ?? color),
    blockout_material_use_grid: false,
    blockout_world_aligned: true,
  }, { ...options, color });
}

function addFloor(builder, name, center, size, rotation = 0) {
  return addBox(builder, name, center, [size[0], size[1], FLOOR_THICKNESS], COLORS.floor, {
    rotation,
    opacity: 0.92,
    layoutRole: "floor",
  });
}

function addRoundFloor(builder, name, center, radius) {
  return addParametric(builder, "cylinder", name, center, {
    CylinderRadius: radius,
    CylinderHeight: FLOOR_THICKNESS,
    CylinderQuality: 3,
    blockout_material_color: colorVector(COLORS.floor),
    blockout_material_top_color: colorVector(COLORS.floor),
    blockout_material_use_grid: false,
    blockout_world_aligned: true,
  }, { color: COLORS.floor, opacity: 0.92, layoutRole: "floor" });
}

function addWallLine(builder, name, start, end, options = {}) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const segmentCount = Math.max(1, Math.ceil(length / MAX_WALL_LENGTH));
  const segmentLength = length / segmentCount;
  const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
  for (let index = 0; index < segmentCount; index += 1) {
    const ratio = (index + 0.5) / segmentCount;
    addBox(builder, `${name} ${index + 1}`, {
      x: start.x + dx * ratio,
      y: start.y + dy * ratio,
    }, [segmentLength + (segmentCount > 1 ? WALL_OVERLAP : 0), options.thickness ?? WALL_THICKNESS, options.height ?? WALL_HEIGHT], COLORS.wall, {
      rotation,
      opacity: 1,
      layoutRole: "wall",
    });
  }
}

function addRectShell(builder, name, center, size, openSides = []) {
  const [width, depth] = size;
  const left = center.x - width / 2;
  const right = center.x + width / 2;
  const top = center.y - depth / 2;
  const bottom = center.y + depth / 2;
  if (!openSides.includes("north")) addWallLine(builder, `${name} 北墙`, { x: left, y: top }, { x: right, y: top });
  if (!openSides.includes("south")) addWallLine(builder, `${name} 南墙`, { x: left, y: bottom }, { x: right, y: bottom });
  if (!openSides.includes("west")) addWallLine(builder, `${name} 西墙`, { x: left, y: top }, { x: left, y: bottom });
  if (!openSides.includes("east")) addWallLine(builder, `${name} 东墙`, { x: right, y: top }, { x: right, y: bottom });
}

function addRoom(builder, name, center, size, openSides = []) {
  addFloor(builder, `${name} 楼板`, center, size);
  addRectShell(builder, name, center, size, openSides);
}

function addHall(builder, name, start, end, width) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  addFloor(builder, `${name} 楼板`, center, [length, width], rotation);
  const normal = { x: -dy / length * width / 2, y: dx / length * width / 2 };
  addWallLine(builder, `${name} 左墙`, { x: start.x + normal.x, y: start.y + normal.y }, { x: end.x + normal.x, y: end.y + normal.y });
  addWallLine(builder, `${name} 右墙`, { x: start.x - normal.x, y: start.y - normal.y }, { x: end.x - normal.x, y: end.y - normal.y });
}

function angularDistance(left, right) {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

function addRoundRoom(builder, name, center, radius, openings = []) {
  addRoundFloor(builder, `${name} 楼板`, center, radius);
  const segmentCount = 12;
  const pointAt = (angle) => {
    const radians = angle * Math.PI / 180;
    return { x: center.x + Math.cos(radians) * radius, y: center.y + Math.sin(radians) * radius };
  };
  for (let index = 0; index < segmentCount; index += 1) {
    const startAngle = index * 360 / segmentCount;
    const endAngle = (index + 1) * 360 / segmentCount;
    const middleAngle = (startAngle + endAngle) / 2;
    if (openings.some((angle) => angularDistance(middleAngle, angle) < 14)) continue;
    addWallLine(builder, `${name} 圆墙 ${index + 1}`, pointAt(startAngle), pointAt(endAngle));
  }
}

function addStairs(builder, name, center, width, depth, height, rotation = 0) {
  const steps = Math.max(4, Math.ceil(height / 18));
  return addParametric(builder, "stairs-linear", name, center, {
    StairsSize: [width, depth, height],
    NumberOfSteps: steps,
    StairsType: "BOX",
    blockout_material_color: colorVector(COLORS.stair),
    blockout_material_top_color: colorVector(COLORS.stair),
    blockout_material_use_grid: false,
    blockout_world_aligned: true,
  }, { rotation, color: COLORS.stair, opacity: 1, layoutRole: "stair" });
}

function addDoor(builder, name, center, rotation = 0) {
  return addParametric(builder, "doorway", name, center, {
    DoorwaySize: [50, 150, 260],
    TopThickness: 45,
    SideThickness: 35,
    blockout_material_color: colorVector(COLORS.door),
    blockout_material_top_color: colorVector(COLORS.door),
    blockout_material_use_grid: false,
    blockout_world_aligned: true,
  }, { rotation, color: COLORS.door, opacity: 1, layoutRole: "door" });
}

function buildExterior(builder) {
  addRoundRoom(builder, "左侧塔中层", { x: -1100, y: 0 }, 320, [0]);
  addHall(builder, "高墙西段", { x: -780, y: 0 }, { x: 850, y: 0 }, 260);
  addRoundRoom(builder, "右侧废塔", { x: 1120, y: 0 }, 300, [180]);
  addRoundRoom(builder, "出生塔", { x: -180, y: 650 }, 270, [270]);
  addHall(builder, "出生塔连接廊", { x: -180, y: 380 }, { x: -180, y: 130 }, 190);
  addRoundRoom(builder, "A连接塔", { x: 650, y: -350 }, 180, [90]);
  addHall(builder, "A连接短廊", { x: 650, y: -170 }, { x: 650, y: -40 }, 150);
  addStairs(builder, "出生塔内部楼梯", { x: -180, y: 500 }, 170, 340, 300, 180);
  addStairs(builder, "左侧塔内部短梯", { x: -980, y: 30 }, 150, 260, 180, 90);
  addDoor(builder, "西段通道门", { x: -780, y: 0 });
  addDoor(builder, "右侧废塔门", { x: 840, y: 0 });
}

function buildFireDragon(builder) {
  addRoundRoom(builder, "宝箱密室", { x: -650, y: -80 }, 280, [0]);
  addHall(builder, "火龙区斜坡通道", { x: -370, y: -60 }, { x: 0, y: 120 }, 250);
  addRoom(builder, "火龙区主平台", { x: 250, y: 120 }, [720, 520], ["west", "east", "south"]);
  addHall(builder, "左侧塔顶南廊", { x: 250, y: 380 }, { x: 250, y: 690 }, 210);
  addRoom(builder, "左侧塔顶", { x: 250, y: 760 }, [470, 320], ["north"]);
  addStairs(builder, "宝箱密室内部楼梯", { x: -520, y: -80 }, 150, 300, 240, 90);
  addStairs(builder, "火龙区至塔顶楼梯", { x: 250, y: 520 }, 170, 300, 300, 90);
  addDoor(builder, "宝箱密室门", { x: -380, y: -60 });
  addDoor(builder, "左侧塔顶门", { x: 250, y: 610 }, 90);
}

function buildLeftBottom(builder) {
  addRoom(builder, "左侧塔底层", { x: 0, y: 0 }, [360, 620], ["north"]);
  addStairs(builder, "左侧塔底层内部楼梯", { x: 0, y: 80 }, 150, 360, 300, 180);
  addDoor(builder, "左侧塔底层出口", { x: 0, y: -300 }, 90);
}

function buildEdgeThird(builder) {
  addRoundRoom(builder, "边塔第三层", { x: 0, y: 0 }, 340, [90, 270]);
  addHall(builder, "第三层南连接", { x: 0, y: 340 }, { x: 0, y: 620 }, 190);
  addStairs(builder, "边塔第三层环形内梯", { x: 80, y: -20 }, 160, 360, 300, 35);
  addDoor(builder, "第三层北门", { x: 0, y: -325 }, 90);
  addDoor(builder, "第三层南门", { x: 0, y: 610 }, 90);
}

function buildEdgeTop(builder) {
  addRoundRoom(builder, "边塔塔顶", { x: 0, y: 0 }, 300, [90]);
  addStairs(builder, "边塔塔顶收口楼梯", { x: 120, y: 0 }, 150, 300, 300, 20);
  addDoor(builder, "边塔塔顶入口", { x: 0, y: 285 }, 90);
}

function buildEdgeSecondRoof(builder) {
  addRoundRoom(builder, "边塔第二层", { x: -420, y: 0 }, 330, [0]);
  addHall(builder, "边塔至屋顶连廊", { x: -90, y: 0 }, { x: 350, y: 0 }, 230);
  addRoom(builder, "屋顶", { x: 720, y: 0 }, [740, 520], ["west"]);
  addStairs(builder, "边塔第二层内部楼梯", { x: -350, y: 30 }, 160, 360, 300, 30);
  addStairs(builder, "屋顶内部短梯", { x: 650, y: 80 }, 180, 320, 180, 90);
  addDoor(builder, "屋顶西门", { x: 350, y: 0 });
  addDoor(builder, "屋顶J门", { x: 1020, y: 190 }, 90);
}

function buildJailTavernTop(builder) {
  addRoundRoom(builder, "边塔底层监牢", { x: -420, y: 0 }, 300, [0]);
  addHall(builder, "底层监牢通道", { x: -120, y: 0 }, { x: 300, y: 0 }, 230);
  addRoom(builder, "监牢主室", { x: 430, y: 0 }, [420, 420], ["west", "north"]);
  addHall(builder, "酒馆上行廊", { x: 430, y: -210 }, { x: 430, y: -500 }, 180);
  addRoom(builder, "三层酒馆顶层", { x: 630, y: -650 }, [700, 420], ["south"]);
  addRoom(builder, "监牢下层祭坛", { x: 120, y: 520 }, [520, 440], ["north"]);
  addStairs(builder, "监牢主室下行楼梯", { x: 240, y: 240 }, 170, 420, 300, 90);
  addStairs(builder, "三层酒馆顶层内部楼梯", { x: 430, y: -360 }, 160, 300, 300, 180);
  addDoor(builder, "底层监牢门", { x: -120, y: 0 });
  addDoor(builder, "三层酒馆顶层门", { x: 430, y: -500 }, 90);
}

function buildConnectorStair(builder) {
  addFloor(builder, "J端平台", { x: -350, y: -180 }, [260, 240]);
  addFloor(builder, "K端平台", { x: 200, y: 300 }, [260, 240]);
  addStairs(builder, "J-K模块内部主楼梯", { x: -70, y: 60 }, 190, 760, 900, 132);
  addWallLine(builder, "J-K楼梯北包边", { x: -430, y: -80 }, { x: 100, y: 380 });
  addWallLine(builder, "J-K楼梯南包边", { x: -280, y: -260 }, { x: 300, y: 250 });
  addDoor(builder, "J端门", { x: -400, y: -200 }, 42);
  addDoor(builder, "K端门", { x: 200, y: 300 }, 42);
}

function buildTavernMiddle(builder) {
  addRoom(builder, "三层酒馆中层", { x: 0, y: 0 }, [820, 520], ["south"]);
  addRoom(builder, "酒馆中层侧室", { x: -500, y: 80 }, [280, 300], ["east"]);
  addStairs(builder, "酒馆中层内部回折梯", { x: -100, y: 60 }, 170, 380, 300, 90);
  addDoor(builder, "酒馆中层L门", { x: -220, y: -250 }, 90);
  addDoor(builder, "酒馆中层M门", { x: 220, y: -250 }, 90);
  addDoor(builder, "酒馆中层N门", { x: -100, y: 250 }, 90);
}

function buildDeepWall(builder) {
  addRoom(builder, "三层酒馆底层", { x: -650, y: -520 }, [620, 380], ["south"]);
  addRoom(builder, "花园", { x: -650, y: 0 }, [820, 660], ["north", "east", "south"]);
  addHall(builder, "花园至中央通道", { x: -240, y: 0 }, { x: 170, y: 0 }, 250);
  addRoom(builder, "高墙深处中央厅", { x: 330, y: 0 }, [520, 650], ["west", "east", "north", "south"]);
  addRoom(builder, "中庭", { x: 790, y: 120 }, [430, 820], ["west"]);
  addHall(builder, "祭师教堂通道", { x: 330, y: -325 }, { x: 330, y: -620 }, 220);
  addRoom(builder, "祭师教堂", { x: 330, y: -850 }, [650, 460], ["south"]);
  addHall(builder, "后院长廊", { x: 330, y: 325 }, { x: 330, y: 760 }, 240);
  addRoom(builder, "后院", { x: 330, y: 1050 }, [520, 580], ["north"]);
  addRoundRoom(builder, "A端塔室", { x: 300, y: -100 }, 170, [90]);
  addRoundRoom(builder, "K端花园塔室", { x: -800, y: -100 }, 180, [0]);
  addStairs(builder, "酒馆底层至花园楼梯", { x: -650, y: -330 }, 180, 360, 300, 90);
  addStairs(builder, "花园东侧内部楼梯", { x: -300, y: 130 }, 180, 420, 300, 45);
  addStairs(builder, "中庭内部楼梯", { x: 650, y: 140 }, 180, 440, 300, 90);
  addStairs(builder, "祭师教堂内部楼梯", { x: 330, y: -620 }, 180, 360, 300, 180);
  addStairs(builder, "后院内部楼梯", { x: 330, y: 720 }, 180, 420, 300, 90);
  addDoor(builder, "花园K门", { x: -820, y: -100 });
  addDoor(builder, "酒馆底层N门", { x: -650, y: -700 }, 90);
  addDoor(builder, "祭师教堂门", { x: 330, y: -620 }, 90);
}

const MODULES = [
  { key: "exterior", name: "① 高墙外围", diagram: { x: -800, y: 2200, z: 0 }, assembly: { x: 0, y: 0, z: 0 }, build: buildExterior },
  { key: "fire", name: "② 火龙区与左侧塔顶", diagram: { x: -1700, y: 650, z: 300 }, assembly: { x: -1200, y: 0, z: 300 }, build: buildFireDragon },
  { key: "left-bottom", name: "② 左侧塔底层", diagram: { x: -350, y: 650, z: 0 }, assembly: { x: -1600, y: 400, z: 0 }, build: buildLeftBottom },
  { key: "edge-third", name: "② 边塔第三层", diagram: { x: -1700, y: -900, z: 900 }, assembly: { x: -2200, y: -300, z: 900 }, build: buildEdgeThird },
  { key: "edge-top", name: "② 边塔塔顶", diagram: { x: -2300, y: -1800, z: 1200 }, assembly: { x: -2200, y: -300, z: 1200 }, build: buildEdgeTop },
  { key: "edge-second-roof", name: "③ 边塔第二层与屋顶", diagram: { x: 0, y: -500, z: 600 }, assembly: { x: -1600, y: -200, z: 600 }, build: buildEdgeSecondRoof },
  { key: "jail-top", name: "④ 底层监牢与酒馆顶层", diagram: { x: 1500, y: -1500, z: 300 }, assembly: { x: -900, y: -200, z: 300 }, build: buildJailTavernTop },
  { key: "jk-stair", name: "④ J-K内部楼梯模块", diagram: { x: 1650, y: -350, z: -300 }, assembly: { x: -500, y: 200, z: -300 }, build: buildConnectorStair },
  { key: "tavern-middle", name: "⑤ 三层酒馆中层", diagram: { x: 2550, y: 650, z: 0 }, assembly: { x: 0, y: 300, z: 0 }, build: buildTavernMiddle },
  { key: "deep", name: "⑤ 高墙深处与酒馆底层", diagram: { x: 1500, y: 2300, z: -300 }, assembly: { x: 500, y: 600, z: -300 }, build: buildDeepWall },
];

const EDGES = [
  { letter: "A", type: "stairs", from: ["deep", 300, -100, 0, 270], to: ["exterior", 800, 100, 0, 90], bend: 120 },
  { letter: "N", type: "stairs", from: ["deep", -200, -200, 0, 180], to: ["tavern-middle", -100, 100, 0, 0], bend: -80 },
  { letter: "L", type: "stairs", from: ["tavern-middle", -100, -200, 0, 180], to: ["jail-top", 400, 300, 0, 0], bend: -120 },
  { letter: "H", type: "stairs", from: ["jail-top", -100, 0, 0, 180], to: ["edge-second-roof", 200, 0, 0, 0], bend: 80 },
  { letter: "G", type: "stairs", from: ["edge-second-roof", -200, 0, 0, 180], to: ["edge-third", 0, 100, 0, 0], bend: -80 },
  { letter: "F", type: "stairs", from: ["edge-third", -200, 0, 0, 0], to: ["edge-top", 200, 0, 0, 180], bend: 100 },
  { letter: "J", type: "door", from: ["edge-second-roof", 700, 200, 0, 0], to: ["jk-stair", -400, -200, 900, 180], bend: 120 },
  { letter: "K", type: "door", from: ["jk-stair", 200, 300, 0, 0], to: ["deep", -800, -100, 0, 180], bend: -140 },
  { letter: "B", type: "stairs", from: ["exterior", -1300, -150, 0, 0], to: ["fire", 300, -150, 0, 180], bend: -140 },
  { letter: "E", type: "stairs", from: ["left-bottom", -200, 0, 0, 270], to: ["fire", -600, 0, 0, 90], bend: 120 },
  { letter: "C", type: "stairs", from: ["exterior", -1300, 0, 0, 0], to: ["fire", 300, 0, 0, 180], bend: 0 },
  { letter: "D", type: "stairs", from: ["exterior", -1300, 150, 0, 0], to: ["fire", 300, 150, 0, 180], bend: 140 },
  { letter: "M", type: "stairs", from: ["tavern-middle", 100, -100, 0, 180], to: ["jail-top", 600, 400, 0, 0], bend: 120 },
];

const moduleContext = new Map();
for (const spec of MODULES) {
  const created = createEmptyStructureModule(level, {
    moduleId: `module-${spec.key}`,
    instanceId: `instance-${spec.key}`,
    sourceLayerId: `layer-${spec.key}`,
    name: spec.name,
    instanceName: spec.name,
    transform: spec.diagram,
    layerColor: COLORS.floor,
  });
  level = created.level;
  moduleContext.set(spec.key, {
    ...spec,
    moduleId: created.moduleId,
    instanceId: created.instanceId,
    layerId: created.sourceLayerId,
  });
  spec.build(moduleContext.get(spec.key));
}

for (const edge of EDGES) {
  for (const endpoint of [edge.from, edge.to]) {
    const [moduleKey, x, y, z, facing] = endpoint;
    const context = moduleContext.get(moduleKey);
    const portId = `port-${moduleKey}-${edge.letter.toLowerCase()}`;
    level = addModulePort(level, context.moduleId, {
      id: portId,
      name: `${edge.letter} · ${edge.type === "stairs" ? "楼梯" : "门"}`,
      position: { x, y, z },
      facing,
    }).level;
  }
}

for (const context of moduleContext.values()) {
  level = materializeModulePortShapes(level, context.moduleId);
}
level.shapes = level.shapes.map((shape) => (
  shape.modulePort ? { ...shape, id: `shape-${shape.modulePort.id}` } : shape
));

function routeWaypoints(edge) {
  const from = moduleContext.get(edge.from[0]).diagram;
  const to = moduleContext.get(edge.to[0]).diagram;
  const middleX = (from.x + to.x) / 2 + edge.bend;
  return [
    { x: middleX, y: from.y },
    { x: middleX, y: to.y },
  ];
}

for (const edge of EDGES) {
  const fromContext = moduleContext.get(edge.from[0]);
  const toContext = moduleContext.get(edge.to[0]);
  level = connectModulePorts(level, {
    id: `connection-${edge.letter.toLowerCase()}`,
    type: edge.type,
    from: { instanceId: fromContext.instanceId, portId: `port-${edge.from[0]}-${edge.letter.toLowerCase()}` },
    to: { instanceId: toContext.instanceId, portId: `port-${edge.to[0]}-${edge.letter.toLowerCase()}` },
    waypoints: routeWaypoints(edge),
  }).level;
}

const graph = structureGraph(level);
if (graph.modules.length !== MODULES.length) throw new Error("Module count mismatch.");
if (graph.connections.length !== EDGES.length) throw new Error("Connection count mismatch.");
const usedEndpoints = new Set();
for (const connection of graph.connections) {
  for (const endpoint of [connection.from, connection.to]) {
    const key = `${endpoint.instanceId}:${endpoint.portId}`;
    if (usedEndpoints.has(key)) throw new Error(`Endpoint reused: ${key}`);
    usedEndpoints.add(key);
  }
}

const resolvedGraph = resolveStructureAssemblyGraph(level);
let maximumClosureError = 0;
for (const connection of resolvedGraph.connections) {
  const from = worldPort(resolvedGraph, connection.from);
  const to = worldPort(resolvedGraph, connection.to);
  const sourceEdge = EDGES.find((edge) => `connection-${edge.letter.toLowerCase()}` === connection.id);
  const forward = connection.type === "stairs" ? 400 : 0;
  const rise = connection.type === "stairs" ? 300 : 0;
  const radians = from.facing * Math.PI / 180;
  const error = Math.hypot(
    to.x - (from.x + Math.cos(radians) * forward),
    to.y - (from.y + Math.sin(radians) * forward),
    to.z - (from.z + rise),
  );
  maximumClosureError = Math.max(maximumClosureError, error);
  if (!sourceEdge) throw new Error(`Missing source edge for ${connection.id}`);
}
if (maximumClosureError > 0.01) {
  throw new Error(`Structure graph does not close cleanly: ${maximumClosureError.toFixed(3)}cm error.`);
}

const internalStairs = level.shapes.filter((shape) => shape.layoutRole === "stair");
const floors = level.shapes.filter((shape) => shape.layoutRole === "floor");
const walls = level.shapes.filter((shape) => shape.layoutRole === "wall");
if (internalStairs.length < 10 || floors.length < MODULES.length || walls.length < 40) {
  throw new Error("Generated level is missing expected internal geometry.");
}

for (const output of OUTPUTS) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(level, null, 2)}\n`, "utf8");
  console.log(`Generated ${output}`);
}
console.log(`Modules: ${graph.modules.length}; connections: ${graph.connections.length}; shapes: ${level.shapes.length}`);
console.log(`Floors: ${floors.length}; walls: ${walls.length}; internal stairs: ${internalStairs.length}`);
console.log(`Maximum connection closure error: ${maximumClosureError.toFixed(3)}cm`);
