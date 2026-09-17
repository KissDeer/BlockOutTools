import { createBlock } from "./catalog";
import { createId } from "./ids";
import type { LogicNode, LogicTopology } from "./concept";
import type { Block, BlockoutProject, BlockType } from "./types";

/**
 * 项目级命令。
 *
 * 几何挂在**节点**上（`LogicNode.blocks`），所以这里只有三类事：
 * 项目本身的属性、逻辑拓扑的写回、以及节点内积木的增删改。
 * 模块层删除后，实例、连接、模块定义这些命令一并消失。
 */

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

function nodeIn(project: BlockoutProject, nodeId: string): LogicNode | null {
  const topology = project.concept;
  if (!topology) return null;
  for (const scope of [topology, ...topology.scopes]) {
    const node = scope.nodes.find((item) => item.id === nodeId);
    if (node) return node;
  }
  return null;
}

export function addNodeBlock(project: BlockoutProject, nodeId: string, type: BlockType, position: [number, number, number] = [0, 0, 0]): { project: BlockoutProject; block: Block | null } {
  const next = cloneProject(project);
  const node = next.concept ? nodeIn(next, nodeId) : null;
  if (!node) return { project, block: null };
  const block = createBlock(type, position);
  node.blocks = [...(node.blocks ?? []), block];
  return { project: touch(next), block };
}

export function updateNodeBlock(project: BlockoutProject, nodeId: string, block: Block): BlockoutProject {
  const next = cloneProject(project);
  const node = next.concept ? nodeIn(next, nodeId) : null;
  if (!node?.blocks) return project;
  const index = node.blocks.findIndex((item) => item.id === block.id);
  if (index < 0) return project;
  const blocks = [...node.blocks];
  blocks[index] = structuredClone(block);
  node.blocks = blocks;
  return touch(next);
}

export function removeNodeBlocks(project: BlockoutProject, nodeId: string, blockIds: string[]): BlockoutProject {
  const next = cloneProject(project);
  const node = next.concept ? nodeIn(next, nodeId) : null;
  if (!node?.blocks) return project;
  const ids = new Set(blockIds);
  node.blocks = node.blocks.filter((item) => !ids.has(item.id));
  return touch(next);
}

/** 写回逻辑拓扑。只影响 concept 字段。 */
export function setConcept(project: BlockoutProject, topology: LogicTopology): BlockoutProject {
  const next = cloneProject(project);
  next.concept = structuredClone(topology);
  return touch(next);
}

export function updateProjectSettings(project: BlockoutProject, patch: Partial<Pick<BlockoutProject, "blockoutProfile">>): BlockoutProject {
  return touch({ ...cloneProject(project), ...structuredClone(patch) });
}
