import { useMemo } from "react";
import { CircleAlert, Flag, Info, KeyRound, LayoutGrid, Plus, TriangleAlert } from "lucide-react";
import { LOGIC_KINDS, type LogicKind } from "../../domain/concept";
import { topologyStats } from "../../domain/concept-commands";
import { summarizeIssues, validateTopology, type ConceptIssue } from "../../domain/concept-validation";
import { useProjectStore } from "../../store/project-store";
import { useCurrentTopology } from "./use-current-topology";

const SEVERITY_ICON = {
  error: <CircleAlert size={13} />,
  warning: <TriangleAlert size={13} />,
  info: <Info size={13} />,
} as const;

/**
 * 拓扑侧栏：只放**工具与检查**。
 * 区域清单不在这里 —— 那是层级树的职责，同一份东西不该有两处出口。
 */
export function ConceptSidebar() {
  const topology = useCurrentTopology();
  const logicKind = useProjectStore((state) => state.logicKind);
  const setLogicKind = useProjectStore((state) => state.setLogicKind);
  const addLogicNode = useProjectStore((state) => state.addLogicNode);
  const autoLayout = useProjectStore((state) => state.autoLayoutLogic);
  const selectNode = useProjectStore((state) => state.setSelectedLogicNode);
  const selectLink = useProjectStore((state) => state.setSelectedLogicLink);

  const issues = useMemo(() => validateTopology(topology), [topology]);
  const summary = useMemo(() => summarizeIssues(issues), [issues]);
  const stats = useMemo(() => topologyStats(topology), [topology]);

  function focusIssue(issue: ConceptIssue) {
    if (issue.linkIds.length) selectLink(issue.linkIds[0]);
    else if (issue.nodeIds.length) selectNode(issue.nodeIds[0]);
  }

  return (
    <div className="sidebar-content">
      <div className="sidebar-actions">
        <button type="button" className="primary-command" onClick={() => addLogicNode()}><Plus size={15} />新增区域</button>
        <button type="button" className="secondary-command" disabled={!topology.nodes.length} onClick={autoLayout}><LayoutGrid size={15} />自动排版</button>
      </div>
      <div className="concept-sidebar-scroll">
        <div className="concept-section-title">新建链路类型</div>
        <div className="logic-kind-grid">{(Object.keys(LOGIC_KINDS) as LogicKind[]).map((kind) => {
          const meta = LOGIC_KINDS[kind];
          return <button type="button" key={kind} className={`logic-kind-chip ${logicKind === kind ? "is-active" : ""}`} onClick={() => setLogicKind(kind)} title={meta.directed ? `${meta.label}（天然单向）` : meta.label}><i style={{ background: meta.color }} />{meta.label}</button>;
        })}</div>

        {/* 区域清单在层级树里；这里只放工具与检查 */}
        {topology.keys.length ? <><div className="concept-section-title">锁钥 <em>{stats.keys}</em></div><div className="logic-key-list">{topology.keys.map((key) => {
          const found = topology.nodes.find((node) => node.id === key.foundAt);
          const unlocks = key.unlocks.map((id) => topology.links.find((link) => link.id === id)?.label).filter(Boolean).join("、");
          return <div key={key.id} className="logic-key-row"><KeyRound size={12} /><span><strong>{key.name}</strong><small>在 {found?.name ?? "?"} 取得</small></span><em>解锁 {unlocks || "—"}</em></div>;
        })}</div></> : null}

        <div className="concept-section-title">逻辑检查{summary.error ? <b className="is-error">{summary.error} 错误</b> : null}{summary.warning ? <b className="is-warning">{summary.warning} 待定</b> : null}{!summary.error && !summary.warning ? <b className="is-ok">通过</b> : null}</div>
        <div className="logic-issue-list">{issues.map((issue) => <button type="button" key={issue.id} className={`logic-issue is-${issue.severity}`} onClick={() => focusIssue(issue)}>{SEVERITY_ICON[issue.severity]}<span>{issue.message}</span></button>)}</div>
      </div>
      <div className="sidebar-footnote"><Flag size={11} /> 画布位置只用于排版；节点内部与整体位置在搭建时确定。</div>
    </div>
  );
}
