export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Rgba = [number, number, number, number];

export type BlockType = "box" | "doorway" | "stairs-linear" | "port";

export interface Transform {
  position: Vec3;
  rotation: number;
}

interface BlockBase {
  id: string;
  name: string;
  type: BlockType;
  transform: Transform;
}

export interface BoxBlock extends BlockBase {
  type: "box";
  parameters: {
    BoxSize: Vec3;
    blockout_material_color: Rgba;
    blockout_material_top_color: Rgba;
  };
}

export interface DoorwayBlock extends BlockBase {
  type: "doorway";
  parameters: {
    DoorwaySize: Vec3;
    TopThickness: number;
    SideThickness: number;
    blockout_material_color: Rgba;
    blockout_material_top_color: Rgba;
  };
}

export interface StairsLinearBlock extends BlockBase {
  type: "stairs-linear";
  parameters: {
    StairsSize: Vec3;
    NumberOfSteps: number;
    StairsType: "BOX" | "CLOSED" | "SLOPED";
    blockout_material_color: Rgba;
    blockout_material_top_color: Rgba;
  };
}

export interface PortBlock extends BlockBase {
  type: "port";
  parameters: {
    width: number;
    depth: number;
  };
}

export type Block = BoxBlock | DoorwayBlock | StairsLinearBlock | PortBlock;

export interface ModuleDefinition {
  id: string;
  name: string;
  revision: number;
  blocks: Block[];
}

export interface ModuleInstance {
  id: string;
  definitionId: string;
  name: string;
  graphPosition: Vec2;
  assemblyTransform: Transform;
}

export type ConnectionType =
  | "door"
  | "one-way-door"
  | "stairs"
  | "spiral-stairs"
  | "elevator"
  | "one-way-elevator"
  | "road"
  | "drop";

export interface Connection {
  id: string;
  type: ConnectionType;
  sourceInstanceId: string;
  sourcePortId: string;
  targetInstanceId: string;
  targetPortId: string;
  waypoints: Vec2[];
}

export interface BlockoutProfile {
  enabled: boolean;
  enforceUeImport: boolean;
  capsuleRadius: number;
  capsuleHalfHeight: number;
  maxStepHeight: number;
  minDoorWidth: number;
  minDoorHeight: number;
  maxStairRise: number;
  minStairTread: number;
}

export interface BlockoutProject {
  schemaVersion: 2;
  projectId: string;
  name: string;
  modules: ModuleDefinition[];
  instances: ModuleInstance[];
  connections: Connection[];
  blockoutProfile: BlockoutProfile;
  updatedAt: string;
}

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning";
  rule: string;
  moduleId: string;
  blockId: string;
  message: string;
}
