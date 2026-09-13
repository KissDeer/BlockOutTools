import { createId } from "./ids";
import { createEmptyScope, type LogicModule, type LogicScope, type LogicTopology } from "./concept";
import type { Vec2 } from "./types";

/**
 * 子作用域：查询、展开/收起、路径推导与递归展平。
 * 作用域放在扁平池里、可被多个模块复用，所以"从根走到某个模块"的路径可能不止一条。
 */

export interface ScopeStep {
  moduleId: string;
  moduleName: string;
  scopeId: string;
  scopeName: string;
}

export interface FlatModule {
  module: LogicModule;
  /** 所在作用域（null = 根） */
  scopeId: string | null;
  /** 从根到该模块的路径（模块链） */
  path: ScopeStep[];
  /** 累积到父级的原点（厘米）：父级原点 + 本模块相对位置 */
  origin: Vec2;
}

/** 递归深度护栏：即使环检测漏了，也不会把栈跑穿 */
const MAX_SCOPE_DEPTH = 16;

export function findModule(topology: LogicTopology, moduleId: string): { module: LogicModule; scopeId: string | null } | null {
  const inRoot = topology.modules.find((module) => module.id === moduleId);
  if (inRoot) return { module: inRoot, scopeId: null };
  for (const scope of topology.scopes) {
    const found = scope.modules.find((module) => module.id === moduleId);
    if (found) return { module: found, scopeId: scope.id };
  }
  return null;
}

/** 某个作用域自己的节点（根作用域与子作用域统一取法） */
export function nodesOfScope(topology: LogicTopology, scopeId: string | null): LogicTopology["nodes"] {
  if (scopeId === null) return topology.nodes;
  return topology.scopes.find((scope) => scope.id === scopeId)?.nodes ?? [];
}

/**
 * 每个作用域各自当作一个可编辑拓扑来看。
 * 链路、拆解、构型都是**按作用域独立**的，所以既有逻辑可以原样在每个作用域上跑一遍再合并。
 */
export function scopeViews(topology: LogicTopology): { scopeId: string | null; view: LogicTopology }[] {
  return [
    { scopeId: null, view: topology },
    ...topology.scopes.map((scope) => ({ scopeId: scope.id as string | null, view: { ...scope, scopes: topology.scopes } })),
  ];
}

/** 全部模块，连同它所在的作用域 */
export function allModules(topology: LogicTopology): { module: LogicModule; scopeId: string | null }[] {
  return [
    ...topology.modules.map((module) => ({ module, scopeId: null as string | null })),
    ...topology.scopes.flatMap((scope) => scope.modules.map((module) => ({ module, scopeId: scope.id as string | null }))),
  ];
}

/* ---------------- 编辑视图 ---------------- */

/** 把某个子作用域当作一个可编辑拓扑来看；根作用域直接返回自己 */
export function scopeView(root: LogicTopology, scopeId: string | null): LogicTopology {
  if (!scopeId) return root;
  const scope = root.scopes.find((item) => item.id === scopeId);
  return scope ? { ...structuredClone(scope), scopes: root.scopes } : root;
}

/** 把编辑视图写回池子里（视图上的 scopes 是共享的池，不能写回） */
export function writeScopeView(root: LogicTopology, scopeId: string | null, view: LogicTopology): LogicTopology {
  if (!scopeId) return view;
  const { scopes: _shared, ...scope } = structuredClone(view);
  return { ...root, scopes: root.scopes.map((item) => (item.id === scopeId ? scope : item)) };
}

/* ---------------- 展开与收起 ---------------- */

export function expandModule(topology: LogicTopology, moduleId: string, scopeName?: string): { topology: LogicTopology; scope: LogicScope } | null {
  const found = findModule(topology, moduleId);
  if (!found || found.module.childScopeId) return null;
  const next = structuredClone(topology);
  const target = findModule(next, moduleId);
  if (!target) return null;
  const scope = createEmptyScope(createId("scope"), scopeName?.trim() || `${target.module.name} 内部`);
  next.scopes.push(scope);
  target.module.childScopeId = scope.id;
  // 展开之后这个模块自己不再产出构型，几何由子作用域里的模块负责
  delete target.module.moduleDefinitionId;
  delete target.module.relativeOrigin;
  return { topology: next, scope };
}

/** 收起：只解除引用，作用域留在池子里（可能还有别的模块在复用） */
export function collapseModule(topology: LogicTopology, moduleId: string): LogicTopology {
  const found = findModule(topology, moduleId);
  if (!found?.module.childScopeId) return topology;
  const next = structuredClone(topology);
  const target = findModule(next, moduleId);
  if (target) delete target.module.childScopeId;
  return next;
}

/** 从池子里移除作用域，并解除所有引用 */
export function removeScope(topology: LogicTopology, scopeId: string): LogicTopology {
  if (!topology.scopes.some((scope) => scope.id === scopeId)) return topology;
  const next = structuredClone(topology);
  next.scopes = next.scopes.filter((scope) => scope.id !== scopeId);
  for (const module of next.modules) if (module.childScopeId === scopeId) delete module.childScopeId;
  for (const scope of next.scopes) {
    for (const module of scope.modules) if (module.childScopeId === scopeId) delete module.childScopeId;
  }
  return next;
}

/** 把作用域放进池子里（用于复用：新模块可以指向已有的作用域） */
export function linkScope(topology: LogicTopology, moduleId: string, scopeId: string): LogicTopology {
  if (!topology.scopes.some((scope) => scope.id === scopeId)) return topology;
  const found = findModule(topology, moduleId);
  if (!found) return topology;
  const next = structuredClone(topology);
  const target = findModule(next, moduleId);
  if (!target) return topology;
  target.module.childScopeId = scopeId;
  delete target.module.moduleDefinitionId;
  delete target.module.relativeOrigin;
  return next;
}

/* ---------------- 路径与展平 ---------------- */

/** 从根走到指定作用域的面包屑。作用域可复用时只给第一条通路 */
export function scopeCrumbs(topology: LogicTopology, scopeId: string | null): ScopeStep[] {
  if (!scopeId) return [];
  return search(topology, topology.modules, [], new Set(), 0, scopeId) ?? [];
}

function search(topology: LogicTopology, modules: LogicModule[], path: ScopeStep[], visiting: Set<string>, depth: number, targetId: string): ScopeStep[] | null {
  if (depth > MAX_SCOPE_DEPTH) return null;
  for (const module of modules) {
    if (!module.childScopeId) continue;
    const scope = topology.scopes.find((item) => item.id === module.childScopeId);
    if (!scope || visiting.has(scope.id)) continue;
    const step: ScopeStep = { moduleId: module.id, moduleName: module.name, scopeId: scope.id, scopeName: scope.name };
    if (scope.id === targetId) return [...path, step];
    const deeper = search(topology, scope.modules, [...path, step], new Set([...visiting, scope.id]), depth + 1, targetId);
    if (deeper) return deeper;
  }
  return null;
}

/** 从根展开所有模块：复合模块继续往下，叶子模块带着累积原点与路径返回 */
export function flattenModules(topology: LogicTopology): FlatModule[] {
  const byId = new Map(topology.scopes.map((scope) => [scope.id, scope]));
  const result: FlatModule[] = [];

  const walk = (scope: LogicScope, scopeId: string | null, path: ScopeStep[], origin: Vec2, visiting: Set<string>, depth: number) => {
    if (depth > MAX_SCOPE_DEPTH) return;
    for (const module of scope.modules) {
      const moduleOrigin: Vec2 = [origin[0] + (module.relativeOrigin?.[0] ?? 0), origin[1] + (module.relativeOrigin?.[1] ?? 0)];
      const child = module.childScopeId ? byId.get(module.childScopeId) : null;
      // 已经访问过的分支不再进入：环检测是报错，这里只是不让它递归跑穿
      if (child && !visiting.has(child.id)) {
        const step: ScopeStep = { moduleId: module.id, moduleName: module.name, scopeId: child.id, scopeName: child.name };
        walk(child, child.id, [...path, step], moduleOrigin, new Set([...visiting, child.id]), depth + 1);
      } else {
        result.push({ module, scopeId, path, origin: moduleOrigin });
      }
    }
  };

  walk(topology, null, [], [0, 0], new Set(), 0);
  return result;
}

/** 只保留没有展开的模块：真正产出几何的那些 */
export function leafModules(topology: LogicTopology): FlatModule[] {
  return flattenModules(topology).filter((entry) => !entry.module.childScopeId);
}

/** 路径的可读写法，用于标签与同步键 */
export function pathLabel(path: ScopeStep[]): string {
  return path.map((step) => step.moduleName).join(" / ");
}

/** 路径的身份段：用模块 id 保证稳定，不受改名影响 */
export function pathKey(path: ScopeStep[]): string {
  return path.map((step) => step.moduleId).join("/");
}
