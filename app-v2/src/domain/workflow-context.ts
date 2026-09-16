import type { LogicKey, LogicLink, LogicNode, LogicScope } from "./concept";
import { fingerprint } from "./fingerprint";
import { stableJson } from "./stable-json";
import type { BlockoutProject, DesignMaterial } from "./types";

export interface ResolvedDesignMaterial extends DesignMaterial {
  source: string;
  calibration?: unknown;
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
  const resolveMaterialImage = (source: { imageData: string }, material: ResolvedDesignMaterial) => {
    materialImages.set(material, imageSnapshot(source));
    return material;
  };
  const materials: ResolvedDesignMaterial[] = (project.designContext?.materials ?? [])
    .filter((item) => !item.moduleIds.length || item.moduleIds.includes(moduleId))
    .map((item) => resolveMaterialImage(item, { ...item, source: item.moduleIds.length ? "模块资料" : "项目资料" }));
  const inherited = [...new Map([...(project.concept ? [project.concept] : []), ...uniqueOwners].map((scope) => [scope.id, scope])).values()];
  for (const scope of inherited) {
    for (const item of scope.inputs.items) materials.push(resolveMaterialImage(item, {
      id: `legacy:${scope.id}:${item.id}`, name: item.name,
      kind: item.kind === "scope-map" || item.kind === "logic-topology" ? "structure" : item.kind,
      text: [item.text, item.note].filter(Boolean).join("\n"), imageData: item.imageData,
      moduleIds: scope.id === project.concept?.id ? [] : [moduleId],
      source: `原作用域：${scope.name}`, calibration: item.calibration,
    }));
  }
  if (module.reference) materials.push(resolveMaterialImage(module.reference, {
    id: `reference:${module.reference.id}`, name: module.reference.name, kind: "structure",
    text: module.reference.legend, imageData: module.reference.imageData, moduleIds: [moduleId], source: "模块底图",
    calibration: { cmPerPixel: module.reference.cmPerPixel, origin: module.reference.origin, rotation: module.reference.rotation, confirmed: module.reference.confirmed },
  }));
  const warnings: string[] = [];
  const ambiguous = bindings.length > 1 || uniqueOwners.length > 1;
  if (ambiguous) warnings.push("同一模块定义关联多个拓扑分组；请先明确当前模块的来源，再生成草案。");
  if (!nodes.length) warnings.push("当前模块没有关联拓扑区域，可以手工搭建；自动起稿只能给出通用占位。");
  for (const material of materials) {
    if (material.imageData && !materialImages.get(material)!.readable) warnings.push(`“${material.name}”原图不可读取，agent 不能据此看图。`);
    if (!material.imageData && (material.kind === "structure" || material.kind === "mood")) warnings.push(`“${material.name}”没有原图；本次仅包含已有文字。`);
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
    materials: byId(materials).map((item) => ({ ...item, moduleIds: undefined, imageData: materialImages.get(item)!.digest })),
    profile: project.blockoutProfile,
  }));
  return context;
}

export function geometryDigest(project: BlockoutProject, moduleId: string): string {
  const module = project.modules.find((item) => item.id === moduleId);
  if (!module) throw new Error("模块不存在");
  return fingerprint(stableJson(byId(module.blocks)));
}
