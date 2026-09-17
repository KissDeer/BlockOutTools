import { scopesOf, type LogicNode } from "./concept";
import { blockBaseZ, containsXY, stairLandings, surfaceZ, walkingSurfaces } from "./spatial";
import type { BlockoutProfile, BlockoutProject, ValidationIssue, Vec3 } from "./types";

/**
 * 白盒规范检查：门洞尺寸、楼梯坡度、落脚点支撑与净空、未确认的图纸尺寸。
 *
 * 几何现在挂在**逻辑节点**上，所以检查的单位就是节点：遍历根作用域与池子里的全部子作用域，
 * 每个节点拿自己的 `blocks` 判一遍。问题指向 `nodeId`，点一下就能选中那个区域。
 *
 * 只在一个节点内部比较，不跨节点：积木的坐标是**节点局部厘米**，两个节点各自的原点在哪
 * 要等展平（`node-geometry`）才知道。把"落位还没填"混进"楼梯没有楼板支撑"里，
 * 会让人去改一条本来就没错的楼梯。
 */
export function validateProject(project: BlockoutProject): ValidationIssue[] {
  if (!project.blockoutProfile.enabled) return [];
  const topology = project.concept;
  if (!topology) return [];

  const issues: ValidationIssue[] = [];
  // 走 `scopesOf`：池子里每个作用域都带一份 `scopes` 副本，直接展开会重复查同一批节点
  for (const scope of scopesOf(topology)) {
    for (const node of scope.nodes) issues.push(...validateNode(node, project.blockoutProfile));
  }
  return issues;
}

function validateNode(node: LogicNode, profile: BlockoutProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const blocks = node.blocks ?? [];
  const floors = walkingSurfaces({ blocks });

  for (const block of blocks) {
    if (block.type === "doorway") {
      const [, width, height] = block.parameters.DoorwaySize;
      if (width < profile.minDoorWidth) issues.push({ id: `${block.id}:door-width`, severity: "error", rule: "DOOR_MIN_WIDTH", nodeId: node.id, blockId: block.id, message: `门洞宽度 ${width}cm，小于 ${profile.minDoorWidth}cm` });
      if (height < profile.minDoorHeight) issues.push({ id: `${block.id}:door-height`, severity: "error", rule: "DOOR_MIN_HEIGHT", nodeId: node.id, blockId: block.id, message: `门洞高度 ${height}cm，小于 ${profile.minDoorHeight}cm` });
    }
    if (block.type === "stairs-linear") {
      if (block.parameters.StairsType !== "BOX") issues.push({ id: `${block.id}:stair-type`, severity: "warning", rule: "STAIR_PREVIEW_APPROXIMATION", nodeId: node.id, blockId: block.id, message: `${block.parameters.StairsType} 楼梯的 UE 形态未核实，当前预览为 BOX 近似` });
      const [, depth, height] = block.parameters.StairsSize;
      const steps = Math.max(1, block.parameters.NumberOfSteps);
      const rise = height / steps;
      const tread = depth / steps;
      if (rise > profile.maxStairRise) issues.push({ id: `${block.id}:stair-rise`, severity: "error", rule: "STAIR_MAX_RISE", nodeId: node.id, blockId: block.id, message: `楼梯踢面 ${rise.toFixed(1)}cm，超过 ${profile.maxStairRise}cm` });
      if (tread < profile.minStairTread) issues.push({ id: `${block.id}:stair-tread`, severity: "error", rule: "STAIR_MIN_TREAD", nodeId: node.id, blockId: block.id, message: `楼梯踏步 ${tread.toFixed(1)}cm，小于 ${profile.minStairTread}cm` });
    }
    if (floors.length && (block.type === "stairs-linear" || block.type === "port")) {
      const points: { label: string; position: Vec3; width: number; rotation: number }[] = block.type === "port"
        ? [{ label: "出入口", position: block.transform.position, width: block.parameters.width, rotation: block.transform.rotation }]
        : Object.entries(stairLandings(block)).map(([label, position]) => ({ label: label === "lower" ? "楼梯下端" : "楼梯上端", position, width: block.parameters.StairsSize[0], rotation: block.transform.rotation + 90 }));
      for (const point of points) {
        const angle = point.rotation * Math.PI / 180;
        const samples = [-0.5, 0, 0.5].map((offset): Vec3 => [point.position[0] - Math.sin(angle) * point.width * offset, point.position[1] + Math.cos(angle) * point.width * offset, point.position[2]]);
        if (!samples.every((sample) => floors.some((floor) => Math.abs(surfaceZ(floor) - sample[2]) < 1 && containsXY(floor, sample, 1)))) issues.push({ id: `${block.id}:${point.label}:support`, severity: "error", rule: "LANDING_SUPPORT", nodeId: node.id, blockId: block.id, message: `${point.label}没有同高且覆盖通行宽度的楼板支撑，请检查位置、宽度和高度` });
        const obstruction = blocks.find((solid) => solid.type === "box" && solid.id !== block.id && samples.some((sample) => containsXY(solid, sample, -0.5) && surfaceZ(solid) > sample[2] + profile.maxStepHeight && blockBaseZ(solid) < sample[2] + profile.capsuleHalfHeight * 2));
        if (obstruction) issues.push({ id: `${block.id}:${point.label}:blocked`, severity: "error", rule: "LANDING_CLEARANCE", nodeId: node.id, blockId: block.id, message: `${point.label}被“${obstruction.name}”挡住或净空不足` });
      }
    }
    if (block.provenance?.status === "estimated") issues.push({ id: `${block.id}:estimated`, severity: "warning", rule: "REFERENCE_UNCONFIRMED", nodeId: node.id, blockId: block.id, message: `“${block.name}”来自未确认的图纸尺寸` });
  }
  return issues;
}
