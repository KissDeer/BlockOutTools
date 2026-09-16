import { ConceptInspector } from "./ConceptInspector";
import { ConceptDecompositionInspector } from "./ConceptDecompositionInspector";
import { useDecompositionUI } from "./decomposition-ui-store";

export function UnifiedTopologyInspector() {
  const count = useDecompositionUI((state) => state.selectedNodeIds.length);
  const selectedModuleId = useDecompositionUI((state) => state.selectedModuleId);
  return count > 1 || selectedModuleId ? <ConceptDecompositionInspector /> : <ConceptInspector />;
}
