import type { LogicKey, LogicLink, LogicNode, LogicScope } from "./concept";
import { fingerprint } from "./fingerprint";
import { stableJson } from "./stable-json";
import type { BlockoutProject, DesignMaterial } from "./types";

/** 资料的存放位置：决定"去哪里改/删"，提示必须指对地方 */
export type MaterialOrigin = "project-material" | "module-material" | "scope-input" | "module-reference";

export interface ResolvedDesignMaterial extends DesignMaterial {
  source: string;
  calibration?: unknown;
  /** 内容指纹（有原图取图，否则取文字）：用于区分同名资料 */
  contentDigest: string;
  /** 同名资料的序号标签，如「同名 1/2」；不重名时为空串 */
  variantLabel: string;
  /** 它存在哪里 */
  origin: MaterialOrigin;
}

/** 告诉用户"去哪里处理"，不能指错位置 */
export function materialLocationLabel(origin: MaterialOrigin): string {
  if (origin === "scope-input") return "「历史资料管理」";
  if (origin === "module-reference") return "模块底图设置";
  return "模块参考栏的「资料管理」";
}

export interface ModuleContext {
  moduleId: string;
  moduleName: string;
  sourceId: string;
  scopeIds: string[];
  goal: string;
  constraints: string;
  purpose: string;
  goals: string;
  nodes: LogicNode[];
  internalLinks: LogicLink[];
  externalLinks: LogicLink[];
  keys: LogicKey[];
  materials: ResolvedDesignMaterial[];
  sources: string[];
  warnings: string[];
  contextDigest: string;
  ambiguous: boolean;
}

const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
const imageReadable = (data: string) => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(data);
interface ImageSnapshot { imageData: string; digest: string; readable: boolean }
const imageSnapshots = new WeakMap<{ imageData: string }, ImageSnapshot>();

function imageSnapshot(source: { imageData: string }): ImageSnapshot {
  const cached = imageSnapshots.get(source);
  if (cached?.imageData === source.imageData) return cached;
  const snapshot = { imageData: source.imageData, digest: fingerprint(source.imageData), readable: imageReadable(source.imageData) };
  // Key by the persisted source object, never by a newly resolved material or a large string.
  imageSnapshots.set(source, snapshot);
  return snapshot;
}

/** The UI and agent use this same resolver; legacy inputs stay in their owning scope. */
export function resolveModuleContext(project: BlockoutProject, moduleId: string): ModuleContext {
  const module = project.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error("模块不存在");
  const scopes: LogicScope[] = project.concept ? [project.concept, ...project.concept.scopes] : [];
  const bindings = scopes.flatMap((scope) => scope.modules.filter((group) => group.moduleDefinitionId === moduleId).map((group) => ({ scope, group })));
  const owners = bindings.length ? bindings.map(({ scope }) => scope) : scopes.filter((scope) => scope.nodes.some((node) => node.moduleId === moduleId));
  const uniqueOwners = [...new Map(owners.map((scope) => [scope.id, scope])).values()];
  const memberIds = new Set(bindings.flatMap(({ group }) => group.nodeIds));
  const nodes = uniqueOwners.flatMap((scope) => scope.nodes.filter((node) => bindings.length ? memberIds.has(node.id) : node.moduleId === moduleId));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const internalLinks = uniqueOwners.flatMap((scope) => scope.links.filter((link) => nodeIds.has(link.from) && nodeIds.has(link.to)));
  const externalLinks = uniqueOwners.flatMap((scope) => scope.links.filter((link) => nodeIds.has(link.from) !== nodeIds.has(link.to)));
  const relevantLinks = [...internalLinks, ...externalLinks];
  const keys = uniqueOwners.flatMap((scope) => scope.keys.filter((key) => nodeIds.has(key.foundAt) || relevantLinks.some((link) => link.requires === key.id)));
  const materialImages = new Map<ResolvedDesignMaterial, ImageSnapshot>();
  /** 统一入口：补上派生的内容指纹与同名标签，并记下原图快照 */
  const resolveMaterial = (
    source: { imageData: string },
    material: Omit<ResolvedDesignMaterial, "contentDigest" | "variantLabel">,
  ): ResolvedDesignMaterial => {
    const snapshot = imageSnapshot(source);
    const resolved: ResolvedDesignMaterial = {
      ...material,
      contentDigest: material.imageData ? snapshot.digest : fingerprint(`text:${material.text}`),
      variantLabel: "",
    };
    materialImages.set(resolved, snapshot);
    return resolved;
  };
  const materials: ResolvedDesignMaterial[] = (project.designContext?.materials ?? [])
    .filter((item) => !item.moduleIds.length || item.moduleIds.includes(moduleId))
    .map((item) => resolveMaterial(item, { ...item, source: item.moduleIds.length ? "模块资料" : "项目资料", origin: item.moduleIds.length ? "module-material" : "project-material" }));
  const inherited = [...new Map([...(project.concept ? [project.concept] : []), ...uniqueOwners].map((scope) => [scope.id, scope])).values()];
  for (const scope of inherited) {
    for (const item of scope.inputs.items) materials.push(resolveMaterial(item, {
      id: `legacy:${scope.id}:${item.id}`, name: item.name,
      kind: item.kind === "scope-map" || item.kind === "logic-topology" ? "structure" : item.kind,
      text: [item.text, item.note].filter(Boolean).join("\n"), imageData: item.imageData,
      moduleIds: scope.id === project.concept?.id ? [] : [moduleId],
      source: `原作用域：${scope.name}`, calibration: item.calibration, origin: "scope-input",
    }));
  }
  if (module.reference) materials.push(resolveMaterial(module.reference, {
    id: `reference:${module.reference.id}`, name: module.reference.name, kind: "structure",
    text: module.reference.legend, imageData: module.reference.imageData, moduleIds: [moduleId], source: "模块底图",
    calibration: { cmPerPixel: module.reference.cmPerPixel, origin: module.reference.origin, rotation: module.reference.rotation, confirmed: module.reference.confirmed },
    origin: "module-reference",
  }));
  const warnings: string[] = [];
  const ambiguous = bindings.length > 1 || uniqueOwners.length > 1;
  if (ambiguous) warnings.push("同一模块定义关联多个拓扑分组；请先明确当前模块的来源，再生成草案。");
  if (!nodes.length) warnings.push("当前模块没有关联拓扑区域，可以手工搭建；自动起稿只能给出通用占位。");
  for (const material of materials) {
    if (material.imageData && !materialImages.get(material)!.readable) warnings.push(`“${material.name}”原图不可读取，agent 不能据此看图。`);
    if (!material.imageData && (material.kind === "structure" || material.kind === "mood")) warnings.push(`“${material.name}”没有原图；本次仅包含已有文字。`);
  }

  /* 同名资料：不猜哪份是当前版本，但必须让用户和 agent 都知道存在歧义，并指对处理位置 */
  for (const [name, group] of duplicateMaterialGroups(materials)) {
    group.forEach((material, index) => { material.variantLabel = `同名 ${index + 1}/${group.length}`; });
    const locations = [...new Set(group.map((material) => materialLocationLabel(material.origin)))].join("或");
    const distinct = new Set(group.map((material) => material.contentDigest));
    if (distinct.size === 1) {
      warnings.push(`有 ${group.length} 份内容完全相同的资料“${name}”，保留任意一份即可；可在${locations}移除多余的。`);
    } else {
      warnings.push(`有 ${group.length} 份同名但内容不同的资料“${name}”（已编号 ${group.map((_, index) => index + 1).join("/")}）：无法判断哪份是当前版本，本次全部保留，请在${locations}人工确认后删除旧版。`);
    }
  }
  const context: ModuleContext = {
    moduleId, moduleName: module.name, sourceId: bindings[0]?.group.id ?? moduleId, scopeIds: uniqueOwners.map((scope) => scope.id),
    goal: project.designContext?.goal ?? "", constraints: project.designContext?.constraints ?? "",
    purpose: module.designBrief?.purpose ?? bindings.map(({ group }) => group.note).filter(Boolean).join("\n"), goals: module.designBrief?.goals ?? "",
    nodes, internalLinks, externalLinks, keys, materials, sources: [...new Set(materials.map((item) => item.source))], warnings, ambiguous,
    contextDigest: "",
  };
  const neighborIds = new Set(externalLinks.flatMap((link) => [link.from, link.to]).filter((id) => !nodeIds.has(id)));
  const nodeContent = (node: LogicNode) => ({ id: node.id, name: node.name, role: node.role, floor: node.floor, elevation: node.elevation, note: node.note });
  const linkContent = ({ sourceHandle: _source, targetHandle: _target, ...link }: LogicLink) => link;
  context.contextDigest = fingerprint(stableJson({
    moduleId, name: module.name, goal: context.goal, constraints: context.constraints, purpose: context.purpose, goals: context.goals,
    bindings: bindings.map(({ scope, group }) => ({ scopeId: scope.id, groupId: group.id, nodeIds: [...group.nodeIds].sort(), note: group.note, childScopeId: group.childScopeId })),
    nodes: byId(nodes).map(nodeContent), neighbors: byId(uniqueOwners.flatMap((scope) => scope.nodes.filter((node) => neighborIds.has(node.id)))).map(nodeContent),
    links: byId(relevantLinks).map(linkContent), keys: byId(keys),
    materials: byId(materials).map((item) => ({
      // 只取内容字段：contentDigest / variantLabel 是派生的，不进指纹
      id: item.id, name: item.name, kind: item.kind, text: item.text, source: item.source,
      calibration: item.calibration, imageData: materialImages.get(item)!.digest,
    })),
    profile: project.blockoutProfile,
  }));
  return context;
}

export function geometryDigest(project: BlockoutProject, moduleId: string): string {
  const module = project.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error("模块不存在");
  return fingerprint(stableJson(byId(module.blocks)));
}

/**
 * 同名资料分组：保留原始顺序，只返回出现两次以上的组。
 * 界面与上下文都用它来标注「同名 1/2」，不猜哪份是当前版本。
 */
export function duplicateMaterialGroups<T extends { name: string }>(materials: T[]): Map<string, T[]> {
  const byName = new Map<string, T[]>();
  for (const material of materials) {
    const group = byName.get(material.name) ?? [];
    group.push(material);
    byName.set(material.name, group);
  }
  for (const [name, group] of byName) if (group.length < 2) byName.delete(name);
  return byName;
}
