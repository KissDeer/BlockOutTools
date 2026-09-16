import { useState } from "react";
import { ChevronDown, ChevronUp, Pin } from "lucide-react";
import { useProjectStore } from "../../store/project-store";
import { MaterialManager } from "./MaterialManager";
import "./context.css";

export function ProjectContextBar() {
  const project = useProjectStore((state) => state.project);
  const [expanded, setExpanded] = useState(false);
  const context = project.designContext;
  const scopes = project.concept ? [project.concept, ...project.concept.scopes] : [];
  const ungrouped = scopes.reduce((count, scope) => {
    const members = new Set(scope.modules.flatMap((module) => module.nodeIds));
    return count + scope.nodes.filter((node) => !members.has(node.id)).length;
  }, 0);

  function save(field: "goal" | "constraints", value: string) {
    const state = useProjectStore.getState();
    const current = state.project.designContext ?? { goal: "", constraints: "", materials: [] };
    if (current[field] === value) return;
    state.acceptProject({ ...state.project, designContext: { ...current, [field]: value }, updatedAt: new Date().toISOString() });
  }

  return <section className={`project-context-bar ${expanded ? "is-expanded" : ""}`} aria-label="项目目标与约束">
    <button className="project-context-summary" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      <Pin size={14} /><strong>项目提醒</strong>
      <span className="project-context-goal">{context?.goal.trim() || "补充项目体验目标，让各阶段有据可循"}</span>
      <span className="project-context-constraint">{context?.constraints.trim() ? `约束：${context.constraints.split("\n")[0]}` : "尚未设置关键约束"}</span>
      {ungrouped > 0 ? <span className="context-count">{ungrouped} 个区域待归属</span> : null}
      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </button>
    {expanded ? <div className="project-context-details" key={project.projectId}>
      <label>项目体验目标<textarea key={`goal:${context?.goal ?? ""}`} aria-label="项目体验目标" rows={2} defaultValue={context?.goal ?? ""} placeholder="例如：围绕地标探索，逐步打开回环捷径" onBlur={(event) => save("goal", event.target.value)} /></label>
      <label>置顶硬约束<textarea key={`constraints:${context?.constraints ?? ""}`} aria-label="项目关键约束" rows={2} defaultValue={context?.constraints ?? ""} placeholder="通用尺度、不可改变的玩法要求，每行一条" onBlur={(event) => save("constraints", event.target.value)} /></label>
      <MaterialManager key={`materials:${project.projectId}`} moduleId={null} />
    </div> : null}
  </section>;
}
