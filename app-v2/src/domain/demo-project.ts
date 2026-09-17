import { createEmptyScope, createEmptyTopology } from "./concept";
import type { LogicNode, LogicScope, LogicTopology } from "./concept";
import type { BlockoutProject, BoxBlock, DoorwayBlock, PortBlock, StairsLinearBlock } from "./types";

/**
 * 示例项目：一张逻辑拓扑，**几何直接挂在节点上**。
 *
 * 模块层删掉之后，"城墙庭院 → 边塔平台"不再是两个模块定义加两个实例，而是节点自己：
 * 节点的 `blocks` 就是体块，节点的 `relativePosition` 就是落位，`childScopeId` 就是它内部的下一层。
 * 这里刻意把三种形态都摆出来，让示例同时充当测试夹具：
 *
 * - 有几何的节点（庭院、走道、边塔）
 * - 既有几何**又有**子层的节点（边塔：自己拼了体块，里面还分了塔顶与暗格）
 * - 还没拼体块的节点（密封暗室）
 *
 * 两处刻意的取舍：
 *
 * 1. 边塔原来靠实例的 `assemblyTransform` 抬到 300cm 高，而节点局部坐标**不再往上累加 Z**
 *    （展平只沿层级累加落位的 XY 与朝向），所以那 300cm 并进塔上积木的局部 Z。
 *    这是"世界高度由谁负责"换人之后的必然结果，不是随手改的数。
 * 2. 示例积木**不标 `role`**。标成楼板就会触发落脚支撑检查，而这些积木的标高是示意性的
 *    （东侧门本来就挑在庭院的楼板外面）—— 示例第一次打开就报一堆错，比不标更难用。
 */

/** 走道相对庭院的标高（厘米） */
const WALKWAY_LEVEL = 400;
/** 边塔相对庭院的标高（厘米）：原实例的 assemblyTransform.position[2] */
const TOWER_LEVEL = 300;
/** 边塔相对庭院的平面落位（厘米）：原实例的 assemblyTransform.position[0..1] */
const TOWER_OFFSET: [number, number] = [1200, 0];
/** 密封暗室相对庭院的平面落位（厘米） */
const VAULT_OFFSET: [number, number] = [1200, 900];

const floor: BoxBlock = {
  id: "block_demo_floor",
  name: "主楼板",
  type: "box",
  transform: { position: [0, 0, 0], rotation: 0 },
  parameters: {
    BoxSize: [900, 650, 40],
    blockout_material_color: [0.2, 0.48, 0.4, 1],
    blockout_material_top_color: [0.64, 0.8, 0.72, 1],
  },
};

const wall: BoxBlock = {
  id: "block_demo_wall",
  name: "北侧墙体",
  type: "box",
  transform: { position: [0, -305, 40], rotation: 0 },
  parameters: {
    BoxSize: [900, 40, 300],
    blockout_material_color: [0.21, 0.23, 0.22, 1],
    blockout_material_top_color: [0.45, 0.49, 0.46, 1],
  },
};

const doorway: DoorwayBlock = {
  id: "block_demo_doorway",
  name: "庭院门洞",
  type: "doorway",
  transform: { position: [430, 0, 40], rotation: 90 },
  parameters: {
    DoorwaySize: [40, 140, 240],
    TopThickness: 40,
    SideThickness: 40,
    blockout_material_color: [0.23, 0.25, 0.24, 1],
    blockout_material_top_color: [0.54, 0.58, 0.55, 1],
  },
};

const stairs: StairsLinearBlock = {
  id: "block_demo_stairs",
  name: "平台直梯",
  type: "stairs-linear",
  transform: { position: [-260, 80, 40], rotation: 0 },
  parameters: {
    StairsSize: [180, 360, 180],
    NumberOfSteps: 10,
    StairsType: "BOX",
    blockout_material_color: [0.52, 0.39, 0.2, 1],
    blockout_material_top_color: [0.78, 0.63, 0.35, 1],
  },
};

const eastPort: PortBlock = {
  id: "port_demo_east",
  name: "东侧门",
  type: "port",
  transform: { position: [470, 0, 40], rotation: 0 },
  parameters: { width: 140, depth: 80 },
};

const westPort: PortBlock = {
  id: "port_demo_west",
  name: "西侧楼梯",
  type: "port",
  transform: { position: [-470, 80, 40], rotation: 180 },
  parameters: { width: 180, depth: 80 },
};

const walkwayFloor: BoxBlock = {
  ...floor,
  id: "block_demo_walkway_floor",
  name: "走道楼板",
  transform: { position: [0, 0, WALKWAY_LEVEL], rotation: 0 },
  parameters: { ...floor.parameters, BoxSize: [900, 260, 40] },
};

const walkwayDoor: DoorwayBlock = {
  ...doorway,
  id: "block_demo_walkway_door",
  name: "走道尽头门洞",
  transform: { position: [430, 0, WALKWAY_LEVEL + 40], rotation: 90 },
  parameters: { ...doorway.parameters, DoorwaySize: [40, 120, 240] },
};

/** 塔上的积木：整体抬到 `TOWER_LEVEL`，其余沿用庭院的模板 */
const towerFloor: BoxBlock = {
  ...floor,
  id: "block_tower_floor",
  name: "塔楼楼板",
  transform: { position: [0, 0, TOWER_LEVEL], rotation: 0 },
  parameters: { ...floor.parameters, BoxSize: [650, 650, 50] },
};

const towerStairs: StairsLinearBlock = {
  ...stairs,
  id: "block_tower_stairs",
  name: "塔楼直梯",
  transform: { position: [0, 40, TOWER_LEVEL], rotation: 90 },
};

const towerEastPort: PortBlock = {
  ...eastPort,
  id: "port_tower_east",
  name: "塔楼东口",
  transform: { position: [350, 0, TOWER_LEVEL], rotation: 0 },
};

const towerWestPort: PortBlock = {
  ...westPort,
  id: "port_tower_west",
  name: "塔楼西口",
  transform: { position: [-350, 0, TOWER_LEVEL], rotation: 180 },
};

const towerTopFloor: BoxBlock = {
  ...floor,
  id: "block_demo_tower_top",
  name: "塔顶楼板",
  transform: { position: [0, 0, TOWER_LEVEL + 300], rotation: 0 },
  parameters: { ...floor.parameters, BoxSize: [420, 420, 40] },
};

const towerTopRail: BoxBlock = {
  ...wall,
  id: "block_demo_tower_rail",
  name: "塔顶围栏",
  transform: { position: [0, -200, TOWER_LEVEL + 340], rotation: 0 },
  parameters: { ...wall.parameters, BoxSize: [420, 40, 120] },
};

const courtyard: LogicNode = {
  id: "lnode_demo_courtyard",
  name: "城墙庭院",
  role: "hub",
  floor: 0,
  graphPosition: [160, 180],
  relativePosition: [0, 0],
  elevation: { base: 0, top: WALKWAY_LEVEL },
  blocks: [floor, wall, doorway, stairs, eastPort, westPort],
  note: "",
};

const walkway: LogicNode = {
  id: "lnode_demo_walkway",
  name: "城墙走道",
  role: "transition",
  floor: 1,
  graphPosition: [420, 120],
  relativePosition: [0, 900],
  elevation: { base: WALKWAY_LEVEL, top: WALKWAY_LEVEL + 250 },
  blocks: [walkwayFloor, walkwayDoor],
  note: "",
};

const tower: LogicNode = {
  id: "lnode_demo_tower",
  name: "边塔平台",
  role: "reward",
  floor: 1,
  graphPosition: [560, 300],
  relativePosition: TOWER_OFFSET,
  elevation: { base: TOWER_LEVEL, top: TOWER_LEVEL + 400 },
  // 几何与子层并存：这里拼了塔身，里面还有塔顶与暗格两层
  childScopeId: "scope_demo_tower",
  blocks: [towerFloor, towerStairs, towerEastPort, towerWestPort],
  note: "",
};

const vault: LogicNode = {
  id: "lnode_demo_vault",
  name: "密封暗室",
  role: "secret",
  floor: 1,
  graphPosition: [900, 420],
  relativePosition: VAULT_OFFSET,
  elevation: { base: TOWER_LEVEL, top: TOWER_LEVEL + 400 },
  note: "只在链路里存在，还没拼体块",
};

const towerTop: LogicNode = {
  id: "lnode_demo_tower_top",
  name: "塔顶平台",
  role: "reward",
  floor: 2,
  graphPosition: [0, 0],
  relativePosition: [0, 0],
  elevation: { base: TOWER_LEVEL + 300, top: TOWER_LEVEL + 460 },
  blocks: [towerTopFloor, towerTopRail],
  note: "",
};

const towerLanding: LogicNode = {
  id: "lnode_demo_tower_landing",
  name: "塔内暗格",
  role: "secret",
  floor: 2,
  graphPosition: [0, -420],
  relativePosition: [0, -420],
  elevation: { base: TOWER_LEVEL + 300, top: TOWER_LEVEL + 460 },
  note: "",
};

/** 边塔内部那一层：同一套作用域规则，只是入口在节点的 `childScopeId` 上 */
function towerScope(): LogicScope {
  const scope = createEmptyScope("scope_demo_tower", "边塔平台内部");
  scope.nodes = [towerTop, towerLanding];
  scope.links = [{
    id: "llink_demo_tower_landing",
    label: "A",
    from: towerTop.id,
    to: towerLanding.id,
    logic: "locked-door",
    traversal: "both",
    requires: "key_demo_tower_landing",
    note: "",
  }];
  scope.keys = [{
    id: "key_demo_tower_landing",
    name: "塔顶暗格钥匙",
    foundAt: towerTop.id,
    unlocks: ["llink_demo_tower_landing"],
    note: "",
  }];
  scope.startNodeId = towerTop.id;
  return scope;
}

function demoTopology(): LogicTopology {
  const topology = createEmptyTopology();
  topology.name = "洛斯里克城墙";
  topology.nodes = [courtyard, walkway, tower, vault];
  // 原来靠"东侧门 → 塔楼西口"的实例连接表达；现在链路直接连节点，
  // 端口只是节点内部的几何标记，不再承担连通语义
  topology.links = [
    { id: "llink_demo_walkway", label: "A", from: courtyard.id, to: walkway.id, logic: "stairs", traversal: "both", requires: null, note: "" },
    { id: "llink_demo_tower", label: "B", from: walkway.id, to: tower.id, logic: "normal", traversal: "both", requires: null, note: "" },
    { id: "llink_demo_shortcut", label: "C", from: courtyard.id, to: tower.id, logic: "shortcut", traversal: "forward", requires: null, note: "城墙上的近路" },
    { id: "llink_demo_vault", label: "D", from: tower.id, to: vault.id, logic: "locked-door", traversal: "both", requires: "key_demo_vault", note: "" },
  ];
  topology.keys = [{
    id: "key_demo_vault",
    name: "暗室钥匙",
    // 钥匙必须由**同一层**的节点取得：校验按作用域各查各的
    foundAt: tower.id,
    unlocks: ["llink_demo_vault"],
    note: "",
  }];
  topology.startNodeId = courtyard.id;
  topology.scopes = [towerScope()];
  return topology;
}

export function createDemoProject(): BlockoutProject {
  const project: BlockoutProject = {
    schemaVersion: 2,
    projectId: "project_demo_highwall",
    name: "洛斯里克城墙验证",
    concept: demoTopology(),
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
    updatedAt: new Date().toISOString(),
  };
  // 深拷贝一份：模板常量与外部改动必须互不影响（测试会直接改返回值的积木）
  return structuredClone(project);
}
