import { createId } from "./ids";
import { createEmptyScope, nodesOfScope, scopeOwner, scopesOf, type LogicNode, type LogicScope, type LogicTopology } from "./concept";
import type { Vec2 } from "./types";

/** 作用域取节点、取去重后的池：口径都在 `concept.ts`，这里转出去给历史调用方用 */
export { nodesOfScope, scopesOf };

/**
 * 子作用域：查询、展开/收起、路径推导与递归展平。
 *
 * 一个节点内部要么是一份几何、要么是一层子逻辑，也可以两者都有；
 * 子层由**节点自己**的 `childScopeId` 指向池子里的一个作用域。
 */

/** 一个节点内部的子逻辑层。模块层删除后这里只剩一条路：读节点自己的字段 */
export function childScopeIdOf(topology: LogicTopology, nodeId: string): string | null {
  return scopeOwner(topology, nodeId) ?? null;
}

/** 某个节点自己的积木 */
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

/**
 * 从根走到某个作用域的一步。
 * 字段名 `moduleId` / `moduleName` 是历史遗留，装的是**节点身份**（节点 id 与名字）。
 */
export interface ScopeStep {
  nodeId: string;
  nodeName: string;
  scopeId: string;
  scopeName: string;
}

/** 从根展开到底的某个**节点**，带着累积原点与路径 */
export interface FlatNode {
  node: LogicNode;
  /** 所在作用域（null = 根） */
  scopeId: string | null;
  /** 从根到这个节点的路径 */
  path: ScopeStep[];
  /** 累积到父级的原点（厘米）：沿路每一级节点的落位之和 */
  origin: Vec2;
}

/** 递归深度护栏：即使环检测漏了，也不会把栈跑穿 */
const MAX_SCOPE_DEPTH = 16;

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
export function expandNodeScope(topology: LogicTopology, nodeId: string, scopeName?: string): { topology: LogicTopology; scope: LogicScope } | null {
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
export function collapseNodeScope(topology: LogicTopology, nodeId: string): LogicTopology {
  if (!childScopeIdOf(topology, nodeId)) return topology;
  const next = structuredClone(topology);
  const target = nodeById(next, nodeId);
  if (target) delete target.node.childScopeId;
  return next;
}

/** 从池子里移除作用域，并解除所有引用 */
export function removeScope(topology: LogicTopology, scopeId: string): LogicTopology {
  if (!topology.scopes.some((scope) => scope.id === scopeId)) return topology;
  const next = structuredClone(topology);
  next.scopes = next.scopes.filter((scope) => scope.id !== scopeId);
  for (const scope of [next, ...next.scopes]) {
    for (const node of scope.nodes) if (node.childScopeId === scopeId) delete node.childScopeId;
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

/** 沿着"节点的子作用域"往下找目标作用域，路径上的每一步都是一个节点 */
function search(topology: LogicTopology, nodes: LogicNode[], path: ScopeStep[], visiting: Set<string>, depth: number, targetId: string): ScopeStep[] | null {
  if (depth > MAX_SCOPE_DEPTH) return null;
  for (const node of nodes) {
    const childScopeId = childScopeIdOf(topology, node.id);
    if (!childScopeId) continue;
    const scope = topology.scopes.find((item) => item.id === childScopeId);
    if (!scope || visiting.has(scope.id)) continue;
    const step: ScopeStep = { nodeId: node.id, nodeName: node.name, scopeId: scope.id, scopeName: scope.name };
    if (scope.id === targetId) return [...path, step];
    const deeper = search(topology, scope.nodes, [...path, step], new Set([...visiting, scope.id]), depth + 1, targetId);
    if (deeper) return deeper;
  }
  return null;
}

/**
 * 从根展开所有节点：有子作用域的继续往下，叶子节点带着累积原点与路径返回。
 *
 * `origin` 是"节点原点在根坐标系里的位置"，沿路累加每一级节点的 `relativePosition`。
 */
export function flattenNodes(topology: LogicTopology): FlatNode[] {
  const byId = new Map(topology.scopes.map((scope) => [scope.id, scope]));
  const result: FlatNode[] = [];
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
        const step: ScopeStep = { nodeId: node.id, nodeName: node.name, scopeId: child.id, scopeName: child.name };
        walk(child, child.id, [...path, step], nodeOrigin, new Set([...visiting, child.id]), depth + 1);
      } else {
        result.push({ node, scopeId, path, origin: nodeOrigin });
      }
    }
  };

  walk(topology, null, [], [0, 0], new Set(), 0);
  return result;
}

/** 只保留没有展开的节点：真正产出几何的那些 */
export function leafNodes(topology: LogicTopology): FlatNode[] {
  return flattenNodes(topology).filter((entry) => !childScopeIdOf(topology, entry.node.id));
}

/** 路径的可读写法，用于标签 */
export function pathLabel(path: ScopeStep[]): string {
  return path.map((step) => step.nodeName).join(" / ");
}

/** 路径的身份段：用节点 id 保证稳定，不受改名影响 */
export function pathKey(path: ScopeStep[]): string {
  return path.map((step) => step.nodeId).join("/");
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
