import { CircleAlert } from "lucide-react";
import { validateProject } from "../../domain/validation";
import { useProjectStore } from "../../store/project-store";

export function IssueIndicator() {
  const project = useProjectStore((state) => state.project);
  const issues = validateProject(project);
  return (
    <button type="button" className={`issue-indicator ${issues.length ? "has-errors" : ""}`} title={issues[0]?.message ?? "当前没有白盒规范错误"}>
      <CircleAlert size={15} />
      <span>{issues.length ? `${issues.length} 个问题` : "规范通过"}</span>
    </button>
  );
}
