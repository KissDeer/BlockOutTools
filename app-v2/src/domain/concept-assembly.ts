import { createId } from "./ids";
import { worldPortPose } from "./assembly-resolver";
import { deriveModuleLinks } from "./concept-decomposition";
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
}

const EMPTY_RESULT: AssemblyGenerationResult = {
  instancesCreated: 0, instancesMoved: 0, connectionsCreated: 0, connectionsUpdated: 0, unplacedModules: [], missingPorts: [],
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
  const nodeById = new Map(concept.nodes.map((node) => [node.id, node]));
  const result: AssemblyGenerationResult = { ...EMPTY_RESULT, unplacedModules: [], missingPorts: [] };

  /* 1) 实例：每个已落成构型的模块一个实例，放在概念给的相对位置上 */
  const layout = canvasLayout(concept.modules.map((module) => module.relativeOrigin ?? [0, 0]));
  const instanceByModule = new Map<string, ModuleInstance>();
  for (const module of concept.modules) {
    if (!module.moduleDefinitionId) continue;
    const definition = next.modules.find((item) => item.id === module.moduleDefinitionId);
    if (!definition) continue;

    const origin = module.relativeOrigin;
    if (!origin) result.unplacedModules.push(module.name);
    // 体块的 Z 已经是父级绝对标高，所以实例本身放在 Z=0
    const transform = { position: [origin?.[0] ?? 0, origin?.[1] ?? 0, 0] as [number, number, number], rotation: 0 };
    const existing = next.instances.find((item) => item.definitionId === module.moduleDefinitionId);

    if (existing) {
      if (existing.assemblyTransform.position.join(",") !== transform.position.join(",") || existing.assemblyTransform.rotation !== 0) {
        existing.assemblyTransform = transform;
        result.instancesMoved += 1;
      }
      existing.name = module.name;
      existing.graphPosition = layout(origin ?? [0, 0]);
      instanceByModule.set(module.id, existing);
    } else {
      const position = layout(origin ?? [0, 0]);
      const instance: ModuleInstance = {
        id: createId("instance"),
        definitionId: module.moduleDefinitionId,
        name: module.name,
        graphPosition: position,
        assemblyTransform: transform,
      };
      next.instances.push(instance);
      instanceByModule.set(module.id, instance);
      result.instancesCreated += 1;
    }
  }
  next.assemblyAnchorInstanceId ??= next.instances[0]?.id;

  /* 2) 连接：跨模块链路 → 端口之间的连接，间距取概念里的实际值 */
  for (const moduleLink of deriveModuleLinks(concept)) {
    const fromModule = concept.modules.find((item) => item.id === moduleLink.fromModuleId);
    const toModule = concept.modules.find((item) => item.id === moduleLink.toModuleId);
    if (!fromModule?.moduleDefinitionId || !toModule?.moduleDefinitionId) continue;
    const fromInstance = instanceByModule.get(fromModule.id);
    const toInstance = instanceByModule.get(toModule.id);
    const fromDefinition = next.modules.find((item) => item.id === fromModule.moduleDefinitionId);
    const toDefinition = next.modules.find((item) => item.id === toModule.moduleDefinitionId);
    if (!fromInstance || !toInstance || !fromDefinition || !toDefinition) continue;

    const fromPort = portForLink(fromDefinition.blocks, moduleLink.linkId);
    const toPort = portForLink(toDefinition.blocks, moduleLink.linkId);
    if (!fromPort || !toPort) {
      result.missingPorts.push(`${fromModule.name} → ${toModule.name}（${moduleLink.label}）`);
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

  next.updatedAt = new Date().toISOString();
  return { project: next, result };
}

export { LOGIC_TO_CONNECTION };
