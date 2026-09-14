import { create } from "zustand";

interface DecompositionUI {
  selectedNodeIds: string[];
  selectedModuleId: string | null;
  selectionScope: string | null;
  focusNodeIds: string[];
  focusRevision: number;
  setSelection: (nodeIds: string[], moduleId?: string | null) => void;
  focusNodes: (ids: string[]) => void;
  reset: (scopeKey: string) => void;
}

/** Selection and viewport requests are transient; grouping lives only in the project. */
export const useDecompositionUI = create<DecompositionUI>((set, get) => ({
  selectedNodeIds: [], selectedModuleId: null, selectionScope: null,
  focusNodeIds: [], focusRevision: 0,
  setSelection: (nodeIds, moduleId = null) => set({ selectedNodeIds: [...new Set(nodeIds)], selectedModuleId: moduleId }),
  focusNodes: (ids) => set({ focusNodeIds: ids, focusRevision: get().focusRevision + 1 }),
  reset: (scopeKey) => {
    if (get().selectionScope === scopeKey) return;
    set({ selectionScope: scopeKey, selectedNodeIds: [], selectedModuleId: null, focusNodeIds: [] });
  },
}));
