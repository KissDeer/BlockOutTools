import { z } from "zod";
import type { Vec2 } from "./types";

/**
 * 输入上下文包：拆解前必须看全的材料。
 * digest 是"这次拆解到底依据了哪些输入"的指纹；输入一变，旧提案立刻可判为过期。
 */

export type LogicInputKind = "logic-topology" | "scope-map" | "mood" | "rules" | "note";

export interface InputKindMeta {
  label: string;
  hint: string;
  /** 缺少时不允许开始拆解 */
  required: boolean;
  /** 是否承载图片 */
  image: boolean;
}

export const INPUT_KINDS: Record<LogicInputKind, InputKindMeta> = {
  "logic-topology": { label: "逻辑拓扑图", hint: "节点、单向门、锁钥门、连通链路", required: true, image: true },
  "scope-map": { label: "范围图", hint: "空间范围与分区，给相对位置提供参照系", required: true, image: true },
  mood: { label: "氛围图", hint: "基调与风格参考", required: false, image: true },
  rules: { label: "规则与规范", hint: "拆分规范、命名约定、硬性约束", required: false, image: false },
  note: { label: "补充说明", hint: "临时补充的要求，后续可继续追加", required: false, image: false },
};

export interface LogicInputCalibration {
  cmPerPixel: number;
  origin: Vec2;
  rotation: number;
  confirmed: boolean;
}

export interface LogicInputItem {
  id: string;
  kind: LogicInputKind;
  name: string;
  /** 原始文件名，仅用于追溯；不保存机器绝对路径 */
  ref: string;
  /** 图片输入的内嵌数据 */
  imageData: string;
  pixelSize: Vec2 | null;
  /** 文本输入的内容 */
  text: string;
  note: string;
  addedAt: string;
  /** 需要比例参照的输入（范围图、拓扑图）在此标定 */
  calibration: LogicInputCalibration | null;
}

export interface LogicInputs {
  revision: number;
  items: LogicInputItem[];
  digest: string;
  updatedAt: string;
}

/** 拆解结果登记：绑定它依据的输入指纹 */
export interface DecompositionProposal {
  id: string;
  basedOnInputsDigest: string;
  basedOnInputsRevision: number;
  createdAt: string;
  nodeCount: number;
  linkCount: number;
  keyCount: number;
  note: string;
}

export type ProposalState = "none" | "current" | "stale";

export function createEmptyInputs(): LogicInputs {
  return { revision: 0, items: [], digest: computeInputsDigest([]), updatedAt: new Date(0).toISOString() };
}

/* ---------------- 指纹 ---------------- */

/**
 * FNV-1a：同步、确定、跨浏览器与 Node 一致。
 * 这是"内容有没有变"的指纹，不是安全哈希，所以不需要异步的 SubtleCrypto。
 */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function itemSignature(item: LogicInputItem): string {
  const calibration = item.calibration
    ? `${item.calibration.cmPerPixel}:${item.calibration.origin.join(",")}:${item.calibration.rotation}:${item.calibration.confirmed}`
    : "";
  const content = item.imageData ? `${item.imageData.length}:${fnv1a(item.imageData)}` : item.text;
  return [item.id, item.kind, item.name, item.ref, item.note, calibration, content].join("\u0001");
}

/** 只对内容取指纹，不含 revision：内容没变就不该判为过期 */
export function computeInputsDigest(items: LogicInputItem[]): string {
  const signature = [...items].sort((a, b) => a.id.localeCompare(b.id)).map(itemSignature).join("\u0002");
  return fnv1a(signature);
}

/* ---------------- 完整性与状态 ---------------- */

export interface InputsWarning {
  /** 稳定身份：同名文件、同类问题会产生多条警告，不能用文案当 key */
  id: string;
  message: string;
}

export interface InputsCompleteness {
  ok: boolean;
  missing: LogicInputKind[];
  warnings: InputsWarning[];
}

/** 拆解前的完整性核对：缺项必须显式报告，不允许"凭印象拆" */
export function checkInputsCompleteness(inputs: LogicInputs): InputsCompleteness {
  const kinds = new Set(inputs.items.map((item) => item.kind));
  const missing = (Object.keys(INPUT_KINDS) as LogicInputKind[]).filter((kind) => INPUT_KINDS[kind].required && !kinds.has(kind));
  const warnings: InputsWarning[] = [];
  for (const item of inputs.items) {
    if (item.kind !== "scope-map" && item.kind !== "logic-topology") continue;
    if (!item.calibration) warnings.push({ id: `${item.id}:uncalibrated`, message: `“${item.name}”还没有比例标定，相对位置只能按 estimated 处理` });
    else if (!item.calibration.confirmed) warnings.push({ id: `${item.id}:unconfirmed`, message: `“${item.name}”的比例尚未确认` });
  }
  if (!kinds.has("rules")) warnings.push({ id: "rules:missing", message: "还没有提供拆分规范；规则后续补充会让已有拆解结果需要重新核对" });
  return { ok: missing.length === 0, missing, warnings };
}

export function proposalState(inputs: LogicInputs, proposal: DecompositionProposal | null): ProposalState {
  if (!proposal) return "none";
  return proposal.basedOnInputsDigest === inputs.digest ? "current" : "stale";
}

export function latestProposal(proposals: DecompositionProposal[]): DecompositionProposal | null {
  return proposals.length ? proposals[proposals.length - 1] : null;
}

/* ---------------- Schema ---------------- */

const finiteNumber = z.number().finite();
const vec2 = z.tuple([finiteNumber, finiteNumber]);

export const logicInputCalibrationSchema = z.object({
  cmPerPixel: z.number().positive(),
  origin: vec2,
  rotation: finiteNumber,
  confirmed: z.boolean(),
});

export const logicInputItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["logic-topology", "scope-map", "mood", "rules", "note"]),
  name: z.string().min(1),
  ref: z.string(),
  imageData: z.string().max(16_000_000),
  pixelSize: vec2.nullable(),
  text: z.string(),
  note: z.string(),
  addedAt: z.string(),
  calibration: logicInputCalibrationSchema.nullable(),
});

export const logicInputsSchema = z.object({
  revision: z.number().int().nonnegative(),
  items: z.array(logicInputItemSchema),
  digest: z.string(),
  updatedAt: z.string(),
}).default({ revision: 0, items: [], digest: "", updatedAt: new Date(0).toISOString() });

export const decompositionProposalSchema = z.object({
  id: z.string().min(1),
  basedOnInputsDigest: z.string().min(1),
  basedOnInputsRevision: z.number().int().nonnegative(),
  createdAt: z.string(),
  nodeCount: z.number().int().nonnegative(),
  linkCount: z.number().int().nonnegative(),
  keyCount: z.number().int().nonnegative(),
  note: z.string(),
});
