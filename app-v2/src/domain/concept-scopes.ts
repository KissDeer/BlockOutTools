import { createId } from "./ids";
import { createEmptyScope, nodesOfScope, scopeOwner, scopesOf, type LogicModule, type LogicNode, type LogicScope, type LogicTopology } from "./concept";
import type { Vec2 } from "./types";

/** 作用域取节点、取去重后的池：口径都在 `concept.ts`，这里转出去给历史调用方用 */
export { nodesOfScope, scopesOf };

/**
 * 子作用域：查询、展开/收起、路径推导与递归展平。
 *
 * 2026-09-17 二次修订：`childScopeId` 从 `LogicModule` 移到 `LogicNode`。
 * 过渡期两套含义并存，所以**读取一律走 `childScopeIdOf`**，不要在各处写 `??`。
 */

/**
 * 一个节点内部的子逻辑层 —— 过渡期的**唯一裁决点**。
 *
 * 先认节点自己的 `childScopeId`（新模型），再回落 `LogicModule.childScopeId`（旧数据）。
 * 1-F 删掉模块层时，把回落那一段删掉即可，调用方不用动。
 */
export function childScopeIdOf(topology: LogicTopology, nodeId: string): string | null {
  const own = scopeOwner(topology, nodeId);
  if (own) return own;
  for (const scope of scopesOf(topology)) {
    const node = scope.nodes.find((item) => item.id === nodeId);
    if (!node) continue;
    return scope.modules.find((group) => group.nodeIds.includes(nodeId))?.childScopeId ?? null;
  }
  return null;
}

/** 某个节点的几何：新模型在节点自己身上，旧数据挂在模块定义上 */
export function nodeBlocksOf(topology: LogicTopology, nodeId: string): LogicNode["blocks"] {
  for (const scope of scopesOf(topology)) {
    const node = scope.nodes.find((item) => item.id === nodeId);
    if (node) return node.blocks;
  }
  return undefined;
}

/** 拓扑里按 id 找节点，连同它所在的作用域 */
export function nodeById(topology: LogicTopology, nodeId: string): { node: LogicNode; scopeId: string | null } | null {
  for (const scope of scopesOf(topology)) {
    const node = scope.nodes.find((item) => item.id === nodeId);
    if (node) return { node, scopeId: scope.id === topology.id ? null : scope.id };
  }
  return null;
}

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

/**
 * 每个作用域各自当作一个可编辑拓扑来看。
 * 链路、拆解、构型都是**按作用域独立**的，所以既有逻辑可以原样在每个作用域上跑一遍再合并。
 */
export function scopeViews(topology: LogicTopology): { scopeId: string | null; view: LogicTopology }[] {
  return [
    { scopeId: null, view: topology },
    ...topology.scopes.filter((scope) => scope.id !== topology.id).map((scope) => ({ scopeId: scope.id as string | null, view: { ...scope, scopes: topology.scopes } })),
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

/**
 * 把一个节点展开成子逻辑层：给它挂一个新的空作用域。
 *
 * 现在收的是**节点 id**（原来收模块 id）。一个作用域只属于一个节点。
 * 节点自己的 `blocks` 不动 —— 几何与子逻辑并存，展开不该让已有体块消失。
 */
export function expandModule(topology: LogicTopology, nodeId: string, scopeName?: string): { topology: LogicTopology; scope: LogicScope } | null {
  const found = nodeById(topology, nodeId);
  if (!found || childScopeIdOf(topology, nodeId)) return null;
  const next = structuredClone(topology);
  const target = nodeById(next, nodeId);
  if (!target) return null;
  const scope = createEmptyScope(createId("scope"), scopeName?.trim() || `${target.node.name} 内部`);
  next.scopes.push(scope);
  target.node.childScopeId = scope.id;
  return { topology: next, scope };
}

/** 收起：只解除引用，作用域留在池子里（可能还要重新展开，也可能成为悬空项被校验指出） */
export function collapseModule(topology: LogicTopology, nodeId: string): LogicTopology {
  if (!childScopeIdOf(topology, nodeId)) return topology;
  const next = structuredClone(topology);
  const target = nodeById(next, nodeId);
  if (target) delete target.node.childScopeId;
  // 旧数据把引用记在模块上，一并清掉，否则收不起来
  for (const scope of [next, ...next.scopes]) {
    for (const group of scope.modules) if (group.nodeIds.includes(nodeId)) delete group.childScopeId;
  }
  return next;
}

/** 从池子里移除作用域，并解除所有引用（节点上的与旧数据模块上的） */
export function removeScope(topology: LogicTopology, scopeId: string): LogicTopology {
  if (!topology.scopes.some((scope) => scope.id === scopeId)) return topology;
  const next = structuredClone(topology);
  next.scopes = next.scopes.filter((scope) => scope.id !== scopeId);
  for (const scope of [next, ...next.scopes]) {
    for (const node of scope.nodes) if (node.childScopeId === scopeId) delete node.childScopeId;
    for (const group of scope.modules) if (group.childScopeId === scopeId) delete group.childScopeId;
  }
  return next;
}

/** 把一个已有的作用域挂到某个节点内部（接收 nodeId；一个作用域只能属于一个节点） */
export function linkScope(topology: LogicTopology, nodeId: string, scopeId: string): LogicTopology {
  if (!topology.scopes.some((scope) => scope.id === scopeId)) return topology;
  const next = structuredClone(topology);
  const target = nodeById(next, nodeId);
  if (!target) return topology;
  target.node.childScopeId = scopeId;
  return next;
}

/* ---------------- 路径与展平 ---------------- */

/** 从根走到指定作用域的面包屑。作用域只属于一个节点，所以通路唯一 */
export function scopeCrumbs(topology: LogicTopology, scopeId: string | null): ScopeStep[] {
  if (!scopeId) return [];
  return search(topology, nodesOfScope(topology, null), [], new Set(), 0, scopeId) ?? [];
}

/**
 * 沿着"节点的子作用域"往下找目标作用域。
 * 步长里的 `moduleId` 现在装的是**节点 id** —— 字段名是历史遗留，但语义就是"进入这一步经过的那个节点"，
 * 层级路径与同步键都只当它是不透明身份串用。
 */
function search(topology: LogicTopology, nodes: LogicNode[], path: ScopeStep[], visiting: Set<string>, depth: number, targetId: string): ScopeStep[] | null {
  if (depth > MAX_SCOPE_DEPTH) return null;
  for (const node of nodes) {
    const childScopeId = childScopeIdOf(topology, node.id);
    if (!childScopeId) continue;
    const scope = topology.scopes.find((item) => item.id === childScopeId);
    if (!scope || visiting.has(scope.id)) continue;
    const step: ScopeStep = { moduleId: node.id, moduleName: node.name, scopeId: scope.id, scopeName: scope.name };
    if (scope.id === targetId) return [...path, step];
    const deeper = search(topology, scope.nodes, [...path, step], new Set([...visiting, scope.id]), depth + 1, targetId);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * 从根展开所有节点：有子作用域的继续往下，叶子节点带着累积原点与路径返回。
 *
 * 这里的 `origin` 是"节点原点在根坐标系里的位置"，沿路累加每一级节点的 `relativePosition`。
 * 字段名 `moduleId` / `moduleName` 同 `ScopeStep`，装的是节点身份。
 */
export function flattenModules(topology: LogicTopology): FlatModule[] {
  const byId = new Map(topology.scopes.map((scope) => [scope.id, scope]));
  const result: FlatModule[] = [];
  /**
   * 一个作用域只能属于一个节点。这不是靠数据保证的（旧文件里可能出现两个节点指同一个），
   * 所以展平时第一次用到谁就是谁，后面的当叶子处理 —— 与其展平出两份同样的子树、
   * 让人以为有两栋房子，不如让它看起来是"一个子层 + 一个空节点"。
   * 真正的错误由 `collectScopeIssues` 报出来。
   */
  const claimed = new Set<string>();

  const walk = (scope: LogicScope, scopeId: string | null, path: ScopeStep[], origin: Vec2, visiting: Set<string>, depth: number) => {
    if (depth > MAX_SCOPE_DEPTH) return;
    for (const node of scope.nodes) {
      const nodeOrigin: Vec2 = [origin[0] + (node.relativePosition?.[0] ?? 0), origin[1] + (node.relativePosition?.[1] ?? 0)];
      const childScopeId = childScopeIdOf(topology, node.id);
      const child = childScopeId ? byId.get(childScopeId) : null;
      // 已经访问过的分支不再进入：环检测是报错，这里只是不让它递归跑穿
      if (child && !visiting.has(child.id) && !claimed.has(child.id)) {
        claimed.add(child.id);
        const step: ScopeStep = { moduleId: node.id, moduleName: node.name, scopeId: child.id, scopeName: child.name };
        walk(child, child.id, [...path, step], nodeOrigin, new Set([...visiting, child.id]), depth + 1);
      } else {
        // 新模型下节点的几何在它自己身上（`nodeBlocksOf`）；旧数据仍靠 moduleDefinitionId 找回模块定义
        result.push({
          module: {
            id: node.id,
            name: node.name,
            nodeIds: [node.id],
            moduleDefinitionId: node.moduleId,
            relativeOrigin: node.relativePosition ?? undefined,
            note: node.note,
          },
          scopeId,
          path,
          origin: nodeOrigin,
        });
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

/* ---------------- 层级：一张画布上的焦点路径 ---------------- */

export interface LevelStep {
  nodeId: string;
  nodeName: string;
  /** 进入这个节点之后看到的是逻辑层还是几何层 */
  kind: "logic" | "geometry";
}

export interface ResolvedLevel {
  /** 从整图到当前层，面包屑与层级树都用它 */
  steps: LevelStep[];
  /** 当前层形态：logic = 画这一层的逻辑拓扑；geometry = 画某个节点内部的几何 */
  kind: "logic" | "geometry";
  /** 当前逻辑层所在的作用域（null = 根） */
  scopeId: string | null;
  /** kind === "geometry" 时：正在编辑内部几何的节点 */
  nodeId: string | null;
  /** 当前层能看到的节点与链路 */
  nodes: LogicTopology["nodes"];
  links: LogicTopology["links"];
  /** 路径里失效的那一段下标；拓扑被改过之后可能发生 */
  brokenAt: number | null;
}

/**
 * 把"进入了哪些节点"解析成当前层。
 *
 * 与拓扑对齐：**节点是唯一的容器**。层级路径只记节点 id，其余全部从拓扑推导，
 * 不另存一份状态 —— 拓扑改了，层级自己就跟着变。
 *
 * 节点可以**同时**有子作用域和自己的几何（2026-09-17 二次修订）。所以：
 * 有子作用域 = 这一层接着画逻辑（几何在分屏的另一半里看）；
 * 没有子作用域 = 这一层画它自己的几何，也就到底了。
 */
export function resolveLevel(topology: LogicTopology, levelPath: string[]): ResolvedLevel {
  const steps: LevelStep[] = [];
  let scopeId: string | null = null;
  let geometryNodeId: string | null = null;

  for (const [index, nodeId] of levelPath.entries()) {
    // 上一层已经到底了，就不可能再往里进
    if (geometryNodeId) return { ...levelOf(topology, scopeId), steps, brokenAt: index };
    const scope = scopeFor(topology, scopeId);
    const node = scope?.nodes.find((item) => item.id === nodeId);
    if (!scope || !node) return { ...levelOf(topology, scopeId), steps, brokenAt: index };
    const childScopeId = childScopeIdOf(topology, nodeId);
    const scoped = childScopeId && topology.scopes.some((entry) => entry.id === childScopeId) ? childScopeId : null;
    steps.push({ nodeId, nodeName: node.name, kind: scoped ? "logic" : "geometry" });
    if (scoped) scopeId = scoped;
    else geometryNodeId = nodeId;
  }

  const kind = steps.at(-1)?.kind ?? "logic";
  return { ...levelOf(topology, scopeId), steps, kind, nodeId: kind === "geometry" ? geometryNodeId : null, brokenAt: null };
}

/** 某一层的可见内容 */
function levelOf(topology: LogicTopology, scopeId: string | null): Pick<ResolvedLevel, "kind" | "scopeId" | "nodeId" | "nodes" | "links"> {
  const scope = scopeFor(topology, scopeId);
  return { kind: "logic", scopeId, nodeId: null, nodes: scope?.nodes ?? [], links: scope?.links ?? [] };
}

function scopeFor(topology: LogicTopology, scopeId: string | null): LogicScope | null {
  if (scopeId === null) return topology;
  return topology.scopes.find((scope) => scope.id === scopeId) ?? null;
}

/**
 * 某个节点内部有什么：层级树、节点缩略图、以及分屏判断都用它。
 *
 * `blocks` 是**这个节点自己的**几何（节点局部厘米）；
 * `childCount` / `linkCount` 是它子逻辑层里的内容。两者可以同时非空。
 */
export function nodeInterior(topology: LogicTopology, nodeId: string): { kind: "logic" | "geometry"; scopeId: string | null; blocks: LogicNode["blocks"]; childCount: number; linkCount: number } {
  const blocks = nodeBlocksOf(topology, nodeId);
  const childScopeId = childScopeIdOf(topology, nodeId);
  const scope = childScopeId ? topology.scopes.find((item) => item.id === childScopeId) ?? null : null;
  if (!scope) return { kind: "geometry", scopeId: null, blocks, childCount: 0, linkCount: 0 };
  return { kind: "logic", scopeId: scope.id, blocks, childCount: scope.nodes.length, linkCount: scope.links.length };
}

/** 节点在哪一层、属于哪个分组 */
export function nodeScopeAndGroup(topology: LogicTopology, nodeId: string): { scopeId: string | null; group: LogicModule | null } | null {
  for (const scope of [topology, ...topology.scopes]) {
    const node = scope.nodes.find((item) => item.id === nodeId);
    if (!node) continue;
    const group = scope.modules.find((item) => item.nodeIds.includes(nodeId)) ?? null;
    return { scopeId: scope.id === topology.id ? null : scope.id, group };
  }
  return null;
}

/** 从根到某节点的层级路径：层级树点一下就靠它 */
export function levelPathOfNode(topology: LogicTopology, nodeId: string): string[] | null {
  const walk = (scope: LogicScope, path: string[], visiting: Set<string>, depth: number): string[] | null => {
    if (depth > MAX_SCOPE_DEPTH) return null;
    for (const node of scope.nodes) if (node.id === nodeId) return path;
    for (const node of scope.nodes) {
      const childScopeId = childScopeIdOf(topology, node.id);
      const child = childScopeId ? topology.scopes.find((item) => item.id === childScopeId) : null;
      if (!child || visiting.has(child.id)) continue;
      const found = walk(child, [...path, node.id], new Set([...visiting, child.id]), depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(topology, [], new Set(), 0);
}
