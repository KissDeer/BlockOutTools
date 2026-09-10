import type { Block, BlockoutProfile, BoxBlock, ModuleDefinition, StairsLinearBlock, Vec3 } from "./types";

/** Legacy boxes keep their bottom pivot. Surface boxes extend down from the walking plane. */
export function blockBaseZ(block: Block): number {
  return block.transform.position[2] - (block.type === "box" && block.elevationReference === "surface" ? block.parameters.BoxSize[2] : 0);
}

export function surfaceZ(block: BoxBlock): number {
  return blockBaseZ(block) + block.parameters.BoxSize[2];
}

export function containsXY(block: BoxBlock, point: Vec3, margin = 0): boolean {
  const angle = -block.transform.rotation * Math.PI / 180;
  const x = point[0] - block.transform.position[0];
  const y = point[1] - block.transform.position[1];
  return Math.abs(x * Math.cos(angle) - y * Math.sin(angle)) <= block.parameters.BoxSize[0] / 2 + margin
    && Math.abs(x * Math.sin(angle) + y * Math.cos(angle)) <= block.parameters.BoxSize[1] / 2 + margin;
}

export function walkingSurfaces(module: ModuleDefinition): BoxBlock[] {
  return module.blocks.filter((block): block is BoxBlock => block.type === "box" && (block.role === "floor" || block.role === "landing"));
}

export function stairLandings(block: StairsLinearBlock): { lower: Vec3; upper: Vec3 } {
  const [, depth, height] = block.parameters.StairsSize;
  const angle = block.transform.rotation * Math.PI / 180;
  const [x, y, z] = block.transform.position;
  const dx = -Math.sin(angle) * depth / 2;
  const dy = Math.cos(angle) * depth / 2;
  return { lower: [x - dx, y - dy, z], upper: [x + dx, y + dy, z + height] };
}

/** Landing points are the lower entry and upper exit at the stair footprint edges. */
export function fitStairs(block: StairsLinearBlock, lower: Vec3, upper: Vec3, profile: BlockoutProfile): StairsLinearBlock {
  const depth = Math.hypot(upper[0] - lower[0], upper[1] - lower[1]);
  const height = upper[2] - lower[2];
  if (height <= 0 || depth <= 0) throw new Error("上落脚点必须更高，且与下落脚点有水平距离");
  const steps = Math.ceil(height / profile.maxStairRise);
  if (steps > 1000 || depth / steps < profile.minStairTread) throw new Error(`空间不足：高差 ${height.toFixed(1)}cm 至少需要 ${steps} 级、${(steps * profile.minStairTread).toFixed(1)}cm 进深；当前只有 ${depth.toFixed(1)}cm。请移动落脚点或改用折返楼梯。`);
  const next = structuredClone(block);
  next.transform = { position: [(lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2, lower[2]], rotation: Math.atan2(upper[1] - lower[1], upper[0] - lower[0]) * 180 / Math.PI - 90 };
  next.parameters.StairsSize = [block.parameters.StairsSize[0], depth, height];
  next.parameters.NumberOfSteps = steps;
  return next;
}
