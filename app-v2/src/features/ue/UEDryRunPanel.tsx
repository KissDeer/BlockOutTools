import { X } from "lucide-react";
import { buildLocalUEDryRun } from "../../domain/ue-plan";
import { useProjectStore } from "../../store/project-store";
import { IconButton } from "../../components/IconButton";

export function UEDryRunPanel({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((state) => state.project);
  const plan = buildLocalUEDryRun(project);

  return (
    <aside className="ue-plan-panel" aria-label="本地 UE 计划">
      <header className="panel-header">
        <div>
          <strong>UE 计划</strong>
          <span>本地 dry-run · 未连接 UE</span>
        </div>
        <IconButton label="关闭 UE 计划" onClick={onClose}><X size={17} /></IconButton>
      </header>
      <div className="ue-plan-summary">
        <div><strong>{plan.actorCount}</strong><span>Blueprint Actor</span></div>
        <div><strong>{project.instances.length}</strong><span>模块实例</span></div>
        <div><strong>{plan.assemblyIssues.length}</strong><span>端口残差</span></div>
      </div>
      <div className="ue-plan-list">
        {plan.actors.map((actor) => (
          <article key={actor.syncKey}>
            <div><strong>{actor.label}</strong><span>{actor.blockType}</span></div>
            <code>{actor.syncKey}</code>
            <small>X {actor.location[0]} · Y {actor.location[1]} · Z {actor.location[2]}</small>
          </article>
        ))}
      </div>
      <footer className="panel-note">Actor Transform 已按端口连接求解；本面板不执行 Apply。</footer>
    </aside>
  );
}
