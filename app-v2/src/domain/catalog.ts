import type { Block, BlockType, Rgba } from "./types";
import { createId } from "./ids";

const BODY_COLOR: Rgba = [0.22, 0.57, 0.48, 1];
const TOP_COLOR: Rgba = [0.72, 0.86, 0.8, 1];

export interface CatalogItem {
  type: BlockType;
  label: string;
  shortLabel: string;
  deployable: boolean;
  blueprintClassPath?: string;
}

export const CATALOG: CatalogItem[] = [
  {
    type: "box",
    label: "Box 盒体",
    shortLabel: "盒体",
    deployable: true,
    blueprintClassPath: "/BlockoutToolsPlugin/Blueprints/Blockout_Box.Blockout_Box_C",
  },
  {
    type: "doorway",
    label: "Doorway 门洞",
    shortLabel: "门洞",
    deployable: true,
    blueprintClassPath: "/BlockoutToolsPlugin/Blueprints/Blockout_Doorway.Blockout_Doorway_C",
  },
  {
    type: "stairs-linear",
    label: "Stairs Linear 线性楼梯",
    shortLabel: "直梯",
    deployable: true,
    blueprintClassPath: "/BlockoutToolsPlugin/Blueprints/Blockout_Stairs_Linear.Blockout_Stairs_Linear_C",
  },
  {
    type: "port",
    label: "模块出入口",
    shortLabel: "出入口",
    deployable: false,
  },
];

export function createBlock(type: BlockType, position: [number, number, number] = [0, 0, 0]): Block {
  const transform = { position, rotation: 0 };
  switch (type) {
    case "box":
      return {
        id: createId("block"),
        name: "Box",
        type,
        transform,
        parameters: {
          BoxSize: [600, 400, 40],
          blockout_material_color: BODY_COLOR,
          blockout_material_top_color: TOP_COLOR,
        },
      };
    case "doorway":
      return {
        id: createId("block"),
        name: "Doorway",
        type,
        transform,
        parameters: {
          DoorwaySize: [40, 140, 240],
          TopThickness: 40,
          SideThickness: 40,
          blockout_material_color: BODY_COLOR,
          blockout_material_top_color: TOP_COLOR,
        },
      };
    case "stairs-linear":
      return {
        id: createId("block"),
        name: "Stairs Linear",
        type,
        transform,
        parameters: {
          StairsSize: [180, 360, 180],
          NumberOfSteps: 10,
          StairsType: "BOX",
          blockout_material_color: BODY_COLOR,
          blockout_material_top_color: TOP_COLOR,
        },
      };
    case "port":
      return {
        id: createId("port"),
        name: "出入口",
        type,
        transform,
        parameters: { width: 120, depth: 80 },
      };
  }
}

export function blockPlanSize(block: Block): [number, number] {
  switch (block.type) {
    case "box":
      return [block.parameters.BoxSize[0], block.parameters.BoxSize[1]];
    case "doorway":
      return [
        block.parameters.DoorwaySize[0],
        block.parameters.DoorwaySize[1] + block.parameters.SideThickness * 2,
      ];
    case "stairs-linear":
      return [block.parameters.StairsSize[0], block.parameters.StairsSize[1]];
    case "port":
      return [block.parameters.depth, block.parameters.width];
  }
}

export function isDeployableBlock(block: Block): boolean {
  return block.type !== "port";
}
