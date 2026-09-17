import { actorSyncKey } from "./ids";
import { isDeployableBlock } from "./catalog";
import { ancestorPath, flattenNodeGeometry, flattenProjectGeometry, rotate2d, type FlatGeometry, type PlacedBlock } from "./node-geometry";
import type { Block, BlockoutProject, Rgba, Vec3 } from "./types";

export interface DeploymentPrimitive {
  id: string;
  syncKey: string;
  sourceBlockId: string;
  sourcePlacementId: string;
  label: string;
  size: Vec3;
  position: Vec3;
  rotation: number;
  color: Rgba;
  topColor: Rgba;
}

function worldPrimitive(
  project: BlockoutProject,
  placed: PlacedBlock,
  suffix: string,
  localOffset: Vec3,
  size: Vec3,
  color: Rgba,
): DeploymentPrimitive {
  // 积木自己的局部偏移要先按积木自己的朝向转，再整体叠加已经算好的世界位姿。
  // Z 不用再加积木自身的标高：`PlacedBlock.position[2]` 已经是底面标高。
  const [blockOffsetX, blockOffsetY] = rotate2d(localOffset[0], localOffset[1], placed.block.transform.rotation);
  const [x, y] = rotate2d(blockOffsetX, blockOffsetY, placed.rotation - placed.block.transform.rotation);
  const key = actorSyncKey(project.projectId, placed.placementId, placed.block.id, ancestorPath(placed));
  return {
    id: `${key}:${suffix}`,
    syncKey: key,
    sourceBlockId: placed.block.id,
    sourcePlacementId: placed.placementId,
    label: [...placed.namePath, placed.block.name].join(" / "),
    size,
    position: [placed.position[0] + x, placed.position[1] + y, placed.position[2] + localOffset[2]],
    rotation: placed.rotation,
    color,
    topColor: placed.block.type === "port" ? color : placed.block.parameters.blockout_material_top_color,
  };
}

function blockPrimitives(project: BlockoutProject, placed: PlacedBlock): DeploymentPrimitive[] {
  const block = placed.block;
  if (!isDeployableBlock(block) || block.type === "port") return [];
  if (block.type === "box") {
    const size = block.parameters.BoxSize;
    return [worldPrimitive(project, placed, "body", [0, 0, size[2] / 2], size, block.parameters.blockout_material_color)];
  }

  if (block.type === "doorway") {
    const [depth, openingWidth, openingHeight] = block.parameters.DoorwaySize;
    const side = block.parameters.SideThickness;
    const top = block.parameters.TopThickness;
    const totalHeight = openingHeight + top;
    return [
      worldPrimitive(project, placed, "left", [0, -(openingWidth + side) / 2, totalHeight / 2], [depth, side, totalHeight], block.parameters.blockout_material_color),
      worldPrimitive(project, placed, "right", [0, (openingWidth + side) / 2, totalHeight / 2], [depth, side, totalHeight], block.parameters.blockout_material_color),
      worldPrimitive(project, placed, "top", [0, 0, openingHeight + top / 2], [depth, openingWidth, top], block.parameters.blockout_material_top_color),
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
      placed,
      `step-${index + 1}`,
      [0, -depth / 2 + tread * (index + 0.5), stepHeight / 2],
      [width, tread, stepHeight],
      block.parameters.blockout_material_color,
    ));
  }
  return primitives;
}

/**
 * 把**一份展平几何**变成可渲染的体块。
 *
 * 这里不再解析模块与实例：几何从哪来是 `node-geometry` 的事，这里只管换算。
 * 3D 预览与 UE 导出共用同一份输入，就不会出现"网页看着对、UE 不对"。
 */
export function buildDeploymentGeometryFrom(project: BlockoutProject, geometry: FlatGeometry): DeploymentPrimitive[] {
  const primitives: DeploymentPrimitive[] = [];
  for (const placed of geometry.blocks) primitives.push(...blockPrimitives(project, placed));
  return primitives;
}

/** 整张图的展平几何 → 体块 */
export function buildDeploymentGeometry(project: BlockoutProject): DeploymentPrimitive[] {
  return buildDeploymentGeometryFrom(project, flattenProjectGeometry(project));
}

/** 某个节点内部的展平几何 → 体块（含子层），坐标是节点局部厘米 */
export function buildNodeDeploymentGeometry(project: BlockoutProject, nodeId: string): DeploymentPrimitive[] {
  return buildDeploymentGeometryFrom(project, flattenNodeGeometry(project, nodeId));
}

/** 端口方向箭头用：来源积木与它所在的世界位姿 */
export function portPoses(geometry: FlatGeometry): { key: string; label: string; position: Vec3; rotation: number }[] {
  const result: { key: string; label: string; position: Vec3; rotation: number }[] = [];
  for (const placed of geometry.blocks) {
    if (placed.block.type !== "port") continue;
    const key = `${placed.placementId}:${placed.block.id}`;
    result.push({ key, label: [...placed.namePath, placed.block.name].join(" / "), position: placed.position, rotation: placed.rotation });
  }
  return result;
}

/** 积木清单（不换算），给"这个区域里有什么"这类统计用 */
export function blocksOf(geometry: FlatGeometry): Block[] {
  return geometry.blocks.map((placed) => placed.block);
}
