import { findModule, flattenModules, pathLabel, scopeView, writeScopeView } from "./concept-scopes";
import { createId } from "./ids";
import type { BlockoutProject, ModuleDefinition, ModuleInstance } from "./types";

/** Placement identity follows the existing instance parent-path convention. */
export function modulePlacementPaths(project: BlockoutProject, moduleId: string): { path: string[]; label: string }[] {
  if (!project.concept) return [];
  const unique = new Map<string, { path: string[]; label: string }>();
  for (const entry of flattenModules(project.concept)) {
    if (entry.module.moduleDefinitionId !== moduleId) continue;
    const path = entry.path.map((step) => step.moduleId);
    const key = JSON.stringify(path);
    if (!unique.has(key)) unique.set(key, { path, label: pathLabel(entry.path) || "根层" });
  }
  return [...unique.values()];
}

/** Open a definition without instantiating or regenerating any existing geometry. */
export function ensureLogicModule(project: BlockoutProject, logicModuleId: string): { project: BlockoutProject; module: ModuleDefinition | null; childScopeId?: string } {
  const root = project.concept;
  const found = root && findModule(root, logicModuleId);
  if (!root || !found) return { project, module: null };
  if (found.module.childScopeId) return { project, module: null, childScopeId: found.module.childScopeId };
  const existing = project.modules.find((module) => module.id === found.module.moduleDefinitionId);
  if (existing) return { project, module: existing };
  const module: ModuleDefinition = { id: createId("module"), name: found.module.name, revision: 0, blocks: [] };
  const view = scopeView(root, found.scopeId);
  const concept = writeScopeView(root, found.scopeId, {
    ...view,
    modules: view.modules.map((group) => group.id === logicModuleId ? { ...group, moduleDefinitionId: module.id } : group),
  });
  return { project: { ...project, concept, modules: [...project.modules, module], updatedAt: new Date().toISOString() }, module };
}

/** Add just one placement. Diagram positions are never used as world coordinates. */
export function placeModuleDefinition(project: BlockoutProject, moduleId: string, scopePath?: string[]): { project: BlockoutProject; instance: ModuleInstance | null } {
  const module = project.modules.find((item) => item.id === moduleId);
  if (!module) return { project, instance: null };
  const paths = modulePlacementPaths(project, moduleId).map((option) => option.path);
  // A saved path can become stale after the topology is edited. Never silently
  // create an instance in a path that no longer leads to this definition.
  if (scopePath && !paths.some((path) => JSON.stringify(path) === JSON.stringify(scopePath)) && (paths.length > 0 || scopePath.length > 0)) return { project, instance: null };
  const path = scopePath ?? (paths.length === 1 ? paths[0] : undefined);
  // Shared scopes need an explicit path; a definition alone does not identify a placement.
  if (!scopePath && paths.length > 1) return { project, instance: null };
  const existing = project.instances.find((item) => item.definitionId === moduleId && (!path || JSON.stringify(item.scopePath ?? []) === JSON.stringify(path)));
  if (existing) return { project, instance: existing };
  const instance: ModuleInstance = {
    id: createId("instance"), definitionId: moduleId, name: module.name,
    graphPosition: [project.instances.length ? Math.max(...project.instances.map((item) => item.graphPosition[0])) + 360 : 0, 0],
    assemblyTransform: { position: [project.instances.length ? Math.max(...project.instances.map((item) => item.assemblyTransform.position[0])) + 2000 : 0, 0, 0], rotation: 0 },
    ...(path ? { scopePath: [...path] } : {}),
  };
  return { project: { ...project, instances: [...project.instances, instance], updatedAt: new Date().toISOString() }, instance };
}
