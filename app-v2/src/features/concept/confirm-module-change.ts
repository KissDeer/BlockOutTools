import type { LogicTopology } from "../../domain/concept";
import type { BlockoutProject } from "../../domain/types";

/** Membership changes alter requirements only; existing geometry is never moved. */
export function confirmModuleChange(project: BlockoutProject, topology: LogicTopology, nodeIds: string[], destinationId: string | null): boolean {
  const changed = nodeIds.filter((id) => (topology.modules.find((module) => module.nodeIds.includes(id))?.id ?? null) !== destinationId);
  if (!changed.length) return true;
  const affectedGroups = topology.modules.filter((module) => module.id === destinationId || module.nodeIds.some((id) => changed.includes(id)));
  const definitionIds = new Set(affectedGroups.flatMap((module) => module.moduleDefinitionId ? [module.moduleDefinitionId] : []));
  const affected = project.modules.filter((module) => definitionIds.has(module.id) || module.blocks.some((block) => changed.includes(block.provenance?.featureId ?? "")));
  const blocks = affected.reduce((sum, module) => sum + module.blocks.length, 0);
  if (!blocks) return true;
  const instances = project.instances.filter((instance) => affected.some((module) => module.id === instance.definitionId)).length;
  return window.confirm(`调整 ${changed.length} 个区域的模块归属？\n\n涉及 ${affected.map((module) => module.name).join("、")}，共 ${blocks} 个体块、${instances} 个整体实例。\n已有体块、实例和模块资料会保留在原模块，不会自动搬移或删除；调整后请核对区域来源与接口要求。`);
}
