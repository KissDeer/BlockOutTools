import type { BlockoutProject, ValidationIssue } from "./types";

export function validateProject(project: BlockoutProject): ValidationIssue[] {
  if (!project.blockoutProfile.enabled) return [];
  const profile = project.blockoutProfile;
  const issues: ValidationIssue[] = [];

  for (const module of project.modules) {
    for (const block of module.blocks) {
      if (block.type === "doorway") {
        const [, width, height] = block.parameters.DoorwaySize;
        if (width < profile.minDoorWidth) issues.push({ id: `${block.id}:door-width`, severity: "error", rule: "DOOR_MIN_WIDTH", moduleId: module.id, blockId: block.id, message: `门洞宽度 ${width}cm，小于 ${profile.minDoorWidth}cm` });
        if (height < profile.minDoorHeight) issues.push({ id: `${block.id}:door-height`, severity: "error", rule: "DOOR_MIN_HEIGHT", moduleId: module.id, blockId: block.id, message: `门洞高度 ${height}cm，小于 ${profile.minDoorHeight}cm` });
      }
      if (block.type === "stairs-linear") {
        const [, depth, height] = block.parameters.StairsSize;
        const steps = Math.max(1, block.parameters.NumberOfSteps);
        const rise = height / steps;
        const tread = depth / steps;
        if (rise > profile.maxStairRise) issues.push({ id: `${block.id}:stair-rise`, severity: "error", rule: "STAIR_MAX_RISE", moduleId: module.id, blockId: block.id, message: `楼梯踢面 ${rise.toFixed(1)}cm，超过 ${profile.maxStairRise}cm` });
        if (tread < profile.minStairTread) issues.push({ id: `${block.id}:stair-tread`, severity: "error", rule: "STAIR_MIN_TREAD", moduleId: module.id, blockId: block.id, message: `楼梯踏步 ${tread.toFixed(1)}cm，小于 ${profile.minStairTread}cm` });
      }
    }
  }
  return issues;
}
