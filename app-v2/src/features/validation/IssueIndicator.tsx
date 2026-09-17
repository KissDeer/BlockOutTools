import { CircleAlert } from "lucide-react";
import { validateProject } from "../../domain/validation";
import { useProjectStore } from "../../store/project-store";
import { useState } from "react";
import { NumberField } from "../../components/NumberField";
import type { BlockoutProfile } from "../../domain/types";

export function IssueIndicator() {
  const project = useProjectStore((state) => state.project);
  const issues = validateProject(project);
  const [open, setOpen] = useState(false);
  const updateSettings = useProjectStore((state) => state.updateSettings);
  const enterNode = useProjectStore((state) => state.enterNode);
  const labels: Record<Exclude<keyof BlockoutProfile, "enabled" | "enforceUeImport">, string> = { capsuleRadius: "胶囊半径", capsuleHalfHeight: "胶囊半高", maxStepHeight: "最大跨步高度", minDoorWidth: "最小门宽", minDoorHeight: "最小门高", maxStairRise: "最大楼梯踢面", minStairTread: "最小楼梯踏步" };
  return <>
    <button type="button" onClick={() => setOpen(!open)} className={`issue-indicator ${issues.length ? "has-errors" : ""}`} title={issues[0]?.message ?? "打开规范与诊断"}>
      <CircleAlert size={15} />
      <span>{!project.blockoutProfile.enabled ? "规范已关闭" : issues.length ? `${issues.length} 个问题` : "规范检查"}</span>
    </button>
    {open ? <section className="utility-panel" role="dialog" aria-label="规范与诊断">
      <header><strong>规范与诊断</strong><button onClick={() => setOpen(false)}>关闭</button></header>
      <label><input type="checkbox" checked={project.blockoutProfile.enabled} onChange={(event) => updateSettings({ blockoutProfile: { ...project.blockoutProfile, enabled: event.target.checked } })} />启用规范检查</label>
      {Object.entries(labels).map(([key, label]) => <NumberField key={key} label={label} min={1} value={project.blockoutProfile[key as keyof typeof labels]} onCommit={(value) => updateSettings({ blockoutProfile: { ...project.blockoutProfile, [key]: value } })} />)}
      <p className="field-help">支撑检查仅针对明确标注为楼板、落脚平台的 Box；未标注用途的积木不猜测用途。检查覆盖端点支撑与局部净空，不等于 UE 全路线可走性测试。</p>
      {/* 顺序不能反：进入节点会重算层级并清空选中，先选积木就会被清掉 */}
      {issues.map((issue) => <button className="library-item" key={issue.id} onClick={() => { enterNode(issue.nodeId); useProjectStore.getState().setSelectedBlocks([issue.blockId]); useProjectStore.setState({ previewOpen: false }); setOpen(false); }}>{issue.severity === "error" ? "错误" : "待核实"} · {issue.message}</button>)}
    </section> : null}
  </>;
}
