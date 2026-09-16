import { useMemo } from "react";
import { CircleAlert, Flag, Info, KeyRound, LayoutGrid, Link2, Plus, TriangleAlert } from "lucide-react";
import { LOGIC_KINDS, NODE_ROLES, type LogicKind, type LogicNode } from "../../domain/concept";
import { topologyStats } from "../../domain/concept-commands";
import { summarizeIssues, validateTopology, type ConceptIssue } from "../../domain/concept-validation";
import { useProjectStore } from "../../store/project-store";
import { scopeCrumbs } from "../../domain/concept-scopes";
import { useCurrentTopology, useRootTopology } from "./use-current-topology";
import { useDecompositionUI } from "./decomposition-ui-store";
import { moduleColor } from "./module-colors";

const SEVERITY_ICON = { error: <CircleAlert size={13} />, warning: <TriangleAlert size={13} />, info: <Info size={13} /> } as const;

export function ConceptSidebar() {
  const project = useProjectStore((state) => state.project);
  const selectedNodeIds = useDecompositionUI((state) => state.selectedNodeIds);
  const selectedModuleId = useDecompositionUI((state) => state.selectedModuleId);
  const setSelection = useDecompositionUI((state) => state.setSelection);
  const focusNodes = useDecompositionUI((state) => state.focusNodes);
  const topology = useCurrentTopology();
  const logicKind = useProjectStore((state) => state.logicKind);
  const setLogicKind = useProjectStore((state) => state.setLogicKind);
  const addLogicNode = useProjectStore((state) => state.addLogicNode);
  const autoLayout = useProjectStore((state) => state.autoLayoutLogic);
  const selectLink = useProjectStore((state) => state.setSelectedLogicLink);
  const openModule = useProjectStore((state) => state.openLogicModule);
  const scopeId = useProjectStore((state) => state.conceptScopeId);
  const setConceptScope = useProjectStore((state) => state.setConceptScope);
  const rootTopology = useRootTopology();
  const crumbs = useMemo(() => scopeCrumbs(rootTopology, scopeId), [rootTopology, scopeId]);
  const issues = useMemo(() => validateTopology(topology), [topology]);
  const summary = useMemo(() => summarizeIssues(issues), [issues]);
  const stats = useMemo(() => topologyStats(topology), [topology]);
  const ungrouped = topology.nodes.filter((node) => !topology.modules.some((module) => module.nodeIds.includes(node.id)));

  function focusIssue(issue: ConceptIssue) {
    if (issue.linkIds.length) { setSelection([]); selectLink(issue.linkIds[0]); }
    else if (issue.nodeIds.length) setSelection([issue.nodeIds[0]]);
    focusNodes(issue.nodeIds);
  }

  function regionRow(node: LogicNode) {
    return <button type="button" key={node.id} className={selectedNodeIds.includes(node.id) ? "is-selected" : ""} onClick={(event) => {
      const ids = event.ctrlKey || event.metaKey
        ? selectedNodeIds.includes(node.id) ? selectedNodeIds.filter((id) => id !== node.id) : [...selectedNodeIds, node.id]
        : [node.id];
      setSelection(ids); focusNodes(ids);
    }}>
      <span><strong>{node.name}</strong><small>{NODE_ROLES[node.role]} · F{node.floor}</small></span>
      {topology.startNodeId === node.id ? <em>起点</em> : null}
    </button>;
  }

  return <div className="sidebar-content">
    <div className="scope-bar" aria-label="作用域路径">
      <button type="button" className={scopeId ? "" : "is-current"} onClick={() => setConceptScope(null)}>根</button>
      {crumbs.map((step) => <span key={step.scopeId} className="scope-step"><i>›</i><button type="button" className={step.scopeId === scopeId ? "is-current" : ""} onClick={() => setConceptScope(step.scopeId)}>{step.scopeName}</button></span>)}
    </div>
    <div className="sidebar-heading"><div><span>逻辑拓扑</span><strong>{stats.nodes}</strong></div><Link2 size={16} /></div>
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
      <div className="concept-section-title">模块 <em>{topology.modules.length}</em></div>
      <div className="module-definition-list" style={{ overflow: "visible" }}>
        {!topology.modules.length ? <p className="sidebar-footnote" style={{ borderTop: 0 }}>在画布上框选区域，点“组成模块”即可开始搭建。</p> : null}
        {topology.modules.map((module, index) => {
          const definition = project.modules.find((item) => item.id === module.moduleDefinitionId);
          return <div key={module.id} className="topology-module-entry">
            <button type="button" className={selectedModuleId === module.id ? "is-selected" : ""} onClick={() => { setSelection([], module.id); focusNodes([`frame:${module.id}`]); }}>
              <span><strong><i style={{ background: moduleColor(index) }} />{module.name}</strong><small>{module.nodeIds.length} 区域 · {definition?.blocks.length ? `${definition.blocks.length} 积木` : "待搭建"}</small></span>
            </button>
            <button type="button" className="topology-build-button" onClick={() => { setSelection([], module.id); openModule(module.id); }} title={`搭建${module.name}`}>搭建</button>
          </div>;
        })}
      </div>
      <div className="concept-section-title">未归属区域 <em>{ungrouped.length}</em></div>
      <div className="module-definition-list" style={{ overflow: "visible" }}>{ungrouped.map(regionRow)}</div>
      {!ungrouped.length ? <p className="field-help">所有区域已归入模块。</p> : <p className="field-help">框选成组，或拖入已有模块。</p>}
      <details className="topology-all-regions"><summary>全部区域 · {stats.nodes}</summary><div className="module-definition-list" style={{ overflow: "visible" }}>{topology.nodes.map(regionRow)}</div></details>
      {topology.keys.length ? <><div className="concept-section-title">锁钥 <em>{stats.keys}</em></div><div className="logic-key-list">{topology.keys.map((key) => {
        const found = topology.nodes.find((node) => node.id === key.foundAt);
        const unlocks = key.unlocks.map((id) => topology.links.find((link) => link.id === id)?.label).filter(Boolean).join("、");
        return <div key={key.id} className="logic-key-row"><KeyRound size={12} /><span><strong>{key.name}</strong><small>在 {found?.name ?? "?"} 取得</small></span><em>解锁 {unlocks || "—"}</em></div>;
      })}</div></> : null}
      <div className="concept-section-title">逻辑检查{summary.error ? <b className="is-error">{summary.error} 错误</b> : null}{summary.warning ? <b className="is-warning">{summary.warning} 待定</b> : null}{!summary.error && !summary.warning ? <b className="is-ok">通过</b> : null}</div>
      <div className="logic-issue-list">{issues.map((issue) => <button type="button" key={issue.id} className={`logic-issue is-${issue.severity}`} onClick={() => focusIssue(issue)}>{SEVERITY_ICON[issue.severity]}<span>{issue.message}</span></button>)}</div>
    </div>
    <div className="sidebar-footnote"><Flag size={11} /> 画布位置只用于排版；模块内部与整体位置在搭建时确定。</div>
  </div>;
}
