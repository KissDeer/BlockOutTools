import { describe, expect, it } from "vitest";
import { createEmptyTopology } from "./concept";
import { addLogicLink, addLogicNode, createLogicModule, editDecomposition } from "./concept-commands";

function fixture() {
  const first = addLogicNode(createEmptyTopology(), [0, 0], { name: "入口", relativePosition: [1200, 2400], elevation: { base: 0, top: 400 }, moduleId: "definition-1" });
  const second = addLogicNode(first.topology, [300, 0], { name: "中庭" });
  const third = addLogicNode(second.topology, [600, 0], { name: "出口" });
  const linked = addLogicLink(third.topology, first.node.id, second.node.id, "normal", { sourceHandle: "right", targetHandle: "left" })!;
  const source = createLogicModule(linked.topology, "入口模块", [first.node.id, second.node.id]);
  const target = createLogicModule(source.topology, "出口模块", [third.node.id]);
  return { topology: target.topology, ids: [first.node.id, second.node.id, third.node.id], sourceId: source.module.id, targetId: target.module.id };
}

describe("decomposition edit transaction", () => {
  it("moves several nodes and reassigns them without changing topology or spatial data", () => {
    const { topology, ids, sourceId, targetId } = fixture();
    const original = structuredClone(topology);
    const position: [number, number] = [800, 100];
    const next = editDecomposition(topology, {
      positions: [{ nodeId: ids[0], position }, { nodeId: ids[1], position: [1100, 100] }],
      assignments: ids.slice(0, 2).map((nodeId) => ({ nodeId, moduleId: targetId })),
    });
    expect(next.nodes[0]).toEqual({ ...topology.nodes[0], graphPosition: [800, 100] });
    expect(next.nodes[1]).toEqual({ ...topology.nodes[1], graphPosition: [1100, 100] });
    expect(next.nodes[2]).toEqual(topology.nodes[2]);
    expect(next.modules.find((module) => module.id === sourceId)?.nodeIds).toEqual([]);
    expect(next.modules.find((module) => module.id === targetId)?.nodeIds).toEqual([ids[2], ids[0], ids[1]]);
    expect(next.links).toEqual(topology.links);
    expect(next.keys).toEqual(topology.keys);
    expect(next.inputs).toEqual(topology.inputs);
    expect(next.scopes).toEqual(topology.scopes);
    expect(topology).toEqual(original);
    position[0] = -999;
    expect(next.nodes[0].graphPosition).toEqual([800, 100]);
  });

  it("makes touched membership unique and supports removing membership", () => {
    const { topology, ids, targetId } = fixture();
    topology.modules[0].nodeIds.push(ids[0]);
    topology.modules[1].nodeIds.push(ids[0]);
    const next = editDecomposition(topology, {
      assignments: [{ nodeId: ids[0], moduleId: targetId }, { nodeId: ids[1], moduleId: null }],
    });
    expect(next.modules.flatMap((module) => module.nodeIds).filter((id) => id === ids[0])).toEqual([ids[0]]);
    expect(next.modules[1].nodeIds).toContain(ids[0]);
    expect(next.modules.flatMap((module) => module.nodeIds)).not.toContain(ids[1]);
  });

  it("returns the original object for empty edits and unchanged final values", () => {
    const { topology, ids, sourceId, targetId } = fixture();
    expect(editDecomposition(topology, {})).toBe(topology);
    expect(editDecomposition(topology, {
      positions: [{ nodeId: ids[0], position: [100, 200] }, { nodeId: ids[0], position: [0, 0] }],
      assignments: [{ nodeId: ids[0], moduleId: targetId }, { nodeId: ids[0], moduleId: sourceId }],
    })).toBe(topology);
    const unassigned = editDecomposition(topology, { assignments: [{ nodeId: ids[0], moduleId: null }] });
    expect(editDecomposition(unassigned, { assignments: [{ nodeId: ids[0], moduleId: null }] })).toBe(unassigned);
  });

  it("rejects the whole batch if any node, module or position is invalid", () => {
    const { topology, ids, targetId } = fixture();
    const position = { nodeId: ids[0], position: [100, 200] as [number, number] };
    expect(editDecomposition(topology, { positions: [position], assignments: [{ nodeId: ids[1], moduleId: "missing" }] })).toBe(topology);
    expect(editDecomposition(topology, { positions: [position], assignments: [{ nodeId: "missing", moduleId: targetId }] })).toBe(topology);
    expect(editDecomposition(topology, { positions: [position, { nodeId: "missing", position: [1, 2] }] })).toBe(topology);
    expect(editDecomposition(topology, { positions: [position, { nodeId: ids[1], position: [NaN, Infinity] }] })).toBe(topology);
  });
});
