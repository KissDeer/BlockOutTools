import { createBlock } from "./catalog";
import { ROLE_TEMPLATES } from "./concept-configuration";
import { fingerprint } from "./fingerprint";
import { createId } from "./ids";
import { projectSchema } from "./project-schema";
import { stableJson } from "./stable-json";
import type { Block, BlockoutProject } from "./types";
import { geometryDigest, resolveModuleContext } from "./workflow-context";
import { moduleDraftSchema, type ModuleDraft, type ModuleDraftRequest } from "./module-draft-contract";
export { moduleDraftSchema, moduleDraftRequestSchema, type ModuleDraft, type ModuleDraftRequest } from "./module-draft-contract";

export function createModuleDraftRequest(project: BlockoutProject, moduleId: string, intent = ""): ModuleDraftRequest {
  const context = resolveModuleContext(project, moduleId);
  if (context.ambiguous) throw new Error(context.warnings[0]);
  return structuredClone({
    version: 1, requestId: createId("module_request"), projectId: project.projectId, moduleId,
    contextDigest: context.contextDigest, geometryDigest: geometryDigest(project, moduleId), intent, context,
    existingBlocks: project.modules.find((module) => module.id === moduleId)!.blocks, createdAt: new Date().toISOString(),
    instructions: [
      "返回 ModuleDraft version=1，source=agent，原样保留请求身份和两个 digest；只采用当前模块的 blocks，不可修改拓扑、模块归属或连接语义。",
      "所有 transform.position 是模块局部厘米坐标，rotation 是度；graphPosition 只是拓扑排版，不能当空间位置。真实比例未知须在 assumptions 说明。",
      `区域和链路关联使用 provenance.sourceId=${context.sourceId}、featureId=原节点或链路 ID；每个成员区域至少一个非 port 体块，每条跨模块链路恰好一个 port。内部链路不能生成对外 port。`,
      "每种积木类型对同一来源区域或链路只能有一个主要体块；辅助墙体等可以不带 provenance。不得伪造区域/链路身份；保留对应积木 ID 有助于追溯。",
      "图片已包含在 context.materials[].imageData；必须实际查看后才能声称参考。缺图、朝向、尺度和未实现的玩法条件须在 assumptions 说明。",
      "返回真实局部草案，包括体块、内部通路建议及高差处理。逻辑连通不代表已完成空间对接或玩法验证。",
    ],
  });
}

/** Explicit deterministic fallback. It neither reads image content nor calls an AI. */
export function createQuickModuleDraft(project: BlockoutProject, moduleId: string): ModuleDraft {
  const request = createModuleDraftRequest(project, moduleId);
  const { context } = request;
  const blocks: Block[] = [];
  let cursor = 0;
  const bases = context.nodes.flatMap((node) => node.elevation ? [node.elevation.base] : []);
  const originZ = bases.length ? Math.min(...bases) : 0;
  for (const node of context.nodes) {
    const template = ROLE_TEMPLATES[node.role];
    const base = node.elevation ? node.elevation.base - originZ : 0;
    const block = createBlock("box", [cursor + template.width / 2, template.depth / 2, base]);
    if (block.type !== "box") throw new Error("体块模板无效");
    block.name = node.name;
    block.parameters.BoxSize = [template.width, template.depth, node.elevation && node.elevation.top > node.elevation.base ? node.elevation.top - node.elevation.base : template.height];
    block.provenance = { sourceId: context.sourceId, featureId: node.id, status: "estimated", note: "按角色默认尺寸起稿，需手工核对" };
    blocks.push(block);
    const links = context.externalLinks.filter((link) => link.from === node.id || link.to === node.id);
    for (const [index, link] of links.entries()) {
      const port = createBlock("port", [cursor + template.width, template.depth * (index + 1) / (links.length + 1), base]);
      port.name = `接口 ${link.label}`;
      port.provenance = { sourceId: context.sourceId, featureId: link.id, status: "estimated", note: "外部方位待确认，暂排在区域右侧" };
      blocks.push(port);
    }
    cursor += template.width + 600;
  }
  if (!blocks.length) {
    const block = createBlock("box");
    block.name = "手工模块占位";
    blocks.push(block);
  }
  const draft: ModuleDraft = {
    version: 1, requestId: request.requestId, projectId: project.projectId, moduleId,
    contextDigest: request.contextDigest, geometryDigest: request.geometryDigest, source: "template", blocks,
    assumptions: [
      "这是确定性角色模板，未调用 AI，也未解读结构图或氛围图。所有单位为厘米。",
      "区域按成员顺序沿局部 X 轴排列并预留 600cm 间隔，不使用拓扑排版或整体位置。默认尺寸不是设计结论。",
      "明确标高保留相对高差；只有楼层标签时不推算高度。外部端口暂朝右，实际方位与对接需确认。",
      ...context.internalLinks.map((link) => `内部通路 ${link.label}（${link.logic} / ${link.traversal}${link.requires ? ` / 钥匙 ${link.requires}` : ""}）仍需搭建与玩法验证。`),
      ...context.warnings,
    ],
  };
  return { ...draft, blocks: reconcileBlockIds(project, draft) };
}

function identity(block: Block): string | null {
  return block.provenance ? JSON.stringify([block.type, block.provenance.sourceId, block.provenance.featureId]) : null;
}

function reconcileBlockIds(project: BlockoutProject, draft: ModuleDraft): Block[] {
  const current = project.modules.find((module) => module.id === draft.moduleId)?.blocks ?? [];
  const claimed = new Set<string>();
  return draft.blocks.map((block) => {
    const key = identity(block);
    const match = current.find((old) => !claimed.has(old.id) && old.id === block.id && old.type === block.type && identity(old) === key)
      ?? (key ? current.find((old) => !claimed.has(old.id) && identity(old) === key) : undefined);
    const id = match?.id ?? block.id;
    claimed.add(id);
    return { ...block, id };
  });
}

function withDraft(project: BlockoutProject, draft: ModuleDraft): BlockoutProject {
  const blocks = reconcileBlockIds(project, draft);
  const ports = new Set(blocks.filter((block) => block.type === "port").map((block) => block.id));
  const instances = new Set(project.instances.filter((instance) => instance.definitionId === draft.moduleId).map((instance) => instance.id));
  return {
    ...project, updatedAt: new Date().toISOString(),
    modules: project.modules.map((module) => module.id === draft.moduleId ? { ...module, blocks, revision: module.revision + 1 } : module),
    connections: project.connections.filter((connection) => (!instances.has(connection.sourceInstanceId) || ports.has(connection.sourcePortId))
      && (!instances.has(connection.targetInstanceId) || ports.has(connection.targetPortId))),
  };
}

export function validateModuleDraft(project: BlockoutProject, input: unknown): string[] {
  const parsed = moduleDraftSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.slice(0, 12).map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const draft = parsed.data;
  const errors: string[] = [];
  if (draft.projectId !== project.projectId) errors.push("草案属于其他项目");
  if (!project.modules.some((module) => module.id === draft.moduleId)) return [...errors, "草案目标模块不存在"];
  const context = resolveModuleContext(project, draft.moduleId);
  if (context.ambiguous) errors.push("模块来源不明确，不能采用草案");
  if (draft.contextDigest !== context.contextDigest) errors.push("相关拓扑或资料已修改，请重新生成草案");
  if (draft.geometryDigest !== geometryDigest(project, draft.moduleId)) errors.push("模块几何已修改，旧草案不能覆盖新的手工编辑");
  const nodeIds = new Set(context.nodes.map((node) => node.id));
  const linkIds = new Set([...context.internalLinks, ...context.externalLinks].map((link) => link.id));
  const externalIds = new Set(context.externalLinks.map((link) => link.id));
  const ids = draft.blocks.map((block) => block.id);
  if (new Set(ids).size !== ids.length) errors.push("草案积木 ID 重复");
  const otherIds = new Set(project.modules.filter((module) => module.id !== draft.moduleId).flatMap((module) => module.blocks.map((block) => block.id)));
  const currentById = new Map(project.modules.find((module) => module.id === draft.moduleId)!.blocks.map((block) => [block.id, block]));
  const semanticIds = new Set<string>();
  for (const block of draft.blocks) {
    if (otherIds.has(block.id)) errors.push(`积木 ${block.name} 使用了其他模块的 ID`);
    const current = currentById.get(block.id);
    if (current && (current.type !== block.type || identity(current) !== identity(block))) errors.push(`积木 ${block.name} 不能复用其他语义来源的已有 ID`);
    const source = block.provenance;
    if (!source) continue;
    const semanticId = identity(block)!;
    if (semanticIds.has(semanticId)) errors.push(`积木 ${block.name} 的语义来源重复`);
    semanticIds.add(semanticId);
    if (source.sourceId !== context.sourceId || (!nodeIds.has(source.featureId) && !linkIds.has(source.featureId))) errors.push(`积木 ${block.name} 引用了未知来源`);
    if (block.type === "port" && !externalIds.has(source.featureId)) errors.push(`端口 ${block.name} 必须引用跨模块链路`);
  }
  for (const node of context.nodes) if (!draft.blocks.some((block) => block.type !== "port" && block.provenance?.featureId === node.id && block.provenance.sourceId === context.sourceId)) errors.push(`草案遗漏区域：${node.name}`);
  for (const link of context.externalLinks) {
    const count = draft.blocks.filter((block) => block.type === "port" && block.provenance?.featureId === link.id && block.provenance.sourceId === context.sourceId).length;
    if (count !== 1) errors.push(`对外链路 ${link.label} 应对应一个端口，当前 ${count} 个`);
  }
  if (!errors.length) {
    const projectResult = projectSchema.safeParse(withDraft(project, draft));
    if (!projectResult.success) errors.push(...projectResult.error.issues.slice(0, 8).map((issue) => issue.message));
  }
  return errors;
}

export function applyModuleDraft(project: BlockoutProject, draft: ModuleDraft): BlockoutProject {
  const errors = validateModuleDraft(project, draft);
  if (errors.length) throw new Error(errors.join("；"));
  return projectSchema.parse(withDraft(project, moduleDraftSchema.parse(draft)));
}

export function moduleDraftDiff(project: BlockoutProject, draft: ModuleDraft) {
  const existing = project.modules.find((module) => module.id === draft.moduleId)?.blocks ?? [];
  const next = reconcileBlockIds(project, draft);
  const before = new Map(existing.map((block) => [block.id, block]));
  const after = new Map(next.map((block) => [block.id, block]));
  return {
    existingBlocks: existing.length,
    added: next.filter((block) => !before.has(block.id)).length,
    removed: existing.filter((block) => !after.has(block.id)).length,
    changed: next.filter((block) => before.has(block.id) && stableJson(before.get(block.id)) !== stableJson(block)).length,
    removedConnections: project.connections.length - withDraft(project, draft).connections.length,
  };
}

export function moduleShapeDigest(project: BlockoutProject, moduleId: string): string {
  return fingerprint(`${resolveModuleContext(project, moduleId).contextDigest}:${geometryDigest(project, moduleId)}`);
}

export function moduleShapeStatus(project: BlockoutProject, moduleId: string): "empty" | "unconfirmed" | "confirmed" | "stale" {
  const module = project.modules.find((item) => item.id === moduleId);
  if (!module?.blocks.length) return "empty";
  if (!module.shapeConfirmation) return "unconfirmed";
  return module.shapeConfirmation.digest === moduleShapeDigest(project, moduleId) ? "confirmed" : "stale";
}

export function confirmModuleShape(project: BlockoutProject, moduleId: string): BlockoutProject {
  if (!project.modules.find((module) => module.id === moduleId)?.blocks.length) throw new Error("空模块不能确认形态");
  const shapeConfirmation = { digest: moduleShapeDigest(project, moduleId), confirmedAt: new Date().toISOString() };
  return { ...project, updatedAt: new Date().toISOString(), modules: project.modules.map((module) => module.id === moduleId ? { ...module, shapeConfirmation } : module) };
}
