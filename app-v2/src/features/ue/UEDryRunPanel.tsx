import { Download, X } from "lucide-react";
import { buildLocalUEDryRun } from "../../domain/ue-plan";
import { downloadJson } from "../../domain/persistence";
import { useProjectStore } from "../../store/project-store";
import { IconButton } from "../../components/IconButton";

/** 导出文件名：项目名去壳 + 固定后缀，UE 侧脚本按这个约定找文件 */
function planFilename(projectName: string): string {
  return `${projectName.replace(/[\\/:*?"<>|]+/g, "-") || "blockout-project"}.blockout.actors.json`;
}

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
        <div className="toolbar-group">
          <button type="button" className="secondary-command" onClick={() => downloadJson(plan, planFilename(project.name))}><Download size={15} />导出 Actor 计划</button>
          <IconButton label="关闭 UE 计划" onClick={onClose}><X size={17} /></IconButton>
        </div>
      </header>
      <div className="ue-plan-summary">
        <div><strong>{plan.actorCount}</strong><span>Blueprint Actor</span></div>
        <div><strong>{plan.unplaced.length}</strong><span>未落位区域</span></div>
      </div>
      {plan.unplaced.length ? <p className="workflow-notice" role="status">这些区域还没有落位，被按原点处理，会叠在一起：{plan.unplaced.join("、")}。在检查器的「落位与朝向」里给它们填上位置再导出。</p> : null}
      <div className="ue-plan-list">
        {plan.actors.map((actor) => (
          <article key={actor.syncKey}>
            <div><strong>{actor.label}</strong><span>{actor.blockType}</span></div>
            <code>{actor.syncKey}</code>
            <small>X {actor.location[0]} · Y {actor.location[1]} · Z {actor.location[2]}</small>
          </article>
        ))}
      </div>
      <footer className="panel-note">
        位置来自展平的节点几何；本面板不执行 Apply。
        导出的 JSON 交给 <code>scripts/ue_unreal_spawn.py</code> 在编辑器里建 Actor。
        端口对接检查随模块层一起删掉了，这里不再报这一项。
      </footer>
    </aside>
  );
}
