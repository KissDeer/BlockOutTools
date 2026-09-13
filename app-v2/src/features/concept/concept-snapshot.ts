import { computeTopologyDigest, type LogicTopology } from "../../domain/concept";
import { computeDecompositionDigest, deriveModuleLinks } from "../../domain/concept-decomposition";
import { moduleColor } from "./module-colors";

/**
 * 交给 DSH 的拓扑快照。
 * 拆解面板与构型面板必须用同一份 —— 各写一份会漂移（构型就曾漏掉 links，导致提案生不出端口）。
 */
export function conceptSnapshot(topology: LogicTopology) {
  const keyName = (id: string | null) => (id ? topology.keys.find((key) => key.id === id)?.name ?? null : null);
  return {
    inputsDigest: topology.inputs.digest,
    topologyDigest: computeTopologyDigest(topology),
    decompositionDigest: computeDecompositionDigest(topology),
    startNodeId: topology.startNodeId,
    nodes: topology.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      role: node.role,
      floor: node.floor,
      relativePosition: node.relativePosition,
      elevation: node.elevation,
      // 区域级模块绑定（手工绑定的预览用），与拆解模块不是一回事
      moduleId: node.moduleId ?? null,
    })),
    links: topology.links.map((link) => ({
      id: link.id,
      label: link.label,
      from: link.from,
      to: link.to,
      logic: link.logic,
      traversal: link.traversal,
      requiresKeyName: keyName(link.requires),
      note: link.note,
    })),
    keys: topology.keys.map((key) => ({ id: key.id, name: key.name, foundAt: key.foundAt, unlocks: key.unlocks })),
    modules: topology.modules.map((module, index) => ({
      id: module.id,
      name: module.name,
      nodeIds: module.nodeIds,
      note: module.note,
      color: moduleColor(index),
      moduleDefinitionId: module.moduleDefinitionId ?? null,
    })),
    moduleLinks: deriveModuleLinks(topology).map((link) => ({
      linkId: link.linkId,
      label: link.label,
      from: link.from,
      to: link.to,
      fromModuleId: link.fromModuleId,
      toModuleId: link.toModuleId,
      logic: link.logic,
      traversal: link.traversal,
      requiresKeyName: link.requiresKeyName,
    })),
    unassigned: topology.nodes.filter((node) => !topology.modules.some((module) => module.nodeIds.includes(node.id))).map((node) => node.id),
  };
}
