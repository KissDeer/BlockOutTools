import type { BlockoutProject } from "./types";

/**
 * 预览用的私有快照：只留一个摆放，坐标归零，方便"只看这一份几何"。
 * 它不写回项目 —— 打开模块或区域从来不等于把它放进整体。
 */
function withOnlySnapshot(project: BlockoutProject, mutate: (snapshot: BlockoutProject) => void): BlockoutProject {
  const snapshot = structuredClone(project);
  snapshot.instances = [];
  snapshot.connections = [];
  delete snapshot.assemblyAnchorInstanceId;
  mutate(snapshot);
  return snapshot;
}

/** 旧数据：模块定义的局部预览 */
export function createModulePreviewProject(project: BlockoutProject, moduleId: string): BlockoutProject {
  const module = project.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error("预览模块不存在");
  return withOnlySnapshot(project, (snapshot) => {
    snapshot.instances = [{
      id: "__preview_module__", definitionId: module.id, name: module.name,
      graphPosition: [0, 0], assemblyTransform: { position: [0, 0, 0], rotation: 0 },
    }];
    snapshot.assemblyAnchorInstanceId = "__preview_module__";
  });
}

/**
 * 节点的局部预览：只留这个节点自己的积木，坐标本来就是节点局部厘米，
 * 所以不用挪动任何东西。子层内容不进局部预览 —— 那是整体视图的事。
 */
export function createNodePreviewProject(project: BlockoutProject, nodeId: string): BlockoutProject {
  const topology = project.concept;
  const node = topology
    ? [topology, ...topology.scopes].flatMap((scope) => scope.nodes).find((item) => item.id === nodeId)
    : undefined;
  if (!node) throw new Error("预览区域不存在");
  return withOnlySnapshot(project, (snapshot) => {
    for (const scope of [snapshot.concept, ...(snapshot.concept?.scopes ?? [])]) {
      if (!scope) continue;
      scope.nodes = scope.nodes.map((item) => item.id === node.id ? item : { ...item, blocks: [] });
    }
  });
}
