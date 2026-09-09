import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Elysian Boulevard (Lies of P) — BlockOutTools V2 结构还原（共墙对接版）
//
// 对齐约定（与原图对照）：
// - 所有模块实例旋转恒为 0（局部坐标即世界方向：+x 东 / +y 南 / -y 北），
//   要求每条连接的端口朝向严格成对：目标端口 rot = 源端口 rot + 180。
// - door / one-way-door：端口重合（forward=0），两模块共墙贴合，墙面放置门洞物件。
// - stairs：规则 forward=400 / vertical=+300，源模块内放置深度 420 的楼梯几何
//   精确填满间距，顶部搭入目标模块楼板 20（卡扣重叠）。
// - elevator：forward=0 / +300，模块在平面上共墙贴合、竖向堆叠。
// - drop：forward=250 / -300，250 间距为下落竖坑（开放），属刻意留空。
//
// 比例尺：Hotel Krat 参照走廊 6m 宽 => 1m = 100 单位（UE cm 约定）
// 黑色地面 => z=0 模块；灰色半空 => z=+300/+600/+900 模块

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "layouts/elysian-boulevard-v2.blockout.json");

const FLOOR_THICKNESS = 40;
const WALL_HEIGHT = 360;
const WALL_THICKNESS = 44;
const MAX_WALL_LENGTH = 360;
const WALL_OVERLAP = 8;

const COLORS = {
  groundFloor: [0.07, 0.075, 0.085, 1],
  groundTop: [0.14, 0.15, 0.16, 1],
  upperFloor: [0.28, 0.29, 0.31, 1],
  upperTop: [0.46, 0.47, 0.49, 1],
  mezzanineFloor: [0.34, 0.35, 0.37, 1],
  mezzanineTop: [0.58, 0.59, 0.61, 1],
  wall: [0.05, 0.052, 0.055, 1],
  wallTop: [0.16, 0.17, 0.18, 1],
  door: [0.83, 0.69, 0.18, 1],
  doorTop: [0.97, 0.85, 0.4, 1],
  stair: [0.77, 0.59, 0.13, 1],
  stairTop: [0.94, 0.78, 0.28, 1],
  prop: [0.2, 0.21, 0.22, 1],
  propTop: [0.4, 0.41, 0.43, 1],
};

const MARKER_COLORS = {
  enemy: { color: [0.85, 0.2, 0.2, 1], top: [1, 0.45, 0.45, 1], size: [40, 40, 160] },
  "big-enemy": { color: [1, 0.78, 0.25, 1], top: [1, 0.9, 0.55, 1], size: [90, 90, 220] },
  boss: { color: [0.9, 0.32, 0.12, 1], top: [1, 0.55, 0.3, 1], size: [180, 180, 340] },
  pickup: { color: [0.8, 0.65, 0.3, 1], top: [0.95, 0.85, 0.55, 1], size: [40, 40, 160] },
  npc: { color: [0.25, 0.55, 0.85, 1], top: [0.55, 0.8, 1, 1], size: [50, 50, 200] },
  stargazer: { color: [0.4, 0.7, 0.9, 1], top: [0.7, 0.9, 1, 1], size: [50, 50, 200] },
  butterfly: { color: [0.6, 0.45, 0.85, 1], top: [0.8, 0.7, 1, 1], size: [50, 50, 200] },
  prop: { color: COLORS.prop, top: COLORS.propTop, size: [40, 40, 160] },
};

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

function addBox(module, name, center, size, rotation = 0, material = {}) {
  const block = {
    id: nextBlockId(module, "box"),
    name,
    type: "box",
    transform: { position: [center.x, center.y, center.z ?? 0], rotation: normalizeRotation(rotation) },
    parameters: {
      BoxSize: size,
      blockout_material_color: material.color ?? COLORS.wall,
      blockout_material_top_color: material.top ?? COLORS.wallTop,
    },
  };
  module.definition.blocks.push(block);
  return block;
}

function addFloor(module, name, center, size, rotation = 0, level = "ground") {
  const material =
    level === "ground"
      ? { color: COLORS.groundFloor, top: COLORS.groundTop }
      : level === "upper"
        ? { color: COLORS.upperFloor, top: COLORS.upperTop }
        : { color: COLORS.mezzanineFloor, top: COLORS.mezzanineTop };
  return addBox(module, name, { ...center, z: center.z ?? 0 }, [size[0], size[1], FLOOR_THICKNESS], rotation, material);
}

function addWallLine(module, name, start, end, options = {}) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const count = Math.max(1, Math.ceil(length / MAX_WALL_LENGTH));
  const segmentLength = length / count;
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
  for (let index = 0; index < count; index += 1) {
    const ratio = (index + 0.5) / count;
    addBox(module, `${name} ${index + 1}`, {
      x: start.x + dx * ratio,
      y: start.y + dy * ratio,
      z: options.z ?? FLOOR_THICKNESS,
    }, [segmentLength + (count > 1 ? WALL_OVERLAP : 0), options.thickness ?? WALL_THICKNESS, options.height ?? WALL_HEIGHT], rotation);
  }
}

function addRoom(module, name, center, size, openings = [], level = "ground") {
  addFloor(module, `${name}楼板`, center, size, 0, level);
  const [width, depth] = size;
  const left = center.x - width / 2;
  const right = center.x + width / 2;
  const top = center.y - depth / 2;
  const bottom = center.y + depth / 2;
  if (!openings.includes("north")) addWallLine(module, `${name}北墙`, { x: left, y: top }, { x: right, y: top }, { z: (center.z ?? 0) + FLOOR_THICKNESS });
  if (!openings.includes("south")) addWallLine(module, `${name}南墙`, { x: left, y: bottom }, { x: right, y: bottom }, { z: (center.z ?? 0) + FLOOR_THICKNESS });
  if (!openings.includes("west")) addWallLine(module, `${name}西墙`, { x: left, y: top }, { x: left, y: bottom }, { z: (center.z ?? 0) + FLOOR_THICKNESS });
  if (!openings.includes("east")) addWallLine(module, `${name}东墙`, { x: right, y: top }, { x: right, y: bottom }, { z: (center.z ?? 0) + FLOOR_THICKNESS });
}

// gaps: [{ side: "left"|"right", coord: "x"|"y", from, to }]
// coord/from/to 用模块局部坐标表达墙口范围（沿走廊轴线的那个坐标）。
function addHall(module, name, start, end, width, level = "ground", gaps = []) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  addFloor(module, `${name}楼板`, center, [length + 12, width], rotation, level);
  const leftOffsetX = -uy * (width / 2);
  const leftOffsetY = ux * (width / 2);
  for (const side of ["left", "right"]) {
    const sign = side === "left" ? 1 : -1;
    const offsetX = leftOffsetX * sign;
    const offsetY = leftOffsetY * sign;
    const cuts = [];
    for (const gap of gaps) {
      if (gap.side !== side) continue;
      let t0;
      let t1;
      if (gap.coord === "x") {
        t0 = (gap.from - start.x) / ux;
        t1 = (gap.to - start.x) / ux;
      } else {
        t0 = (gap.from - start.y) / uy;
        t1 = (gap.to - start.y) / uy;
      }
      if (t0 > t1) [t0, t1] = [t1, t0];
      cuts.push([Math.max(0, t0), Math.min(length, t1)]);
    }
    cuts.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    const segments = [];
    for (const [from, to] of cuts) {
      if (from > cursor) segments.push([cursor, from]);
      cursor = Math.max(cursor, to);
    }
    if (cursor < length) segments.push([cursor, length]);
    for (const [from, to] of segments) {
      if (to - from < 1) continue;
      addWallLine(module, `${name}${side === "left" ? "左" : "右"}墙`, {
        x: start.x + ux * from + offsetX,
        y: start.y + uy * from + offsetY,
      }, {
        x: start.x + ux * to + offsetX,
        y: start.y + uy * to + offsetY,
      });
    }
  }
}

function angularDistance(left, right) {
  const delta = Math.abs(normalizeRotation(left) - normalizeRotation(right)) % 360;
  return Math.min(delta, 360 - delta);
}

function addRoundRoom(module, name, center, radius, openings = []) {
  const bandCount = 5;
  const bandHeight = (radius * 2) / bandCount;
  for (let index = 0; index < bandCount; index += 1) {
    const localY = -radius + bandHeight * (index + 0.5);
    const halfWidth = Math.sqrt(Math.max(0, radius * radius - localY * localY));
    addFloor(module, `${name}楼板 ${index + 1}`, { x: center.x, y: center.y + localY }, [halfWidth * 2 + 12, bandHeight + 12]);
  }
  const segmentCount = 12;
  const pointAt = (angle) => {
    const radians = (angle * Math.PI) / 180;
    return { x: center.x + Math.cos(radians) * radius, y: center.y + Math.sin(radians) * radius };
  };
  for (let index = 0; index < segmentCount; index += 1) {
    const startAngle = (index * 360) / segmentCount;
    const endAngle = ((index + 1) * 360) / segmentCount;
    const middleAngle = (startAngle + endAngle) / 2;
    if (openings.some((angle) => angularDistance(middleAngle, angle) < 16)) continue;
    addWallLine(module, `${name}圆墙`, pointAt(startAngle), pointAt(endAngle));
  }
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

// rotation 约定：0 = 朝东(+x)，90 = 朝南(+y)，180 = 朝西(-x)，270 = 朝北(-y)
// 成对规则：目标端口 rot = 源端口 rot + 180，保证模块解算旋转恒为 0。
function addPort(module, letter, label, type, center, rotation) {
  const id = `port_${module.key}_${letter.toLowerCase()}`;
  module.definition.blocks.push({
    id,
    name: `${letter} · ${label}`,
    type: "port",
    transform: { position: [center.x, center.y, center.z ?? FLOOR_THICKNESS], rotation: normalizeRotation(rotation) },
    parameters: { width: type === "door" || type === "one-way-door" ? 150 : 200, depth: 90 },
  });
  return id;
}

function addMarker(module, category, label, center, z) {
  const spec = MARKER_COLORS[category] ?? MARKER_COLORS.pickup;
  const [sx, sy, sz] = spec.size;
  addBox(
    module,
    `标记 · ${label}`,
    { x: center.x, y: center.y, z: (z ?? FLOOR_THICKNESS) + sz / 2 },
    [sx, sy, sz],
    0,
    { color: spec.color, top: spec.top },
  );
}

// 连接楼梯（跨模块）：深度 420 = 规则 forward 400 + 顶部搭接 20，
// 15 级台阶（踏面 28 / 踢面 20）恰好满足 blockoutProfile。
function addLinkStairs(module, name, center, width, rotation) {
  addStairs(module, name, center, width, 420, 300, rotation);
}

// ============================ 模块定义 ============================

function buildHotelKrat(module) {
  addRoom(module, "Hotel Krat 起始大厅", { x: 0, y: 0 }, [1000, 1000], ["north"]);
  addHall(module, "START 参照走廊(6m)", { x: 0, y: -500 }, { x: 0, y: -1750 }, 600);
  addStairs(module, "START 台阶", { x: 0, y: -1000 }, 500, 500, 150, 180);
  addMarker(module, "stargazer", "Stargazer · Hotel Krat 起点", { x: 300, y: 300 });
  addMarker(module, "enemy", "敌人 · 起始大厅 1", { x: -300, y: -200 });
  addMarker(module, "enemy", "敌人 · 起始大厅 2", { x: 200, y: -100 });
  addMarker(module, "pickup", "拾取物 · Hotel Krat Passage", { x: 0, y: -1400 });
}

function buildBoulevardLower(module) {
  // 南侧入口竖廊（与 Hotel Krat 走廊共墙对接）
  addHall(module, "Passage 入口竖廊", { x: 0, y: 900 }, { x: 0, y: 300 }, 600, "ground", [
    { side: "right", coord: "y", from: 500, to: 800 },
  ]);
  // 东西向主廊，南墙在竖廊接口处开口
  addHall(module, "Hotel Krat Passage", { x: -1800, y: 0 }, { x: 500, y: 0 }, 600, "ground", [
    { side: "left", coord: "x", from: -300, to: 300 },
  ]);
  addRoom(module, "Throwing Cell", { x: -794, y: 700 }, [988, 800], ["east"]);
  addRoundRoom(module, "Intersection / Whirlwind", { x: 900, y: 0 }, 450, [0, 180]);
  addMarker(module, "enemy", "敌人 · Passage 1", { x: -1200, y: 150 });
  addMarker(module, "enemy", "敌人 · Passage 2", { x: -200, y: -150 });
  addMarker(module, "enemy", "敌人 · Throwing Cell", { x: -794, y: 700 });
  addMarker(module, "pickup", "拾取物 · Intersection", { x: 900, y: 300 });
  addMarker(module, "pickup", "素材 · Passage", { x: -400, y: 0 });
}

function buildCulvertSouth(module) {
  // 西侧入口短廊（与大道下段共墙对接）
  addHall(module, "Culvert 西入口廊", { x: -1200, y: 600 }, { x: -300, y: 600 }, 600);
  // 南北向主廊：西墙在密室门与入口廊处开口，东墙在后门死路处开口
  addHall(module, "Culvert 紧急通道", { x: 0, y: -800 }, { x: 0, y: 800 }, 600, "ground", [
    { side: "left", coord: "y", from: -600, to: -300 },
    { side: "left", coord: "y", from: 300, to: 800 },
    { side: "right", coord: "y", from: -450, to: -150 },
  ]);
  addRoom(module, "Hidden Monument 密室", { x: -725, y: -550 }, [850, 700], ["east"]);
  addRoom(module, "Antechamber 后门死路", { x: 725, y: -300 }, [850, 700], ["west"]);
  addMarker(module, "pickup", "收藏品 · Hidden Monument", { x: -725, y: -550 });
  addMarker(module, "enemy", "敌人 · Culvert 1", { x: 0, y: -400 });
  addMarker(module, "enemy", "敌人 · Culvert 2", { x: 0, y: 200 });
  addMarker(module, "pickup", "素材 · 后门死路", { x: 725, y: -300 });
}

function buildEmergencyPassage(module) {
  addHall(module, "通用紧急通道", { x: -1100, y: 0 }, { x: 1100, y: 0 }, 600, "upper", [
    { side: "left", coord: "x", from: -250, to: 250 },
  ]);
  addDoor(module, "Electric Wire Obstacle 电线障碍", { x: 0, y: 0 }, 90);
  addMarker(module, "enemy", "敌人 · 紧急通道 1", { x: -700, y: 120 });
  addMarker(module, "enemy", "敌人 · 紧急通道 2", { x: 400, y: -120 });
  addMarker(module, "enemy", "敌人 · 紧急通道 3", { x: 900, y: 100 });
  addMarker(module, "pickup", "素材 · 电线障碍旁", { x: -300, y: 0 });
}

function buildPumpStation(module) {
  addRoom(module, "Culvert 泵站主厅", { x: 0, y: 0 }, [1400, 1200], ["north", "east", "west"]);
  addFloor(module, "泵站上层平台(半空)", { x: 400, y: -200, z: 300 }, [700, 600], 0, "mezzanine");
  addStairs(module, "泵站上行短梯", { x: -250, y: -200 }, 500, 700, 300, 0);
  addMarker(module, "enemy", "敌人 · 泵站 1", { x: 0, y: 300 });
  addMarker(module, "enemy", "敌人 · 泵站 2", { x: -400, y: 100 });
  addMarker(module, "enemy", "敌人 · 泵站 3", { x: 300, y: 250 });
  addMarker(module, "pickup", "拾取物 · 上层平台", { x: 400, y: -200 }, 340);
}

function buildWorkshopFront(module) {
  addHall(module, "车间前廊", { x: -700, y: 0 }, { x: 700, y: 0 }, 600, "upper", [
    { side: "left", coord: "x", from: -250, to: 250 },
  ]);
  addDoor(module, "Electric Slide Obstacle 电滑障碍", { x: 0, y: 0 }, 90);
  addMarker(module, "enemy", "敌人 · 车间前廊", { x: 300, y: 120 });
  addMarker(module, "pickup", "功能物品 · 电滑障碍旁", { x: -300, y: 0 });
  addMarker(module, "pickup", "素材 · 前廊", { x: 0, y: 180 });
}

function buildSubway(module) {
  addRoom(module, "Vertical Hold Subway 井道", { x: 0, y: 0 }, [900, 900], ["west", "north"], "upper");
  addMarker(module, "enemy", "敌人 · 井道", { x: 200, y: 200 });
  addMarker(module, "pickup", "收藏品 · 井道", { x: -200, y: 200 });
}

function buildHalfPlatform(module) {
  addRoom(module, "Half Platform 半空平台", { x: -550, y: 0 }, [1500, 1000], ["east", "south"], "upper");
  addRoom(module, "Patrol Squad 巡逻平台", { x: 740, y: 0 }, [1100, 900], ["west", "east"], "upper");
  addMarker(module, "enemy", "敌人 · 半空平台 1", { x: -800, y: -200 });
  addMarker(module, "enemy", "敌人 · 半空平台 2", { x: -300, y: 200 });
  addMarker(module, "enemy", "敌人 · 巡逻平台 1", { x: 700, y: -150 });
  addMarker(module, "enemy", "敌人 · 巡逻平台 2", { x: 1000, y: 150 });
  addMarker(module, "pickup", "拾取物 · 半空平台", { x: -550, y: 0 });
  addMarker(module, "pickup", "防御部件 · 巡逻平台", { x: 740, y: 300 });
}

function buildFrozenShield(module) {
  addRoom(module, "冰盾士兵竞技场", { x: 0, y: 0 }, [1600, 1200], ["west", "east", "south"], "upper");
  addMarker(module, "big-enemy", "大型敌人 · Frozen Shield Soldier", { x: 0, y: 0 });
  addMarker(module, "enemy", "敌人 · 竞技场 1", { x: -400, y: -300 });
  addMarker(module, "enemy", "敌人 · 竞技场 2", { x: 400, y: 300 });
  addMarker(module, "pickup", "素材 · 竞技场", { x: -300, y: 200 });
}

function buildWanderer(module) {
  addRoom(module, "Wanderer Vestige 区域", { x: 0, y: 0 }, [1400, 900], ["west"], "upper");
  addMarker(module, "npc", "NPC · Wanderer Vestige", { x: 0, y: 100 });
  addMarker(module, "enemy", "敌人 · 漫游者 1", { x: 300, y: -200 });
  addMarker(module, "enemy", "敌人 · 漫游者 2", { x: -400, y: 100 });
  addMarker(module, "pickup", "收藏品 · 漫游者", { x: 500, y: 200 });
}

function buildPatrolNorth(module) {
  addRoom(module, "北段巡逻场", { x: 0, y: 0 }, [1300, 1000], ["west", "east", "north", "south"], "upper");
  addBox(module, "Unloading Vehicle 卸货车", { x: 350, y: 250, z: 40 }, [500, 300, 180], 0, { color: COLORS.prop, top: COLORS.propTop });
  addMarker(module, "big-enemy", "大型敌人 · 巡逻队长", { x: -300, y: -100 });
  addMarker(module, "enemy", "敌人 · 巡逻场 1", { x: 300, y: -250 });
  addMarker(module, "enemy", "敌人 · 巡逻场 2", { x: -100, y: 300 });
  addMarker(module, "pickup", "防御部件 · 卸货车旁", { x: -500, y: 200 });
}

function buildStruggleYard(module) {
  addRoom(module, "双子抗争场", { x: 0, y: 0 }, [1500, 1100], ["south", "east"], "upper");
  addMarker(module, "npc", "NPC · 抗争场 1", { x: -300, y: -200 });
  addMarker(module, "npc", "NPC · 抗争场 2", { x: 200, y: -300 });
  addMarker(module, "butterfly", "维度蝴蝶 · 抗争场", { x: 400, y: 200 });
  addMarker(module, "big-enemy", "大型敌人 · 抗争场", { x: 0, y: 100 });
  addMarker(module, "enemy", "敌人 · 抗争场 1", { x: -500, y: 300 });
  addMarker(module, "enemy", "敌人 · 抗争场 2", { x: 500, y: -50 });
  addMarker(module, "pickup", "功能物品 · 抗争场", { x: 500, y: -300 });
}

function buildBridgeLanding(module) {
  addRoom(module, "桥头平台", { x: 0, y: 0 }, [800, 800], ["west", "east"], "upper");
  addMarker(module, "pickup", "拾取物 · 桥头平台", { x: 0, y: 0 });
}

function buildAlchemistBridge(module) {
  addHall(module, "Alchemist Bridge 桥面", { x: -900, y: 0 }, { x: 500, y: 0 }, 700, "upper");
  addRoom(module, "桥心 Boss 竞技场", { x: 1250, y: 0 }, [1400, 1400], ["west"], "upper");
  addStairs(module, "出口下行大楼梯", { x: 1550, y: 0 }, 600, 750, 450, 0);
  addMarker(module, "boss", "BOSS · Alchemist Bridge", { x: 1250, y: 0 });
  addMarker(module, "enemy", "敌人 · 桥面 1", { x: 1000, y: -400 });
  addMarker(module, "enemy", "敌人 · 桥面 2", { x: 1500, y: 400 });
  addMarker(module, "enemy", "敌人 · 桥面 3", { x: 1750, y: -200 });
  addMarker(module, "pickup", "收藏品 · Torn Doodle", { x: 700, y: 200 });
  addMarker(module, "pickup", "护身符 · 竞技场", { x: 1250, y: -450 });
}

// 组装位姿仅为草稿锚点：求解器从根模块（Hotel Krat）沿连接树精确重排，
// 以下数值 = 按端口规则手工推演的期望世界坐标，保证草稿与解算结果一致。
const moduleSpecs = [
  ["hotel_krat", "① Hotel Krat 起点", [0, 1000], [0, 0, 0], buildHotelKrat],
  ["boulevard_lower", "② 大道下段 · Passage 与 Throwing Cell", [220, 1000], [0, -2650, 0], buildBoulevardLower],
  ["culvert_south", "③ Culvert 紧急通道与密室", [440, 1000], [2550, -3250, 0], buildCulvertSouth],
  ["emergency_passage", "④ 通用紧急通道(灰·半空)", [660, 1000], [2550, -4750, 300], buildEmergencyPassage],
  ["pump_station", "⑤ Culvert 泵站", [880, 1000], [4600, -4750, 0], buildPumpStation],
  ["workshop_front", "⑥ 车间前廊(灰·半空)", [880, 780], [4600, -6050, 300], buildWorkshopFront],
  ["subway", "⑦ Vertical Hold Subway(灰·半空)", [1100, 780], [5750, -6050, 300], buildSubway],
  ["half_platform", "⑧ Half Platform 与巡逻平台(灰)", [1100, 560], [5750, -7000, 600], buildHalfPlatform],
  ["frozen_shield", "⑨ 冰盾士兵竞技场(灰)", [1540, 560], [9140, -7000, 600], buildFrozenShield],
  ["wanderer", "⑩ Wanderer Vestige 区域(灰)", [1760, 560], [10640, -7000, 600], buildWanderer],
  ["patrol_north", "⑪ 北段巡逻场(灰)", [1320, 560], [7690, -7000, 600], buildPatrolNorth],
  ["struggle_yard", "⑫ 双子抗争场(灰·高层)", [1320, 340], [7690, -8450, 900], buildStruggleYard],
  ["bridge_landing", "⑬ 桥头平台(灰)", [1540, 340], [9090, -8450, 600], buildBridgeLanding],
  ["alchemist_bridge", "⑭ Alchemist Bridge 终点(灰·高层)", [1760, 340], [10790, -8450, 900], buildAlchemistBridge],
];

const modules = new Map(
  moduleSpecs.map(([key, name, graphPosition, assemblyPosition, build]) => {
    const module = createModule(key, name, graphPosition, assemblyPosition);
    build(module);
    return [key, module];
  }),
);

// ============================ 连接表 ============================
// 端口成对规则：to.rot = from.rot + 180（模块旋转保持 0）。
// door：端口重合于共墙；stairs：端口间距 400 由深度 420 楼梯填满；drop 间距 250 为竖坑。
const edges = [
  { letter: "A", type: "door", label: "Hotel 至 Passage 通道门", from: ["hotel_krat", 0, -1750, 270, 40], to: ["boulevard_lower", 0, 900, 90, 40] },
  { letter: "B", type: "door", label: "Passage 至 Culvert 通道门", from: ["boulevard_lower", 1350, 0, 0, 40], to: ["culvert_south", -1200, 600, 180, 40] },
  { letter: "C", type: "stairs", label: "Culvert 上行梯", from: ["culvert_south", 0, -800, 270, 40], to: ["emergency_passage", 0, 300, 90, 40] },
  { letter: "D", type: "drop", label: "紧急通道下落泵站", from: ["emergency_passage", 1100, 0, 0, 40], to: ["pump_station", -700, 0, 180, 40] },
  { letter: "E", type: "stairs", label: "泵站上行车间廊", from: ["pump_station", 0, -600, 270, 40], to: ["workshop_front", 0, 300, 90, 40] },
  { letter: "F", type: "door", label: "车间廊至 Subway 通道门", from: ["workshop_front", 700, 0, 0, 40], to: ["subway", -450, 0, 180, 40] },
  { letter: "G", type: "elevator", label: "Subway 电梯", from: ["subway", 0, -450, 270, 40], to: ["half_platform", 0, 500, 90, 40] },
  { letter: "H", type: "door", label: "巡逻场路", from: ["half_platform", 1290, 0, 0, 40], to: ["patrol_north", -650, 0, 180, 40] },
  { letter: "I", type: "door", label: "冰盾区路", from: ["patrol_north", 650, 0, 0, 40], to: ["frozen_shield", -800, 0, 180, 40] },
  { letter: "J", type: "door", label: "漫游者路", from: ["frozen_shield", 800, -200, 0, 40], to: ["wanderer", -700, -200, 180, 40] },
  { letter: "K", type: "stairs", label: "抗争场上行梯", from: ["patrol_north", 0, -500, 270, 40], to: ["struggle_yard", 0, 550, 90, 40] },
  { letter: "L", type: "drop", label: "桥头单向下落", from: ["struggle_yard", 750, 0, 0, 40], to: ["bridge_landing", -400, 0, 180, 40] },
  { letter: "M", type: "stairs", label: "桥面上行梯", from: ["bridge_landing", 400, 0, 0, 40], to: ["alchemist_bridge", -900, 0, 180, 40] },
  { letter: "N", type: "one-way-door", label: "冰盾区单向门", from: ["wanderer", -700, 200, 180, 40], to: ["frozen_shield", 800, 200, 0, 40] },
];

// door 类连接在共享墙上放置门洞物件（面对面卡扣）。
const DOORWAY_ROTATIONS = { 0: 0, 180: 0, 90: 90, 270: 90 };

const connections = edges.map((edge) => {
  const sourceModule = modules.get(edge.from[0]);
  const targetModule = modules.get(edge.to[0]);
  if (!sourceModule || !targetModule) throw new Error(`Missing module for ${edge.letter}`);
  const sourceRotation = edge.from[3];
  const sourcePortId = addPort(sourceModule, edge.letter, edge.label, edge.type, { x: edge.from[1], y: edge.from[2], z: edge.from[4] ?? 0 }, sourceRotation);
  const targetPortId = addPort(targetModule, edge.letter, edge.label, edge.type, { x: edge.to[1], y: edge.to[2], z: edge.to[4] ?? 0 }, edge.to[3]);
  if (edge.type === "door" || edge.type === "one-way-door") {
    addDoor(sourceModule, `${edge.label} 门洞`, { x: edge.from[1], y: edge.from[2] }, DOORWAY_ROTATIONS[sourceRotation]);
  }
  if (edge.type === "stairs") {
    addLinkStairs(sourceModule, `${edge.label} 楼梯`, stairsCenter(edge), stairsRotation(sourceRotation));
  }
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

function stairsRotation(sourceRotation) {
  // 楼梯块沿局部 +y 升高：升高方向 = rotate2d(0,1,r)，需等于行进方向（源端口朝向）
  // => r = 源端口 rot + 270（270 北→180，0 东→270，90 南→0，180 西→90）
  return normalizeRotation(sourceRotation + 270);
}

function stairsCenter(edge) {
  // 楼梯几何从源端口起、沿行进方向铺满 420（跨过 400 间距，搭入目标 20）
  const [, x, y, rotation] = edge.from;
  const direction = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] }[rotation];
  return { x: x + direction[0] * 210, y: y + direction[1] * 210 };
}

const project = {
  schemaVersion: 2,
  projectId: "project_elysian_boulevard_v2",
  name: "伊里西安大道 · 结构还原 V2",
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
  updatedAt: "2026-09-02T00:00:00.000Z",
};

// ============================ 校验 ============================

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
// 端口成对朝向检查：目标 rot 必须 = 源 rot + 180（保证零旋转解算）
for (const edge of edges) {
  const expected = normalizeRotation(edge.from[3] + 180);
  if (normalizeRotation(edge.to[3]) !== expected) throw new Error(`Port rotation pair broken on ${edge.letter}`);
}
const stairs = allBlocks.filter((block) => block.type === "stairs-linear");
for (const stair of stairs) {
  const [, depth, height] = stair.parameters.StairsSize;
  if (height / stair.parameters.NumberOfSteps > project.blockoutProfile.maxStairRise) throw new Error(`Stair rise invalid: ${stair.name}`);
  if (depth / stair.parameters.NumberOfSteps < project.blockoutProfile.minStairTread) throw new Error(`Stair tread invalid: ${stair.name}`);
}
if (project.modules.length !== 14) throw new Error("Elysian topology is incomplete: modules.");
if (project.connections.length !== 14) throw new Error("Elysian topology is incomplete: connections.");
const markers = allBlocks.filter((block) => block.name.startsWith("标记 · "));
if (markers.length < 50) throw new Error("Elysian markers missing.");

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(project, null, 2)}\n`, "utf8");
console.log(`Generated ${OUTPUT}`);
console.log(`Modules: ${project.modules.length}; connections: ${project.connections.length}; blocks: ${allBlocks.length}`);
console.log(`Floors/walls/props: ${allBlocks.filter((block) => block.type === "box").length}; doors: ${allBlocks.filter((block) => block.type === "doorway").length}; stairs: ${stairs.length}; ports: ${allBlocks.filter((block) => block.type === "port").length}; markers: ${markers.length}`);
