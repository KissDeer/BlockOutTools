import { useMemo } from "react";
import { ChevronRight, CornerDownRight, Layers } from "lucide-react";
import { createEmptyTopology } from "../../domain/concept";
import { resolveLevel } from "../../domain/concept-scopes";
import { useProjectStore } from "../../store/project-store";

/**
 * 层级面包屑：取代原来的两个顶层页签。
 * 进入节点是画布换焦点，不是换界面；这里是"我在哪一层"的唯一说明。
 */
export function LevelBreadcrumb() {
  const concept = useProjectStore((state) => state.project.concept);
  const levelPath = useProjectStore((state) => state.levelPath);
  const setLevelPath = useProjectStore((state) => state.setLevelPath);
  const level = useMemo(() => resolveLevel(concept ?? createEmptyTopology(), levelPath), [concept, levelPath]);

  return (
    <nav className="level-breadcrumb" aria-label="当前位置">
      <button type="button" className={level.steps.length === 0 ? "is-current" : ""} onClick={() => setLevelPath([])}>
        <Layers size={14} />整图
      </button>
      {level.steps.map((step, index) => {
        const isLast = index === level.steps.length - 1;
        return (
          <span key={step.nodeId} className="level-step">
            <ChevronRight size={13} />
            <button
              type="button"
              className={isLast ? "is-current" : ""}
              title={step.kind === "logic" ? "这一层里面还有逻辑" : "这一层里面是几何"}
              onClick={() => setLevelPath(level.steps.slice(0, index + 1).map((item) => item.nodeId))}
            >
              {step.kind === "geometry" ? <CornerDownRight size={13} /> : null}
              {step.nodeName}
            </button>
          </span>
        );
      })}
      {level.brokenAt !== null ? <em className="level-broken">这一层已被改动，已退回</em> : null}
    </nav>
  );
}
