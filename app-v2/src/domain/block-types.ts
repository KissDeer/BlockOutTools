import type { Rgba, Vec3 } from "./types";

/**
 * 积木类型定义单独成文，是为了打断一个循环：
 *
 * - `types.ts` 里的 `BlockoutProject` 需要 `LogicTopology`（从 `concept.ts` 来）
 * - `concept.ts` 里的 `LogicNode` 需要 `Block`（原本只能从 `types.ts` 来）
 *
 * 于是两边互为依赖。把积木类型抽到这里，`types.ts` 与 `concept.ts` 都只往下依赖它，
 * 循环消失。`block-schema.ts` 当初抽出参数校验也是同一个理由。
 */

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
  provenance?: { sourceId: string; featureId: string; status: "estimated" | "confirmed"; note: string };
}

export interface BoxBlock extends BlockBase {
  type: "box";
  role?: "solid" | "floor" | "wall" | "edging" | "landing";
  elevationReference?: "bottom" | "surface";
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
