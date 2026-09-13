import { useMemo } from "react";
import { CircleAlert, CornerDownRight, Info, Layers, Maximize2, Minimize2, Trash2, TriangleAlert } from "lucide-react";
import { deriveModuleLinks, summarizeDecomposition, validateDecomposition } from "../../domain/concept-decomposition";
import { useProjectStore } from "../../store/project-store";
import { moduleColor } from "./module-colors";
import { useCurrentTopology } from "./use-current-topology";

const SEVERITY_ICON = { error: <CircleAlert size={13} />, warning: <TriangleAlert size={13} />, info: <Info size={13} /> } as const;

export function ConceptDecompositionInspector() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();
  const decomposition = useProjectStore((state) => state.decomposition);
  const updateLogicModule = useProjectStore((state) => state.updateLogicModule);
  const removeLogicModule = useProjectStore((state) => state.removeLogicModule);
  const expandLogicModule = useProjectStore((state) => state.expandLogicModule);
  const collapseLogicModule = useProjectStore((state) => state.collapseLogicModule);
  const setConceptScope = useProjectStore((state) => state.setConceptScope);
  const setNodeModule = useProjectStore((state) => state.setNodeModule);

  const issues = useMemo(() => validateDecomposition(topology), [topology]);
  const summary = useMemo(() => summarizeDecomposition(topology), [topology]);
  const moduleLinks = useMemo(() => deriveModuleLinks(topology), [topology]);
  const errors = issues.filter((issue) => issue.severity === "error").length;

  return (
    <div className="inspector-content">
      <header className="inspector-heading">
        <span>横向拆解</span>
        <strong>{summary.modules} 个模块 · {summary.assigned} 个区域</strong>
        <small>模块间连接由拓扑链路推导，不单独存储</small>
      </header>

      <section className="inspector-section">
        <h3>规模</h3>
        <dl className="summary-list">
          <div><dt>模块</dt><dd>{summary.modules}</dd></div>
          <div><dt>已分配区域</dt><dd>{summary.assigned}</dd></div>
          <div><dt>未分配</dt><dd>{summary.unassigned}</dd></div>
          <div><dt>模块间连接</dt><dd>{summary.moduleLinks}</dd></div>
          <div><dt>模块内部链路</dt><dd>{summary.internal}</dd></div>
        </dl>
      </section>

      <section className="inspector-section">
        <h3><Layers size={13} /> 交付门</h3>
        {errors === 0 && summary.modules > 0
          ? <p className="field-help" style={{ marginTop: 0 }}>没有拦住交付的错误。</p>
          : errors > 0
            ? <p className="field-help" style={{ marginTop: 0 }}>还有 {errors} 个错误必须先解决。</p>
            : <p className="field-help" style={{ marginTop: 0 }}>还没有做横向拆解。</p>}
        {issues.map((issue) => (
          <div key={issue.id} className={`logic-issue is-${issue.severity}`}>
            {SEVERITY_ICON[issue.severity]}
            <span>{issue.message}</span>
          </div>
        ))}
      </section>

      {topology.modules.length ? (
        <section className="inspector-section">
          <h3>模块</h3>
          {topology.modules.map((module, index) => (
            <div key={module.id} className="module-row">
              <i style={{ background: moduleColor(index) }} />
              <input
                value={module.name}
                aria-label="模块名称"
                onChange={(event) => updateLogicModule(module.id, { name: event.target.value })}
              />
              <small>{module.nodeIds.length} 区域{module.childScopeId ? " · 已展开" : ""}</small>
              {module.childScopeId ? (
                <button type="button" title="进入这个子作用域" onClick={() => setConceptScope(module.childScopeId as string)}>
                  <CornerDownRight size={13} />
                </button>
              ) : null}
              <button
                type="button"
                title={module.childScopeId ? "收起：解除子作用域引用（作用域本身保留，可能还有别的模块在复用）" : "展开为子作用域：这个模块内部还有一层"}
                onClick={() => (module.childScopeId ? collapseLogicModule(module.id) : expandLogicModule(module.id))}
              >
                {module.childScopeId ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button
                type="button"
                title="解散这个模块（区域本身保留）"
                onClick={() => { for (const nodeId of module.nodeIds) setNodeModule(nodeId, null); removeLogicModule(module.id); }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {moduleLinks.length ? (
        <section className="inspector-section">
          <h3>模块间连接</h3>
          {moduleLinks.map((link) => (
            <div key={link.linkId} className="logic-link-row">
              <span>
                <strong>{link.label}</strong>{" "}
                {topology.modules.find((module) => module.id === link.fromModuleId)?.name} → {topology.modules.find((module) => module.id === link.toModuleId)?.name}
              </span>
              <em>{link.traversal === "both" ? "" : "单向"}{link.requiresKeyName ? ` 🔑${link.requiresKeyName}` : ""}</em>
            </div>
          ))}
        </section>
      ) : null}

      {decomposition ? (
        <section className="inspector-section">
          <h3>待确认提案</h3>
          <dl className="summary-list">
            <div><dt>名称</dt><dd>{decomposition.name}</dd></div>
            <div><dt>提出方</dt><dd>{decomposition.proposer.name} v{decomposition.proposer.version}</dd></div>
            <div><dt>模块数</dt><dd>{decomposition.modules.length}</dd></div>
          </dl>
          <p className="field-help">套用会整体替换现有划分，并且是一次可撤销事务。</p>
        </section>
      ) : null}
    </div>
  );
}
