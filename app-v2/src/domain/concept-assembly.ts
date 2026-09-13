import { createId } from "./ids";
import { worldPortPose } from "./assembly-resolver";
import { deriveModuleLinks } from "./concept-decomposition";
import { flattenModules, pathKey, scopeViews, type ScopeStep } from "./concept-scopes";
import type { BlockoutProject, Connection, ConnectionType, ModuleInstance, PortBlock, Vec2 } from "./types";
import type { LogicKind, LogicTopology } from "./concept";

/**
 * 概念 → 阶段二组装。
 * 把每个拆解模块落成一个实例（放在概念给的相对位置上），再把跨模块链路落成连接。
 * 只新增/更新，不删除已有内容；整个过程可撤销。
 */

const LOGIC_TO_CONNECTION: Record<LogicKind, ConnectionType> = {
  normal: "door",
  "one-way-door": "one-way-door",
  "locked-door": "locked-door",
  shortcut: "shortcut",
  drop: "drop",
  stairs: "stairs",
  "spiral-stairs": "spiral-stairs",
  elevator: "elevator",
  "one-way-elevator": "one-way-elevator",
  road: "road",
};

export interface AssemblyGenerationResult {
  instancesCreated: number;
  instancesMoved: number;
  connectionsCreated: number;
  connectionsUpdated: number;
  /** 没有相对位置、只能放在原点的模块 */
  unplacedModules: string[];
  /** 缺少端口、无法连线的链路 */
  missingPorts: string[];
  /** 一端是已展开模块（没有单一实例可接）而跳过的链路 */
  skippedLinks: string[];
}

const EMPTY_RESULT: AssemblyGenerationResult = {
  instancesCreated: 0, instancesMoved: 0, connectionsCreated: 0, connectionsUpdated: 0, unplacedModules: [], missingPorts: [], skippedLinks: [],
};

/** 模块原点等比映射到画布，避免把厘米当画布坐标用 */
function canvasLayout(origins: Vec2[]): (point: Vec2) => Vec2 {
  if (origins.length === 0) return () => [240, 200];
  const xs = origins.map((point) => point[0]);
  const ys = origins.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  const scale = Math.min(900 / width, 600 / height, 1.2);
  return (point) => [140 + (point[0] - minX) * scale, 140 + (point[1] - minY) * scale];
}

function portForLink(blocks: { type: string; provenance?: { featureId: string } }[], linkId: string): PortBlock | null {
  const found = blocks.find((block) => block.type === "port" && block.provenance?.featureId === linkId);
  return (found as PortBlock | undefined) ?? null;
}

export function generateAssembly(project: BlockoutProject): { project: BlockoutProject; result: AssemblyGenerationResult } {
  if (!project.concept) return { project, result: { ...EMPTY_RESULT } };
  const next = structuredClone(project);
  const concept = next.concept as LogicTopology;
  const result: AssemblyGenerationResult = { ...EMPTY_RESULT, unplacedModules: [], missingPorts: [] };

  /* 1) 实例：递归展平后，每个产出几何的模块在**每条路径上**各得一个实例。
        共享的作用域会被多条路径实例化，所以身份必须带路径，不能只按模块记。 */
  const flat = flattenModules(concept);
  const layout = canvasLayout(flat.map((entry) => entry.origin));
  const instanceByKey = new Map<string, ModuleInstance>();
  const instanceKey = (path: ScopeStep[], moduleId: string) => `${pathKey(path)}|${moduleId}`;

  for (const entry of flat) {
    const module = entry.module;
    if (!module.moduleDefinitionId) continue;
    const definition = next.modules.find((item) => item.id === module.moduleDefinitionId);
    if (!definition) continue;

    // 没有自己相对位置的模块只能落在累积原点上，值得提醒
    if (!module.relativeOrigin) result.unplacedModules.push(module.name);
    const position: [number, number, number] = [entry.origin[0], entry.origin[1], 0];
    const scopePath = entry.path.map((step) => step.moduleId);
    const pathId = pathKey(entry.path);

    const existing = next.instances.find((item) =>
      item.definitionId === module.moduleDefinitionId && (item.scopePath ?? []).join("/") === pathId);

    if (existing) {
      const moved = existing.assemblyTransform.position.join(",") !== position.join(",") || existing.assemblyTransform.rotation !== 0;
      existing.assemblyTransform = { position, rotation: 0 };
      existing.name = module.name;
      existing.graphPosition = layout(entry.origin);
      existing.scopePath = scopePath;
      if (moved) result.instancesMoved += 1;
      instanceByKey.set(instanceKey(entry.path, module.id), existing);
    } else {
      const instance: ModuleInstance = {
        id: createId("instance"),
        definitionId: module.moduleDefinitionId,
        name: module.name,
        graphPosition: layout(entry.origin),
        assemblyTransform: { position, rotation: 0 },
        scopePath,
      };
      next.instances.push(instance);
      instanceByKey.set(instanceKey(entry.path, module.id), instance);
      result.instancesCreated += 1;
    }
  }
  next.assemblyAnchorInstanceId ??= next.instances[0]?.id;

  /* 2) 连接：跨模块链路 → 端口之间的连接。链路按作用域独立，作用域又可能被多条路径实例化，
        所以每条路径都要接一遍。 */
  const leafModuleIds = new Set(flat.map((entry) => entry.module.id));
  for (const { scopeId, view } of scopeViews(concept)) {
    const instantiationPaths = [...new Set(flat.filter((entry) => entry.scopeId === scopeId).map((entry) => entry.path))];
    for (const moduleLink of deriveModuleLinks(view)) {
      const nameOf = (moduleId: string) => view.modules.find((module) => module.id === moduleId)?.name ?? moduleId;
      // 一端是已展开的模块：它在阶段二里是一组实例，没有单一实例可以接这条链路
      if (!leafModuleIds.has(moduleLink.fromModuleId) || !leafModuleIds.has(moduleLink.toModuleId)) {
        result.skippedLinks.push(`${nameOf(moduleLink.fromModuleId)} → ${nameOf(moduleLink.toModuleId)}（${moduleLink.label}）：一端是已展开的模块，没有单一实例可接`);
        continue;
      }
      for (const path of instantiationPaths) {
        const fromInstance = instanceByKey.get(instanceKey(path, moduleLink.fromModuleId));
        const toInstance = instanceByKey.get(instanceKey(path, moduleLink.toModuleId));
        if (!fromInstance || !toInstance) continue;
        const fromDefinition = next.modules.find((item) => item.id === fromInstance.definitionId);
        const toDefinition = next.modules.find((item) => item.id === toInstance.definitionId);
        if (!fromDefinition || !toDefinition) continue;

        const fromPort = portForLink(fromDefinition.blocks, moduleLink.linkId);
        const toPort = portForLink(toDefinition.blocks, moduleLink.linkId);
        if (!fromPort || !toPort) {
          result.missingPorts.push(`${fromInstance.name} → ${toInstance.name}（${moduleLink.label}）`);
          continue;
        }

        /* 间距：把概念里的实际相对位置写成 spacing，
           否则求解器会按类型默认值（比如楼梯固定前移 400）把模块挪走，和概念打架。 */
        const sourcePose = worldPortPose(fromInstance.assemblyTransform, fromPort);
        const targetPose = worldPortPose(toInstance.assemblyTransform, toPort);
        const dx = targetPose.position[0] - sourcePose.position[0];
        const dy = targetPose.position[1] - sourcePose.position[1];
        const radians = sourcePose.rotation * Math.PI / 180;
        const spacing = {
          forward: Math.round(dx * Math.cos(radians) + dy * Math.sin(radians)),
          lateral: Math.round(-dx * Math.sin(radians) + dy * Math.cos(radians)),
          vertical: Math.round(targetPose.position[2] - sourcePose.position[2]),
        };

        const type = LOGIC_TO_CONNECTION[moduleLink.logic];
        const existing = next.connections.find((item) =>
          item.sourceInstanceId === fromInstance.id && item.sourcePortId === fromPort.id
          && item.targetInstanceId === toInstance.id && item.targetPortId === toPort.id);
        if (existing) {
          existing.type = type;
          existing.spacing = spacing;
          result.connectionsUpdated += 1;
        } else {
          const connection: Connection = {
            id: createId("connection"),
            type,
            sourceInstanceId: fromInstance.id,
            sourcePortId: fromPort.id,
            targetInstanceId: toInstance.id,
            targetPortId: toPort.id,
            waypoints: [],
            spacing,
          };
          next.connections.push(connection);
          result.connectionsCreated += 1;
        }
      }
    }
  }

  next.updatedAt = new Date().toISOString();
  return { project: next, result };
}

export { LOGIC_TO_CONNECTION };
