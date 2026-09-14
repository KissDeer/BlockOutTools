import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoProject } from "../domain/demo-project";
import { createEmptyTopology } from "../domain/concept";
import { createEmptyCandidate } from "../domain/concept-candidate";
import { createEmptyDecompositionCandidate } from "../domain/concept-decomposition";
import { createEmptyConfigurationCandidate } from "../domain/concept-configuration";
import { addLogicKey, addLogicLink, addLogicNode, createLogicModule } from "../domain/concept-commands";
import { expandModule, scopeView, writeScopeView } from "../domain/concept-scopes";

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("decomposition history", () => {
  it("dissolves a module in one undoable step without removing nodes, locked links, keys or generated geometry", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    const { useProjectStore } = await import("./project-store");
    const demo = createDemoProject();
    const first = addLogicNode(createEmptyTopology(), [0, 0], { moduleId: demo.modules[0].id });
    const second = addLogicNode(first.topology, [300, 0]);
    const linked = addLogicLink(second.topology, first.node.id, second.node.id, "locked-door", { sourceHandle: "right", targetHandle: "left" })!;
    const keyed = addLogicKey(linked.topology, first.node.id, linked.link.id)!;
    const grouped = createLogicModule(keyed.topology, "locked route", [first.node.id, second.node.id]);
    const expanded = expandModule(grouped.topology, grouped.module.id)!;
    const before = { ...demo, concept: expanded.topology };
    useProjectStore.getState().replaceProject(before);
    useProjectStore.getState().removeLogicModule(grouped.module.id);
    const after = useProjectStore.getState().project;
    expect(after.concept).toEqual({ ...before.concept, modules: [] });
    expect(after.modules).toEqual(before.modules);
    expect(after.instances).toEqual(before.instances);
    expect(after.connections).toEqual(before.connections);
    expect(after.concept?.links[0].requires).toBe(keyed.key.id);
    expect(after.concept?.keys[0].unlocks).toEqual([linked.link.id]);
    expect(useProjectStore.getState().past).toEqual([before]);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.getState().past).toEqual([]);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project).toBe(after);
  });

  it("commits a multi-node drop once and restores membership and positions with one undo/redo", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    const { useProjectStore } = await import("./project-store");
    const first = addLogicNode(createEmptyTopology(), [0, 0]);
    const second = addLogicNode(first.topology, [300, 0]);
    const source = createLogicModule(second.topology, "source", [first.node.id, second.node.id]);
    const target = createLogicModule(source.topology, "target");
    const before = { ...createDemoProject(), concept: target.topology };
    useProjectStore.getState().replaceProject(before);
    useProjectStore.getState().editDecomposition({
      positions: [{ nodeId: first.node.id, position: [500, 200] }, { nodeId: second.node.id, position: [800, 200] }],
      assignments: [first.node.id, second.node.id].map((nodeId) => ({ nodeId, moduleId: target.module.id })),
    });
    const after = useProjectStore.getState().project;
    expect(useProjectStore.getState().past).toEqual([before]);
    expect(after.concept?.nodes.map((node) => node.graphPosition)).toEqual([[500, 200], [800, 200]]);
    expect(after.concept?.modules[0].nodeIds).toEqual([]);
    expect(after.concept?.modules[1].nodeIds).toEqual([first.node.id, second.node.id]);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.getState().past).toEqual([]);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project).toBe(after);
    useProjectStore.getState().undo();
    useProjectStore.getState().editDecomposition({ positions: [{ nodeId: first.node.id, position: [0, 0] }] });
    useProjectStore.getState().editDecomposition({ assignments: [{ nodeId: first.node.id, moduleId: "missing" }] });
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.getState().past).toEqual([]);
    expect(useProjectStore.getState().future).toEqual([after]);
  });

  it("edits only the current child scope and refuses cross-scope references", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    const { useProjectStore } = await import("./project-store");
    const outer = addLogicNode(createEmptyTopology(), [0, 0]);
    const parent = createLogicModule(outer.topology, "parent", [outer.node.id]);
    const expanded = expandModule(parent.topology, parent.module.id)!;
    const inner = addLogicNode(scopeView(expanded.topology, expanded.scope.id), [20, 30]);
    const childModule = createLogicModule(inner.topology, "child");
    const topology = writeScopeView(expanded.topology, expanded.scope.id, childModule.topology);
    const before = { ...createDemoProject(), concept: topology };
    useProjectStore.getState().replaceProject(before);
    useProjectStore.getState().setConceptScope(expanded.scope.id);
    useProjectStore.getState().editDecomposition({
      positions: [{ nodeId: inner.node.id, position: [400, 600] }],
      assignments: [{ nodeId: inner.node.id, moduleId: childModule.module.id }],
    });
    const after = useProjectStore.getState().project;
    expect(after.concept?.nodes).toEqual(topology.nodes);
    expect(after.concept?.modules).toEqual(topology.modules);
    expect(after.concept?.links).toEqual(topology.links);
    const current = scopeView(after.concept!, expanded.scope.id);
    expect(current.nodes[0].graphPosition).toEqual([400, 600]);
    expect(current.modules[0].nodeIds).toEqual([inner.node.id]);
    useProjectStore.getState().editDecomposition({ assignments: [{ nodeId: inner.node.id, moduleId: parent.module.id }] });
    useProjectStore.getState().editDecomposition({ positions: [{ nodeId: outer.node.id, position: [1, 2] }] });
    expect(useProjectStore.getState().project).toBe(after);
    expect(useProjectStore.getState().past).toEqual([before]);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.getState().conceptScopeId).toBe(expanded.scope.id);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project).toBe(after);
  });
});

describe("project store clipboard actions", () => {
  it("打开另一项目后清除旧子层、候选和组装结果", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    const { useProjectStore } = await import("./project-store");
    useProjectStore.setState({
      conceptScopeId: "old-child", candidate: createEmptyCandidate("old", null), candidateExcluded: ["old-node"], selectedCandidateNodeId: "old-node",
      decomposition: createEmptyDecompositionCandidate("old", "old"), configuration: createEmptyConfigurationCandidate(createEmptyTopology()),
      assemblyResult: { instancesCreated: 1, instancesMoved: 0, connectionsCreated: 0, connectionsUpdated: 0, unplacedModules: [], missingPorts: [], skippedLinks: ["旧项目未接通链路"] },
    });
    const incoming = createDemoProject();
    useProjectStore.getState().replaceProject(incoming);
    expect(useProjectStore.getState()).toMatchObject({
      project: incoming, conceptScopeId: null, candidate: null, candidateExcluded: [], selectedCandidateNodeId: null,
      decomposition: null, configuration: null, assemblyResult: null,
    });
  });

  it("keeps preview snapshots until explicit refresh and clears deleted selections on undo", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    const { useProjectStore } = await import("./project-store");
    useProjectStore.getState().replaceProject(createDemoProject());
    useProjectStore.getState().refreshPreview();
    const snapshot = useProjectStore.getState().previewProject;
    useProjectStore.getState().addModule();
    useProjectStore.getState().togglePreview();
    useProjectStore.getState().togglePreview();
    expect(useProjectStore.getState().previewProject).toBe(snapshot);
    expect(useProjectStore.getState().previewDirty).toBe(true);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().selectedInstanceId).toBeNull();
    useProjectStore.getState().refreshPreview();
    expect(useProjectStore.getState().previewProject).toBe(useProjectStore.getState().project);
  });
  it("copies and pastes a module instance without copying its connections", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    const { useProjectStore } = await import("./project-store");
    const project = createDemoProject();
    useProjectStore.setState({
      project,
      view: "assembly",
      activeInstanceId: null,
      selectedInstanceId: project.instances[0].id,
      selectedConnectionId: null,
      selectedBlockIds: [],
      instanceClipboardId: null,
      blockClipboard: [],
      past: [],
      future: [],
    });

    useProjectStore.getState().copySelectedInstance();
    useProjectStore.getState().pasteInstance();

    const next = useProjectStore.getState();
    expect(next.project.instances).toHaveLength(3);
    expect(next.project.connections).toHaveLength(1);
    expect(next.project.instances[2].definitionId).toBe(project.instances[0].definitionId);
    expect(next.project.instances[2].id).not.toBe(project.instances[0].id);
    expect(next.selectedInstanceId).toBe(next.project.instances[2].id);
  });

  it("duplicates selected module blocks with new stable identities", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    const { useProjectStore } = await import("./project-store");
    const project = createDemoProject();
    const source = project.modules[0].blocks[0];
    useProjectStore.setState({
      project,
      view: "module",
      activeInstanceId: project.instances[0].id,
      selectedInstanceId: project.instances[0].id,
      selectedConnectionId: null,
      selectedBlockIds: [source.id],
      instanceClipboardId: null,
      blockClipboard: [],
      past: [],
      future: [],
    });

    useProjectStore.getState().duplicateSelectedBlocks();

    const next = useProjectStore.getState();
    const duplicated = next.project.modules[0].blocks.at(-1);
    expect(next.project.modules[0].blocks).toHaveLength(7);
    expect(duplicated?.id).not.toBe(source.id);
    expect(duplicated?.name).toBe(`${source.name} 副本`);
    expect(next.selectedBlockIds).toEqual([duplicated?.id]);
  });

  it("edits and deletes the selected connection", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    const { useProjectStore } = await import("./project-store");
    const project = createDemoProject();
    useProjectStore.setState({
      project,
      view: "assembly",
      selectedInstanceId: null,
      selectedConnectionId: project.connections[0].id,
      past: [],
      future: [],
    });

    useProjectStore.getState().updateSelectedConnectionType("elevator");
    expect(useProjectStore.getState().project.connections[0].type).toBe("elevator");
    useProjectStore.getState().deleteSelectedConnection();
    expect(useProjectStore.getState().project.connections).toEqual([]);
    expect(useProjectStore.getState().selectedConnectionId).toBeNull();
  });
});
