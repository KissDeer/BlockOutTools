import { useMemo } from "react";
import { createEmptyTopology, type LogicTopology } from "../../domain/concept";
import { scopeView } from "../../domain/concept-scopes";
import { useProjectStore } from "../../store/project-store";

/**
 * 当前正在编辑的作用域（根或子作用域）。
 * 所有概念层组件都从这里取拓扑，作用域切换时不需要各自处理。
 */
export function useCurrentTopology(): LogicTopology {
  const concept = useProjectStore((state) => state.project.concept);
  const scopeId = useProjectStore((state) => state.conceptScopeId);
  return useMemo(() => scopeView(concept ?? createEmptyTopology(), scopeId), [concept, scopeId]);
}

/** 根拓扑：做全树统计（指纹、层级、展平）时用它 */
export function useRootTopology(): LogicTopology {
  const concept = useProjectStore((state) => state.project.concept);
  return useMemo(() => concept ?? createEmptyTopology(), [concept]);
}
