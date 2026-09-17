import { z } from "zod";
import type { Vec2 } from "./types";
import { fingerprint } from "./fingerprint";

/**
 * 参考资料：开工前要看的图和文字。
 *
 * 工具**不读**这些材料，也不从它们推出任何东西 —— 区域、链路与几何都由人照着材料自己摆。
 * digest 是"这批材料此刻是什么内容"的指纹；材料一变，登记过的基准立刻可判为过期。
 * （识图那条路线已于 2026-09-17 删除，这里的 key 名沿用当时的叫法，改它要迁移已存在的草稿。）
 */

export type LogicInputKind = "logic-topology" | "scope-map" | "mood" | "rules" | "note";

export interface InputKindMeta {
  label: string;
  hint: string;
  /** 缺少时会显式报缺，并且不允许登记基准 */
  required: boolean;
  /** 是否承载图片 */
  image: boolean;
}

export const INPUT_KINDS: Record<LogicInputKind, InputKindMeta> = {
  "logic-topology": { label: "连通关系参考图", hint: "手绘或软件画的连通草图：谁和谁相连、哪里有单向门与锁钥门；照着它摆区域和链路", required: true, image: true },
  "scope-map": { label: "空间范围参考图", hint: "平面图或分区草图：空间怎么分区、各个区域大致在哪儿；照着它定范围与相对位置", required: true, image: true },
  mood: { label: "氛围图", hint: "基调与风格参考，拼几何时对着看", required: false, image: true },
  rules: { label: "规则与规范", hint: "命名约定、尺度底线、硬性约束", required: false, image: false },
  note: { label: "补充说明", hint: "临时补充的要求，后续可继续追加", required: false, image: false },
};

/**
 * 图上像素与实际厘米的换算比例。
 *
 * 工具**不消费**它做任何换算（识图已删）：这里只是把比例记在旁边，人照着图量尺寸时有个依据。
 * origin / rotation 是旧识图链路留下的参照字段，现在只会是 [0,0] / 0；
 * 保留是为了不改动已存在的草稿格式，别拿它们当"还能自动换算"的信号。
 */
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
  /** 图上比例由人自己标定；只有承载图片的输入会有 */
  calibration: LogicInputCalibration | null;
}

export interface LogicInputs {
  revision: number;
  items: LogicInputItem[];
  digest: string;
  updatedAt: string;
}

/**
 * 基准登记：把"此刻这批参考材料的指纹"和"此刻的拓扑规模"绑成一条记录。
 * 之后材料一改，这条记录立刻可判为过期，而不是悄悄沿用旧结论。
 */
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

function itemSignature(item: LogicInputItem): string {
  const calibration = item.calibration
    ? `${item.calibration.cmPerPixel}:${item.calibration.origin.join(",")}:${item.calibration.rotation}:${item.calibration.confirmed}`
    : "";
  const content = item.imageData ? `${item.imageData.length}:${fingerprint(item.imageData)}` : item.text;
  return [item.id, item.kind, item.name, item.ref, item.note, calibration, content].join("\u0001");
}

/** 只对内容取指纹，不含 revision：内容没变就不该判为过期 */
export function computeInputsDigest(items: LogicInputItem[]): string {
  const signature = [...items].sort((a, b) => a.id.localeCompare(b.id)).map(itemSignature).join("\u0002");
  return fingerprint(signature);
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

/** 材料清单核对：缺项必须显式报告，不允许"凭印象开工" */
export function checkInputsCompleteness(inputs: LogicInputs): InputsCompleteness {
  const kinds = new Set(inputs.items.map((item) => item.kind));
  const missing = (Object.keys(INPUT_KINDS) as LogicInputKind[]).filter((kind) => INPUT_KINDS[kind].required && !kinds.has(kind));
  const warnings: InputsWarning[] = [];
  for (const item of inputs.items) {
    if (item.kind !== "scope-map" && item.kind !== "logic-topology") continue;
    if (!item.calibration) warnings.push({ id: `${item.id}:uncalibrated`, message: `“${item.name}”还没有比例标定，照着它量出来的尺寸没法换算成厘米` });
    else if (!item.calibration.confirmed) warnings.push({ id: `${item.id}:unconfirmed`, message: `“${item.name}”的比例尚未确认` });
  }
  if (!kinds.has("rules")) warnings.push({ id: "rules:missing", message: "还没有提供规则与规范；后续补充会让已登记的基准需要重新核对" });
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
