import type { LogicTopology } from "./concept";
import type { Block, BlockType, Transform } from "./block-types";

export type { Block, BlockType, Transform, BoxBlock, DoorwayBlock, StairsLinearBlock, PortBlock } from "./block-types";

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Rgba = [number, number, number, number];

export interface DesignMaterial {
  id: string;
  name: string;
  kind: "structure" | "mood" | "rules" | "note";
  text: string;
  imageData: string;
  /** Empty means project-wide. References stable module definition IDs. */
  moduleIds: string[];
}

export interface DesignContext {
  goal: string;
  constraints: string;
  materials: DesignMaterial[];
}

export interface ModuleDefinition {
  id: string;
  name: string;
  revision: number;
  blocks: Block[];
  reference?: DiagramReference;
  interpretation?: Record<string, unknown>;
  designBrief?: { purpose: string; goals: string };
  shapeConfirmation?: { digest: string; confirmedAt: string };
}

export interface DiagramReference {
  id: string;
  name: string;
  imageData: string;
  pixelSize: Vec2;
  origin: Vec2;
  cmPerPixel: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  confirmed: boolean;
  legend: string;
}

export interface ModuleInstance {
  id: string;
  definitionId: string;
  name: string;
  graphPosition: Vec2;
  assemblyTransform: Transform;
  /**
   * 层级路径（从根到该实例经过的模块 id 链）。
   * 嵌套之后用它区分"不同位置上的同名积木"；扁平项目里为空。
   */
  scopePath?: string[];
}

export type ConnectionType =
  | "door"
  | "one-way-door"
  | "locked-door"
  | "shortcut"
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
  spacing?: { forward: number; lateral: number; vertical: number };
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
  assemblyAnchorInstanceId?: string;
  /** 阶段一：逻辑拓扑（只表达连通逻辑，不含真实位置） */
  concept?: LogicTopology;
  designContext?: DesignContext;
}

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning";
  rule: string;
  moduleId: string;
  blockId: string;
  message: string;
}
