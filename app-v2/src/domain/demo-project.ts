import type { BlockoutProject, DoorwayBlock, PortBlock, StairsLinearBlock, BoxBlock } from "./types";

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

export function createDemoProject(): BlockoutProject {
  return {
    schemaVersion: 2,
    projectId: "project_demo_highwall",
    name: "洛斯里克模块验证",
    modules: [
      { id: "module_courtyard", name: "城墙庭院", revision: 1, blocks: [floor, wall, doorway, stairs, eastPort, westPort] },
      {
        id: "module_tower",
        name: "边塔平台",
        revision: 1,
        blocks: [
          { ...structuredClone(floor), id: "block_tower_floor", name: "塔楼楼板", parameters: { ...structuredClone(floor.parameters), BoxSize: [650, 650, 50] } },
          { ...structuredClone(stairs), id: "block_tower_stairs", name: "塔楼直梯", transform: { position: [0, 40, 50], rotation: 90 } },
          { ...structuredClone(eastPort), id: "port_tower_east", name: "塔楼东口", transform: { position: [350, 0, 50], rotation: 0 } },
          { ...structuredClone(westPort), id: "port_tower_west", name: "塔楼西口", transform: { position: [-350, 0, 50], rotation: 180 } },
        ],
      },
    ],
    instances: [
      { id: "instance_courtyard", definitionId: "module_courtyard", name: "城墙庭院 A", graphPosition: [160, 180], assemblyTransform: { position: [0, 0, 0], rotation: 0 } },
      { id: "instance_tower", definitionId: "module_tower", name: "边塔平台 B", graphPosition: [560, 300], assemblyTransform: { position: [1200, 0, 300], rotation: 0 } },
    ],
    connections: [
      { id: "connection_demo", type: "stairs", sourceInstanceId: "instance_courtyard", sourcePortId: "port_demo_east", targetInstanceId: "instance_tower", targetPortId: "port_tower_west", waypoints: [] },
    ],
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
}
