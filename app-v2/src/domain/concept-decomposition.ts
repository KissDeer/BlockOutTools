import { z } from "zod";
import { computeTopologyDigest } from "./concept";
import { fingerprint } from "./fingerprint";
import type { LogicKind, LogicModule, LogicTopology, LogicTraversal } from "./concept";

/**
 * 横向拆解：把逻辑节点划分成模块。
 * 模块间连接不单独存储，一律由拓扑链路推导 —— 划分只有一个事实来源，不会和链路对不上。
 */

export interface ModuleLink {
  linkId: string;
  label: string;
  /** 两端所在的区域（LogicNode.id）—— 生成端口时要知道是哪两个区域相连 */
  from: string;
  to: string;
  fromModuleId: string;
  toModuleId: string;
  logic: LogicKind;
  traversal: LogicTraversal;
  requiresKeyName: string | null;
}

export interface DecompositionIssue {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  moduleIds: string[];
}

export interface DecompositionCandidate {
  spec: "blockout.concept.decomposition";
  specVersion: 1;
  name: string;
  /** 依据的输入指纹 */
  basedOnInputsDigest: string;
  /** 依据的拓扑指纹：拓扑改过之后旧提案必须重新核对 */
  basedOnTopologyDigest: string;
  proposer: { name: string; version: string; note: string };
  modules: { tempId: string; name: string; nodeIds: string[]; note: string }[];
  warnings: string[];
}

export function createEmptyDecompositionCandidate(inputsDigest: string, topologyDigest: string): DecompositionCandidate {
  return {
    spec: "blockout.concept.decomposition",
    specVersion: 1,
    name: "拆解提案",
    basedOnInputsDigest: inputsDigest,
    basedOnTopologyDigest: topologyDigest,
    proposer: { name: "manual", version: "1", note: "" },
    modules: [],
    warnings: [],
  };
}

/* ---------------- 推导 ---------------- */

export function moduleOfNode(topology: LogicTopology, nodeId: string): LogicModule | null {
  return topology.modules.find((module) => module.nodeIds.includes(nodeId)) ?? null;
}

/** 模块间连接 = 两端落在不同模块的拓扑链路 */
export function deriveModuleLinks(topology: LogicTopology): ModuleLink[] {
  const owner = new Map<string, string>();
  for (const module of topology.modules) for (const nodeId of module.nodeIds) owner.set(nodeId, module.id);
  const result: ModuleLink[] = [];
  for (const link of topology.links) {
    const from = owner.get(link.from);
    const to = owner.get(link.to);
    if (!from || !to || from === to) continue;
    result.push({
      linkId: link.id,
      label: link.label,
      from: link.from,
      to: link.to,
      fromModuleId: from,
      toModuleId: to,
      logic: link.logic,
      traversal: link.traversal,
      requiresKeyName: topology.keys.find((key) => key.id === link.requires)?.name ?? null,
    });
  }
  return result;
}

export function internalLinkCount(topology: LogicTopology): number {
  const owner = new Map<string, string>();
  for (const module of topology.modules) for (const nodeId of module.nodeIds) owner.set(nodeId, module.id);
  return topology.links.filter((link) => owner.get(link.from) && owner.get(link.from) === owner.get(link.to)).length;
}

/** 划分指纹：模块归属变了，基于它的基础构型提案就必须重新核对 */
export function computeDecompositionDigest(topology: LogicTopology): string {
  const modules = [...topology.modules]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((module) => [module.id, module.name, [...module.nodeIds].sort().join(",")].join("\u0001"));
  return fingerprint(modules.join("\u0002"));
}

/* ---------------- 规则兜底校验（B） ---------------- */

/**
 * 只做确定性检查，不代替设计判断。
 * error 会拦住交付；warning 需要人工确认；info 只是提示。
 */
export function validateDecomposition(topology: LogicTopology): DecompositionIssue[] {
  const issues: DecompositionIssue[] = [];
  const nodes = topology.nodes;

  if (nodes.length === 0) return issues;
  if (topology.modules.length === 0) {
    issues.push({ id: "dec:none", severity: "info", message: "还没有做横向拆解：所有区域都还没分到模块", moduleIds: [] });
    return issues;
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const seen = new Map<string, string[]>();
  for (const module of topology.modules) {
    const unknown = module.nodeIds.filter((nodeId) => !nodeIds.has(nodeId));
    if (unknown.length) {
      issues.push({ id: `dec:unknown:${module.id}`, severity: "error", message: `模块“${module.name}”引用了 ${unknown.length} 个不存在的节点`, moduleIds: [module.id] });
    }
    if (module.nodeIds.length === 0) {
      issues.push({ id: `dec:empty:${module.id}`, severity: "warning", message: `模块“${module.name}”是空的`, moduleIds: [module.id] });
    }
    for (const nodeId of module.nodeIds) seen.set(nodeId, [...(seen.get(nodeId) ?? []), module.id]);
  }

  for (const [nodeId, moduleIds] of seen) {
    if (moduleIds.length > 1) {
      const name = nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
      issues.push({ id: `dec:dup:${nodeId}`, severity: "error", message: `“${name}”同时被分到了 ${moduleIds.length} 个模块`, moduleIds });
    }
  }

  const unassigned = nodes.filter((node) => !seen.has(node.id));
  if (unassigned.length) {
    issues.push({
      id: "dec:unassigned", severity: "error",
      message: `还有 ${unassigned.length} 个区域没有分到模块：${unassigned.map((node) => node.name).join("、")}`,
      moduleIds: [],
    });
  }

  const moduleLinks = deriveModuleLinks(topology);

  for (const module of topology.modules) {
    if (module.nodeIds.length === 0) continue;
    const external = moduleLinks.filter((link) => link.fromModuleId === module.id || link.toModuleId === module.id);
    if (external.length === 0 && topology.modules.length > 1) {
      issues.push({
        id: `dec:sealed:${module.id}`, severity: "warning",
        message: `模块“${module.name}”没有任何对外连接，玩家进不去也出不来`,
        moduleIds: [module.id],
      });
    }
    const floors = new Set(module.nodeIds.map((nodeId) => nodes.find((node) => node.id === nodeId)?.floor ?? 0));
    if (floors.size > 1) {
      issues.push({
        id: `dec:cross-floor:${module.id}`, severity: "warning",
        message: `模块“${module.name}”跨越了 ${floors.size} 个逻辑层（F${[...floors].sort().join("、F")}），UE 里一个模块通常只占一层`,
        moduleIds: [module.id],
      });
    }
    if (module.nodeIds.length >= 8) {
      issues.push({
        id: `dec:over-merge:${module.id}`, severity: "warning",
        message: `模块“${module.name}”包含 ${module.nodeIds.length} 个区域，可能还没真正拆开`,
        moduleIds: [module.id],
      });
    }
  }

  /* 模块图连通性：从起点所在模块出发能不能走到所有模块 */
  const startModule = topology.startNodeId ? moduleOfNode(topology, topology.startNodeId) : null;
  if (startModule) {
    const adjacency = new Map<string, string[]>(topology.modules.map((module) => [module.id, []]));
    for (const link of moduleLinks) {
      adjacency.get(link.fromModuleId)?.push(link.toModuleId);
      adjacency.get(link.toModuleId)?.push(link.fromModuleId);
    }
    const visited = new Set<string>([startModule.id]);
    const queue = [startModule.id];
    while (queue.length) {
      const current = queue.shift() as string;
      for (const next of adjacency.get(current) ?? []) if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
    const unreachable = topology.modules.filter((module) => !visited.has(module.id));
    if (unreachable.length) {
      issues.push({
        id: "dec:disconnected", severity: "error",
        message: `从起点所在模块出发走不到：${unreachable.map((module) => module.name).join("、")}`,
        moduleIds: unreachable.map((module) => module.id),
      });
    }
  } else if (topology.modules.length > 1) {
    issues.push({ id: "dec:no-start", severity: "warning", message: "没有起点，无法判断模块图是否连通", moduleIds: [] });
  }

  const single = topology.modules.filter((module) => module.nodeIds.length === 1);
  if (topology.modules.length >= 4 && single.length > topology.modules.length / 2) {
    issues.push({
      id: "dec:over-split", severity: "info",
      message: `${single.length}/${topology.modules.length} 个模块只含一个区域，可能拆得过碎`,
      moduleIds: single.map((module) => module.id),
    });
  }

  const internal = internalLinkCount(topology);
  if (internal > 0) {
    issues.push({ id: "dec:internal", severity: "info", message: `${internal} 条链路落在模块内部，不会成为模块间连接`, moduleIds: [] });
  }

  return issues;
}

export function summarizeDecomposition(topology: LogicTopology): { modules: number; assigned: number; unassigned: number; moduleLinks: number; internal: number } {
  const assigned = new Set(topology.modules.flatMap((module) => module.nodeIds));
  return {
    modules: topology.modules.length,
    assigned: assigned.size,
    unassigned: topology.nodes.filter((node) => !assigned.has(node.id)).length,
    moduleLinks: deriveModuleLinks(topology).length,
    internal: internalLinkCount(topology),
  };
}

/* ---------------- 候选校验 ---------------- */

export function validateDecompositionCandidate(candidate: DecompositionCandidate, topology: LogicTopology): DecompositionIssue[] {
  const issues: DecompositionIssue[] = [];
  if (candidate.basedOnInputsDigest !== topology.inputs.digest) {
    issues.push({ id: "dec-candidate:inputs-stale", severity: "error", message: "提案基于旧的输入材料，请重新拆解", moduleIds: [] });
  }
  if (candidate.basedOnTopologyDigest !== computeTopologyDigest(topology)) {
    issues.push({ id: "dec-candidate:topology-stale", severity: "error", message: "提案给出后逻辑拓扑已被改动，请重新拆解", moduleIds: [] });
  }
  if (candidate.modules.length === 0) {
    issues.push({ id: "dec-candidate:empty", severity: "error", message: "提案没有给出任何模块", moduleIds: [] });
  }

  const nodeIds = new Set(topology.nodes.map((node) => node.id));
  const assigned = new Map<string, string>();
  const tempIds = new Set<string>();
  for (const module of candidate.modules) {
    if (tempIds.has(module.tempId)) issues.push({ id: `dec-candidate:dup:${module.tempId}`, severity: "error", message: `提案里模块身份重复：${module.tempId}`, moduleIds: [] });
    tempIds.add(module.tempId);
    if (module.nodeIds.length === 0) issues.push({ id: `dec-candidate:empty-module:${module.tempId}`, severity: "warning", message: `提案中的模块“${module.name}”没有包含任何区域`, moduleIds: [] });
    for (const nodeId of module.nodeIds) {
      if (!nodeIds.has(nodeId)) {
        issues.push({ id: `dec-candidate:unknown:${module.tempId}:${nodeId}`, severity: "error", message: `提案引用了不存在的区域：${nodeId}`, moduleIds: [] });
        continue;
      }
      if (assigned.has(nodeId)) {
        const name = topology.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
        issues.push({ id: `dec-candidate:dup-node:${nodeId}`, severity: "error", message: `提案把“${name}”分到了多个模块`, moduleIds: [] });
      }
      assigned.set(nodeId, module.tempId);
    }
  }
  const missing = topology.nodes.filter((node) => !assigned.has(node.id));
  if (missing.length) {
    issues.push({ id: "dec-candidate:missing", severity: "warning", message: `提案没有覆盖 ${missing.length} 个区域（套用后它们仍未分配）：${missing.map((node) => node.name).join("、")}`, moduleIds: [] });
  }
  return issues;
}

/* ---------------- Schema ---------------- */

export const decompositionCandidateSchema = z.object({
  spec: z.literal("blockout.concept.decomposition"),
  specVersion: z.literal(1),
  name: z.string().default("拆解提案"),
  basedOnInputsDigest: z.string().min(1),
  basedOnTopologyDigest: z.string().min(1),
  proposer: z.object({ name: z.string(), version: z.string(), note: z.string().default("") }).default({ name: "unknown", version: "1", note: "" }),
  modules: z.array(z.object({
    tempId: z.string().min(1),
    name: z.string().min(1),
    nodeIds: z.array(z.string().min(1)).default([]),
    note: z.string().default(""),
  })).default([]),
  warnings: z.array(z.string()).default([]),
});
