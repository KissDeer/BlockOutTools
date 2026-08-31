import { structureGraph } from "./structure-module-model.js";

export const MODULE_PACKAGE_KIND = "layouttools-structure-module";
export const MODULE_PACKAGE_SCHEMA_VERSION = 1;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableString(value) {
  if (Array.isArray(value)) return `[${value.map(stableString).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableString(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function moduleContentRevision(content) {
  const text = stableString(content);
  let left = 2166136261;
  let right = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    left = Math.imul(left ^ code, 16777619);
    right = Math.imul(right ^ code, 2246822519);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

function cleanModule(module) {
  const cleaned = clone(module);
  delete cleaned.versionControl;
  return cleaned;
}

export function extractModuleContent(level, moduleId) {
  const graph = structureGraph(level);
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  if (!module) throw new Error(`未找到模块：${moduleId}`);
  const layer = (level.layers ?? []).find((candidate) => candidate.id === module.sourceLayerId);
  if (!layer) throw new Error(`模块 ${module.name} 缺少内部图层`);
  return {
    module: cleanModule(module),
    layer: clone(layer),
    shapes: clone((level.shapes ?? []).filter((shape) => shape.layerId === module.sourceLayerId)),
    entities: clone((level.entities ?? []).filter((entity) => entity.layerId === module.sourceLayerId)),
  };
}

export function createModulePackage(level, moduleId) {
  const graph = structureGraph(level);
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  const content = extractModuleContent(level, moduleId);
  const storedBase = module?.versionControl?.baseContent;
  const base = storedBase ? clone(storedBase) : clone(content);
  return {
    kind: MODULE_PACKAGE_KIND,
    schemaVersion: MODULE_PACKAGE_SCHEMA_VERSION,
    moduleId,
    moduleName: content.module.name,
    baseRevision: moduleContentRevision(base),
    revision: moduleContentRevision(content),
    exportedAt: new Date().toISOString(),
    base,
    content,
  };
}

export function validateModulePackage(value) {
  if (!value || value.kind !== MODULE_PACKAGE_KIND || value.schemaVersion !== MODULE_PACKAGE_SCHEMA_VERSION) {
    throw new TypeError("不是受支持的 LayoutTools 模块包");
  }
  if (!value.content?.module?.id || !value.content?.layer?.id || !Array.isArray(value.content.shapes) || !Array.isArray(value.content.entities)) {
    throw new TypeError("模块包缺少模块、图层或积木数据");
  }
  if (value.moduleId !== value.content.module.id) throw new TypeError("模块包 ID 不一致");
  return value;
}

function equal(left, right) {
  return stableString(left) === stableString(right);
}

function mergeArrayById(base, current, incoming, path, conflicts) {
  const ids = new Set([...base, ...current, ...incoming].map((item) => item?.id).filter(Boolean));
  if ([base, current, incoming].some((items) => new Set(items.map((item) => item.id)).size !== items.length)) {
    conflicts.push({ path, base: clone(base), current: clone(current), incoming: clone(incoming) });
    return clone(current);
  }
  const byId = (items) => new Map(items.map((item) => [item.id, item]));
  const baseMap = byId(base);
  const currentMap = byId(current);
  const incomingMap = byId(incoming);
  const merged = [];
  for (const id of ids) {
    const value = mergeValue(baseMap.get(id), currentMap.get(id), incomingMap.get(id), `${path}[${id}]`, conflicts);
    if (value !== undefined) merged.push(value);
  }
  return merged;
}

function mergeValue(base, current, incoming, path, conflicts) {
  if (equal(current, incoming)) return clone(current);
  if (equal(current, base)) return clone(incoming);
  if (equal(incoming, base)) return clone(current);
  if (base && current && incoming && !Array.isArray(base) && !Array.isArray(current) && !Array.isArray(incoming)
    && typeof base === "object" && typeof current === "object" && typeof incoming === "object") {
    const result = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(current), ...Object.keys(incoming)])) {
      const value = mergeValue(base[key], current[key], incoming[key], path ? `${path}.${key}` : key, conflicts);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (Array.isArray(base) && Array.isArray(current) && Array.isArray(incoming)) {
    const mergeable = [...base, ...current, ...incoming].every((item) => item && typeof item === "object" && !Array.isArray(item) && item.id);
    if (mergeable) return mergeArrayById(base, current, incoming, path, conflicts);
  }
  conflicts.push({ path, base: clone(base), current: clone(current), incoming: clone(incoming) });
  return clone(current);
}

export function mergeModulePackage(level, packageValue, options = {}) {
  const modulePackage = validateModulePackage(packageValue);
  const graph = clone(structureGraph(level));
  const existing = graph.modules.find((module) => module.id === modulePackage.moduleId);
  if (!existing) {
    if ((level.layers ?? []).some((layer) => layer.id === modulePackage.content.layer.id)) {
      throw new Error(`图层 ID 冲突：${modulePackage.content.layer.id}`);
    }
    const module = {
      ...clone(modulePackage.content.module),
      versionControl: { baseRevision: modulePackage.revision, baseContent: clone(modulePackage.content) },
    };
    graph.modules.push(module);
    return {
      level: {
        ...level,
        layers: [...(level.layers ?? []), clone(modulePackage.content.layer)],
        shapes: [...(level.shapes ?? []), ...clone(modulePackage.content.shapes)],
        entities: [...(level.entities ?? []), ...clone(modulePackage.content.entities)],
        structureGraph: graph,
      },
      conflicts: [],
      imported: true,
    };
  }

  const current = extractModuleContent(level, existing.id);
  const base = modulePackage.base ?? existing.versionControl?.baseContent ?? current;
  const conflicts = [];
  let merged = mergeValue(base, current, modulePackage.content, "module", conflicts);
  if (conflicts.length > 0 && options.resolution === "incoming") merged = clone(modulePackage.content);
  if (conflicts.length > 0 && options.resolution === "current") merged = clone(current);
  if (conflicts.length > 0 && !options.resolution) return { level, conflicts, imported: false };

  const sourceLayerId = existing.sourceLayerId;
  if (merged.module.sourceLayerId !== sourceLayerId || merged.layer.id !== sourceLayerId) {
    throw new Error("更新模块时不能改变内部图层 ID");
  }
  const nextModule = {
    ...merged.module,
    versionControl: { baseRevision: moduleContentRevision(merged), baseContent: clone(merged) },
  };
  graph.modules = graph.modules.map((module) => module.id === existing.id ? nextModule : module);
  const validPortIds = new Set(nextModule.ports.map((port) => port.id));
  const instanceIds = new Set(graph.instances.filter((instance) => instance.moduleId === existing.id).map((instance) => instance.id));
  graph.connections = graph.connections.filter((connection) => !(
    (instanceIds.has(connection.from.instanceId) && !validPortIds.has(connection.from.portId))
    || (instanceIds.has(connection.to.instanceId) && !validPortIds.has(connection.to.portId))
  ));
  return {
    level: {
      ...level,
      layers: (level.layers ?? []).map((layer) => layer.id === sourceLayerId ? clone(merged.layer) : layer),
      shapes: [...(level.shapes ?? []).filter((shape) => shape.layerId !== sourceLayerId), ...clone(merged.shapes)],
      entities: [...(level.entities ?? []).filter((entity) => entity.layerId !== sourceLayerId), ...clone(merged.entities)],
      structureGraph: graph,
    },
    conflicts,
    imported: true,
  };
}
