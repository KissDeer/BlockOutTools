import { findModule, flattenModules, nodeInterior, nodeScopeAndGroup, pathLabel, scopeCrumbs, scopeView, scopesOf, writeScopeView } from "./concept-scopes";
import { createId } from "./ids";
import type { LogicTopology } from "./concept";
import type { Block, BlockoutProject, ModuleDefinition, ModuleInstance, Vec2 } from "./types";

/** Placement identity follows the existing instance parent-path convention. */
export interface NodeInteriorPlan {
  /** 这个节点内部的几何，已展平多层嵌套；坐标是节点局部厘米 */
  blocks: Block[];
  /** 内部还有几个区域、几条链路（给节点上的"里面有什么"用） */
  childCount: number;
  linkCount: number;
  /** 内部是否已经有几何 */
  built: boolean;
}

/**
 * 一个节点内部长什么样。多层嵌套时给的是**展平后的最终结果**：
 * 小房子 → 带大庭院的小房子 → …，逐层累积位置后落回节点自己的坐标系。
 * 内部还没有几何时返回空块，但照常告诉调用方"里面有几个东西、怎么连"。
 */
export function nodeInteriorPlan(project: BlockoutProject, nodeId: string): NodeInteriorPlan {
  const topology = project.concept;
  if (!topology) return { blocks: [], childCount: 0, linkCount: 0, built: false };
  const interior = nodeInterior(topology, nodeId);
  const group = nodeScopeAndGroup(topology, nodeId)?.group;
  if (!group) return { blocks: [], childCount: interior.childCount, linkCount: interior.linkCount, built: false };

  const flat = flattenModules(topology);
  // 展开过就取这个节点以下的所有叶子，没展开就取它自己
  const nested = flat.filter((entry) => entry.path.length > 0 && entry.path[0].moduleId === group.id);
  const own = flat.find((entry) => entry.module.id === group.id);
  const entries = nested.length ? nested : own ? [own] : [];
  const base: Vec2 = group.relativeOrigin ?? [0, 0];

  const blocks: Block[] = [];
  for (const entry of entries) {
    const definition = project.modules.find((module) => module.id === entry.module.moduleDefinitionId);
    if (!definition) continue;
    for (const block of definition.blocks) {
      // entry.origin 是累积到父级的位置，减去节点自己的原点就落回节点局部坐标
      const [x, y, z] = block.transform.position;
      blocks.push({
        ...block,
        transform: { ...block.transform, position: [x + entry.origin[0] - base[0], y + entry.origin[1] - base[1], z] },
      });
    }
  }
  return { blocks, childCount: interior.childCount, linkCount: interior.linkCount, built: blocks.length > 0 };
}

/**
 * 一个模块定义在拓扑里的所有落位路径。
 *
 * 2026-09-17 二次修订后几何应该挂在**节点**上，但旧数据仍把 `moduleDefinitionId`
 * 记在模块分组里，所以两条链都要认：先看节点自己的 `moduleId`，再看分组的 `moduleDefinitionId`。
 */
export function modulePlacementPaths(project: BlockoutProject, moduleId: string): { path: string[]; label: string }[] {
  const topology = project.concept;
  if (!topology) return [];
  const unique = new Map<string, { path: string[]; label: string }>();
  const remember = (path: string[], label: string) => {
    const key = JSON.stringify(path);
    if (!unique.has(key)) unique.set(key, { path, label });
  };

  for (const entry of flattenModules(topology)) {
    if (entry.module.moduleDefinitionId !== moduleId) continue;
    const path = entry.path.map((step) => step.moduleId);
    remember(path, pathLabel(entry.path) || "根层");
  }
  // 空分组不会进 flattenModules（那里只走节点），旧数据在根层挂定义就属于这种情况
  for (const scope of scopesOf(topology)) {
    const path = scopePath(topology, scope.id);
    if (!path) continue;
    for (const group of scope.modules) {
      if (group.moduleDefinitionId === moduleId) remember(path, pathLabel(scopeCrumbs(topology, scope.id)) || "根层");
    }
  }
  return [...unique.values()];
}

/** 从根走到某个作用域的模块 id 链（根层为 []）；走不到返回 null */
function scopePath(topology: LogicTopology, scopeId: string | null): string[] | null {
  if (!scopeId || scopeId === topology.id) return [];
  const crumbs = scopeCrumbs(topology, scopeId);
  return crumbs.length ? crumbs.map((step) => step.moduleId) : null;
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
  // 分组上的绑定是旧数据形态；同时把节点上的 moduleId 也记上，
  // 让"哪个节点产出这份几何"在新模型里也有据可查（flattenModules 读的就是它）。
  const ownerNodeId = found.module.nodeIds[0];
  const view = scopeView(root, found.scopeId);
  const concept = writeScopeView(root, found.scopeId, {
    ...view,
    modules: view.modules.map((group) => group.id === logicModuleId ? { ...group, moduleDefinitionId: module.id } : group),
    nodes: view.nodes.map((node) => node.id === ownerNodeId ? { ...node, moduleId: module.id } : node),
  });
  return { project: { ...project, concept, modules: [...project.modules, module], updatedAt: new Date().toISOString() }, module };
}

/** Add just one placement. Diagram positions are never used as world coordinates. */export function placeModuleDefinition(project: BlockoutProject, moduleId: string, scopePath?: string[]): { project: BlockoutProject; instance: ModuleInstance | null } {
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
