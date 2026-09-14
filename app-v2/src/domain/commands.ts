import { createBlock } from "./catalog";
import { createId } from "./ids";
import { moduleLocalLayout, type ConfigurationCandidate } from "./concept-configuration";
import { nodesOfScope, findModule } from "./concept-scopes";
import type { LogicTopology } from "./concept";
import type { Block, BlockoutProject, BlockType, Connection, ConnectionType, ModuleDefinition, ModuleInstance, Transform, Vec2 } from "./types";

function cloneProject(project: BlockoutProject): BlockoutProject {
  return structuredClone(project);
}

function touch(project: BlockoutProject): BlockoutProject {
  project.updatedAt = new Date().toISOString();
  return project;
}

export function renameProject(project: BlockoutProject, name: string): BlockoutProject {
  const next = cloneProject(project);
  next.name = name.trim() || next.name;
  return touch(next);
}

export function addModule(project: BlockoutProject, graphPosition: Vec2 = [320, 220]): { project: BlockoutProject; module: ModuleDefinition; instance: ModuleInstance } {
  const next = cloneProject(project);
  const module: ModuleDefinition = { id: createId("module"), name: `新模块 ${next.modules.length + 1}`, revision: 1, blocks: [] };
  const instance: ModuleInstance = {
    id: createId("instance"),
    definitionId: module.id,
    name: module.name,
    graphPosition,
    assemblyTransform: { position: [0, 0, 0], rotation: 0 },
  };
  next.modules.push(module);
  next.instances.push(instance);
  next.assemblyAnchorInstanceId ??= next.instances[0].id;
  return { project: touch(next), module, instance };
}

export function duplicateInstance(project: BlockoutProject, instanceId: string): { project: BlockoutProject; instance: ModuleInstance | null } {
  const next = cloneProject(project);
  const source = next.instances.find((item) => item.id === instanceId);
  if (!source) return { project, instance: null };
  const instance: ModuleInstance = {
    ...source,
    id: createId("instance"),
    name: `${source.name} 副本`,
    graphPosition: [source.graphPosition[0] + 48, source.graphPosition[1] + 48],
    assemblyTransform: { ...source.assemblyTransform, position: [source.assemblyTransform.position[0] + 200, source.assemblyTransform.position[1] + 200, source.assemblyTransform.position[2]] },
  };
  next.instances.push(instance);
  return { project: touch(next), instance };
}

export function removeInstance(project: BlockoutProject, instanceId: string): BlockoutProject {
  const next = cloneProject(project);
  next.instances = next.instances.filter((item) => item.id !== instanceId);
  if (next.assemblyAnchorInstanceId === instanceId) next.assemblyAnchorInstanceId = next.instances[0]?.id;
  next.connections = next.connections.filter((item) => item.sourceInstanceId !== instanceId && item.targetInstanceId !== instanceId);
  return touch(next);
}

export function updateInstanceGraph(project: BlockoutProject, instanceId: string, graphPosition: Vec2): BlockoutProject {
  const next = cloneProject(project);
  const instance = next.instances.find((item) => item.id === instanceId);
  if (!instance) return project;
  instance.graphPosition = graphPosition;
  return touch(next);
}

export function updateInstanceTransform(project: BlockoutProject, instanceId: string, transform: Transform): BlockoutProject {
  const next = cloneProject(project);
  const instance = next.instances.find((item) => item.id === instanceId);
  if (!instance) return project;
  instance.assemblyTransform = structuredClone(transform);
  return touch(next);
}

export function addBlock(project: BlockoutProject, moduleId: string, type: BlockType, position: [number, number, number] = [0, 0, 0]): { project: BlockoutProject; block: Block | null } {
  const next = cloneProject(project);
  const module = next.modules.find((item) => item.id === moduleId);
  if (!module) return { project, block: null };
  const block = createBlock(type, position);
  module.blocks.push(block);
  module.revision += 1;
  return { project: touch(next), block };
}

export function updateBlock(project: BlockoutProject, moduleId: string, block: Block): BlockoutProject {
  const next = cloneProject(project);
  const module = next.modules.find((item) => item.id === moduleId);
  if (!module) return project;
  const index = module.blocks.findIndex((item) => item.id === block.id);
  if (index < 0) return project;
  module.blocks[index] = structuredClone(block);
  module.revision += 1;
  return touch(next);
}

export function removeBlocks(project: BlockoutProject, moduleId: string, blockIds: string[]): BlockoutProject {
  const next = cloneProject(project);
  const module = next.modules.find((item) => item.id === moduleId);
  if (!module) return project;
  const ids = new Set(blockIds);
  const removedPortIds = new Set(module.blocks.filter((item) => ids.has(item.id) && item.type === "port").map((item) => item.id));
  module.blocks = module.blocks.filter((item) => !ids.has(item.id));
  module.revision += 1;
  if (removedPortIds.size > 0) {
    next.connections = next.connections.filter((item) => !removedPortIds.has(item.sourcePortId) && !removedPortIds.has(item.targetPortId));
  }
  return touch(next);
}

export function addConnection(project: BlockoutProject, type: ConnectionType, sourceInstanceId: string, sourcePortId: string, targetInstanceId: string, targetPortId: string): BlockoutProject {
  const sourceInstance = project.instances.find((item) => item.id === sourceInstanceId);
  const targetInstance = project.instances.find((item) => item.id === targetInstanceId);
  const sourceModule = project.modules.find((item) => item.id === sourceInstance?.definitionId);
  const targetModule = project.modules.find((item) => item.id === targetInstance?.definitionId);
  const sourcePortExists = sourceModule?.blocks.some((item) => item.type === "port" && item.id === sourcePortId);
  const targetPortExists = targetModule?.blocks.some((item) => item.type === "port" && item.id === targetPortId);
  const occupied = project.connections.some((item) =>
    (item.sourceInstanceId === sourceInstanceId && item.sourcePortId === sourcePortId)
    || (item.targetInstanceId === sourceInstanceId && item.targetPortId === sourcePortId)
    || (item.sourceInstanceId === targetInstanceId && item.sourcePortId === targetPortId)
    || (item.targetInstanceId === targetInstanceId && item.targetPortId === targetPortId));
  if (!sourcePortExists || !targetPortExists || occupied || sourceInstanceId === targetInstanceId) return project;
  const next = cloneProject(project);
  next.connections.push({ id: createId("connection"), type, sourceInstanceId, sourcePortId, targetInstanceId, targetPortId, waypoints: [] });
  return touch(next);
}

export function updateConnection(project: BlockoutProject, connectionId: string, patch: Partial<Pick<Connection, "type" | "spacing" | "waypoints">>): BlockoutProject {
  const next = cloneProject(project);
  const connection = next.connections.find((item) => item.id === connectionId);
  if (!connection) return project;
  Object.assign(connection, structuredClone(patch));
  return touch(next);
}

export function updateModule(project: BlockoutProject, module: ModuleDefinition): BlockoutProject {
  const next = cloneProject(project);
  const index = next.modules.findIndex((item) => item.id === module.id);
  if (index < 0) return project;
  const portIds = new Set(module.blocks.filter((block) => block.type === "port").map((block) => block.id));
  const removedPorts = new Set(next.modules[index].blocks.filter((block) => block.type === "port" && !portIds.has(block.id)).map((block) => block.id));
  next.connections = next.connections.filter((connection) => !removedPorts.has(connection.sourcePortId) && !removedPorts.has(connection.targetPortId));
  next.modules[index] = { ...structuredClone(module), revision: next.modules[index].revision + 1 };
  return touch(next);
}

export function updateProjectSettings(project: BlockoutProject, patch: Partial<Pick<BlockoutProject, "assemblyAnchorInstanceId" | "blockoutProfile">>): BlockoutProject {
  return touch({ ...cloneProject(project), ...structuredClone(patch) });
}

export function removeConnection(project: BlockoutProject, connectionId: string): BlockoutProject {
  if (!project.connections.some((item) => item.id === connectionId)) return project;
  const next = cloneProject(project);
  next.connections = next.connections.filter((item) => item.id !== connectionId);
  return touch(next);
}

/** 阶段一：写回逻辑拓扑。只影响 concept 字段，不触碰模块、实例与连接。 */
export function setConcept(project: BlockoutProject, topology: LogicTopology): BlockoutProject {
  const next = cloneProject(project);
  next.concept = structuredClone(topology);
  return touch(next);
}

/** 为逻辑节点新建一个空模块并绑定，便于立刻进入模块内部搭建体块 */
export function createModuleForNode(project: BlockoutProject, nodeId: string, graphPosition: Vec2): { project: BlockoutProject; module: ModuleDefinition; instance: ModuleInstance } | null {
  const node = project.concept?.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const created = addModule(project, graphPosition);
  created.module.name = node.name;
  created.instance.name = node.name;
  const next = cloneProject(created.project);
  const module = next.modules.find((item) => item.id === created.module.id) as ModuleDefinition;
  module.name = node.name;
  const instance = next.instances.find((item) => item.id === created.instance.id) as ModuleInstance;
  instance.name = node.name;
  if (next.concept) {
    const target = next.concept.nodes.find((item) => item.id === nodeId);
    if (target) target.moduleId = module.id;
  }
  return { project: touch(next), module, instance };
}

/**
 * 套用基础构型：把每个拆解模块落成一个阶段二模块定义（体块 + 端口）。
 * 坐标在这里统一换算：区域相对位置（父级厘米）→ 模块局部厘米（以包围盒左下角为原点）。
 * 已有绑定则更新该模块的积木，同源积木保留身份；移除端口时解除其关联连接。
 */
export function applyConfiguration(project: BlockoutProject, candidate: ConfigurationCandidate): { project: BlockoutProject; moduleIds: string[]; blockCount: number } {
  if (!project.concept) return { project, moduleIds: [], blockCount: 0 };
  const next = cloneProject(project);
  const concept = next.concept as LogicTopology;
  const moduleIds: string[] = [];
  let blockCount = 0;
  for (const entry of candidate.modules) {
    // 模块可能在任何一层作用域里
    const found = findModule(concept, entry.moduleId);
    if (!found || found.module.childScopeId) continue;
    const logicModule = found.module;
    const nodeById = new Map(nodesOfScope(concept, found.scopeId).map((node) => [node.id, node]));
    const existing = logicModule.moduleDefinitionId ? next.modules.find((item) => item.id === logicModule.moduleDefinitionId) : null;
    const layout = moduleLocalLayout(concept, entry);
    const blocks: Block[] = [];

    for (const box of layout.boxes) {
      const block = createBlock("box", [box.center[0], box.center[1], box.base]);
      if (block.type !== "box") continue;
      const area = entry.areas.find((item) => item.nodeId === box.nodeId);
      block.name = nodeById.get(box.nodeId)?.name ?? "区域";
      block.role = area?.role === "floor" ? "floor" : "solid";
      block.elevationReference = "bottom";
      block.parameters.BoxSize = [box.size[0], box.size[1], box.size[2]];
      // 出处：源 = 拆解模块，特征 = 逻辑区域。组装与回溯都靠它，不靠名字
      block.provenance = { sourceId: logicModule.id, featureId: box.nodeId, status: "confirmed", note: area?.note ?? "" };
      blocks.push(block);
    }

    for (const port of entry.ports) {
      const node = nodeById.get(port.nodeId);
      const box = layout.boxes.find((item) => item.nodeId === port.nodeId);
      if (!node || !box) continue;
      const block = createBlock("port", [box.center[0] + port.offset[0], box.center[1] + port.offset[1], box.base]);
      if (block.type !== "port") continue;
      block.name = `${node.name} · ${port.note || "出入口"}`;
      block.transform.rotation = port.rotation;
      block.parameters.width = port.width;
      // 特征 = 拓扑链路 id：组装时据此把链路接到端口上
      block.provenance = { sourceId: logicModule.id, featureId: port.linkId, status: "confirmed", note: port.note };
      blocks.push(block);
    }
    blockCount += blocks.length;
    // 记下模块局部原点在父级里的位置：阶段二拼装与平面图都要用
    logicModule.relativeOrigin = layout.origin;

    if (existing) {
      // 特征身份只在本模块与积木类型内匹配，不按名称、顺序或位置猜测。
      const previousByFeature = new Map(existing.blocks.filter((block) => block.provenance).map((block) => [
        JSON.stringify([block.type, block.provenance!.sourceId, block.provenance!.featureId]), block.id,
      ]));
      for (const block of blocks) {
        const key = JSON.stringify([block.type, block.provenance!.sourceId, block.provenance!.featureId]);
        const previousId = previousByFeature.get(key);
        if (previousId) block.id = previousId;
        previousByFeature.delete(key);
      }
      const retainedPorts = new Set(blocks.filter((block) => block.type === "port").map((block) => block.id));
      const removedPorts = new Set(existing.blocks.filter((block) => block.type === "port" && !retainedPorts.has(block.id)).map((block) => block.id));
      const instanceIds = new Set(next.instances.filter((instance) => instance.definitionId === existing.id).map((instance) => instance.id));
      next.connections = next.connections.filter((connection) =>
        !(instanceIds.has(connection.sourceInstanceId) && removedPorts.has(connection.sourcePortId))
        && !(instanceIds.has(connection.targetInstanceId) && removedPorts.has(connection.targetPortId)));
      existing.name = logicModule.name;
      existing.blocks = blocks;
      existing.revision += 1;
      moduleIds.push(existing.id);
    } else {
      const module: ModuleDefinition = { id: createId("module"), name: logicModule.name, revision: 1, blocks };
      next.modules.push(module);
      logicModule.moduleDefinitionId = module.id;
      moduleIds.push(module.id);
    }
  }

  return { project: touch(next), moduleIds, blockCount };
}
