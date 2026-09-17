import { z } from "zod";
import { logicTopologySchema, scopesOf } from "./concept";
import { blockSchema, finiteNumber, positiveNumber, vec2, vec3 } from "./block-schema";

export { blockSchema, vec2, vec3 };

/**
 * 项目文件的 schema。
 *
 * 模块层删除后，项目里只剩三样东西：身份与规范、一张逻辑拓扑（几何挂在节点上）、设计资料。
 * 这里**没有** `modules` / `instances` / `connections`，`concept` 也不是可选的 —— 旧项目文件
 * 不会被静默读成"几何消失了"的半截项目，而是直接被 schema 挡下。
 * 数据层宁可拒绝，也不要假装读懂了。
 *
 * `concept` 曾经写成 `.optional()`，于是上面那句话是假的：旧文件带 `<项目名>` 之类的字段
 * 照样通过校验，读出来是个**一个区域都没有**的合法项目 —— 导出 0 个 Actor 并成功退出，
 * 把已提交的 104 个 Actor 覆盖成空数组（实测发生过一次，靠 git 还原）。
 * 一个能被静默读成"什么都没有"的模型，比拒绝读取危险得多。
 */

/**
 * 旧格式（模块层删除之前的 LayoutTools 项目）。
 *
 * 判据是**旧格式独有**的顶层字段，一个不落：
 * - `structureGraph` / `shapes` —— 更早的 LayoutTools 画布格式（`data/levels/` 里那批）；
 * - `modules` / `instances` / `connections` —— 模块层模型本身（`layouts/` 里那批）。
 *
 * 三类都不会出现在新项目里，所以不会误伤。**判据要按实际文件写，不能按想象写**：
 * 最初只写了 `structureGraph` / `shapes`，结果 `souls-starter-floor-wall.blockout.json`
 * （只有 `modules`/`instances`/`connections`）两道门都漏，落到 schema 那里报了一串 Zod 路径 ——
 * 调用方看不出这是"项目太老"而不是"文件坏了"。
 *
 * 抛在 schema 之前，就是为了给出人话原因。这些文件没有被丢：
 * 它们是 Phase 3 的迁移输入（见 `docs/rebuild/REBUILD_PLAN.md`）。
 */
export function assertNotLegacyProject(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const record = raw as Record<string, unknown>;
  const isArray = (key: string) => Array.isArray(record[key]);
  const legacy: string[] = [];
  if (isArray("shapes")) legacy.push("shapes");
  if (isArray("modules")) legacy.push("modules");
  if (isArray("instances")) legacy.push("instances");
  if (isArray("connections")) legacy.push("connections");
  if (record.structureGraph !== undefined) legacy.push("structureGraph");
  if (!legacy.length) return;
  throw new Error(
    `这是模块层删除之前的旧项目文件（含 ${legacy.join(" / ")}），当前版本读不了，也不会假装读成空项目。` +
    "旧文件保留作迁移输入，见 docs/rebuild/REBUILD_PLAN.md 的 Phase 3。",
  );
}

/**
 * 一份节点底图：像素坐标 + 标定比例，用来把图上量到的点换算成厘米。
 *
 * 目前没有写入入口（FR-10 还挂起着），所以它**不在 `projectSchema` 里** —— 留在这是为了
 * 将来做节点底图时校验口径只有一处，不要到时候再各写一套。
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
  /* 必填：见本文件顶部注释 —— 可选会让旧项目通过校验并静默变成空的合法项目。 */
  concept: logicTopologySchema,
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
  const blocks = scopesOf(project.concept).flatMap((scope) => scope.nodes.flatMap((node) => node.blocks ?? []));
  unique(blocks.map((block) => block.id), "积木");
});
