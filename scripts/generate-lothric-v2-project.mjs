import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "layouts/lothric-high-wall-v2.blockout.json");

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
  const block = {
    id: nextBlockId(module, "box"),
    name,
    type: "box",
    transform: { position: [center.x, center.y, center.z ?? (floor ? 0 : FLOOR_THICKNESS)], rotation: normalizeRotation(rotation) },
    parameters: {
      BoxSize: size,
      blockout_material_color: floor ? COLORS.floor : COLORS.wall,
      blockout_material_top_color: floor ? COLORS.floorTop : COLORS.wallTop,
    },
  };
  module.definition.blocks.push(block);
  return block;
}

function addFloor(module, name, center, size, rotation = 0) {
  return addBox(module, name, { ...center, z: center.z ?? 0 }, [size[0], size[1], FLOOR_THICKNESS], rotation, "floor");
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

function addHall(module, name, start, end, width) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  addFloor(module, `${name}楼板`, center, [length + 12, width], rotation);
  const normal = { x: -dy / length * width / 2, y: dx / length * width / 2 };
  addWallLine(module, `${name}左墙`, { x: start.x + normal.x, y: start.y + normal.y }, { x: end.x + normal.x, y: end.y + normal.y });
  addWallLine(module, `${name}右墙`, { x: start.x - normal.x, y: start.y - normal.y }, { x: end.x - normal.x, y: end.y - normal.y });
}

function angularDistance(left, right) {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
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
    if (openings.some((angle) => angularDistance(middleAngle, angle) < 16)) continue;
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
    name: `${letter} · ${type === "door" ? "门" : "楼梯"}`,
    type: "port",
    transform: { position: [center.x, center.y, center.z ?? 0], rotation: normalizeRotation(rotation) },
    parameters: { width: type === "door" ? 150 : 180, depth: 90 },
  });
  return id;
}

function buildExterior(module) {
  addRoundRoom(module, "左侧塔中层", { x: -1100, y: 0 }, 320, [0]);
  addHall(module, "高墙西段", { x: -780, y: 0 }, { x: 850, y: 0 }, 260);
  addRoundRoom(module, "右侧废塔", { x: 1120, y: 0 }, 300, [180]);
  addRoundRoom(module, "出生塔", { x: -180, y: 650 }, 270, [270]);
  addHall(module, "出生塔连接廊", { x: -180, y: 380 }, { x: -180, y: 130 }, 190);
  addRoundRoom(module, "A连接塔", { x: 650, y: -350 }, 180, [90]);
  addHall(module, "A连接短廊", { x: 650, y: -170 }, { x: 650, y: -40 }, 150);
  addStairs(module, "出生塔内部楼梯", { x: -180, y: 500 }, 170, 520, 300, 180);
  addStairs(module, "左侧塔内部短梯", { x: -980, y: 30 }, 150, 300, 180, 90);
  addDoor(module, "西段通道门", { x: -780, y: 0 });
  addDoor(module, "右侧废塔门", { x: 840, y: 0 });
}

function buildFireDragon(module) {
  addRoundRoom(module, "宝箱密室", { x: -650, y: -80 }, 280, [0]);
  addHall(module, "火龙区斜坡通道", { x: -370, y: -60 }, { x: 0, y: 120 }, 250);
  addRoom(module, "火龙区主平台", { x: 250, y: 120 }, [720, 520], ["west", "east", "south"]);
  addHall(module, "左侧塔顶南廊", { x: 250, y: 380 }, { x: 250, y: 690 }, 210);
  addRoom(module, "左侧塔顶", { x: 250, y: 760 }, [470, 320], ["north"]);
  addStairs(module, "宝箱密室内部楼梯", { x: -520, y: -80 }, 150, 420, 240, 90);
  addStairs(module, "火龙区至塔顶楼梯", { x: 250, y: 520 }, 170, 520, 300, 90);
  addDoor(module, "宝箱密室门", { x: -380, y: -60 });
  addDoor(module, "左侧塔顶门", { x: 250, y: 610 }, 90);
}

function buildLeftBottom(module) {
  addRoom(module, "左侧塔底层", { x: 0, y: 0 }, [360, 620], ["north"]);
  addStairs(module, "左侧塔底层内部楼梯", { x: 0, y: 80 }, 150, 520, 300, 180);
  addDoor(module, "左侧塔底层出口", { x: 0, y: -300 }, 90);
}

function buildEdgeThird(module) {
  addRoundRoom(module, "边塔第三层", { x: 0, y: 0 }, 340, [90, 270]);
  addHall(module, "第三层南连接", { x: 0, y: 340 }, { x: 0, y: 620 }, 190);
  addStairs(module, "边塔第三层环形内梯", { x: 80, y: -20 }, 160, 520, 300, 35);
  addDoor(module, "第三层北门", { x: 0, y: -325 }, 90);
  addDoor(module, "第三层南门", { x: 0, y: 610 }, 90);
}

function buildEdgeTop(module) {
  addRoundRoom(module, "边塔塔顶", { x: 0, y: 0 }, 300, [90]);
  addStairs(module, "边塔塔顶收口楼梯", { x: 120, y: 0 }, 150, 520, 300, 20);
  addDoor(module, "边塔塔顶入口", { x: 0, y: 285 }, 90);
}

function buildEdgeSecondRoof(module) {
  addRoundRoom(module, "边塔第二层", { x: -420, y: 0 }, 330, [0]);
  addHall(module, "边塔至屋顶连廊", { x: -90, y: 0 }, { x: 350, y: 0 }, 230);
  addRoom(module, "屋顶", { x: 720, y: 0 }, [740, 520], ["west"]);
  addHall(module, "H连接短廊", { x: 1050, y: 200 }, { x: 1360, y: 350 }, 180);
  addStairs(module, "边塔第二层内部楼梯", { x: -350, y: 30 }, 160, 520, 300, 30);
  addStairs(module, "屋顶内部短梯", { x: 650, y: 80 }, 180, 300, 180, 90);
  addDoor(module, "屋顶西门", { x: 350, y: 0 });
  addDoor(module, "屋顶J门", { x: 1020, y: 190 }, 90);
}

function buildJailTavernTop(module) {
  addRoundRoom(module, "边塔底层监牢", { x: -420, y: 0 }, 300, [0]);
  addHall(module, "底层监牢通道", { x: -120, y: 0 }, { x: 300, y: 0 }, 230);
  addRoom(module, "监牢主室", { x: 430, y: 0 }, [420, 420], ["west", "north"]);
  addHall(module, "酒馆上行廊", { x: 430, y: -210 }, { x: 430, y: -500 }, 180);
  addRoom(module, "三层酒馆顶层", { x: 630, y: -650 }, [700, 420], ["south"]);
  addRoom(module, "监牢下层祭坛", { x: 120, y: 520 }, [520, 440], ["north"]);
  addStairs(module, "监牢主室下行楼梯", { x: 240, y: 240 }, 170, 520, 300, 90);
  addStairs(module, "三层酒馆顶层内部楼梯", { x: 430, y: -360 }, 160, 520, 300, 180);
  addDoor(module, "底层监牢门", { x: -120, y: 0 });
  addDoor(module, "三层酒馆顶层门", { x: 430, y: -500 }, 90);
}

function buildConnectorStair(module) {
  addFloor(module, "J端平台", { x: -600, y: -520, z: 900 }, [300, 260]);
  addFloor(module, "K端平台", { x: 600, y: 520 }, [300, 260]);
  addStairs(module, "J-K模块内部主楼梯", { x: 0, y: 0 }, 200, 1500, 900, 132);
  addWallLine(module, "J-K楼梯北包边", { x: -720, y: -420 }, { x: 480, y: 650 });
  addWallLine(module, "J-K楼梯南包边", { x: -480, y: -650 }, { x: 720, y: 420 });
  addDoor(module, "J端门", { x: -600, y: -520, z: 940 }, 42);
  addDoor(module, "K端门", { x: 600, y: 520 }, 42);
}

function buildTavernMiddle(module) {
  addRoom(module, "三层酒馆中层", { x: 0, y: 0 }, [820, 520], ["south"]);
  addRoom(module, "酒馆中层侧室", { x: -500, y: 80 }, [280, 300], ["east"]);
  addStairs(module, "酒馆中层内部回折梯", { x: -100, y: 60 }, 170, 520, 300, 90);
  addDoor(module, "酒馆中层L门", { x: -220, y: -250 }, 90);
  addDoor(module, "酒馆中层M门", { x: 220, y: -250 }, 90);
  addDoor(module, "酒馆中层N门", { x: -100, y: 250 }, 90);
}

function buildDeepWall(module) {
  addRoom(module, "三层酒馆底层", { x: -650, y: -520 }, [620, 380], ["south"]);
  addRoom(module, "花园", { x: -650, y: 0 }, [820, 660], ["north", "east", "south"]);
  addHall(module, "花园至中央通道", { x: -240, y: 0 }, { x: 170, y: 0 }, 250);
  addRoom(module, "高墙深处中央厅", { x: 330, y: 0 }, [520, 650], ["west", "east", "north", "south"]);
  addRoom(module, "中庭", { x: 790, y: 120 }, [430, 820], ["west"]);
  addHall(module, "祭师教堂通道", { x: 330, y: -325 }, { x: 330, y: -620 }, 220);
  addRoom(module, "祭师教堂", { x: 330, y: -850 }, [650, 460], ["south"]);
  addHall(module, "后院长廊", { x: 330, y: 325 }, { x: 330, y: 760 }, 240);
  addRoom(module, "后院", { x: 330, y: 1050 }, [520, 580], ["north"]);
  addRoundRoom(module, "A端塔室", { x: 300, y: -100 }, 170, [90]);
  addRoundRoom(module, "K端花园塔室", { x: -800, y: -100 }, 180, [0]);
  addStairs(module, "酒馆底层至花园楼梯", { x: -650, y: -330 }, 180, 520, 300, 90);
  addStairs(module, "花园东侧内部楼梯", { x: -300, y: 130 }, 180, 520, 300, 45);
  addStairs(module, "中庭内部楼梯", { x: 650, y: 140 }, 180, 520, 300, 90);
  addStairs(module, "祭师教堂内部楼梯", { x: 330, y: -620 }, 180, 520, 300, 180);
  addStairs(module, "后院内部楼梯", { x: 330, y: 720 }, 180, 520, 300, 90);
  addDoor(module, "花园K门", { x: -820, y: -100 });
  addDoor(module, "酒馆底层N门", { x: -650, y: -700 }, 90);
  addDoor(module, "祭师教堂门", { x: 330, y: -620 }, 90);
}

const moduleSpecs = [
  ["edge_top", "② 边塔塔顶", [0, 0], [-4200, -200, 1200], buildEdgeTop],
  ["jail_top", "④ 底层监牢与酒馆顶层", [600, 0], [-800, -2800, 300], buildJailTavernTop],
  ["edge_third", "② 边塔第三层", [0, 240], [-4200, -200, 900], buildEdgeThird],
  ["edge_roof", "③ 边塔第二层与屋顶", [300, 240], [-2600, -1400, 600], buildEdgeSecondRoof],
  ["jk_stair", "④ J-K内部楼梯", [600, 240], [900, -2200, -300], buildConnectorStair],
  ["tavern_middle", "⑤ 三层酒馆中层", [900, 240], [2200, -1200, 0], buildTavernMiddle],
  ["fire", "② 火龙区与左侧塔顶", [0, 480], [-2600, 0, 300], buildFireDragon],
  ["left_bottom", "② 左侧塔底层", [300, 480], [-1300, 1000, 0], buildLeftBottom],
  ["deep", "⑤ 高墙深处与酒馆底层", [900, 500], [2500, 900, -300], buildDeepWall],
  ["exterior", "① 高墙外围", [300, 740], [0, 0, 0], buildExterior],
];

const modules = new Map(moduleSpecs.map(([key, name, graphPosition, assemblyPosition, build]) => {
  const module = createModule(key, name, graphPosition, assemblyPosition);
  build(module);
  return [key, module];
}));

const edges = [
  { letter: "A", type: "stairs", from: ["deep", 300, -100, 270], to: ["exterior", 800, 100, 90] },
  { letter: "N", type: "stairs", from: ["deep", -650, -700, 270], to: ["tavern_middle", -100, 250, 90] },
  { letter: "L", type: "stairs", from: ["tavern_middle", -220, -250, 270], to: ["jail_top", 280, -820, 90] },
  { letter: "H", type: "stairs", from: ["jail_top", -720, 0, 180], to: ["edge_roof", 1360, 350, 0] },
  { letter: "G", type: "stairs", from: ["edge_roof", -420, -330, 270], to: ["edge_third", 0, 620, 90] },
  { letter: "F", type: "stairs", from: ["edge_third", 0, -340, 270], to: ["edge_top", 0, 300, 90] },
  { letter: "J", type: "door", from: ["edge_roof", 1090, 190, 0], to: ["jk_stair", -730, -620, 180, 900] },
  { letter: "K", type: "door", from: ["jk_stair", 730, 620, 0], to: ["deep", -980, -100, 180] },
  { letter: "B", type: "stairs", from: ["exterior", -1420, -150, 180], to: ["fire", 610, -150, 0] },
  { letter: "E", type: "stairs", from: ["left_bottom", 0, -350, 270], to: ["fire", -930, -80, 180] },
  { letter: "C", type: "stairs", from: ["exterior", -1420, 0, 180], to: ["fire", 610, 0, 0] },
  { letter: "D", type: "stairs", from: ["exterior", -1420, 150, 180], to: ["fire", 610, 150, 0] },
  { letter: "M", type: "stairs", from: ["tavern_middle", 220, -250, 270], to: ["jail_top", 720, -820, 90] },
];

const connections = edges.map((edge) => {
  const sourceModule = modules.get(edge.from[0]);
  const targetModule = modules.get(edge.to[0]);
  if (!sourceModule || !targetModule) throw new Error(`Missing module for ${edge.letter}`);
  const sourcePortId = addPort(sourceModule, edge.letter, edge.type, { x: edge.from[1], y: edge.from[2], z: edge.from[4] ?? 0 }, edge.from[3]);
  const targetPortId = addPort(targetModule, edge.letter, edge.type, { x: edge.to[1], y: edge.to[2], z: edge.to[4] ?? 0 }, edge.to[3]);
  const sourceGraph = sourceModule.instance.graphPosition;
  const targetGraph = targetModule.instance.graphPosition;
  const middleX = (sourceGraph[0] + targetGraph[0]) / 2;
  return {
    id: `connection_${edge.letter.toLowerCase()}`,
    type: edge.type,
    sourceInstanceId: sourceModule.instance.id,
    sourcePortId,
    targetInstanceId: targetModule.instance.id,
    targetPortId,
    waypoints: [[middleX, sourceGraph[1]], [middleX, targetGraph[1]]],
  };
});

const project = {
  schemaVersion: 2,
  projectId: "project_lothric_high_wall_reference_v2",
  name: "洛斯里克高墙 · 结构还原 V2",
  modules: [...modules.values()].map((module) => module.definition),
  instances: [...modules.values()].map((module) => module.instance),
  connections,
  blockoutProfile: {
    enabled: true,
    enforceUeImport: false,
    capsuleRadius: 42,
    capsuleHalfHeight: 96,
    maxStepHeight: 45,
    minDoorWidth: 100,
    minDoorHeight: 210,
    maxStairRise: 20,
    minStairTread: 28,
  },
  updatedAt: "2026-09-01T00:00:00.000Z",
};

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
if (project.modules.length !== 10 || project.connections.length !== 13 || stairs.length < 10) throw new Error("Lothric topology is incomplete.");

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(`Generated ${OUTPUT}`);
console.log(`Modules: ${project.modules.length}; connections: ${project.connections.length}; blocks: ${allBlocks.length}`);
console.log(`Floors/walls: ${allBlocks.filter((block) => block.type === "box").length}; doors: ${allBlocks.filter((block) => block.type === "doorway").length}; stairs: ${stairs.length}; ports: ${allBlocks.filter((block) => block.type === "port").length}`);
