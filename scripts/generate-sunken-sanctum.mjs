// 生成自创魂系小关卡《沉没圣所》，输出 BlockOutTools V2 关卡 JSON。
// 结构参照 scripts/generate-lothric-v2-project.mjs 的成熟约定。
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 运行模式：spine => 只保留主轴(无捷径闭环)；all => 含捷径(默认)
const MODE = process.argv[2] === "spine" ? "spine" : "all";

const OUTPUT_FILE = MODE === "spine" ? "layouts/sunken-sanctum-spine.blockout.json" : "layouts/sunken-sanctum.blockout.json";
const OUTPUT = resolve(ROOT, OUTPUT_FILE);

const COLORS = Object.freeze({
  floor: [0.46, 0.49, 0.51, 1],
  floorTop: [0.66, 0.69, 0.7, 1],
  wall: [0.055, 0.06, 0.058, 1],
  wallTop: [0.16, 0.17, 0.165, 1],
  stair: [0.77, 0.59, 0.13, 1],
  stairTop: [0.94, 0.78, 0.28, 1],
  door: [0.83, 0.69, 0.18, 1],
  doorTop: [0.97, 0.85, 0.4, 1],
});

const FLOOR_THICKNESS = 40;
const WALL_HEIGHT = 360;
const WALL_THICKNESS = 44;
const MAX_WALL_LENGTH = 360;
const WALL_OVERLAP = 8;

function normalizeRotation(rotation) {
  return ((rotation % 360) + 360) % 360;
}

function createModule(key, name, graphPosition, assemblyPosition) {
  return {
    key,
    definition: { id: `module_${key}`, name, revision: 1, blocks: [] },
    instance: {
      id: `instance_${key}`,
      definitionId: `module_${key}`,
      name,
      graphPosition,
      assemblyTransform: { position: assemblyPosition, rotation: 0 },
    },
    serial: 0,
  };
}

function nextBlockId(module, type) {
  module.serial += 1;
  return `${type}_${module.key}_${String(module.serial).padStart(3, "0")}`;
}

function addBox(module, name, center, size, rotation = 0, role = "floor") {
  const floor = role === "floor";
  module.definition.blocks.push({
    id: nextBlockId(module, "box"),
    name,
    type: "box",
    transform: { position: [center.x, center.y, center.z ?? (floor ? 0 : FLOOR_THICKNESS)], rotation: normalizeRotation(rotation) },
    parameters: {
      BoxSize: size,
      blockout_material_color: floor ? COLORS.floor : COLORS.wall,
      blockout_material_top_color: floor ? COLORS.floorTop : COLORS.wallTop,
    },
  });
}

function addFloor(module, name, center, size, rotation = 0) {
  addBox(module, name, { ...center, z: center.z ?? 0 }, [size[0], size[1], FLOOR_THICKNESS], rotation, "floor");
}

function addWallLine(module, name, start, end, options = {}) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const count = Math.max(1, Math.ceil(length / MAX_WALL_LENGTH));
  const segmentLength = length / count;
  const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
  for (let index = 0; index < count; index += 1) {
    const ratio = (index + 0.5) / count;
    addBox(module, `${name} ${index + 1}`, {
      x: start.x + dx * ratio,
      y: start.y + dy * ratio,
      z: options.z ?? FLOOR_THICKNESS,
    }, [segmentLength + (count > 1 ? WALL_OVERLAP : 0), options.thickness ?? WALL_THICKNESS, options.height ?? WALL_HEIGHT], rotation, "wall");
  }
}

function addRectShell(module, name, center, size, openings = []) {
  const [width, depth] = size;
  const left = center.x - width / 2;
  const right = center.x + width / 2;
  const top = center.y - depth / 2;
  const bottom = center.y + depth / 2;
  if (!openings.includes("north")) addWallLine(module, `${name} 北墙`, { x: left, y: top }, { x: right, y: top });
  if (!openings.includes("south")) addWallLine(module, `${name} 南墙`, { x: left, y: bottom }, { x: right, y: bottom });
  if (!openings.includes("west")) addWallLine(module, `${name} 西墙`, { x: left, y: top }, { x: left, y: bottom });
  if (!openings.includes("east")) addWallLine(module, `${name} 东墙`, { x: right, y: top }, { x: right, y: bottom });
}

function addRoom(module, name, center, size, openings = []) {
  addFloor(module, `${name}楼板`, center, size);
  addRectShell(module, name, center, size, openings);
}

function addRoundRoom(module, name, center, radius, openings = []) {
  const bandCount = 5;
  const bandHeight = radius * 2 / bandCount;
  for (let index = 0; index < bandCount; index += 1) {
    const localY = -radius + bandHeight * (index + 0.5);
    const halfWidth = Math.sqrt(Math.max(0, radius * radius - localY * localY));
    addFloor(module, `${name}楼板 ${index + 1}`, { x: center.x, y: center.y + localY }, [halfWidth * 2 + 12, bandHeight + 12]);
  }
  const segmentCount = 12;
  const pointAt = (angle) => {
    const radians = angle * Math.PI / 180;
    return { x: center.x + Math.cos(radians) * radius, y: center.y + Math.sin(radians) * radius };
  };
  for (let index = 0; index < segmentCount; index += 1) {
    const startAngle = index * 360 / segmentCount;
    const endAngle = (index + 1) * 360 / segmentCount;
    const middleAngle = (startAngle + endAngle) / 2;
    if (openings.some((angle) => Math.min(Math.abs(middleAngle - angle) % 360, 360 - Math.abs(middleAngle - angle) % 360) < 16)) continue;
    addWallLine(module, `${name}圆墙`, pointAt(startAngle), pointAt(endAngle));
  }
}

function addDoor(module, name, center, rotation = 0) {
  module.definition.blocks.push({
    id: nextBlockId(module, "doorway"),
    name,
    type: "doorway",
    transform: { position: [center.x, center.y, center.z ?? FLOOR_THICKNESS], rotation: normalizeRotation(rotation) },
    parameters: {
      DoorwaySize: [50, 150, 260],
      TopThickness: 45,
      SideThickness: 35,
      blockout_material_color: COLORS.door,
      blockout_material_top_color: COLORS.doorTop,
    },
  });
}

function addStairs(module, name, center, width, requestedDepth, height, rotation = 0) {
  const steps = Math.max(4, Math.ceil(height / 18));
  const depth = Math.max(requestedDepth, steps * 30);
  module.definition.blocks.push({
    id: nextBlockId(module, "stairs"),
    name,
    type: "stairs-linear",
    transform: { position: [center.x, center.y, center.z ?? FLOOR_THICKNESS], rotation: normalizeRotation(rotation) },
    parameters: {
      StairsSize: [width, depth, height],
      NumberOfSteps: steps,
      StairsType: "BOX",
      blockout_material_color: COLORS.stair,
      blockout_material_top_color: COLORS.stairTop,
    },
  });
}

function addPort(module, letter, type, center, rotation) {
  const id = `port_${module.key}_${letter.toLowerCase()}`;
  module.definition.blocks.push({
    id,
    name: `${letter} · ${type === "door" ? "门" : type === "stairs" ? "楼梯" : type === "one-way-door" ? "单向门" : "下坠"}`,
    type: "port",
    transform: { position: [center.x, center.y, center.z ?? 0], rotation: normalizeRotation(rotation) },
    parameters: { width: type === "door" || type === "one-way-door" ? 150 : 180, depth: 90 },
  });
  return id;
}

function buildPlaza(m) {
  // 沉没庭院：篝火检查点 + 东北两个通往不同朝向的接口
  addRoom(m, "沉没庭院", { x: 0, y: 0 }, [1200, 900], ["east", "west", "north"]);
  // 篝火祭坛（装饰用中心盒）
  addBox(m, "篝火祭坛", { x: 0, y: 200, z: 0 }, [130, 130, 70], 0, "floor");
  // 哥特式立柱（四角）
  for (const [px, py] of [[-430, -300], [430, -300], [-430, 300], [430, 300]]) {
    addBox(m, "庭院立柱", { x: px, y: py, z: 40 }, [64, 64, 300], 0, "wall");
  }
}

function buildTerrace(m) {
  addRoom(m, "圣梯露台", { x: 0, y: 0 }, [900, 700], ["east", "west"]);
  addStairs(m, "圣梯露台上行梯", { x: 240, y: 0 }, 170, 520, 300, 90);
  // 捷径单向门的门框几何（从露台回到庭院）
  addDoor(m, "捷径单向门", { x: -450, y: -150 }, 270);
}

function buildGallery(m) {
  addRoom(m, "圣像回廊", { x: 0, y: 0 }, [1000, 500], ["east", "west"]);
  addStairs(m, "圣像回廊上行梯", { x: 240, y: 0 }, 170, 520, 300, 90);
}

function buildSanctum(m) {
  addRoundRoom(m, "深渊圣所", { x: 0, y: 0 }, 450, [270]);
  // 首领/祭坛高台
  addBox(m, "深渊祭坛高台", { x: 0, y: 0, z: 0 }, [260, 260, 80], 0, "floor");
  // 仪式烛台柱（环形）
  for (let angle = 0; angle < 360; angle += 60) {
    const radians = angle * Math.PI / 180;
    addBox(m, "仪式烛台柱", { x: Math.cos(radians) * 300, y: Math.sin(radians) * 300, z: 40 }, [46, 46, 320], angle, "wall");
  }
}

function buildNook(m) {
  // 隐修壁龛：从回廊单向下坠进入的隐藏遗物室（死胡同分支，无闭环=0残差）
  addRoundRoom(m, "隐修壁龛", { x: 0, y: 0 }, 180, [90]);
  addBox(m, "遗物祭坛", { x: 0, y: 0, z: 0 }, [90, 90, 60], 0, "floor");
}

function buildCrypt(m) {
  // 潮湿地窟：从庭院向下的单向下坠进入的暗区（死胡同，0残差）
  addRoom(m, "潮湿地窟", { x: 0, y: 0 }, [460, 520], ["north"]);
  addBox(m, "地窟暗柜", { x: 0, y: 0, z: 0 }, [120, 120, 50], 0, "floor");
}

function buildSacristy(m) {
  // 圣器室：从首领圣所向内开的单向门进入的侧室（死胡同，0残差）
  addRoom(m, "圣器室", { x: 0, y: 0 }, [420, 360], ["west"]);
  addBox(m, "圣器箱", { x: 0, y: 0, z: 0 }, [110, 110, 60], 0, "floor");
}

function buildAttach(m) {
  // 庭院库房：从庭院可双向进出的门进仓库（两向门，同层，死胡同，0残差）
  addRoom(m, "庭院库房", { x: 0, y: 0 }, [420, 380], ["east"]);
  addBox(m, "货架", { x: -60, y: 0, z: 0 }, [120, 240, 70], 0, "floor");
}

function buildLookout(m) {
  // 瞭望台：从圣所继续向上的一段崖台（反向垂直延伸，死胡同，0残差）
  addRoundRoom(m, "瞭望台", { x: 0, y: 0 }, 240, [180]);
  addBox(m, "观测石台", { x: 0, y: 0, z: 0 }, [110, 110, 70], 0, "floor");
}

const moduleSpecs = [
  ["plaza", "① 沉没庭院 · 篝火", [0, 0], [0, 0, 0], buildPlaza],
  ["terrace", "② 圣梯露台", [480, 0], [0, 0, 300], buildTerrace],
  ["gallery", "③ 圣像回廊", [960, 0], [0, 0, 600], buildGallery],
  ["sanctum", "④ 深渊圣所 · 首领", [1440, 0], [0, 0, 900], buildSanctum],
  ["nook", "⑤ 隐修壁龛 · 遗物", [1200, 300], [0, 0, 300], buildNook],
  ["crypt", "⑥ 潮湿地窟 · 暗区", [480, 300], [0, 0, -300], buildCrypt],
  ["sacristy", "⑦ 圣器室 · 储室", [1880, 300], [0, 0, 900], buildSacristy],
  ["attach", "⑧ 庭院库房 · 两向门", [480, -340], [0, 0, 0], buildAttach],
  ["lookout", "⑨ 瞭望台 · 崖顶", [1880, -340], [0, 0, 1200], buildLookout],
];

const modules = new Map(moduleSpecs.map(([key, name, graphPosition, assemblyPosition, build]) => {
  const module = createModule(key, name, graphPosition, assemblyPosition);
  build(module);
  return [key, module];
}));

// 端口（模块局部坐标）。旋转方向只影响求解时的朝向，谜题由求解器旋转模块满足。
const portDefs = {
  plaza: [
    ["A", "stairs", { x: 600, y: 0 }, 90],
    ["S", "one-way-door", { x: -600, y: 0 }, 270],
    ["L", "drop", { x: 0, y: -450 }, 0],
    ["M", "drop", { x: 0, y: 450 }, 0],
    ["P", "door", { x: -600, y: 450 }, 270],
  ],
  terrace: [
    ["B", "stairs", { x: -450, y: 0 }, 270],
    ["D", "stairs", { x: 450, y: 0 }, 90],
    ["C", "one-way-door", { x: -450, y: -150 }, 270],
  ],
  gallery: [
    ["E", "stairs", { x: -500, y: 0 }, 270],
    ["G", "stairs", { x: 500, y: 0 }, 90],
    ["F", "drop", { x: -500, y: 150 }, 270],
  ],
  sanctum: [
    ["H", "stairs", { x: -450, y: 0 }, 270],
    ["I", "drop", { x: -450, y: 200 }, 270],
    ["K", "door", { x: 450, y: 0 }, 90],
    ["Q", "stairs", { x: 0, y: 450 }, 0],
  ],
  nook: [
    ["J", "drop", { x: -180, y: 0 }, 270],
  ],
  crypt: [
    ["N", "drop", { x: 0, y: 180 }, 0],
  ],
  sacristy: [
    ["O", "door", { x: -210, y: 0 }, 270],
  ],
  attach: [
    ["R", "door", { x: 210, y: 0 }, 90],
  ],
  lookout: [
    ["T", "stairs", { x: 0, y: -240 }, 0],
  ],
};

const edges = [
  { letter: "1", type: "stairs", from: ["plaza", "A"], to: ["terrace", "B"] },
  { letter: "2", type: "stairs", from: ["terrace", "D"], to: ["gallery", "E"] },
  { letter: "3", type: "stairs", from: ["gallery", "G"], to: ["sanctum", "H"] },
  // 捷径 1：露台的单向门，回到庭院（闭环，残差会报告）
  { letter: "4", type: "one-way-door", from: ["terrace", "C"], to: ["plaza", "S"] },
  // 捷径 2：圣所的单向下坠，落到庭院（主捷径闭环，残差会报告）
  { letter: "5", type: "drop", from: ["sanctum", "I"], to: ["plaza", "L"] },
  // 支线 6：回廊单向下坠进入隐修壁龛（死胡同，0残差）
  { letter: "6", type: "drop", from: ["gallery", "F"], to: ["nook", "J"] },
  // 支线 7：庭院单向下坠进入潮湿地窟（死胡同，0残差）
  { letter: "7", type: "drop", from: ["plaza", "M"], to: ["crypt", "N"] },
  // 支线 8：首领圣所单向门进入圣器室（死胡同，0残差）
  { letter: "8", type: "door", from: ["sanctum", "K"], to: ["sacristy", "O"] },
  // 支线 9：庭院两向门进入库房（同层，死胡同，0残差）
  { letter: "9", type: "door", from: ["plaza", "P"], to: ["attach", "R"] },
  // 支线 10：圣所继续向上瞭望台（反向垂直延伸，死胡同，0残差）
  { letter: "10", type: "stairs", from: ["sanctum", "Q"], to: ["lookout", "T"] },
];

// loop 捷径(4,5)会造成闭环残差，只在 all 模式包含；死胡同支线(6-10)在两种模式都保留且 0 残差
const LOOP_SHORTCUTS = new Set(["4", "5"]);
// 为模块安装端口并生成连接（方式与 Lothric 生成器一致）
const activeEdges = MODE === "spine" ? edges.filter((edge) => !LOOP_SHORTCUTS.has(edge.letter)) : edges;
const connections = [];
for (const edge of activeEdges) {
  const sourceModule = modules.get(edge.from[0]);
  const targetModule = modules.get(edge.to[0]);
  const sourcePortDef = portDefs[edge.from[0]].find(([letter]) => letter === edge.from[1]);
  const targetPortDef = portDefs[edge.to[0]].find(([letter]) => letter === edge.to[1]);
  const sourcePortId = addPort(sourceModule, edge.letter, edge.type, sourcePortDef[2], sourcePortDef[3]);
  const targetPortId = addPort(targetModule, edge.letter, edge.type, targetPortDef[2], targetPortDef[3]);
  const sourceGraph = sourceModule.instance.graphPosition;
  const targetGraph = targetModule.instance.graphPosition;
  const middleX = (sourceGraph[0] + targetGraph[0]) / 2;
  connections.push({
    id: `connection_${edge.letter}`,
    type: edge.type,
    sourceInstanceId: sourceModule.instance.id,
    sourcePortId,
    targetInstanceId: targetModule.instance.id,
    targetPortId,
    waypoints: [[middleX, sourceGraph[1]], [middleX, targetGraph[1]]],
  });
}

const project = {
  schemaVersion: 2,
  projectId: "project_sunken_sanctum",
  name: "沉没圣所 · 自创魂系小关卡",
  modules: [...modules.values()].map((module) => module.definition),
  instances: [...modules.values()].map((module) => module.instance),
  connections,
  blockoutProfile: {
    enabled: true,
    enforceUeImport: true,
    capsuleRadius: 42,
    capsuleHalfHeight: 96,
    maxStepHeight: 45,
    minDoorWidth: 100,
    minDoorHeight: 210,
    maxStairRise: 20,
    minStairTread: 28,
  },
  updatedAt: "2026-06-01T00:00:00.000Z",
};

// 自检
const allBlocks = project.modules.flatMap((module) => module.blocks);
const ids = new Set();
for (const item of [...project.modules, ...project.instances, ...project.connections, ...allBlocks]) {
  if (ids.has(item.id)) throw new Error(`Duplicate id: ${item.id}`);
  ids.add(item.id);
}
const usedPorts = new Set();
for (const connection of project.connections) {
  for (const key of [`${connection.sourceInstanceId}:${connection.sourcePortId}`, `${connection.targetInstanceId}:${connection.targetPortId}`]) {
    if (usedPorts.has(key)) throw new Error(`Port reused: ${key}`);
    usedPorts.add(key);
  }
}
const stairs = allBlocks.filter((block) => block.type === "stairs-linear");
for (const stair of stairs) {
  const [, depth, height] = stair.parameters.StairsSize;
  if (height / stair.parameters.NumberOfSteps > project.blockoutProfile.maxStairRise) throw new Error(`Stair rise invalid: ${stair.name}`);
  if (depth / stair.parameters.NumberOfSteps < project.blockoutProfile.minStairTread) throw new Error(`Stair tread invalid: ${stair.name}`);
}
if (project.modules.length !== 9 || project.connections.length !== (MODE === "spine" ? 8 : 10)) throw new Error("Sunken Sanctum topology incomplete.");

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(`Generated ${OUTPUT}`);
console.log(`Modules: ${project.modules.length}; connections: ${project.connections.length}; blocks: ${allBlocks.length}`);
console.log(`Boxes: ${allBlocks.filter((b) => b.type === "box").length}; doors: ${allBlocks.filter((b) => b.type === "doorway").length}; stairs: ${stairs.length}; ports: ${allBlocks.filter((b) => b.type === "port").length}`);
