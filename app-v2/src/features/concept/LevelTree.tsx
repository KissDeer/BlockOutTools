import { useMemo, type ReactNode } from "react";
import { Box, ChevronRight, Layers, Route } from "lucide-react";
import { createEmptyTopology, NODE_ROLES, type LogicScope } from "../../domain/concept";
import { nodeInterior } from "../../domain/concept-scopes";
import { useProjectStore } from "../../store/project-store";

const MAX_TREE_DEPTH = 10;

/**
 * 层级树常驻侧边：一张画布只显示当前一层，这棵树负责"全局有哪些东西、哪些已经做了内部"。
 * 点任意一行 = 跳到能看到它的那一层。
 */
export function LevelTree() {
  const concept = useProjectStore((state) => state.project.concept);
  const levelPath = useProjectStore((state) => state.levelPath);
  const setLevelPath = useProjectStore((state) => state.setLevelPath);
  const topology = useMemo(() => concept ?? createEmptyTopology(), [concept]);
  const here = levelPath.join("/");

  function scopeOf(scopeId: string | null): LogicScope | null {
    if (scopeId === null) return topology;
    return topology.scopes.find((scope) => scope.id === scopeId) ?? null;
  }

  /** 递归画一层：节点 + 有内部就把内部嵌进来 */
  function renderScope(scopeId: string | null, path: string[], depth: number): ReactNode {
    if (depth > MAX_TREE_DEPTH) return null;
    const scope = scopeOf(scopeId);
    if (!scope || scope.nodes.length === 0) return null;
    return scope.nodes.map((node) => {
      const interior = nodeInterior(topology, node.id);
      const childPath = [...path, node.id];
      const isHere = childPath.join("/") === here;
      const onPath = here.startsWith(`${childPath.join("/")}/`);
      const inside = interior.kind === "logic" ? scopeOf(interior.scopeId) : null;
      return (
        <li key={node.id}>
          <button
            type="button"
            className={`level-tree-row${isHere ? " is-here" : ""}${onPath ? " is-ancestor" : ""}`}
            onClick={() => setLevelPath(childPath)}
            title={interior.kind === "logic" ? `里面有 ${interior.childCount} 个区域、${interior.linkCount} 条链路` : "里面是几何"}
          >
            {interior.kind === "logic" ? <ChevronRight size={12} /> : <Box size={12} />}
            <span>{node.name}</span>
            <small>{NODE_ROLES[node.role]}</small>
            {interior.kind === "logic" ? <em>{interior.childCount}</em> : null}
          </button>
          {inside && inside.nodes.length ? <ul>{renderScope(interior.scopeId, childPath, depth + 1)}</ul> : null}
        </li>
      );
    });
  }

  const totalNodes = topology.nodes.length + topology.scopes.reduce((sum, scope) => sum + scope.nodes.length, 0);
  const builtCount = countBuilt(topology);

  return (
    <div className="level-tree">
      <button type="button" className={`level-tree-root${here === "" ? " is-here" : ""}`} onClick={() => setLevelPath([])}>
        <Layers size={13} />整图
        <small>{topology.nodes.length} 个区域</small>
      </button>
      <ul className="level-tree-list">{renderScope(null, [], 0)}</ul>
      <p className="level-tree-foot">
        <Route size={12} />共 {totalNodes} 个区域，{builtCount} 个已经有内部
      </p>
    </div>
  );
}

/** 有多少区域已经做过内部（有子作用域，或者已经拼了几何） */
function countBuilt(topology: ReturnType<typeof createEmptyTopology>): number {
  const scopes = [topology, ...topology.scopes];
  return scopes.reduce((sum, scope) => sum + scope.nodes.filter((node) => {
    const interior = nodeInterior(topology, node.id);
    if (interior.kind === "logic") return true;
    const group = scope.modules.find((item) => item.nodeIds.includes(node.id));
    return Boolean(group?.moduleDefinitionId);
  }).length, 0);
}
