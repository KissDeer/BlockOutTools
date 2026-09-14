import { useMemo } from "react";
import { CircleAlert, Flag, Info, KeyRound, LayoutGrid, Link2, Plus, TriangleAlert } from "lucide-react";
import { LOGIC_KINDS, NODE_ROLES, type LogicKind } from "../../domain/concept";
import { topologyStats } from "../../domain/concept-commands";
import { summarizeIssues, validateTopology, type ConceptIssue } from "../../domain/concept-validation";
import { useProjectStore } from "../../store/project-store";
import { scopeCrumbs } from "../../domain/concept-scopes";
import { useCurrentTopology, useRootTopology } from "./use-current-topology";
import { useDecompositionUI } from "./decomposition-ui-store";

const SEVERITY_ICON = {
  error: <CircleAlert size={13} />,
  warning: <TriangleAlert size={13} />,
  info: <Info size={13} />,
} as const;

export function ConceptSidebar() {
  const project = useProjectStore((state) => state.project);
  const conceptPane = useProjectStore((state) => state.conceptPane);
  const isDecomposition = conceptPane === "decomposition";
  const decompositionSelection = useDecompositionUI((state) => state.selectedNodeIds);
  const setDecompositionSelection = useDecompositionUI((state) => state.setSelection);
  const focusNodes = useDecompositionUI((state) => state.focusNodes);
  const topology = useCurrentTopology();
  const logicKind = useProjectStore((state) => state.logicKind);
  const setLogicKind = useProjectStore((state) => state.setLogicKind);
  const addLogicNode = useProjectStore((state) => state.addLogicNode);
  const autoLayout = useProjectStore((state) => state.autoLayoutLogic);
  const selectedNodeId = useProjectStore((state) => state.selectedLogicNodeId);
  const selectNode = useProjectStore((state) => state.setSelectedLogicNode);
  const selectLink = useProjectStore((state) => state.setSelectedLogicLink);
  const scopeId = useProjectStore((state) => state.conceptScopeId);
  const setConceptScope = useProjectStore((state) => state.setConceptScope);
  const rootTopology = useRootTopology();
  const crumbs = useMemo(() => scopeCrumbs(rootTopology, scopeId), [rootTopology, scopeId]);

  const issues = useMemo(() => validateTopology(topology), [topology]);
  const summary = useMemo(() => summarizeIssues(issues), [issues]);
  const stats = useMemo(() => topologyStats(topology), [topology]);

  function focusIssue(issue: ConceptIssue) {
    if (issue.linkIds.length) selectLink(issue.linkIds[0]);
    else if (issue.nodeIds.length) selectNode(issue.nodeIds[0]);
  }

  return (
    <div className="sidebar-content">
      <div className="scope-bar" aria-label="作用域路径">
        <button type="button" className={scopeId ? "" : "is-current"} onClick={() => setConceptScope(null)}>根</button>
        {crumbs.map((step) => (
          <span key={step.scopeId} className="scope-step">
            <i>›</i>
            <button type="button" className={step.scopeId === scopeId ? "is-current" : ""} onClick={() => setConceptScope(step.scopeId)}>{step.scopeName}</button>
          </span>
        ))}
        {scopeId ? <em>{stats.nodes} 区域 · {topology.modules.length} 模块</em> : null}
      </div>
      <div className="sidebar-heading">
        <div><span>{isDecomposition ? "模块划分 · 区域" : "逻辑拓扑"}</span><strong>{stats.nodes}</strong></div>
        <Link2 size={16} />
      </div>
      {!isDecomposition ? <div className="sidebar-actions">
        <button type="button" className="primary-command" onClick={() => addLogicNode()}>
          <Plus size={15} />新增区域
        </button>
        <button type="button" className="secondary-command" disabled={!topology.nodes.length} onClick={autoLayout}>
          <LayoutGrid size={15} />自动排版
        </button>
      </div> : null}

      <div className="concept-sidebar-scroll">
        {!isDecomposition ? <><div className="concept-section-title">新建链路类型</div>
        <div className="logic-kind-grid">
          {(Object.keys(LOGIC_KINDS) as LogicKind[]).map((kind) => {
            const meta = LOGIC_KINDS[kind];
            return (
              <button
                type="button"
                key={kind}
                className={`logic-kind-chip ${logicKind === kind ? "is-active" : ""}`}
                onClick={() => setLogicKind(kind)}
                title={meta.directed ? `${meta.label}（天然单向）` : meta.label}
              >
                <i style={{ background: meta.color }} />
                {meta.label}
              </button>
            );
          })}
        </div></> : null}

        <div className="concept-section-title">区域 <em>{stats.nodes}</em></div>
        <div className="module-definition-list" style={{ overflow: "visible" }}>
          {topology.nodes.length === 0 ? <div className="sidebar-footnote" style={{ borderTop: 0 }}>还没有区域</div> : null}
          {topology.nodes.map((node) => {
            const module = project.modules.find((item) => item.id === node.moduleId);
            const group = topology.modules.find((item) => item.nodeIds.includes(node.id));
            const isStart = topology.startNodeId === node.id;
            return (
              <button
                type="button"
                key={node.id}
                className={(isDecomposition ? decompositionSelection.includes(node.id) : selectedNodeId === node.id) ? "is-selected" : ""}
                onClick={(event) => {
                  if (!isDecomposition) { selectNode(node.id); return; }
                  const ids = event.ctrlKey || event.metaKey ? decompositionSelection.includes(node.id) ? decompositionSelection.filter((id) => id !== node.id) : [...decompositionSelection, node.id] : [node.id];
                  setDecompositionSelection(ids);
                  focusNodes(ids);
                }}
              >
                <span>
                  <strong>{node.name}</strong>
                  <small>{NODE_ROLES[node.role]} · F{node.floor}</small>
                </span>
                <em>
                  {isStart ? "起点 · " : ""}
                  {isDecomposition ? group?.name ?? "未分配" : module ? `已绑定 · ${module.blocks.length} 积木` : "未绑定模块"}
                </em>
              </button>
            );
          })}
        </div>

        {!isDecomposition && topology.keys.length > 0 ? (
          <>
            <div className="concept-section-title">锁钥 <em>{stats.keys}</em></div>
            <div className="logic-key-list">
              {topology.keys.map((key) => {
                const found = topology.nodes.find((node) => node.id === key.foundAt);
                const unlocks = key.unlocks.map((id) => topology.links.find((link) => link.id === id)?.label).filter(Boolean).join("、");
                return (
                  <div key={key.id} className="logic-key-row">
                    <KeyRound size={12} />
                    <span><strong>{key.name}</strong><small>在 {found?.name ?? "?"} 取得</small></span>
                    <em>解锁 {unlocks || "—"}</em>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {!isDecomposition ? <><div className="concept-section-title">
          校验
          {summary.error ? <b className="is-error">{summary.error} 错误</b> : null}
          {summary.warning ? <b className="is-warning">{summary.warning} 待定</b> : null}
          {!summary.error && !summary.warning ? <b className="is-ok">通过</b> : null}
        </div>
        <div className="logic-issue-list">
          {issues.map((issue) => (
            <button type="button" key={issue.id} className={`logic-issue is-${issue.severity}`} onClick={() => focusIssue(issue)}>
              {SEVERITY_ICON[issue.severity]}
              <span>{issue.message}</span>
            </button>
          ))}
        </div></> : null}
      </div>

      <div className="sidebar-footnote"><Flag size={11} /> 逻辑图位置只用于排版，不参与 3D、UE 或任何几何计算。</div>
    </div>
  );
}
