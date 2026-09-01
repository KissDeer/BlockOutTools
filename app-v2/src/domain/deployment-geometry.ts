import { actorSyncKey } from "./ids";
import { isDeployableBlock } from "./catalog";
import { resolveAssembly } from "./assembly-resolver";
import type { Block, BlockoutProject, ModuleInstance, Rgba, Vec3 } from "./types";

export interface DeploymentPrimitive {
  id: string;
  syncKey: string;
  sourceBlockId: string;
  sourceInstanceId: string;
  label: string;
  size: Vec3;
  position: Vec3;
  rotation: number;
  color: Rgba;
}

function rotate2d(x: number, y: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [x * cos - y * sin, x * sin + y * cos];
}

function worldPrimitive(
  project: BlockoutProject,
  instance: ModuleInstance,
  block: Block,
  suffix: string,
  localOffset: Vec3,
  size: Vec3,
  color: Rgba,
): DeploymentPrimitive {
  const [blockOffsetX, blockOffsetY] = rotate2d(localOffset[0], localOffset[1], block.transform.rotation);
  const blockLocalX = block.transform.position[0] + blockOffsetX;
  const blockLocalY = block.transform.position[1] + blockOffsetY;
  const [instanceX, instanceY] = rotate2d(blockLocalX, blockLocalY, instance.assemblyTransform.rotation);
  const key = actorSyncKey(project.projectId, instance.id, block.id);
  return {
    id: `${key}:${suffix}`,
    syncKey: key,
    sourceBlockId: block.id,
    sourceInstanceId: instance.id,
    label: block.name,
    size,
    position: [
      instance.assemblyTransform.position[0] + instanceX,
      instance.assemblyTransform.position[1] + instanceY,
      instance.assemblyTransform.position[2] + block.transform.position[2] + localOffset[2],
    ],
    rotation: instance.assemblyTransform.rotation + block.transform.rotation,
    color,
  };
}

function blockPrimitives(project: BlockoutProject, instance: ModuleInstance, block: Block): DeploymentPrimitive[] {
  if (!isDeployableBlock(block) || block.type === "port") return [];
  if (block.type === "box") {
    const size = block.parameters.BoxSize;
    return [worldPrimitive(project, instance, block, "body", [0, 0, size[2] / 2], size, block.parameters.blockout_material_color)];
  }

  if (block.type === "doorway") {
    const [depth, openingWidth, openingHeight] = block.parameters.DoorwaySize;
    const side = block.parameters.SideThickness;
    const top = block.parameters.TopThickness;
    const totalHeight = openingHeight + top;
    return [
      worldPrimitive(project, instance, block, "left", [0, -(openingWidth + side) / 2, totalHeight / 2], [depth, side, totalHeight], block.parameters.blockout_material_color),
      worldPrimitive(project, instance, block, "right", [0, (openingWidth + side) / 2, totalHeight / 2], [depth, side, totalHeight], block.parameters.blockout_material_color),
      worldPrimitive(project, instance, block, "top", [0, 0, openingHeight + top / 2], [depth, openingWidth, top], block.parameters.blockout_material_top_color),
    ];
  }

  const [width, depth, height] = block.parameters.StairsSize;
  const count = Math.max(1, Math.round(block.parameters.NumberOfSteps));
  const tread = depth / count;
  const rise = height / count;
  const primitives: DeploymentPrimitive[] = [];
  for (let index = 0; index < count; index += 1) {
    const stepHeight = rise * (index + 1);
    primitives.push(worldPrimitive(
      project,
      instance,
      block,
      `step-${index + 1}`,
      [0, -depth / 2 + tread * (index + 0.5), stepHeight / 2],
      [width, tread, stepHeight],
      index === count - 1 ? block.parameters.blockout_material_top_color : block.parameters.blockout_material_color,
    ));
  }
  return primitives;
}

export function buildDeploymentGeometry(project: BlockoutProject, resolvedInstances = resolveAssembly(project).instances): DeploymentPrimitive[] {
  const moduleById = new Map(project.modules.map((module) => [module.id, module]));
  const primitives: DeploymentPrimitive[] = [];
  for (const instance of resolvedInstances) {
    const module = moduleById.get(instance.definitionId);
    if (!module) continue;
    for (const block of module.blocks) primitives.push(...blockPrimitives(project, instance, block));
  }
  return primitives;
}
