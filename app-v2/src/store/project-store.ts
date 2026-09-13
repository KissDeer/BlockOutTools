import { create } from "zustand";
import { addBlock, addConnection, addModule, createModuleForNode, duplicateInstance, removeBlocks, removeConnection, removeInstance, renameProject, setConcept, updateBlock, updateConnection, updateInstanceGraph, updateInstanceTransform, updateModule, updateProjectSettings } from "../domain/commands";
import { addLogicKey, addLogicLink, addLogicNode, autoLayoutTopology, bindNodeModule, nextNodePosition, removeLogicKey, removeLogicLink, removeLogicNode, setStartNode, updateLogicKey, updateLogicLink, updateLogicNode } from "../domain/concept-commands";
import { createEmptyTopology } from "../domain/concept";
import type { LogicKey, LogicKind, LogicLink, LogicNode, LogicTopology } from "../domain/concept";
import { createDemoProject } from "../domain/demo-project";
import { createId } from "../domain/ids";
import { loadDraft, saveDraft } from "../domain/persistence";
import type { Block, BlockoutProject, BlockType, Connection, ConnectionType, ModuleDefinition, Transform, Vec2 } from "../domain/types";

/** concept = 阶段一 构想工作台；build = 阶段二 拼接与转化 */
export type AppStage = "concept" | "build";
export type AppView = "assembly" | "module";
export type TransformMode = "move" | "rotate" | "scale";
export type SaveStatus = "saved" | "saving" | "error";

interface ProjectStore {
  project: BlockoutProject;
  stage: AppStage;
  view: AppView;
  activeInstanceId: string | null;
  activeModuleId: string | null;
  selectedInstanceId: string | null;
  selectedConnectionId: string | null;
  selectedBlockIds: string[];
  selectedLogicNodeId: string | null;
  selectedLogicLinkId: string | null;
  transformMode: TransformMode;
  connectionType: ConnectionType;
  logicKind: LogicKind;
  setLogicKind: (kind: LogicKind) => void;
  previewOpen: boolean;
  previewDirty: boolean;
  previewRevision: number;
  previewProject: BlockoutProject | null;
  saveStatus: SaveStatus;
  past: BlockoutProject[];
  future: BlockoutProject[];
  instanceClipboardId: string | null;
  blockClipboard: Block[];
  setStage: (stage: AppStage) => void;
  setView: (view: AppView) => void;
  openModule: (instanceId: string) => void;
  openModuleById: (moduleId: string) => void;
  setSelectedInstance: (instanceId: string | null) => void;
  setSelectedConnection: (connectionId: string | null) => void;
  setSelectedBlocks: (blockIds: string[]) => void;
  setSelectedLogicNode: (nodeId: string | null) => void;
  setSelectedLogicLink: (linkId: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  setConnectionType: (type: ConnectionType) => void;
  togglePreview: () => void;
  refreshPreview: () => void;
  renameProject: (name: string) => void;
  addModule: (position?: Vec2) => void;
  duplicateSelectedInstance: () => void;
  copySelectedInstance: () => void;
  pasteInstance: () => void;
  deleteSelectedInstance: () => void;
  updateInstanceGraph: (instanceId: string, position: Vec2) => void;
  updateInstanceTransform: (instanceId: string, transform: Transform) => void;
  addBlock: (type: BlockType, position?: [number, number, number]) => void;
  updateBlock: (block: Block) => void;
  deleteSelectedBlocks: () => void;
  copySelectedBlocks: () => void;
  pasteBlocks: () => void;
  duplicateSelectedBlocks: () => void;
  connectPorts: (sourceInstanceId: string, sourcePortId: string, targetInstanceId: string, targetPortId: string) => void;
  updateSelectedConnectionType: (type: ConnectionType) => void;
  updateSelectedConnectionSpacing: (spacing: Connection["spacing"]) => void;
  updateConnectionWaypoints: (connectionId: string, points: Vec2[]) => void;
  updateModule: (module: ModuleDefinition) => void;
  updateSettings: (patch: Partial<Pick<BlockoutProject, "assemblyAnchorInstanceId" | "blockoutProfile">>) => void;
  addLogicNode: (position?: Vec2) => void;
  updateLogicNode: (nodeId: string, patch: Partial<Omit<LogicNode, "id">>) => void;
  removeLogicNode: (nodeId: string) => void;
  addLogicLink: (from: string, to: string, logic: LogicKind) => void;
  updateLogicLink: (linkId: string, patch: Partial<Omit<LogicLink, "id">>) => void;
  removeLogicLink: (linkId: string) => void;
  addLogicKey: (foundAt: string, linkId: string, name?: string) => void;
  updateLogicKey: (keyId: string, patch: Partial<Omit<LogicKey, "id">>) => void;
  removeLogicKey: (keyId: string) => void;
  setLogicStartNode: (nodeId: string | null) => void;
  autoLayoutLogic: () => void;
  bindNodeModule: (nodeId: string, moduleId: string | undefined) => void;
  createModuleForNode: (nodeId: string) => void;
  acceptProject: (project: BlockoutProject) => void;
  deleteSelectedConnection: () => void;
  undo: () => void;
  redo: () => void;
  replaceProject: (project: BlockoutProject) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(project: BlockoutProject, set: (partial: Partial<ProjectStore>) => void): void {
  if (saveTimer) clearTimeout(saveTimer);
  set({ saveStatus: "saving" });
  saveTimer = setTimeout(() => {
    try {
      saveDraft(project);
      set({ saveStatus: "saved" });
    } catch {
      set({ saveStatus: "error" });
    }
  }, 350);
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  const initialProject = loadDraft() ?? createDemoProject();

  function commit(nextProject: BlockoutProject): void {
    const current = get().project;
    if (nextProject === current) return;
    set((state) => ({
      project: nextProject,
      past: [...state.past.slice(-99), current],
      future: [],
      previewDirty: true,
    }));
    scheduleSave(nextProject, set);
  }

  function currentModuleId(): string | null {
    const explicit = get().activeModuleId;
    if (explicit && get().project.modules.some((item) => item.id === explicit)) return explicit;
    const activeId = get().activeInstanceId;
    return get().project.instances.find((item) => item.id === activeId)?.definitionId ?? null;
  }

  function currentTopology(): LogicTopology {
    return get().project.concept ?? createEmptyTopology();
  }

  /** 拓扑改动一律：先算出新拓扑，再整体提交，保证不可变 + 进撤销栈 + 自动保存 */
  function commitTopology(next: LogicTopology): void {
    commit(setConcept(get().project, next));
  }

  return {
    project: initialProject,
    stage: "concept",
    view: "assembly",
    activeInstanceId: null,
    activeModuleId: null,
    selectedInstanceId: initialProject.instances[0]?.id ?? null,
    selectedConnectionId: null,
    selectedBlockIds: [],
    selectedLogicNodeId: initialProject.concept?.nodes[0]?.id ?? null,
    selectedLogicLinkId: null,
    transformMode: "move",
    connectionType: "stairs",
    logicKind: "normal",
    setLogicKind: (logicKind) => set({ logicKind }),
    previewOpen: false,
    previewDirty: true,
    previewRevision: 0,
    previewProject: null,
    saveStatus: "saved",
    past: [],
    future: [],
    instanceClipboardId: null,
    blockClipboard: [],
    setStage: (stage) => set({ stage }),
    setView: (view) => set({ view }),
    openModule: (instanceId) => set((state) => ({ view: "module", activeInstanceId: instanceId, activeModuleId: state.project.instances.find((item) => item.id === instanceId)?.definitionId ?? null, selectedInstanceId: instanceId, selectedConnectionId: null, selectedBlockIds: [] })),
    openModuleById: (moduleId) => set({ stage: "build", view: "module", activeModuleId: moduleId, activeInstanceId: null, selectedConnectionId: null, selectedBlockIds: [] }),
    setSelectedInstance: (selectedInstanceId) => set({ selectedInstanceId, selectedConnectionId: null }),
    setSelectedConnection: (selectedConnectionId) => set({ selectedConnectionId, selectedInstanceId: null }),
    setSelectedBlocks: (selectedBlockIds) => set({ selectedBlockIds }),
    setSelectedLogicNode: (selectedLogicNodeId) => set({ selectedLogicNodeId, selectedLogicLinkId: null }),
    setSelectedLogicLink: (selectedLogicLinkId) => set({ selectedLogicLinkId, selectedLogicNodeId: null }),
    setTransformMode: (transformMode) => set({ transformMode }),
    setConnectionType: (connectionType) => set({ connectionType }),
    togglePreview: () => set((state) => ({ previewOpen: !state.previewOpen })),
    refreshPreview: () => set((state) => ({ previewRevision: state.previewRevision + 1, previewProject: state.project, previewDirty: false, previewOpen: true })),
    renameProject: (name) => commit(renameProject(get().project, name)),
    updateModule: (module) => commit(updateModule(get().project, module)),
    updateSettings: (patch) => commit(updateProjectSettings(get().project, patch)),
    addLogicNode: (position) => {
      const topology = currentTopology();
      const result = addLogicNode(topology, position ?? nextNodePosition(topology));
      commitTopology(result.topology);
      set({ selectedLogicNodeId: result.node.id, selectedLogicLinkId: null });
    },
    updateLogicNode: (nodeId, patch) => commitTopology(updateLogicNode(currentTopology(), nodeId, patch)),
    removeLogicNode: (nodeId) => {
      commitTopology(removeLogicNode(currentTopology(), nodeId));
      set((state) => (state.selectedLogicNodeId === nodeId ? { selectedLogicNodeId: null } : {}));
    },
    addLogicLink: (from, to, logic) => {
      const result = addLogicLink(currentTopology(), from, to, logic);
      if (!result) return;
      commitTopology(result.topology);
      set({ selectedLogicLinkId: result.link.id, selectedLogicNodeId: null });
    },
    updateLogicLink: (linkId, patch) => commitTopology(updateLogicLink(currentTopology(), linkId, patch)),
    removeLogicLink: (linkId) => {
      commitTopology(removeLogicLink(currentTopology(), linkId));
      set((state) => (state.selectedLogicLinkId === linkId ? { selectedLogicLinkId: null } : {}));
    },
    addLogicKey: (foundAt, linkId, name) => {
      const result = addLogicKey(currentTopology(), foundAt, linkId, name);
      if (result) commitTopology(result.topology);
    },
    updateLogicKey: (keyId, patch) => commitTopology(updateLogicKey(currentTopology(), keyId, patch)),
    removeLogicKey: (keyId) => commitTopology(removeLogicKey(currentTopology(), keyId)),
    setLogicStartNode: (nodeId) => commitTopology(setStartNode(currentTopology(), nodeId)),
    autoLayoutLogic: () => commitTopology(autoLayoutTopology(currentTopology())),
    bindNodeModule: (nodeId, moduleId) => commitTopology(bindNodeModule(currentTopology(), nodeId, moduleId)),
    createModuleForNode: (nodeId) => {
      const node = currentTopology().nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const result = createModuleForNode(get().project, nodeId, node.graphPosition);
      if (!result) return;
      commit(result.project);
      set({ activeModuleId: result.module.id, selectedLogicNodeId: nodeId });
    },
    acceptProject: (project) => commit(project),
    addModule: (position) => {
      const result = addModule(get().project, position);
      commit(result.project);
      set({ selectedInstanceId: result.instance.id, selectedConnectionId: null });
    },
    duplicateSelectedInstance: () => {
      const selected = get().selectedInstanceId;
      if (!selected) return;
      const result = duplicateInstance(get().project, selected);
      if (!result.instance) return;
      commit(result.project);
      set({ selectedInstanceId: result.instance.id, selectedConnectionId: null });
    },
    copySelectedInstance: () => {
      const selected = get().selectedInstanceId;
      if (selected && get().project.instances.some((instance) => instance.id === selected)) set({ instanceClipboardId: selected });
    },
    pasteInstance: () => {
      const sourceId = get().instanceClipboardId;
      if (!sourceId) return;
      const result = duplicateInstance(get().project, sourceId);
      if (!result.instance) return;
      commit(result.project);
      set({ selectedInstanceId: result.instance.id, selectedConnectionId: null });
    },
    deleteSelectedInstance: () => {
      const selected = get().selectedInstanceId;
      if (!selected) return;
      commit(removeInstance(get().project, selected));
      set({ selectedInstanceId: null, selectedConnectionId: null });
    },
    updateInstanceGraph: (instanceId, position) => commit(updateInstanceGraph(get().project, instanceId, position)),
    updateInstanceTransform: (instanceId, transform) => commit(updateInstanceTransform(get().project, instanceId, transform)),
    addBlock: (type, position) => {
      const moduleId = currentModuleId();
      if (!moduleId) return;
      const result = addBlock(get().project, moduleId, type, position);
      if (!result.block) return;
      commit(result.project);
      set({ selectedBlockIds: [result.block.id] });
    },
    updateBlock: (block) => {
      const moduleId = currentModuleId();
      if (!moduleId) return;
      commit(updateBlock(get().project, moduleId, block));
    },
    deleteSelectedBlocks: () => {
      const moduleId = currentModuleId();
      const ids = get().selectedBlockIds;
      if (!moduleId || ids.length === 0) return;
      commit(removeBlocks(get().project, moduleId, ids));
      set({ selectedBlockIds: [] });
    },
    copySelectedBlocks: () => {
      const moduleId = currentModuleId();
      const module = get().project.modules.find((item) => item.id === moduleId);
      const ids = new Set(get().selectedBlockIds);
      set({ blockClipboard: module?.blocks.filter((item) => ids.has(item.id)).map((item) => structuredClone(item)) ?? [] });
    },
    pasteBlocks: () => {
      const moduleId = currentModuleId();
      const module = get().project.modules.find((item) => item.id === moduleId);
      const clipboard = get().blockClipboard;
      if (!moduleId || !module || clipboard.length === 0) return;
      let nextProject = get().project;
      const newIds: string[] = [];
      for (const source of clipboard) {
        const copied = structuredClone(source);
        copied.id = createId(source.type === "port" ? "port" : "block");
        copied.name = `${source.name} 副本`;
        copied.transform.position = [source.transform.position[0] + 50, source.transform.position[1] + 50, source.transform.position[2]];
        const result = addBlock(nextProject, moduleId, copied.type, copied.transform.position);
        if (!result.block) continue;
        copied.id = result.block.id;
        nextProject = updateBlock(result.project, moduleId, copied);
        newIds.push(copied.id);
      }
      commit(nextProject);
      set({ selectedBlockIds: newIds });
    },
    duplicateSelectedBlocks: () => {
      const moduleId = currentModuleId();
      const module = get().project.modules.find((item) => item.id === moduleId);
      const ids = new Set(get().selectedBlockIds);
      const selected = module?.blocks.filter((item) => ids.has(item.id)).map((item) => structuredClone(item)) ?? [];
      if (selected.length === 0) return;
      set({ blockClipboard: selected });
      get().pasteBlocks();
    },
    connectPorts: (sourceInstanceId, sourcePortId, targetInstanceId, targetPortId) => {
      const currentProject = get().project;
      const nextProject = addConnection(currentProject, get().connectionType, sourceInstanceId, sourcePortId, targetInstanceId, targetPortId);
      if (nextProject === currentProject) return;
      commit(nextProject);
      set({ selectedConnectionId: nextProject.connections.at(-1)?.id ?? null, selectedInstanceId: null });
    },
    updateSelectedConnectionType: (type) => {
      const selected = get().selectedConnectionId;
      if (!selected) return;
      commit(updateConnection(get().project, selected, { type }));
    },
    updateSelectedConnectionSpacing: (spacing) => {
      const id = get().selectedConnectionId;
      if (id) commit(updateConnection(get().project, id, { spacing }));
    },
    updateConnectionWaypoints: (id, waypoints) => commit(updateConnection(get().project, id, { waypoints })),
    deleteSelectedConnection: () => {
      const selected = get().selectedConnectionId;
      if (!selected) return;
      commit(removeConnection(get().project, selected));
      set({ selectedConnectionId: null });
    },
    undo: () => {
      const state = get();
      const previous = state.past.at(-1);
      if (!previous) return;
      const nodes = new Set(previous.concept?.nodes.map((item) => item.id) ?? []);
      const links = new Set(previous.concept?.links.map((item) => item.id) ?? []);
      set({ project: previous, past: state.past.slice(0, -1), future: [state.project, ...state.future].slice(0, 100), previewDirty: true, selectedConnectionId: null, selectedInstanceId: null, selectedBlockIds: [], selectedLogicNodeId: nodes.has(state.selectedLogicNodeId ?? "") ? state.selectedLogicNodeId : null, selectedLogicLinkId: links.has(state.selectedLogicLinkId ?? "") ? state.selectedLogicLinkId : null, ...(previous.instances.some((item) => item.id === state.activeInstanceId) ? {} : { view: "assembly" as const, activeInstanceId: null }) });
      scheduleSave(previous, set);
    },
    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      const nodes = new Set(next.concept?.nodes.map((item) => item.id) ?? []);
      const links = new Set(next.concept?.links.map((item) => item.id) ?? []);
      set({ project: next, past: [...state.past, state.project].slice(-100), future: state.future.slice(1), previewDirty: true, selectedConnectionId: null, selectedInstanceId: null, selectedBlockIds: [], selectedLogicNodeId: nodes.has(state.selectedLogicNodeId ?? "") ? state.selectedLogicNodeId : null, selectedLogicLinkId: links.has(state.selectedLogicLinkId ?? "") ? state.selectedLogicLinkId : null });
      scheduleSave(next, set);
    },
    replaceProject: (project) => {
      set({ project, stage: "concept", view: "assembly", activeInstanceId: null, activeModuleId: null, selectedInstanceId: project.instances[0]?.id ?? null, selectedConnectionId: null, selectedBlockIds: [], selectedLogicNodeId: project.concept?.nodes[0]?.id ?? null, selectedLogicLinkId: null, past: [], future: [], previewDirty: true, previewProject: null, previewRevision: 0 });
      scheduleSave(project, set);
    },
  };
});
