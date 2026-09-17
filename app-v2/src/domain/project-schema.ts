import { z } from "zod";
import { logicTopologySchema, scopesOf } from "./concept";
import { blockSchema, finiteNumber, positiveNumber, vec2, vec3 } from "./block-schema";

export { blockSchema, vec2, vec3 };

/**
 * 项目文件的 schema。
 *
 * 模块层删除后，项目里只剩三样东西：身份与规范、一张逻辑拓扑（几何挂在节点上）、设计资料。
 * 这里**没有** `modules` / `instances` / `connections` —— 旧项目文件不会再被静默读成
 * "几何消失了"的半截项目，而是直接被 schema 挡下。数据层宁可拒绝，也不要假装读懂了。
 */

/**
 * 一份节点底图：像素坐标 + 标定比例，用来把图上量到的点换算成厘米。
 *
 * 目前没有写入入口（FR-10 还挂起着），但 `DiagramReference` 类型已经在 `types.ts` 里，
 * 校验口径放在这里，免得将来两处各写一套。
 */
export const referenceSchema = z.object({
  id: z.string().min(1), name: z.string().min(1),
  imageData: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(16_000_000),
  pixelSize: z.tuple([positiveNumber, positiveNumber]), origin: vec2,
  cmPerPixel: positiveNumber, rotation: finiteNumber, opacity: finiteNumber.min(0).max(1),
  visible: z.boolean(), confirmed: z.boolean(), legend: z.string(),
});

/** 资料挂在**逻辑节点**上：`nodeIds` 为空 = 整个项目可见 */
export const designMaterialSchema = z.object({
  id: z.string().min(1), name: z.string().min(1),
  kind: z.enum(["structure", "mood", "rules", "note"]),
  text: z.string(),
  imageData: z.string().max(16_000_000).refine((value) => !value || /^data:image\/(png|jpeg|webp);base64,/.test(value), "图片格式无效"),
  nodeIds: z.array(z.string().min(1)),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(2),
  projectId: z.string().min(1),
  name: z.string().min(1),
  blockoutProfile: z.object({
    enabled: z.boolean(),
    enforceUeImport: z.boolean(),
    capsuleRadius: positiveNumber,
    capsuleHalfHeight: positiveNumber,
    maxStepHeight: positiveNumber,
    minDoorWidth: positiveNumber,
    minDoorHeight: positiveNumber,
    maxStairRise: positiveNumber,
    minStairTread: positiveNumber,
  }),
  updatedAt: z.string().datetime(),
  concept: logicTopologySchema.optional(),
  designContext: z.object({ goal: z.string(), constraints: z.string(), materials: z.array(designMaterialSchema) }).optional(),
}).superRefine((project, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) fail(`${label}身份重复`); };
  unique(project.designContext?.materials.map((item) => item.id) ?? [], "设计资料");
  /*
   * 积木身份在**整份项目**里唯一，不只是在它那个节点里唯一。
   * 校验结果、同步键、撤销都靠积木 id 指认"说的是哪一块"，
   * 两个区域里各有一个 `block_1` 会让这些说法同时指向两块砖。
   * 遍历必须走 `scopesOf`：池子里每个作用域都带一份 `scopes` 副本，直接展开会漏查或重复查。
   */
  const blocks = project.concept
    ? scopesOf(project.concept).flatMap((scope) => scope.nodes.flatMap((node) => node.blocks ?? []))
    : [];
  unique(blocks.map((block) => block.id), "积木");
});
