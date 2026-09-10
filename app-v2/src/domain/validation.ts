import type { BlockoutProject, ValidationIssue, Vec3 } from "./types";
import { blockBaseZ, containsXY, stairLandings, surfaceZ, walkingSurfaces } from "./spatial";

export function validateProject(project: BlockoutProject): ValidationIssue[] {
  if (!project.blockoutProfile.enabled) return [];
  const profile = project.blockoutProfile;
  const issues: ValidationIssue[] = [];

  for (const module of project.modules) {
    const floors = walkingSurfaces(module);
    for (const block of module.blocks) {
      if (block.type === "doorway") {
        const [, width, height] = block.parameters.DoorwaySize;
        if (width < profile.minDoorWidth) issues.push({ id: `${block.id}:door-width`, severity: "error", rule: "DOOR_MIN_WIDTH", moduleId: module.id, blockId: block.id, message: `门洞宽度 ${width}cm，小于 ${profile.minDoorWidth}cm` });
        if (height < profile.minDoorHeight) issues.push({ id: `${block.id}:door-height`, severity: "error", rule: "DOOR_MIN_HEIGHT", moduleId: module.id, blockId: block.id, message: `门洞高度 ${height}cm，小于 ${profile.minDoorHeight}cm` });
      }
      if (block.type === "stairs-linear") {
        if (block.parameters.StairsType !== "BOX") issues.push({ id: `${block.id}:stair-type`, severity: "warning", rule: "STAIR_PREVIEW_APPROXIMATION", moduleId: module.id, blockId: block.id, message: `${block.parameters.StairsType} 楼梯的 UE 形态未核实，当前预览为 BOX 近似` });
        const [, depth, height] = block.parameters.StairsSize;
        const steps = Math.max(1, block.parameters.NumberOfSteps);
        const rise = height / steps;
        const tread = depth / steps;
        if (rise > profile.maxStairRise) issues.push({ id: `${block.id}:stair-rise`, severity: "error", rule: "STAIR_MAX_RISE", moduleId: module.id, blockId: block.id, message: `楼梯踢面 ${rise.toFixed(1)}cm，超过 ${profile.maxStairRise}cm` });
        if (tread < profile.minStairTread) issues.push({ id: `${block.id}:stair-tread`, severity: "error", rule: "STAIR_MIN_TREAD", moduleId: module.id, blockId: block.id, message: `楼梯踏步 ${tread.toFixed(1)}cm，小于 ${profile.minStairTread}cm` });
      }
      if (floors.length && (block.type === "stairs-linear" || block.type === "port")) {
        const points: { label: string; position: Vec3; width: number; rotation: number }[] = block.type === "port"
          ? [{ label: "出入口", position: block.transform.position, width: block.parameters.width, rotation: block.transform.rotation }]
          : Object.entries(stairLandings(block)).map(([label, position]) => ({ label: label === "lower" ? "楼梯下端" : "楼梯上端", position, width: block.parameters.StairsSize[0], rotation: block.transform.rotation + 90 }));
        for (const point of points) {
          const angle = point.rotation * Math.PI / 180;
          const samples = [-0.5, 0, 0.5].map((offset): Vec3 => [point.position[0] - Math.sin(angle) * point.width * offset, point.position[1] + Math.cos(angle) * point.width * offset, point.position[2]]);
          if (!samples.every((sample) => floors.some((floor) => Math.abs(surfaceZ(floor) - sample[2]) < 1 && containsXY(floor, sample, 1)))) issues.push({ id: `${block.id}:${point.label}:support`, severity: "error", rule: "LANDING_SUPPORT", moduleId: module.id, blockId: block.id, message: `${point.label}没有同高且覆盖通行宽度的楼板支撑，请检查位置、宽度和高度` });
          const obstruction = module.blocks.find((solid) => solid.type === "box" && solid.id !== block.id && samples.some((sample) => containsXY(solid, sample, -0.5) && surfaceZ(solid) > sample[2] + profile.maxStepHeight && blockBaseZ(solid) < sample[2] + profile.capsuleHalfHeight * 2));
          if (obstruction) issues.push({ id: `${block.id}:${point.label}:blocked`, severity: "error", rule: "LANDING_CLEARANCE", moduleId: module.id, blockId: block.id, message: `${point.label}被“${obstruction.name}”挡住或净空不足` });
        }
      }
      if (block.provenance?.status === "estimated") issues.push({ id: `${block.id}:estimated`, severity: "warning", rule: "REFERENCE_UNCONFIRMED", moduleId: module.id, blockId: block.id, message: `“${block.name}”来自未确认的图纸尺寸` });
    }
  }
  return issues;
}
