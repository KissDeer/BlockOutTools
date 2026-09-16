import type { BlockoutProject } from "./types";

/** A private rendering snapshot; opening a module never places it in the project. */
export function createModulePreviewProject(project: BlockoutProject, moduleId: string): BlockoutProject {
  const module = project.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error("预览模块不存在");
  const snapshot = structuredClone(project);
  snapshot.instances = [{
    id: "__preview_module__", definitionId: module.id, name: module.name,
    graphPosition: [0, 0], assemblyTransform: { position: [0, 0, 0], rotation: 0 },
  }];
  snapshot.connections = [];
  snapshot.assemblyAnchorInstanceId = "__preview_module__";
  return snapshot;
}
