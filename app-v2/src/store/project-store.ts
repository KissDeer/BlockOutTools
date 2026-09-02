import { create } from "zustand";
import { addBlock, addConnection, addModule, duplicateInstance, removeBlocks, removeConnection, removeInstance, renameProject, updateBlock, updateConnection, updateInstanceGraph, updateInstanceTransform } from "../domain/commands";
import { createDemoProject } from "../domain/demo-project";
import { createId } from "../domain/ids";
import { loadDraft, saveDraft } from "../domain/persistence";
import type { Block, BlockoutProject, BlockType, ConnectionType, Transform, Vec2 } from "../domain/types";

export type AppView = "assembly" | "module";
export type TransformMode = "move" | "rotate" | "scale";
export type SaveStatus = "saved" | "saving" | "error";

interface ProjectStore {
  project: BlockoutProject;
  view: AppView;
  activeInstanceId: string | null;
  selectedInstanceId: string | null;
  selectedConnectionId: string | null;
  selectedBlockIds: string[];
  transformMode: TransformMode;
  connectionType: ConnectionType;
  previewOpen: boolean;
  previewDirty: boolean;
  previewRevision: number;
  saveStatus: SaveStatus;
  past: BlockoutProject[];
  future: BlockoutProject[];
  instanceClipboardId: string | null;
  blockClipboard: Block[];
  setView: (view: AppView) => void;
  openModule: (instanceId: string) => void;
  setSelectedInstance: (instanceId: string | null) => void;
  setSelectedConnection: (connectionId: string | null) => void;
  setSelectedBlocks: (blockIds: string[]) => void;
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

  function activeModuleId(): string | null {
    const activeId = get().activeInstanceId;
    return get().project.instances.find((item) => item.id === activeId)?.definitionId ?? null;
  }

  return {
    project: initialProject,
    view: "assembly",
    activeInstanceId: null,
    selectedInstanceId: initialProject.instances[0]?.id ?? null,
    selectedConnectionId: null,
    selectedBlockIds: [],
    transformMode: "move",
    connectionType: "stairs",
    previewOpen: false,
    previewDirty: true,
    previewRevision: 0,
    saveStatus: "saved",
    past: [],
    future: [],
    instanceClipboardId: null,
    blockClipboard: [],
    setView: (view) => set({ view }),
    openModule: (instanceId) => set({ view: "module", activeInstanceId: instanceId, selectedInstanceId: instanceId, selectedBlockIds: [] }),
    setSelectedInstance: (selectedInstanceId) => set({ selectedInstanceId, selectedConnectionId: null }),
    setSelectedConnection: (selectedConnectionId) => set({ selectedConnectionId, selectedInstanceId: null }),
    setSelectedBlocks: (selectedBlockIds) => set({ selectedBlockIds }),
    setTransformMode: (transformMode) => set({ transformMode }),
    setConnectionType: (connectionType) => set({ connectionType }),
    togglePreview: () => set((state) => ({ previewOpen: !state.previewOpen })),
    refreshPreview: () => set((state) => ({ previewRevision: state.previewRevision + 1, previewDirty: false, previewOpen: true })),
    renameProject: (name) => commit(renameProject(get().project, name)),
    addModule: (position) => {
      const result = addModule(get().project, position);
      commit(result.project);
      set({ selectedInstanceId: result.instance.id });
    },
    duplicateSelectedInstance: () => {
      const selected = get().selectedInstanceId;
      if (!selected) return;
      const result = duplicateInstance(get().project, selected);
      if (!result.instance) return;
      commit(result.project);
      set({ selectedInstanceId: result.instance.id });
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
      set({ selectedInstanceId: result.instance.id });
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
      const moduleId = activeModuleId();
      if (!moduleId) return;
      const result = addBlock(get().project, moduleId, type, position);
      if (!result.block) return;
      commit(result.project);
      set({ selectedBlockIds: [result.block.id] });
    },
    updateBlock: (block) => {
      const moduleId = activeModuleId();
      if (!moduleId) return;
      commit(updateBlock(get().project, moduleId, block));
    },
    deleteSelectedBlocks: () => {
      const moduleId = activeModuleId();
      const ids = get().selectedBlockIds;
      if (!moduleId || ids.length === 0) return;
      commit(removeBlocks(get().project, moduleId, ids));
      set({ selectedBlockIds: [] });
    },
    copySelectedBlocks: () => {
      const moduleId = activeModuleId();
      const module = get().project.modules.find((item) => item.id === moduleId);
      const ids = new Set(get().selectedBlockIds);
      set({ blockClipboard: module?.blocks.filter((item) => ids.has(item.id)).map((item) => structuredClone(item)) ?? [] });
    },
    pasteBlocks: () => {
      const moduleId = activeModuleId();
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
      const moduleId = activeModuleId();
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
      set({ project: previous, past: state.past.slice(0, -1), future: [state.project, ...state.future].slice(0, 100), previewDirty: true });
      scheduleSave(previous, set);
    },
    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      set({ project: next, past: [...state.past, state.project].slice(-100), future: state.future.slice(1), previewDirty: true });
      scheduleSave(next, set);
    },
    replaceProject: (project) => {
      set({ project, view: "assembly", activeInstanceId: null, selectedInstanceId: project.instances[0]?.id ?? null, selectedConnectionId: null, selectedBlockIds: [], past: [], future: [], previewDirty: true });
      scheduleSave(project, set);
    },
  };
});
