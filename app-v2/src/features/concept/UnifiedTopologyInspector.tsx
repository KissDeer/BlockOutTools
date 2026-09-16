import { ConceptInspector } from "./ConceptInspector";

/**
 * 拓扑检查器。
 *
 * 原来按"选了几个区域 / 选了哪个模块"分流到拆解检查器；
 * 拆解已从主流程撤下，这里直接就是区域 / 连线检查器。
 */
export function UnifiedTopologyInspector() {
  return <ConceptInspector />;
}
