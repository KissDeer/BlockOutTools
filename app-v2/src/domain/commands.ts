import { createBlock } from "./catalog";
import { createId } from "./ids";
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

export function updateConnection(project: BlockoutProject, connectionId: string, patch: Pick<Connection, "type">): BlockoutProject {
  const next = cloneProject(project);
  const connection = next.connections.find((item) => item.id === connectionId);
  if (!connection || connection.type === patch.type) return project;
  connection.type = patch.type;
  return touch(next);
}

export function removeConnection(project: BlockoutProject, connectionId: string): BlockoutProject {
  if (!project.connections.some((item) => item.id === connectionId)) return project;
  const next = cloneProject(project);
  next.connections = next.connections.filter((item) => item.id !== connectionId);
  return touch(next);
}
