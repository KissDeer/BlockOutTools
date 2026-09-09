// 从《Lies of P · Elysian Boulevard》地图重建 v2 Blockout 项目。
// 采用"空间还原"：每个房间是一个 module（floor/wall/doorway/stairs/port 拼成），
// instances 放在贴合地图的相对位置，connections 表达门/楼梯/电梯连通。
// 比例约定：1 图素 ≈ 12 cm；原点取 START 房间中心；平面 X 向右 / Y 向下。
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "layouts/elysian-boulevard-rebuild.blockout.json");

// v2 schema 校验（与 validate-elysian-v2.mjs 相同的引入方式）
let projectSchema;
try {
  ({ projectSchema } = await import("../app-v2/src/domain/project-schema.ts"));
} catch (error) {
  console.warn("projectSchema import failed, skipping strict validation:", error.message);
}

const S = 12; // cm per map px
const WALL_H = 300;
const WALL_T = 40;
const FLOOR_T = 40;
const STEPS_LIMIT = 12;

const COL = {
  floor: [0.32, 0.34, 0.33, 1],
  floorTop: [0.78, 0.8, 0.78, 1],
  wall: [0.16, 0.18, 0.17, 1],
  wallTop: [0.5, 0.53, 0.5, 1],
  door: [0.23, 0.25, 0.24, 1],
  doorTop: [0.58, 0.62, 0.59, 1],
  stairs: [0.52, 0.4, 0.22, 1],
  stairsTop: [0.78, 0.65, 0.4, 1],
};

let blockSeq = 0;
const nextId = (prefix) => `${prefix}_${(++blockSeq).toString().padStart(3, "0")}`;

function box(id, name, size, position, rotation = 0, color = COL.wall, top = COL.wallTop) {
  return {
    id,
    name,
    type: "box",
    transform: { position, rotation },
    parameters: { BoxSize: size, blockout_material_color: color, blockout_material_top_color: top },
  };
}

function doorway(id, name, size, position, rotation = 0) {
  return {
    id,
    name,
    type: "doorway",
    transform: { position, rotation },
    parameters: {
      DoorwaySize: size,
      TopThickness: 40,
      SideThickness: 40,
      blockout_material_color: COL.door,
      blockout_material_top_color: COL.doorTop,
    },
  };
}

function stairs(id, name, size, position, rotation = 0) {
  return {
    id,
    name,
    type: "stairs-linear",
    transform: { position, rotation },
    parameters: {
      StairsSize: size,
      NumberOfSteps: 8,
      StairsType: "BOX",
      blockout_material_color: COL.stairs,
      blockout_material_top_color: COL.stairsTop,
    },
  };
}

function port(id, name, position, rotation = 0) {
  return {
    id,
    name,
    type: "port",
    transform: { position, rotation },
    parameters: { width: 120, depth: 80 },
  };
}

// 房间几何：给 floor 与四周墙，按 openings 在墙上留门洞并放 doorway + port。
// openings: { side: 'N'|'S'|'E'|'W', at: 沿墙偏移(cm), width: 门宽, exportPort?: {id,name} }
function roomBlocks(moduleId, name, w, d, floorZ, openings = []) {
  const blocks = [];
  blocks.push(box(`${moduleId}_floor`, `${name} 楼板`, [w, d, FLOOR_T], [0, 0, floorZ], 0, COL.floor, COL.floorTop));
  const halfW = w / 2;
  const halfD = d / 2;
  const doPass = (side) => openings.filter((o) => o.side === side);

  function wallRun(side, length, cx, cy, rot) {
    // 沿墙方向 split 出实体段；有门洞处跳过门洞宽度，并放 doorway + port
    const gaps = doPass(side).map((o) => ({ at: o.at, width: o.width }));
    const sorted = [...gaps].sort((a, b) => a.at - b.at);
    const segments = [];
    let cursor = -length / 2;
    for (const g of sorted) {
      const segStart = g.at - g.width / 2;
      const segEnd = g.at + g.width / 2;
      if (segStart - cursor > 0.5) segments.push([cursor, segStart]);
      cursor = Math.max(cursor, segEnd);
    }
    if (length / 2 - cursor > 0.5) segments.push([cursor, length / 2]);

    for (const [a, b] of segments) {
      const segLen = b - a;
      const mid = (a + b) / 2;
      const L = rot === 0 ? [segLen, WALL_T, WALL_H] : [WALL_T, segLen, WALL_H];
      blocks.push(box(
        nextId(`${moduleId}_wall`),
        `${name} 墙`,
        L,
        [cx + (rot === 0 ? mid : 0), cy + (rot === 0 ? 0 : mid), floorZ + WALL_H / 2],
        0,
        COL.wall,
        COL.wallTop,
      ));
    }

    for (const o of doPass(side)) {
      const dSize = rot === 0 ? [WALL_T + 4, o.height ?? 240, o.width] : [o.width, o.height ?? 240, WALL_T + 4];
      const dwPos = [
        cx + (rot === 0 ? o.at : 0),
        cy + (rot === 0 ? 0 : o.at),
        floorZ,
      ];
      blocks.push(doorway(nextId(`${moduleId}_door`), `${name} 门洞`, dSize, dwPos, 0));
      if (o.exportPort) {
        blocks.push(port(o.exportPort.id, o.exportPort.name, dwPos, o.facing ?? 0));
      }
    }
  }

  // N: y=-halfD, horizontal (rot 0), length=w
  wallRun("N", w, 0, -halfD, 0);
  // S: y=+halfD, horizontal (rot 0)
  wallRun("S", w, 0, halfD, 0);
  // W: x=-halfW, vertical (rot 90), length=d
  wallRun("W", d, -halfW, 0, 90);
  // E: x=+halfW, vertical
  wallRun("E", d, halfW, 0, 90);

  return blocks;
}

const modules = [];
const instances = [];
const connections = [];

// ---------- 段 1 · 起点下层：Hotel Krat → 下段长走廊 → 前厅 → Passage ----------
// 坐标（cm）：Y 向下，所以"地图上方/北侧"为负 Y。原点=START 中心。

function addModuleDefinition(module, instanceId, instanceName, graphPos, asmPos, asmRot) {
  modules.push(module);
  instances.push({
    id: instanceId,
    definitionId: module.id,
    name: instanceName,
    graphPosition: graphPos,
    assemblyTransform: { position: asmPos, rotation: asmRot },
  });
}

// 1) Hotel Krat 起点（START）
const hotel = {
  id: "module_hotel_krat",
  name: "① Hotel Krat 起点",
  revision: 1,
  blocks: [
    ...roomBlocks("module_hotel_krat", "Hotel Krat 起点", 600, 600, 0, [
      { side: "N", at: 0, width: 120, height: 260, exportPort: { id: "port_hotel_north", name: "上行口", facing: 0 } },
    ]),
  ],
};
addModuleDefinition(hotel, "instance_hotel_krat", "① Hotel Krat 起点", [0, 0], [0, 0, 0], 0);

// 2) 下段长走廊（窄长，纵向）
const corridor = {
  id: "module_corridor_lower",
  name: "② 大道下段通道",
  revision: 1,
  blocks: [
    ...roomBlocks("module_corridor_lower", "大道下段通道", 480, 1600, 0, [
      { side: "S", at: 0, width: 120, height: 260, exportPort: { id: "port_corridor_south", name: "起点侧口", facing: 90 } },
      { side: "N", at: 0, width: 120, height: 260, exportPort: { id: "port_corridor_north", name: "上行口", facing: 270 } },
    ]),
  ],
};
addModuleDefinition(corridor, "instance_corridor_lower", "② 大道下段通道", [220, 0], [0, -1100, 0], 0);

// 3) 前厅（通往 Passage 前的大厅）
const hall = {
  id: "module_entry_hall",
  name: "③ 前厅 · 通往 Passage",
  revision: 1,
  blocks: [
    ...roomBlocks("module_entry_hall", "前厅", 1500, 900, 300, [
      { side: "S", at: -300, width: 120, height: 260, exportPort: { id: "port_hall_south", name: "走廊口", facing: 90 } },
      { side: "E", at: 0, width: 140, height: 280, exportPort: { id: "port_hall_east", name: "通往 Passage", facing: 0 } },
    ]),
    stairs("stairs_hall_south", "前厅上行梯", [360, 900, 300], [0, 200, 150], 0),
  ],
};
addModuleDefinition(hall, "instance_entry_hall", "③ 前厅 · 通往 Passage", [450, 0], [300, -2600, 300], 0);

// 4) Passage / Throwing Cell 通道口
const passage = {
  id: "module_passage",
  name: "④ Passage 通道口",
  revision: 1,
  blocks: [
    ...roomBlocks("module_passage", "Passage 通道口", 900, 700, 300, [
      { side: "W", at: 0, width: 140, height: 280, exportPort: { id: "port_passage_west", name: "前厅口", facing: 180 } },
      { side: "N", at: 0, width: 120, height: 260, exportPort: { id: "port_passage_north", name: "Throwing Cell 口", facing: 0 } },
    ]),
  ],
};
addModuleDefinition(passage, "instance_passage", "④ Passage 通道口", [680, 0], [1750, -2600, 300], 0);

// ---------- 连接 ----------
let connSeq = 0;
const nextConn = () => `conn_seg1_${(++connSeq).toString().padStart(3, "0")}`;
function addConnection(type, fromInstance, fromPort, toInstance, toPort, waypoints = []) {
  connections.push({
    id: nextConn(),
    type,
    sourceInstanceId: fromInstance,
    sourcePortId: fromPort,
    targetInstanceId: toInstance,
    targetPortId: toPort,
    waypoints,
  });
}

addConnection("door", "instance_hotel_krat", "port_hotel_north", "instance_corridor_lower", "port_corridor_south", [[0, -550]]);
addConnection("stairs", "instance_corridor_lower", "port_corridor_north", "instance_entry_hall", "port_hall_south", [[0, -1850]]);
addConnection("door", "instance_entry_hall", "port_hall_east", "instance_passage", "port_passage_west", [[1050, -2600]]);

const blockoutProfile = {
  enabled: true,
  enforceUeImport: true,
  capsuleRadius: 42,
  capsuleHalfHeight: 96,
  maxStepHeight: 45,
  minDoorWidth: 100,
  minDoorHeight: 210,
  maxStairRise: 20,
  minStairTread: 28,
};

const project = {
  schemaVersion: 2,
  projectId: "project_elysian_boulevard_rebuild",
  name: "Elysian Boulevard · 结构还原（重建）",
  modules,
  instances,
  connections,
  blockoutProfile,
  updatedAt: new Date().toISOString(),
};

if (projectSchema) {
  const result = projectSchema.safeParse(project);
  if (!result.success) {
    console.error("Schema validation FAILED:");
    console.error(JSON.stringify(result.error.issues, null, 2));
    process.exit(1);
  }
  console.log("Schema validation OK.");
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(project, null, 2)}\n`, "utf8");

console.log(`Modules: ${modules.length}; instances: ${instances.length}; connections: ${connections.length}`);
console.log(`Wrote ${OUTPUT}`);
