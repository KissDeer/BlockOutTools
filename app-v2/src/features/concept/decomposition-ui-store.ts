import { create } from "zustand";
import { useProjectStore } from "../../store/project-store";

interface DecompositionUI {
  selectedNodeIds: string[];
  selectedModuleId: string | null;
  selectionScope: string | null;
  focusNodeIds: string[];
  focusRevision: number;
  collapsedModuleIds: string[];
  toggleCollapsed: (moduleId: string) => void;
  setSelection: (nodeIds: string[], moduleId?: string | null) => void;
  focusNodes: (ids: string[]) => void;
  reset: (scopeKey: string) => void;
}

/** Selection and viewport requests are transient; grouping lives only in the project. */
export const useDecompositionUI = create<DecompositionUI>((set, get) => ({
  selectedNodeIds: [], selectedModuleId: null, selectionScope: null, collapsedModuleIds: [],
  focusNodeIds: [], focusRevision: 0,
  setSelection: (nodeIds, moduleId = null) => {
    const ids = [...new Set(nodeIds)];
    if (get().selectedModuleId === moduleId && ids.length === get().selectedNodeIds.length && ids.every((id, index) => id === get().selectedNodeIds[index])) {
      if (ids.length || moduleId) useProjectStore.getState().setSelectedLogicNode(ids.length === 1 ? ids[0] : null);
      return;
    }
    set({ selectedNodeIds: ids, selectedModuleId: moduleId });
    useProjectStore.getState().setSelectedLogicNode(ids.length === 1 ? ids[0] : null);
  },
  toggleCollapsed: (moduleId) => set((state) => ({ collapsedModuleIds: state.collapsedModuleIds.includes(moduleId)
    ? state.collapsedModuleIds.filter((id) => id !== moduleId) : [...state.collapsedModuleIds, moduleId] })),
  focusNodes: (ids) => set({ focusNodeIds: ids, focusRevision: get().focusRevision + 1 }),
  reset: (scopeKey) => {
    if (get().selectionScope === scopeKey) return;
    set({ selectionScope: scopeKey, selectedNodeIds: [], selectedModuleId: null, focusNodeIds: [], collapsedModuleIds: [] });
  },
}));
