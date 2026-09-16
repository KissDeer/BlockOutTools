import { useMemo, type ReactNode } from "react";
import { Box, ChevronRight, Layers, Route, Unlink } from "lucide-react";
import { createEmptyTopology, NODE_ROLES, type LogicScope } from "../../domain/concept";
import { nodeInterior } from "../../domain/concept-scopes";
import { nodeInteriorPlan, type NodeInteriorPlan } from "../../domain/module-workflow";
import { useProjectStore } from "../../store/project-store";

const MAX_TREE_DEPTH = 10;

/**
 * 层级树：**节点清单的唯一出口**。
 *
 * 它同时承担三件事，因为这三件事讲的是同一份东西：
 * 1. 全局有哪些区域、哪些还有内部（嵌套展开）
 * 2. 每个区域做到哪一步了（已搭 / 待搭建 / 未归属）
 * 3. 点一下就跳到能看到它的那一层
 */
export function LevelTree() {
  const project = useProjectStore((state) => state.project);
  const levelPath = useProjectStore((state) => state.levelPath);
  const setLevelPath = useProjectStore((state) => state.setLevelPath);
  const topology = useMemo(() => project.concept ?? createEmptyTopology(), [project.concept]);
  const here = levelPath.join("/");

  /** 每个节点的进度一次算完，避免逐行重复展平 */
  const plans = useMemo(() => {
    const map = new Map<string, NodeInteriorPlan>();
    for (const scope of [topology, ...topology.scopes]) {
      for (const node of scope.nodes) map.set(node.id, nodeInteriorPlan(project, node.id));
    }
    return map;
  }, [project, topology]);

  const grouped = useMemo(
    () => new Set([topology, ...topology.scopes].flatMap((scope) => scope.modules.flatMap((group) => group.nodeIds))),
    [topology],
  );

  function scopeOf(scopeId: string | null): LogicScope | null {
    if (scopeId === null) return topology;
    return topology.scopes.find((scope) => scope.id === scopeId) ?? null;
  }

  function renderScope(scopeId: string | null, path: string[], depth: number): ReactNode {
    if (depth > MAX_TREE_DEPTH) return null;
    const scope = scopeOf(scopeId);
    if (!scope || scope.nodes.length === 0) return null;
    return scope.nodes.map((node) => {
      const interior = nodeInterior(topology, node.id);
      const plan = plans.get(node.id);
      const childPath = [...path, node.id];
      const isHere = childPath.join("/") === here;
      const onPath = here.startsWith(`${childPath.join("/")}/`);
      const inside = interior.kind === "logic" ? scopeOf(interior.scopeId) : null;
      const bodyCount = plan?.blocks.filter((block) => block.type !== "port").length ?? 0;
      const ungrouped = !grouped.has(node.id);
      return (
        <li key={node.id}>
          <button
            type="button"
            className={`level-tree-row${isHere ? " is-here" : ""}${onPath ? " is-ancestor" : ""}${ungrouped ? " is-ungrouped" : ""}`}
            onClick={() => setLevelPath(childPath)}
            title={interior.kind === "logic" ? `里面有 ${interior.childCount} 个区域、${interior.linkCount} 条链路` : bodyCount ? `里面已经搭了 ${bodyCount} 个体块` : "里面还是空的"}
          >
            {interior.kind === "logic" ? <ChevronRight size={12} /> : <Box size={12} />}
            <span>{node.name}</span>
            <small>{NODE_ROLES[node.role]}</small>
            {ungrouped ? <em className="is-ungrouped" title="还没有归入模块"><Unlink size={10} /></em> : null}
            {interior.kind === "logic"
              ? <em>{interior.childCount}</em>
              : bodyCount ? <em className="is-built">{bodyCount}</em> : null}
          </button>
          {inside && inside.nodes.length ? <ul>{renderScope(interior.scopeId, childPath, depth + 1)}</ul> : null}
        </li>
      );
    });
  }

  const totalNodes = topology.nodes.length + topology.scopes.reduce((sum, scope) => sum + scope.nodes.length, 0);
  const builtCount = [...plans.values()].filter((plan) => plan.built).length;

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
