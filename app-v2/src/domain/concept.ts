import { z } from "zod";
import type { Vec2 } from "./types";
import type { Block } from "./block-types";
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

/** 连线在画布上的连接点方向，不影响通行与空间语义。 */
export type LogicHandleSide = "top" | "right" | "bottom" | "left";

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
  /**
   * 这个节点自己的朝向（度，绕 Z）。
   * 它同时是自己那套坐标的朝向：节点的积木与子层内容都跟着它转。
   * 缺省 0 = 与父级对齐。
   */
  relativeRotation?: number;
  /** 相对标高范围（厘米，父级局部坐标） */
  elevation: { base: number; top: number } | null;
  /** 绑定到模块定义后，可直接查看该模块内部体块与 3D 预览 */
  moduleId?: string;
  /**
   * 这个节点自己的几何，坐标是**节点局部厘米**。
   * 节点是唯一容器：几何挂在节点上，中间不再有承载体。
   * 与 childScopeId **可以并存** —— 同一个区域既能拼体块，又能在里面分出子区域。
   */
  blocks?: Block[];
  /**
   * 这个节点内部的下一层逻辑拓扑。指向本拓扑 `scopes` 池里的一个作用域。
   * 一个作用域只能属于一个节点（嵌套是一棵树，不是图）。
   */
  childScopeId?: string;
  note: string;
}

export interface LogicLink {
  id: string;
  /** 图上标注字母（A、B、C…），沿用既有习惯 */
  label: string;
  from: string;
  to: string;
  sourceHandle?: LogicHandleSide;
  targetHandle?: LogicHandleSide;
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

/**
 * 一个可编辑的作用域。根作用域就是拓扑本身，子作用域放在 `LogicTopology.scopes` 池里。
 *
 * **没有"模块"这一层**：节点直接持有几何（`LogicNode.blocks`），
 * 内部还有一层时由节点自己的 `childScopeId` 指向池子里的作用域。
 */
export interface LogicScope {
  id: string;
  name: string;
  inputs: LogicInputs;
  nodes: LogicNode[];
  links: LogicLink[];
  keys: LogicKey[];
  startNodeId: string | null;
  proposals: DecompositionProposal[];
  note: string;
}

export interface LogicTopology extends LogicScope {
  /** 全部子作用域（扁平池，按 id 去重后使用；见 `scopesOf`） */
  scopes: LogicScope[];
}

export function createEmptyScope(id: string, name: string): LogicScope {
  return { id, name, inputs: createEmptyInputs(), nodes: [], links: [], keys: [], startNodeId: null, proposals: [], note: "" };
}

export function createEmptyTopology(): LogicTopology {
  return { ...createEmptyScope("scope_root", "根作用域"), scopes: [] };
}

/** 某个作用域自己的节点（根作用域与子作用域统一取法） */
export function nodesOfScope(topology: LogicTopology, scopeId: string | null): LogicNode[] {
  if (scopeId === null) return topology.nodes;
  return topology.scopes.find((scope) => scope.id === scopeId)?.nodes ?? [];
}

/**
 * 拓扑池里真正要去查的那些作用域。
 *
 * 池子里的每个作用域都带一份自己的 `scopes` 数组（为了让每个作用域都能单独当一个可编辑拓扑用），
 * 那份是**同一份池的副本**，不是权威数据。凡是"遍历所有作用域去找某个东西"的地方都必须走这里：
 * 直接写 `[topology, ...topology.scopes]` 会摸到过期副本，展开、收起这类
 * "先克隆再改"的操作就会看起来没生效。
 */
export function scopesOf(topology: LogicTopology): LogicScope[] {
  const seen = new Set<string>([topology.id]);
  const result: LogicScope[] = [topology];
  for (const scope of topology.scopes) {
    if (seen.has(scope.id)) continue;
    seen.add(scope.id);
    result.push(scope);
  }
  return result;
}

/**
 * 一个节点内部的子逻辑层。
 *
 * **注意**：这里只认节点自己的 `childScopeId`。旧的 `LogicModule.childScopeId`
 * 由 `concept-scopes.ts` 的 `childScopeIdOf` 兜底读——那是过渡期的唯一裁决点。
 * 直接在各处写 `node.childScopeId ?? group.childScopeId` 迟早会漂移。
 */
export function scopeOwner(topology: LogicTopology, nodeId: string): string | undefined {
  for (const scope of scopesOf(topology)) {
    const node = scope.nodes.find((item) => item.id === nodeId);
    if (node) return node.childScopeId;
  }
  return undefined;
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

/**
 * 节点内积木：这里**只做形状检查，不解析**，解析完原样交给 `Block` 类型。
 *
 * 原因有两个：
 * 1. 每种积木的参数由 `block-schema.ts` 逐类校验，那是唯一口径。这里再写一套规则，
 *    两处迟早漂移；而节点几何是新的写入目标，更不能有两套说法。
 * 2. 用 `z.unknown()` 而不是 `z.object({...})`，是为了让**旧文件里的积木原样穿过去**，
 *    而不是被这里悄悄剥掉未知字段。
 */
const nodeBlocksSchema = z.array(z.unknown()).optional() as unknown as z.ZodType<Block[] | undefined>;

export const logicNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["start", "hub", "combat", "reward", "boss", "transition", "secret"]),
  floor: z.number().int(),
  graphPosition: vec2,
  // 旧草稿没有这两个字段
  relativePosition: vec2.nullable().default(null),
  relativeRotation: finiteNumber.optional(),
  elevation: z.object({ base: finiteNumber, top: finiteNumber }).nullable().default(null),
  moduleId: z.string().min(1).optional(),
  // 旧草稿的节点没有自己的几何
  blocks: nodeBlocksSchema,
  // 旧草稿把这一层关系记在 LogicModule 上（过渡期由 concept-scopes 兜底读）
  childScopeId: z.string().min(1).optional(),
  note: z.string(),
});

export const logicLinkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  sourceHandle: z.enum(["top", "right", "bottom", "left"]).optional(),
  targetHandle: z.enum(["top", "right", "bottom", "left"]).optional(),
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

const logicScopeFields = {
  id: z.string().min(1),
  name: z.string().min(1),
  inputs: logicInputsSchema,
  nodes: z.array(logicNodeSchema),
  links: z.array(logicLinkSchema),
  keys: z.array(logicKeySchema),
  startNodeId: z.string().min(1).nullable(),
  proposals: z.array(decompositionProposalSchema).default([]),
  note: z.string().default(""),
};

/** 每层使用同一套局部身份与引用规则；不同作用域的本地身份可以重复。 */
export function collectLocalScopeIssues(topology: LogicScope): string[] {
  const issues: string[] = [];
  const fail = (message: string) => issues.push(message);
  const nodeIds = new Set(topology.nodes.map((node) => node.id));
  const linkIds = new Set(topology.links.map((link) => link.id));
  if (nodeIds.size !== topology.nodes.length) fail("逻辑节点身份重复");
  if (linkIds.size !== topology.links.length) fail("逻辑链路身份重复");
  if (new Set(topology.keys.map((key) => key.id)).size !== topology.keys.length) fail("锁钥身份重复");
  const keyIds = new Set(topology.keys.map((key) => key.id));
  for (const link of topology.links) {
    if (link.from === link.to) fail(`链路 ${link.label} 的两端是同一个节点`);
    if (!nodeIds.has(link.from) || !nodeIds.has(link.to)) fail(`链路 ${link.label} 引用了不存在的节点`);
    if (link.logic === "locked-door" && !link.requires) fail(`锁钥门 ${link.label} 没有指定钥匙`);
    if (link.requires && !keyIds.has(link.requires)) fail(`链路 ${link.label} 引用了不存在的钥匙`);
  }
  for (const key of topology.keys) {
    if (!nodeIds.has(key.foundAt)) fail(`钥匙“${key.name}”的取得位置不存在`);
    for (const unlock of key.unlocks) if (!linkIds.has(unlock)) fail(`钥匙“${key.name}”解锁了不存在的链路`);
  }
  if (topology.startNodeId && !nodeIds.has(topology.startNodeId)) fail("起点节点不存在");
  return issues;
}

function validateScopeReferences(scope: LogicScope, context: z.RefinementCtx): void {
  for (const message of collectLocalScopeIssues(scope)) {
    context.addIssue({ code: "custom", message: `作用域“${scope.name}”（${scope.id}）：${message}` });
  }
}

export const logicScopeSchema = z.object(logicScopeFields).superRefine(validateScopeReferences);

export const logicTopologySchema = z.object({
  ...logicScopeFields,
  // 旧草稿的根作用域没有 id/name（子作用域才需要显式给），给默认值兜底
  id: z.string().min(1).default("scope_root"),
  name: z.string().min(1).default("根作用域"),
  // 旧草稿没有子作用域
  scopes: z.array(logicScopeSchema).default([]),
}).superRefine((topology, context) => {
  validateScopeReferences(topology, context);
  for (const message of collectScopeIssues(topology)) context.addIssue({ code: "custom", message });
});

/**
 * 子作用域的结构问题：身份重复、引用不存在、悬空作用域、被两个节点抢、以及**自包含**。
 *
 * 2026-09-17 二次修订后，一个作用域只能属于**一个节点**（嵌套是一棵树，不是图）。
 * 原来的 `LogicModule.childScopeId` 支持多对一，移到节点上就自然收紧成一对一 ——
 * 这里把"被抢"和"没人要"都报出来，避免静默留下对不上的导航。
 */
export function collectScopeIssues(topology: LogicTopology): string[] {
  const issues: string[] = [];
  const ids = topology.scopes.map((scope) => scope.id);
  if (new Set(ids).size !== ids.length) issues.push("子作用域身份重复");
  const known = new Set(ids);

  // 每个作用域引用它的那个节点，用于发现"被抢"
  const owners = new Map<string, { nodeId: string; nodeName: string }[]>();
  const childScopeIdsOf = (scopeId: string | null): string[] => {
    const found: string[] = [];
    for (const node of nodesOfScope(topology, scopeId)) {
      if (!node.childScopeId) continue;
      found.push(node.childScopeId);
      owners.set(node.childScopeId, [...(owners.get(node.childScopeId) ?? []), { nodeId: node.id, nodeName: node.name }]);
    }
    return found;
  };
  // 先把根层的归属登记下来；环检测只从子作用域出发，不会顺带走到根层
  childScopeIdsOf(null);

  for (const scope of scopesOf(topology)) {
    for (const node of scope.nodes) {
      if (node.childScopeId && !known.has(node.childScopeId)) issues.push(`节点“${node.name}”引用了不存在的子作用域：${node.childScopeId}`);
    }
  }

  for (const [scopeId, claimants] of owners) {
    if (claimants.length < 2) continue;
    issues.push(`子作用域 ${scopeId} 被 ${claimants.length} 个节点同时指定为内部：${claimants.map((item) => item.nodeName).join("、")}。一个作用域只能属于一个节点`);
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

  // 悬空：池子里有、但没有任何节点指向它。不是错误，但说出来免得它一直躺在文件里
  for (const scope of topology.scopes) {
    if (!owners.has(scope.id)) issues.push(`子作用域“${scope.name}”没有归属节点（悬空）`);
  }
  return issues;
}
