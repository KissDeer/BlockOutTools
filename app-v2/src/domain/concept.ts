import { z } from "zod";
import type { Vec2 } from "./types";
import { fingerprint } from "./fingerprint";
import {
  createEmptyInputs,
  decompositionProposalSchema,
  logicInputsSchema,
  type DecompositionProposal,
  type LogicInputs,
} from "./concept-inputs";

/**
 * 逻辑拓扑：只表达"怎么连通"，不表达真实位置。
 * graphPosition 仅是画布排版坐标，任何逻辑坐标都不参与 3D、UE 或几何计算。
 */

export type LogicKind =
  | "normal"
  | "one-way-door"
  | "locked-door"
  | "shortcut"
  | "drop"
  | "stairs"
  | "spiral-stairs"
  | "elevator"
  | "one-way-elevator"
  | "road";

/** both=双向；forward=只能按 from→to 走；one-time=一次性，走过不再可回 */
export type LogicTraversal = "both" | "forward" | "one-time";

export type LogicNodeRole = "start" | "hub" | "combat" | "reward" | "boss" | "transition" | "secret";

export interface LogicNode {
  id: string;
  name: string;
  role: LogicNodeRole;
  floor: number;
  /** 画布排版坐标，无世界含义 */
  graphPosition: Vec2;
  /** 依范围图标定换算出的相对位置（厘米，父级局部坐标）；未定位为 null */
  relativePosition: Vec2 | null;
  /** 相对标高范围（厘米，父级局部坐标） */
  elevation: { base: number; top: number } | null;
  /** 绑定到模块定义后，可直接查看该模块内部体块与 3D 预览 */
  moduleId?: string;
  note: string;
}

export interface LogicLink {
  id: string;
  /** 图上标注字母（A、B、C…），沿用既有习惯 */
  label: string;
  from: string;
  to: string;
  logic: LogicKind;
  traversal: LogicTraversal;
  /** 锁钥门指向 LogicKey.id */
  requires: string | null;
  note: string;
}

export interface LogicKey {
  id: string;
  name: string;
  /** 在哪个节点取得（LogicNode.id） */
  foundAt: string;
  /** 解锁哪些链路（LogicLink.id） */
  unlocks: string[];
  note: string;
}

/** 拆解出的模块：一组逻辑节点的集合。模块间连接由拓扑链路推导，不另存一份。 */
export interface LogicModule {
  id: string;
  name: string;
  /** 属于这个模块的节点（LogicNode.id） */
  nodeIds: string[];
  /** 基础构型落成的阶段二模块定义（体块 + 端口）。展开成子作用域的模块没有自己的构型 */
  moduleDefinitionId?: string;
  /** 该模块局部坐标系原点在父级里的位置（厘米）—— 阶段二拼装时需要 */
  relativeOrigin?: Vec2;
  /**
   * 展开：这个模块内部还有一层（游乐园 → 鬼屋）。
   * 指向本拓扑 scopes 池里的一个作用域；同一个作用域可以被多个模块引用（复用）。
   */
  childScopeId?: string;
  note: string;
}

/** 一个可编辑的作用域。根作用域就是拓扑本身，子作用域放在 LogicTopology.scopes 池里。 */
export interface LogicScope {
  id: string;
  name: string;
  inputs: LogicInputs;
  nodes: LogicNode[];
  links: LogicLink[];
  keys: LogicKey[];
  startNodeId: string | null;
  proposals: DecompositionProposal[];
  /** 横向拆解：节点到模块的划分 */
  modules: LogicModule[];
  note: string;
}

export interface LogicTopology extends LogicScope {
  /**
   * 全部子作用域（扁平池，可被任意层的模块复用）。
   * 因为可以复用，环检测是必须的：作用域不能直接或间接包含自己。
   */
  scopes: LogicScope[];
}

export function createEmptyScope(id: string, name: string): LogicScope {
  return { id, name, inputs: createEmptyInputs(), nodes: [], links: [], keys: [], startNodeId: null, proposals: [], modules: [], note: "" };
}

export function createEmptyTopology(): LogicTopology {
  return { ...createEmptyScope("scope_root", "根作用域"), scopes: [] };
}

/**
 * 拓扑内容指纹：只包含会改变"拆解含义"的字段，**覆盖全部子作用域**。
 * 用于发现"提案给出之后，拓扑已经被改过"。
 */
export function computeTopologyDigest(topology: LogicTopology): string {
  const scopeSignature = (scope: LogicScope): string => {
    const nodes = [...scope.nodes].sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => [node.id, node.name, node.role, node.floor].join("\u0001"));
    const links = [...scope.links].sort((a, b) => a.id.localeCompare(b.id))
      .map((link) => [link.id, link.from, link.to, link.logic, link.traversal, link.requires ?? ""].join("\u0001"));
    const keys = [...scope.keys].sort((a, b) => a.id.localeCompare(b.id))
      .map((key) => [key.id, key.name, key.foundAt, [...key.unlocks].sort().join(",")].join("\u0001"));
    return [scope.id, scope.name, nodes.join("\u0002"), links.join("\u0002"), keys.join("\u0002")].join("\u0001");
  };
  const scopes = [...topology.scopes].sort((a, b) => a.id.localeCompare(b.id)).map(scopeSignature);
  return fingerprint([scopeSignature(topology), ...scopes].join("\u0003"));
}

export interface LogicKindMeta {
  label: string;
  color: string;
  dash: boolean;
  /** 天然单向：新建时默认 traversal=forward */
  directed: boolean;
}

export const LOGIC_KINDS: Record<LogicKind, LogicKindMeta> = {
  normal: { label: "普通连通", color: "#9da69f", dash: false, directed: false },
  "one-way-door": { label: "单向门", color: "#d8a84e", dash: false, directed: true },
  "locked-door": { label: "锁钥门", color: "#df7062", dash: false, directed: false },
  shortcut: { label: "捷径", color: "#6bd2b4", dash: true, directed: true },
  drop: { label: "掉落", color: "#b08bd8", dash: false, directed: true },
  stairs: { label: "楼梯", color: "#4bb89a", dash: false, directed: false },
  "spiral-stairs": { label: "旋转楼梯", color: "#4bb89a", dash: true, directed: false },
  elevator: { label: "电梯", color: "#7fb2d8", dash: false, directed: false },
  "one-way-elevator": { label: "单向升降", color: "#7fb2d8", dash: true, directed: true },
  road: { label: "道路", color: "#8f9a91", dash: false, directed: false },
};

export const NODE_ROLES: Record<LogicNodeRole, string> = {
  start: "起点",
  hub: "枢纽",
  combat: "战斗",
  reward: "奖励",
  boss: "Boss",
  transition: "过渡",
  secret: "隐藏",
};

export const TRAVERSALS: Record<LogicTraversal, string> = {
  both: "双向",
  forward: "单向",
  "one-time": "一次性",
};

export function defaultTraversal(logic: LogicKind): LogicTraversal {
  return LOGIC_KINDS[logic].directed ? "forward" : "both";
}

/** 该链路是否允许 to→from */
export function allowsBackward(link: LogicLink): boolean {
  return link.traversal === "both";
}

/* ---------------- Schema ---------------- */

const finiteNumber = z.number().finite();
const vec2 = z.tuple([finiteNumber, finiteNumber]);

export const logicNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["start", "hub", "combat", "reward", "boss", "transition", "secret"]),
  floor: z.number().int(),
  graphPosition: vec2,
  // 旧草稿没有这两个字段
  relativePosition: vec2.nullable().default(null),
  elevation: z.object({ base: finiteNumber, top: finiteNumber }).nullable().default(null),
  moduleId: z.string().min(1).optional(),
  note: z.string(),
});

export const logicLinkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  logic: z.enum(["normal", "one-way-door", "locked-door", "shortcut", "drop", "stairs", "spiral-stairs", "elevator", "one-way-elevator", "road"]),
  traversal: z.enum(["both", "forward", "one-time"]),
  requires: z.string().min(1).nullable(),
  note: z.string(),
});

export const logicKeySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  foundAt: z.string().min(1),
  unlocks: z.array(z.string().min(1)),
  note: z.string(),
});

export const logicModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodeIds: z.array(z.string().min(1)),
  moduleDefinitionId: z.string().min(1).optional(),
  relativeOrigin: vec2.optional(),
  childScopeId: z.string().min(1).optional(),
  note: z.string(),
});

const logicScopeFields = {
  id: z.string().min(1),
  name: z.string().min(1),
  inputs: logicInputsSchema,
  nodes: z.array(logicNodeSchema),
  links: z.array(logicLinkSchema),
  keys: z.array(logicKeySchema),
  startNodeId: z.string().min(1).nullable(),
  proposals: z.array(decompositionProposalSchema).default([]),
  modules: z.array(logicModuleSchema).default([]),
  note: z.string().default(""),
};

export const logicScopeSchema = z.object(logicScopeFields);

export const logicTopologySchema = z.object({
  ...logicScopeFields,
  // 旧草稿的根作用域没有 id/name（子作用域才需要显式给），给默认值兜底
  id: z.string().min(1).default("scope_root"),
  name: z.string().min(1).default("根作用域"),
  // 旧草稿没有子作用域
  scopes: z.array(logicScopeSchema).default([]),
}).superRefine((topology, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const nodeIds = new Set(topology.nodes.map((node) => node.id));
  const linkIds = new Set(topology.links.map((link) => link.id));
  if (nodeIds.size !== topology.nodes.length) fail("逻辑节点身份重复");
  if (linkIds.size !== topology.links.length) fail("逻辑链路身份重复");
  if (new Set(topology.keys.map((key) => key.id)).size !== topology.keys.length) fail("锁钥身份重复");
  for (const link of topology.links) {
    if (link.from === link.to) fail(`链路 ${link.label} 的两端是同一个节点`);
    if (!nodeIds.has(link.from) || !nodeIds.has(link.to)) fail(`链路 ${link.label} 引用了不存在的节点`);
    if (link.logic === "locked-door" && !link.requires) fail(`锁钥门 ${link.label} 没有指定钥匙`);
  }
  for (const key of topology.keys) {
    if (!nodeIds.has(key.foundAt)) fail(`钥匙“${key.name}”的取得位置不存在`);
    for (const unlock of key.unlocks) if (!linkIds.has(unlock)) fail(`钥匙“${key.name}”解锁了不存在的链路`);
  }
  if (topology.startNodeId && !nodeIds.has(topology.startNodeId)) fail("起点节点不存在");
  if (new Set(topology.modules.map((module) => module.id)).size !== topology.modules.length) fail("模块身份重复");
  const assigned = new Set<string>();
  for (const module of topology.modules) {
    for (const nodeId of module.nodeIds) {
      if (!nodeIds.has(nodeId)) fail(`模块“${module.name}”引用了不存在的节点`);
      if (assigned.has(nodeId)) fail(`节点被分到了多个模块`);
      assigned.add(nodeId);
    }
  }
  for (const issue of collectScopeIssues(topology)) fail(issue);
});

/**
 * 子作用域的结构问题：身份重复、引用不存在、以及**自包含**。
 * 作用域是可复用的（同一个鬼屋用在两张地图里），所以必须能发现环。
 */
export function collectScopeIssues(topology: LogicTopology): string[] {
  const issues: string[] = [];
  const ids = topology.scopes.map((scope) => scope.id);
  if (new Set(ids).size !== ids.length) issues.push("子作用域身份重复");
  const byId = new Map(topology.scopes.map((scope) => [scope.id, scope]));
  const known = new Set(ids);

  const childScopeIdsOf = (scopeId: string | null): string[] => {
    const modules = scopeId === null ? topology.modules : byId.get(scopeId)?.modules ?? [];
    return modules.map((module) => module.childScopeId).filter((id): id is string => Boolean(id));
  };

  for (const scopeId of childScopeIdsOf(null)) if (!known.has(scopeId)) issues.push(`模块引用了不存在的子作用域：${scopeId}`);
  for (const scope of topology.scopes) {
    for (const scopeId of childScopeIdsOf(scope.id)) if (!known.has(scopeId)) issues.push(`模块引用了不存在的子作用域：${scopeId}`);
  }

  // 环检测：从某个作用域出发往下走，能不能再走回它自己
  for (const scope of topology.scopes) {
    const seen = new Set<string>();
    const stack = [...childScopeIdsOf(scope.id)];
    let cyclic = false;
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (current === scope.id) { cyclic = true; break; }
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...childScopeIdsOf(current));
    }
    if (cyclic) issues.push(`作用域“${scope.name}”直接或间接包含了自己`);
  }
  return issues;
}
