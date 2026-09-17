import { blockPlanSize } from "../../domain/catalog";
import type { Block } from "../../domain/types";

export interface PlanBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface PreviewBlock {
  block: Block;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface NodePreviewModel {
  width: number;
  height: number;
  scale: number;
  bounds: PlanBounds;
  blocks: PreviewBlock[];
}

const DEFAULT_WORLD_SIZE = 200;

export function rotatedBlockBounds(block: Block): PlanBounds {
  const [width, height] = blockPlanSize(block);
  const radians = block.transform.rotation * Math.PI / 180;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const extentX = Math.abs(Math.cos(radians)) * halfWidth + Math.abs(Math.sin(radians)) * halfHeight;
  const extentY = Math.abs(Math.sin(radians)) * halfWidth + Math.abs(Math.cos(radians)) * halfHeight;
  const [x, y] = block.transform.position;
  return {
    minX: x - extentX,
    minY: y - extentY,
    maxX: x + extentX,
    maxY: y + extentY,
    width: extentX * 2,
    height: extentY * 2,
  };
}

function planBounds(blocks: Block[]): PlanBounds {
  if (blocks.length === 0) {
    const half = DEFAULT_WORLD_SIZE / 2;
    return { minX: -half, minY: -half, maxX: half, maxY: half, width: DEFAULT_WORLD_SIZE, height: DEFAULT_WORLD_SIZE };
  }

  const bounds = blocks.map(rotatedBlockBounds);
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** 俯视缩略图只关心积木：谁持有它都行（节点自己的几何，或旧模块定义） */
export function createNodePreviewModel(holder: { blocks: Block[] }, width = 228, height = 116, padding = 8): NodePreviewModel {
  const bounds = planBounds(holder.blocks);
  const drawableWidth = Math.max(1, width - padding * 2);
  const drawableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(drawableWidth / bounds.width, drawableHeight / bounds.height);
  const contentWidth = bounds.width * scale;
  const contentHeight = bounds.height * scale;
  const offsetX = (width - contentWidth) / 2;
  const offsetY = (height - contentHeight) / 2;

  const blocks = holder.blocks.map((block) => {
    const [blockWidth, blockHeight] = blockPlanSize(block);
    return {
      block,
      x: offsetX + (block.transform.position[0] - bounds.minX) * scale,
      y: offsetY + (block.transform.position[1] - bounds.minY) * scale,
      width: blockWidth * scale,
      height: blockHeight * scale,
      rotation: block.transform.rotation,
    };
  });

  return { width, height, scale, bounds, blocks };
}
