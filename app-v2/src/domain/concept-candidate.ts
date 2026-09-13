import { z } from "zod";
import type { Vec2 } from "./types";
import type { LogicInputCalibration } from "./concept-inputs";
import type { LogicKind, LogicNodeRole, LogicTopology, LogicTraversal } from "./concept";

/**
 * 识别候选：把"逻辑拓扑图 + 范围图"读成结构化结构，供人工逐条确认后再套用。
 * 识别只产出候选，不产出结论 —— 套用是一次可撤销事务。
 */

export interface CandidateNode {
  tempId: string;
  name: string;
  role: LogicNodeRole;
  floor: number;
  /** 范围图上的像素坐标；没给就是"尚未定位" */
  scopeMapPoint: Vec2 | null;
  /** 相对标高（厘米，父级局部坐标） */
  elevation: { base: number; top: number } | null;
  note: string;
}

export interface CandidateLink {
  tempId: string;
  label: string;
  from: string;
  to: string;
  logic: LogicKind;
  traversal: LogicTraversal;
  /** 指向 CandidateKey.tempId；锁钥门必须给 */
  requiresKey: string | null;
  note: string;
}

export interface CandidateKey {
  tempId: string;
  name: string;
  foundAt: string;
  unlocks: string[];
  note: string;
}

export interface RecognitionCandidate {
  spec: "blockout.concept.candidate";
  specVersion: 1;
  name: string;
  /** 依据的输入指纹；与当前不一致就不允许套用 */
  basedOnInputsDigest: string;
  /** 用哪份范围图来定位；决定像素→厘米的换算 */
  scopeMapInputId: string | null;
  recognizer: { name: string; version: string; note: string };
  nodes: CandidateNode[];
  links: CandidateLink[];
  keys: CandidateKey[];
  /** 识别过程中的已知不确定项，直接展示给用户 */
  warnings: string[];
}

export interface CandidateIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
}

export function createEmptyCandidate(digest: string, scopeMapInputId: string | null): RecognitionCandidate {
  return {
    spec: "blockout.concept.candidate",
    specVersion: 1,
    name: "识别候选",
    basedOnInputsDigest: digest,
    scopeMapInputId,
    recognizer: { name: "manual", version: "1", note: "" },
    nodes: [],
    links: [],
    keys: [],
    warnings: [],
  };
}

/** 范围图像素 → 父级局部厘米。与 diagram-import 的 referencePoint 同一套换算，不另立解释。 */
export function toRelativePosition(point: Vec2, calibration: LogicInputCalibration | null): Vec2 | null {
  if (!calibration) return null;
  const radians = calibration.rotation * Math.PI / 180;
  const x = point[0] * calibration.cmPerPixel;
  const y = point[1] * calibration.cmPerPixel;
  return [
    calibration.origin[0] + x * Math.cos(radians) - y * Math.sin(radians),
    calibration.origin[1] + x * Math.sin(radians) + y * Math.cos(radians),
  ];
}

/** 套用前校验：候选必须与自己声称依赖的输入一致，引用必须自洽 */
export function validateCandidate(candidate: RecognitionCandidate, topology: LogicTopology): CandidateIssue[] {
  const issues: CandidateIssue[] = [];
  if (candidate.basedOnInputsDigest !== topology.inputs.digest) {
    issues.push({
      id: "candidate:stale", severity: "error",
      message: `候选基于旧输入（候选 digest ${candidate.basedOnInputsDigest}，当前 ${topology.inputs.digest}），请重新识别`,
    });
  }

  const nodeIds = new Set(candidate.nodes.map((node) => node.tempId));
  const linkIds = new Set(candidate.links.map((link) => link.tempId));
  const keyIds = new Set(candidate.keys.map((key) => key.tempId));
  if (nodeIds.size !== candidate.nodes.length) issues.push({ id: "candidate:dup-node", severity: "error", message: "候选节点身份重复" });
  if (linkIds.size !== candidate.links.length) issues.push({ id: "candidate:dup-link", severity: "error", message: "候选链路身份重复" });
  if (keyIds.size !== candidate.keys.length) issues.push({ id: "candidate:dup-key", severity: "error", message: "候选钥匙身份重复" });

  for (const link of candidate.links) {
    if (!nodeIds.has(link.from) || !nodeIds.has(link.to)) {
      issues.push({ id: `candidate:link-node:${link.tempId}`, severity: "error", message: `链路 ${link.label} 引用了不存在的候选节点` });
    }
    if (link.from === link.to) issues.push({ id: `candidate:self:${link.tempId}`, severity: "error", message: `链路 ${link.label} 两端是同一个节点` });
    if (link.logic === "locked-door") {
      if (!link.requiresKey) issues.push({ id: `candidate:key-missing:${link.tempId}`, severity: "error", message: `锁钥门 ${link.label} 没有指定钥匙` });
      else if (!keyIds.has(link.requiresKey)) issues.push({ id: `candidate:key-ref:${link.tempId}`, severity: "error", message: `锁钥门 ${link.label} 指向了不存在的钥匙` });
    }
  }
  for (const key of candidate.keys) {
    if (!nodeIds.has(key.foundAt)) issues.push({ id: `candidate:key-node:${key.tempId}`, severity: "error", message: `钥匙“${key.name}”的取得位置不在候选节点里` });
    for (const unlock of key.unlocks) if (!linkIds.has(unlock)) issues.push({ id: `candidate:key-link:${key.tempId}`, severity: "error", message: `钥匙“${key.name}”解锁了不存在的候选链路` });
  }

  const scopeMap = candidate.scopeMapInputId ? topology.inputs.items.find((item) => item.id === candidate.scopeMapInputId) : null;
  if (!scopeMap) {
    issues.push({ id: "candidate:no-scope-map", severity: "warning", message: "没有指定用于定位的范围图，所有节点都会是“尚未定位”" });
  } else if (!scopeMap.calibration) {
    issues.push({ id: "candidate:no-calibration", severity: "warning", message: `“${scopeMap.name}”还没有比例标定，相对位置无法换算成厘米` });
  }
  const unplaced = candidate.nodes.filter((node) => !node.scopeMapPoint).length;
  if (unplaced > 0) issues.push({ id: "candidate:unplaced", severity: "warning", message: `有 ${unplaced} 个候选节点没有给出范围图位置` });

  return issues;
}

export function summarizeCandidate(candidate: RecognitionCandidate): { nodes: number; links: number; keys: number; placed: number; located: number } {
  const placed = candidate.nodes.filter((node) => node.scopeMapPoint).length;
  return {
    nodes: candidate.nodes.length,
    links: candidate.links.length,
    keys: candidate.keys.length,
    placed,
    located: candidate.nodes.filter((node) => node.elevation).length,
  };
}

/**
 * 按人工排除项裁剪候选。
 * 排除一个节点会连带丢弃挂在它上面的链路，以及失去解锁目标的钥匙 —— 不允许留下悬空引用。
 */
export function pruneCandidate(candidate: RecognitionCandidate, excluded: string[]): RecognitionCandidate {
  const skip = new Set(excluded);
  if (skip.size === 0) return candidate;
  const nodes = candidate.nodes.filter((node) => !skip.has(node.tempId));
  const keptNodes = new Set(nodes.map((node) => node.tempId));
  const links = candidate.links.filter((link) => !skip.has(link.tempId) && keptNodes.has(link.from) && keptNodes.has(link.to));
  const keptLinks = new Set(links.map((link) => link.tempId));
  const keys = candidate.keys
    .filter((key) => !skip.has(key.tempId) && keptNodes.has(key.foundAt))
    .map((key) => ({ ...key, unlocks: key.unlocks.filter((id) => keptLinks.has(id)) }))
    .filter((key) => key.unlocks.length > 0);
  return { ...candidate, nodes, links, keys };
}

/* ---------------- Schema ---------------- */

const finiteNumber = z.number().finite();
const vec2 = z.tuple([finiteNumber, finiteNumber]);
const logicKinds = ["normal", "one-way-door", "locked-door", "shortcut", "drop", "stairs", "spiral-stairs", "elevator", "one-way-elevator", "road"] as const;

export const candidateNodeSchema = z.object({
  tempId: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["start", "hub", "combat", "reward", "boss", "transition", "secret"]).default("transition"),
  floor: z.number().int().default(0),
  scopeMapPoint: vec2.nullable().default(null),
  elevation: z.object({ base: finiteNumber, top: finiteNumber }).nullable().default(null),
  note: z.string().default(""),
});

export const candidateLinkSchema = z.object({
  tempId: z.string().min(1),
  label: z.string().default(""),
  from: z.string().min(1),
  to: z.string().min(1),
  logic: z.enum(logicKinds).default("normal"),
  traversal: z.enum(["both", "forward", "one-time"]).default("both"),
  requiresKey: z.string().min(1).nullable().default(null),
  note: z.string().default(""),
});

export const candidateKeySchema = z.object({
  tempId: z.string().min(1),
  name: z.string().min(1),
  foundAt: z.string().min(1),
  unlocks: z.array(z.string().min(1)).default([]),
  note: z.string().default(""),
});

export const recognitionCandidateSchema = z.object({
  spec: z.literal("blockout.concept.candidate"),
  specVersion: z.literal(1),
  name: z.string().default("识别候选"),
  basedOnInputsDigest: z.string().min(1),
  scopeMapInputId: z.string().min(1).nullable().default(null),
  recognizer: z.object({ name: z.string(), version: z.string(), note: z.string().default("") }).default({ name: "unknown", version: "1", note: "" }),
  nodes: z.array(candidateNodeSchema).default([]),
  links: z.array(candidateLinkSchema).default([]),
  keys: z.array(candidateKeySchema).default([]),
  warnings: z.array(z.string()).default([]),
});
