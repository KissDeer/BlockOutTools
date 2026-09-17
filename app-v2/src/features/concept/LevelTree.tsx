import { useMemo, type ReactNode } from "react";
import { Box, ChevronRight, Layers, Route } from "lucide-react";
import { createEmptyTopology, NODE_ROLES, type LogicScope } from "../../domain/concept";
import { nodeInterior, scopesOf } from "../../domain/concept-scopes";
import { useProjectStore } from "../../store/project-store";

const MAX_TREE_DEPTH = 10;

/** 一个节点内部有什么；层级树每一行都要，所以整棵树一次算完 */
interface InteriorSummary {
  /** 里面已经拼好的体块数（出入口不算体块） */
  bodyCount: number;
  /** 里面还有几个子区域、几条链路 */
  childCount: number;
  linkCount: number;
  /** 子逻辑层（作用域池里的那一份）；还没分过子层就是 null */
  child: LogicScope | null;
  /** 里面是否已经有几何 */
  built: boolean;
}

/**
 * 层级树：**节点清单的唯一出口**。
 *
 * 它同时承担三件事，因为这三件事讲的是同一份东西：
 * 1. 全局有哪些区域、哪些还有内部（嵌套展开）
 * 2. 每个区域做到哪一步了（拼了几个体块 / 里面还有几个子区域）
 * 3. 点一下就跳到能看到它的那一层
 */
export function LevelTree() {
  const project = useProjectStore((state) => state.project);
  const levelPath = useProjectStore((state) => state.levelPath);
  const setLevelPath = useProjectStore((state) => state.setLevelPath);
  const topology = useMemo(() => project.concept ?? createEmptyTopology(), [project.concept]);
  const here = levelPath.join("/");

  /**
   * 每个节点的内部一次算完，避免逐行重复查。
   * 遍历走 `scopesOf`：作用域池里每份作用域都自带一份过期的 `scopes` 副本。
   */
  const interiors = useMemo(() => {
    const map = new Map<string, InteriorSummary>();
    for (const scope of scopesOf(topology)) {
      for (const node of scope.nodes) {
        const interior = nodeInterior(topology, node.id);
        const blocks = interior.blocks ?? [];
        map.set(node.id, {
          bodyCount: blocks.filter((block) => block.type !== "port").length,
          childCount: interior.childCount,
          linkCount: interior.linkCount,
          child: interior.kind === "logic" ? topology.scopes.find((item) => item.id === interior.scopeId) ?? null : null,
          built: blocks.length > 0,
        });
      }
    }
    return map;
  }, [topology]);

  function scopeOf(scopeId: string | null): LogicScope | null {
    if (scopeId === null) return topology;
    return topology.scopes.find((scope) => scope.id === scopeId) ?? null;
  }

  function renderScope(scopeId: string | null, path: string[], depth: number): ReactNode {
    if (depth > MAX_TREE_DEPTH) return null;
    const scope = scopeOf(scopeId);
    if (!scope || scope.nodes.length === 0) return null;
    return scope.nodes.map((node) => {
      const interior = interiors.get(node.id);
      const child = interior?.child ?? null;
      const bodyCount = interior?.bodyCount ?? 0;
      const childPath = [...path, node.id];
      const isHere = childPath.join("/") === here;
      const onPath = here.startsWith(`${childPath.join("/")}/`);
      return (
        <li key={node.id}>
          <button
            type="button"
            className={`level-tree-row${isHere ? " is-here" : ""}${onPath ? " is-ancestor" : ""}`}
            onClick={() => setLevelPath(childPath)}
            title={child ? `里面有 ${interior?.childCount ?? 0} 个区域、${interior?.linkCount ?? 0} 条链路` : bodyCount ? `里面已经拼了 ${bodyCount} 个体块` : "里面还是空的"}
          >
            {child ? <ChevronRight size={12} /> : <Box size={12} />}
            <span>{node.name}</span>
            <small>{NODE_ROLES[node.role]}</small>
            {child ? <em>{interior?.childCount ?? 0}</em> : bodyCount ? <em className="is-built">{bodyCount}</em> : null}
          </button>
          {child && child.nodes.length ? <ul>{renderScope(child.id, childPath, depth + 1)}</ul> : null}
        </li>
      );
    });
  }

  const totalNodes = topology.nodes.length + topology.scopes.reduce((sum, scope) => sum + scope.nodes.length, 0);
  const builtCount = [...interiors.values()].filter((summary) => summary.built).length;

  return (
    <div className="level-tree">
      <button type="button" className={`level-tree-root${here === "" ? " is-here" : ""}`} onClick={() => setLevelPath([])}>
        <Layers size={13} />整图
        <small>{topology.nodes.length} 个区域</small>
      </button>
      <ul className="level-tree-list">{renderScope(null, [], 0)}</ul>
      <p className="level-tree-foot">
        <Route size={12} />共 {totalNodes} 个区域，{builtCount} 个已经搭了几何
      </p>
    </div>
  );
}
