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
  /** 空 = 整个项目可见。有值 = 只在这些逻辑节点内部可见（节点 id） */
  nodeIds: string[];
}

export interface DesignContext {
  goal: string;
  constraints: string;
  materials: DesignMaterial[];
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

/**
 * 一个项目。
 *
 * 没有"模块"这一层：几何直接挂在逻辑节点上（`LogicNode.blocks`），
 * 位置来自节点的 `relativePosition` / `relativeRotation`。
 * 这里只留项目身份、拓扑、规范与资料。
 */
export interface BlockoutProject {
  schemaVersion: 2;
  projectId: string;
  name: string;
  blockoutProfile: BlockoutProfile;
  updatedAt: string;
  /** 逻辑拓扑：节点 + 链路 + 锁钥，以及节点内部的几何 */
  concept?: LogicTopology;
  designContext?: DesignContext;
}

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning";
  rule: string;
  /** 问题所在的逻辑节点 */
  nodeId: string;
  blockId: string;
  message: string;
}
