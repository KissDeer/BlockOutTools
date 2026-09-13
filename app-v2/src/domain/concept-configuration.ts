import { z } from "zod";
import { computeTopologyDigest } from "./concept";
import { computeDecompositionDigest, deriveModuleLinks } from "./concept-decomposition";
import type { LogicNodeRole, LogicTopology } from "./concept";
import type { Vec2, Vec3 } from "./types";

/**
 * 基础构型：把拆解出来的每个模块变成"体块 + 端口"，写进阶段二的模块定义。
 * 候选只给尺寸与端口朝向，模块局部坐标由这里统一算 —— 提案方不需要知道原点在哪。
 */

export interface ConfigurationArea {
  nodeId: string;
  /** 体块尺寸（厘米）：宽 × 深 × 高 */
  size: Vec3;
  role: "floor" | "solid";
  note: string;
}

export interface ConfigurationPort {
  linkId: string;
  nodeId: string;
  /** 相对该区域中心的平面偏移（厘米） */
  offset: Vec2;
  rotation: number;
  width: number;
  note: string;
}

export interface ModuleConfiguration {
  moduleId: string;
  areas: ConfigurationArea[];
  ports: ConfigurationPort[];
  note: string;
}

export interface ConfigurationCandidate {
  spec: "blockout.concept.configuration";
  specVersion: 1;
  name: string;
  basedOnInputsDigest: string;
  basedOnTopologyDigest: string;
  basedOnDecompositionDigest: string;
  proposer: { name: string; version: string; note: string };
  modules: ModuleConfiguration[];
  warnings: string[];
}

export interface ConfigurationIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
}

/** 兜底模板：按区域角色给一个通用体量，明确标注是模板尺寸 */
export const ROLE_TEMPLATES: Record<LogicNodeRole, { width: number; depth: number; height: number; label: string }> = {
  start: { width: 1800, depth: 1800, height: 400, label: "起点小厅" },
  transition: { width: 1200, depth: 3600, height: 400, label: "走廊" },
  hub: { width: 3000, depth: 3000, height: 500, label: "枢纽大厅" },
  combat: { width: 3600, depth: 3000, height: 600, label: "战斗区" },
  reward: { width: 2000, depth: 2000, height: 400, label: "奖励间" },
  boss: { width: 4200, depth: 3600, height: 800, label: "Boss 区" },
  secret: { width: 1200, depth: 1200, height: 300, label: "隐藏区域" },
};

export function createEmptyConfigurationCandidate(topology: LogicTopology): ConfigurationCandidate {
  return {
    spec: "blockout.concept.configuration",
    specVersion: 1,
    name: "基础构型提案",
    basedOnInputsDigest: topology.inputs.digest,
    basedOnTopologyDigest: computeTopologyDigest(topology),
    basedOnDecompositionDigest: computeDecompositionDigest(topology),
    proposer: { name: "manual", version: "1", note: "" },
    modules: [],
    warnings: [],
  };
}

/**
 * 端口落在区域边界上，朝向邻居。
 * 注意用"从中心沿该方向的射线与矩形边界的交点距离"，即两轴射线距离取小值；
 * 不能用支撑函数（|ux|·w/2 + |uy|·d/2）—— 那是投影范围，斜方向时会把端口甩到体块外面。
 */
function portPose(from: Vec2 | null, to: Vec2 | null, size: Vec3): { offset: Vec2; rotation: number } {
  if (!from || !to) return { offset: [0, 0], rotation: 0 };
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length < 1) return { offset: [0, 0], rotation: 0 };
  const ux = dx / length;
  const uy = dy / length;
  const rayX = ux === 0 ? Number.POSITIVE_INFINITY : (size[0] / 2) / Math.abs(ux);
  const rayY = uy === 0 ? Number.POSITIVE_INFINITY : (size[1] / 2) / Math.abs(uy);
  const reach = Math.min(rayX, rayY);
  return {
    offset: [Math.round(ux * reach), Math.round(uy * reach)],
    rotation: Math.round(Math.atan2(uy, ux) * 180 / Math.PI),
  };
}

/**
 * 确定性兜底（A）：按角色模板给每个区域一个体块，按对外连接生成端口。
 * 只保证"合法、可复现、可用"，不假装懂设计意图。
 */
export function generateConfiguration(topology: LogicTopology): ConfigurationCandidate {
  const moduleLinks = deriveModuleLinks(topology);
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const warnings: string[] = [];

  const modules: ModuleConfiguration[] = topology.modules.map((module) => {
    const areas: ConfigurationArea[] = module.nodeIds.map((nodeId) => {
      const node = nodeById.get(nodeId);
      const template = ROLE_TEMPLATES[node?.role ?? "transition"];
      return {
        nodeId,
        size: [template.width, template.depth, template.height] as Vec3,
        role: "solid" as const,
        note: `模板尺寸（${template.label}），请按设计调整`,
      };
    });
    const sizeOf = new Map(areas.map((area) => [area.nodeId, area.size]));

    const ports: ConfigurationPort[] = [];
    for (const link of moduleLinks) {
      const outgoing = link.fromModuleId === module.id;
      const incoming = link.toModuleId === module.id;
      if (!outgoing && !incoming) continue;
      const selfNodeId = outgoing ? link.from : link.to;
      const otherNodeId = outgoing ? link.to : link.from;
      const self = nodeById.get(selfNodeId);
      const other = nodeById.get(otherNodeId);
      if (!self || !other) continue;
      const size = sizeOf.get(selfNodeId) ?? [1200, 1200, 400];
      const pose = portPose(self.relativePosition, other.relativePosition, size as Vec3);
      if (!self.relativePosition || !other.relativePosition) warnings.push(`“${self.name}”或“${other.name}”还没有相对位置，端口只能放在区域中心`);
      ports.push({ linkId: link.linkId, nodeId: selfNodeId, offset: pose.offset, rotation: pose.rotation, width: 200, note: `对外连接 ${link.label}` });
    }
    return { moduleId: module.id, areas, ports, note: "" };
  });

  const unplaced = topology.nodes.filter((node) => !node.relativePosition);
  if (unplaced.length) warnings.push(`有 ${unplaced.length} 个区域没有相对位置，体块会叠在同一处，请先在识别面板定位`);
  if (topology.modules.length === 0) warnings.push("还没有做横向拆解，先完成拆解再生成构型");

  return {
    ...createEmptyConfigurationCandidate(topology),
    name: "按角色模板生成的基础构型",
    proposer: { name: "deterministic", version: "1", note: "角色模板 + 对外连接端口" },
    modules,
    warnings,
  };
}

/* ---------------- 规则兜底校验（B） ---------------- */

export function validateConfiguration(topology: LogicTopology, candidate: ConfigurationCandidate): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  if (candidate.basedOnInputsDigest !== topology.inputs.digest) {
    issues.push({ id: "cfg:inputs-stale", severity: "error", message: "构型基于旧的输入材料，请重新生成" });
  }
  if (candidate.basedOnTopologyDigest !== computeTopologyDigest(topology)) {
    issues.push({ id: "cfg:topology-stale", severity: "error", message: "构型给出后逻辑拓扑已被改动，请重新生成" });
  }
  if (candidate.basedOnDecompositionDigest !== computeDecompositionDigest(topology)) {
    issues.push({ id: "cfg:decomposition-stale", severity: "error", message: "模块划分已改动，构型需要重新生成" });
  }

  const moduleById = new Map(topology.modules.map((module) => [module.id, module]));
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const moduleLinks = deriveModuleLinks(topology);
  const covered = new Set<string>();

  if (candidate.modules.length === 0) {
    issues.push({ id: "cfg:empty", severity: "error", message: "构型没有包含任何模块" });
    return issues;
  }

  for (const entry of candidate.modules) {
    const module = moduleById.get(entry.moduleId);
    if (!module) {
      issues.push({ id: `cfg:unknown-module:${entry.moduleId}`, severity: "error", message: `构型引用了不存在的模块：${entry.moduleId}` });
      continue;
    }
    const areaNodes = new Set(entry.areas.map((area) => area.nodeId));
    for (const area of entry.areas) {
      covered.add(area.nodeId);
      const node = nodeById.get(area.nodeId);
      if (!node) {
        issues.push({ id: `cfg:unknown-node:${area.nodeId}`, severity: "error", message: `构型引用了不存在的区域：${area.nodeId}` });
        continue;
      }
      if (!module.nodeIds.includes(area.nodeId)) {
        issues.push({ id: `cfg:extra-area:${area.nodeId}`, severity: "warning", message: `“${node.name}”不属于模块“${module.name}”，它的体块将被忽略` });
      }
      if (area.size.some((value) => !(value > 0))) {
        issues.push({ id: `cfg:bad-size:${area.nodeId}`, severity: "error", message: `“${node.name}”的体块尺寸必须为正数` });
      }
      if (!node.relativePosition) {
        issues.push({ id: `cfg:unplaced:${area.nodeId}`, severity: "warning", message: `“${node.name}”没有相对位置，体块会落在模块原点` });
      }
    }
    for (const nodeId of module.nodeIds) {
      if (!areaNodes.has(nodeId)) {
        const node = nodeById.get(nodeId);
        issues.push({ id: `cfg:missing-area:${nodeId}`, severity: "error", message: `模块“${module.name}”里的“${node?.name ?? nodeId}”没有体块` });
      }
    }

    /* 每一条对外连接都要在本模块这一侧有端口 */
    const touching = moduleLinks.filter((link) => link.fromModuleId === module.id || link.toModuleId === module.id);
    for (const link of touching) {
      const selfNodeId = link.fromModuleId === module.id ? link.from : link.to;
      const hasPort = entry.ports.some((port) => port.linkId === link.linkId && port.nodeId === selfNodeId);
      if (!hasPort) {
        issues.push({
          id: `cfg:missing-port:${module.id}:${link.linkId}`, severity: "error",
          message: `模块“${module.name}”的对外连接 ${link.label} 没有端口，阶段二无法在这里连接`,
        });
      }
    }
    for (const port of entry.ports) {
      if (!touching.some((link) => link.linkId === port.linkId)) {
        issues.push({ id: `cfg:extra-port:${module.id}:${port.linkId}`, severity: "warning", message: `模块“${module.name}”上有一个不对应任何对外连接的端口` });
      }
    }
  }

  for (const module of topology.modules) {
    if (!candidate.modules.some((entry) => entry.moduleId === module.id)) {
      issues.push({ id: `cfg:module-missing:${module.id}`, severity: "error", message: `构型没有覆盖模块“${module.name}”` });
    }
  }

  return issues;
}

export function summarizeConfiguration(candidate: ConfigurationCandidate): { modules: number; areas: number; ports: number } {
  return {
    modules: candidate.modules.length,
    areas: candidate.modules.reduce((total, entry) => total + entry.areas.length, 0),
    ports: candidate.modules.reduce((total, entry) => total + entry.ports.length, 0),
  };
}

/**
 * 模块局部坐标：以该模块所有体块的包围盒左下角为原点。
 * 相对位置（父级厘米）在这里被平移到模块局部坐标系。
 */
export function moduleLocalLayout(topology: LogicTopology, entry: ModuleConfiguration): { origin: Vec2; boxes: { nodeId: string; center: Vec2; base: number; size: Vec3; rotation: number }[] } {
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const raw = entry.areas.flatMap((area) => {
    const node = nodeById.get(area.nodeId);
    if (!node) return [];
    const center = node.relativePosition ?? [0, 0];
    return [{
      nodeId: area.nodeId,
      center,
      base: node.elevation?.base ?? 0,
      size: area.size,
      rotation: 0,
      minX: center[0] - area.size[0] / 2,
      minY: center[1] - area.size[1] / 2,
    }];
  });
  if (raw.length === 0) return { origin: [0, 0], boxes: [] };
  const origin: Vec2 = [Math.min(...raw.map((item) => item.minX)), Math.min(...raw.map((item) => item.minY))];
  return {
    origin,
    boxes: raw.map((item) => ({ nodeId: item.nodeId, center: [item.center[0] - origin[0], item.center[1] - origin[1]], base: item.base, size: item.size, rotation: item.rotation })),
  };
}

/* ---------------- Schema ---------------- */

const finiteNumber = z.number().finite();
const vec2 = z.tuple([finiteNumber, finiteNumber]);
const vec3 = z.tuple([finiteNumber, finiteNumber, finiteNumber]);

export const configurationCandidateSchema = z.object({
  spec: z.literal("blockout.concept.configuration"),
  specVersion: z.literal(1),
  name: z.string().default("基础构型提案"),
  basedOnInputsDigest: z.string().min(1),
  basedOnTopologyDigest: z.string().min(1),
  basedOnDecompositionDigest: z.string().min(1),
  proposer: z.object({ name: z.string(), version: z.string(), note: z.string().default("") }).default({ name: "unknown", version: "1", note: "" }),
  modules: z.array(z.object({
    moduleId: z.string().min(1),
    areas: z.array(z.object({
      nodeId: z.string().min(1),
      size: vec3,
      role: z.enum(["floor", "solid"]).default("solid"),
      note: z.string().default(""),
    })).default([]),
    ports: z.array(z.object({
      linkId: z.string().min(1),
      nodeId: z.string().min(1),
      offset: vec2,
      rotation: finiteNumber,
      width: z.number().positive(),
      note: z.string().default(""),
    })).default([]),
    note: z.string().default(""),
  })).default([]),
  warnings: z.array(z.string()).default([]),
});
