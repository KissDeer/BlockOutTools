import type { Block, BlockType, Vec3 } from "./types";
import { createId } from "./ids";
import { blockSchema } from "./project-schema";
import box from "./block-library/box/definition.json";
import doorway from "./block-library/doorway/definition.json";
import stairs from "./block-library/stairs-linear/definition.json";
import port from "./block-library/port/definition.json";

export interface CatalogItem {
  type: BlockType;
  label: string;
  shortLabel: string;
  deployable: boolean;
  blueprintClassPath?: string;
}

// Only implemented types are registered. Documentation alone cannot add geometry.
export const BLOCK_DEFINITIONS = [box, doorway, stairs, port];
const templates = new Map<BlockType, Block>();
export const CATALOG: CatalogItem[] = BLOCK_DEFINITIONS.map((definition) => {
  const template = blockSchema.parse({
    ...definition.defaults,
    id: "catalog-template",
    type: definition.type,
    transform: { position: [0, 0, 0], rotation: 0 },
  });
  if (templates.has(template.type)) throw new Error(`重复积木类型：${template.type}`);
  templates.set(template.type, template);
  const blueprintClassPath = "blueprintClassPath" in definition ? definition.blueprintClassPath : undefined;
  if (definition.deployable && !blueprintClassPath) throw new Error(`缺少 UE 类路径：${template.type}`);
  return { type: template.type, label: definition.label, shortLabel: definition.shortLabel, deployable: definition.deployable, blueprintClassPath };
});

export function createBlock(type: BlockType, position: Vec3 = [0, 0, 0]): Block {
  const template = templates.get(type);
  if (!template) throw new Error(`未实现的积木类型：${type}`);
  const block = structuredClone(template);
  block.id = createId(type === "port" ? "port" : "block");
  block.transform.position = [...position];
  return block;
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
  return CATALOG.some((item) => item.type === block.type && item.deployable);
}
