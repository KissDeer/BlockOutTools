import { CATALOG, isDeployableBlock } from "./catalog";
import { actorSyncKey } from "./ids";
import { resolveAssembly, type AssemblyConstraintIssue } from "./assembly-resolver";
import type { Block, BlockoutProject } from "./types";

export interface UEActorPlan {
  syncKey: string;
  label: string;
  blockType: Block["type"];
  blueprintClassPath: string;
  location: [number, number, number];
  rotation: [number, number, number];
  parameters: Record<string, unknown>;
}

export interface UEDryRunPlan {
  projectId: string;
  createdAt: string;
  actorCount: number;
  actors: UEActorPlan[];
  assemblyIssues: AssemblyConstraintIssue[];
}

function rotate2d(x: number, y: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [x * cos - y * sin, x * sin + y * cos];
}

export function buildLocalUEDryRun(project: BlockoutProject): UEDryRunPlan {
  const modules = new Map(project.modules.map((module) => [module.id, module]));
  const classPathByType = new Map(CATALOG.filter((item) => item.blueprintClassPath).map((item) => [item.type, item.blueprintClassPath as string]));
  const actors: UEActorPlan[] = [];
  const resolution = resolveAssembly(project);

  for (const instance of resolution.instances) {
    const module = modules.get(instance.definitionId);
    if (!module) continue;
    for (const block of module.blocks) {
      if (!isDeployableBlock(block)) continue;
      const [offsetX, offsetY] = rotate2d(block.transform.position[0], block.transform.position[1], instance.assemblyTransform.rotation);
      actors.push({
        syncKey: actorSyncKey(project.projectId, instance.id, block.id),
        label: `${instance.name} / ${block.name}`,
        blockType: block.type,
        blueprintClassPath: classPathByType.get(block.type) ?? "",
        location: [
          instance.assemblyTransform.position[0] + offsetX,
          -(instance.assemblyTransform.position[1] + offsetY),
          instance.assemblyTransform.position[2] + block.transform.position[2],
        ],
        rotation: [0, 0, -(instance.assemblyTransform.rotation + block.transform.rotation)],
        parameters: structuredClone(block.parameters),
      });
    }
  }

  return { projectId: project.projectId, createdAt: new Date().toISOString(), actorCount: actors.length, actors, assemblyIssues: resolution.issues };
}
