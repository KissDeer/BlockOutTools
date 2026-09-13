import { useMemo, useRef, useState } from "react";
import { CircleAlert, Download, Info, Layers, RefreshCw, TriangleAlert, Upload, Wand2 } from "lucide-react";
import { computeTopologyDigest, createEmptyTopology } from "../../domain/concept";
import { decompositionCandidateSchema, deriveModuleLinks, summarizeDecomposition, validateDecomposition, validateDecompositionCandidate, type DecompositionIssue } from "../../domain/concept-decomposition";
import { useProjectStore } from "../../store/project-store";
import { moduleColor } from "./module-colors";

const SEVERITY_ICON = { error: <CircleAlert size={13} />, warning: <TriangleAlert size={13} />, info: <Info size={13} /> } as const;

export function ConceptDecompositionBoard() {
  const project = useProjectStore((state) => state.project);
  const topology = project.concept ?? createEmptyTopology();
  const decomposition = useProjectStore((state) => state.decomposition);
  const setDecomposition = useProjectStore((state) => state.setDecomposition);
  const seedModules = useProjectStore((state) => state.seedModules);
  const setNodeModule = useProjectStore((state) => state.setNodeModule);
  const selectNode = useProjectStore((state) => state.setSelectedLogicNode);
  const setConceptPane = useProjectStore((state) => state.setConceptPane);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  const issues = useMemo(() => validateDecomposition(topology), [topology]);
  const summary = useMemo(() => summarizeDecomposition(topology), [topology]);
  const moduleLinks = useMemo(() => deriveModuleLinks(topology), [topology]);
  const candidateIssues = useMemo(() => (decomposition ? validateDecompositionCandidate(decomposition, topology) : []), [decomposition, topology]);
  const candidateBlocked = candidateIssues.some((issue) => issue.severity === "error");

  function snapshot() {
    const keyName = (id: string | null) => (id ? topology.keys.find((key) => key.id === id)?.name ?? null : null);
    return {
      inputsDigest: topology.inputs.digest,
      topologyDigest: computeTopologyDigest(topology),
      startNodeId: topology.startNodeId,
      nodes: topology.nodes.map((node) => ({ id: node.id, name: node.name, role: node.role, floor: node.floor, relativePosition: node.relativePosition, elevation: node.elevation, moduleId: node.moduleId ?? null })),
      links: topology.links.map((link) => ({ id: link.id, label: link.label, from: link.from, to: link.to, logic: link.logic, traversal: link.traversal, requiresKeyName: keyName(link.requires), note: link.note })),
      keys: topology.keys.map((key) => ({ id: key.id, name: key.name, foundAt: key.foundAt, unlocks: key.unlocks })),
      modules: topology.modules.map((module, index) => ({ id: module.id, name: module.name, nodeIds: module.nodeIds, note: module.note, color: moduleColor(index) })),
      moduleLinks: moduleLinks.map((link) => ({ label: link.label, fromModuleId: link.fromModuleId, toModuleId: link.toModuleId, logic: link.logic, traversal: link.traversal, requiresKeyName: link.requiresKeyName })),
      unassigned: topology.nodes.filter((node) => !topology.modules.some((module) => module.nodeIds.includes(node.id))).map((node) => node.id),
    };
  }

  async function syncState() {
    setStatus("正在同步拓扑到本地服务…");
    try {
      const response = await fetch("/api/concept/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot()) });
      const data = (await response.json()) as { error?: string };
      setStatus(data.error ? `同步失败：${data.error}` : "已同步拓扑，可以在 DSH 里让我给拆解提案");
    } catch {
      setStatus("同步失败：本地服务不可用");
    }
  }

  async function pullDecomposition() {
    setStatus("正在拉取拆解提案…");
    try {
      const response = await fetch("/api/concept/decomposition");
      const data = (await response.json()) as { candidate: unknown; receivedAt: string };
      if (!data.candidate) { setStatus("本地服务上还没有拆解提案"); return; }
      const parsed = decompositionCandidateSchema.safeParse(data.candidate);
      if (!parsed.success) { setStatus("拆解提案格式不合法"); return; }
      setDecomposition(parsed.data);
      setStatus(`已拉取提案（${data.receivedAt}）`);
    } catch {
      setStatus("拉取失败：本地服务不可用");
    }
  }

  async function importFile(file: File) {
    try {
      const parsed = decompositionCandidateSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) { setStatus("拆解提案格式不合法"); return; }
      setDecomposition(parsed.data);
      setStatus(`已导入提案：${parsed.data.name}`);
    } catch {
      setStatus("提案文件读取失败");
    }
  }

  function renderIssues(list: DecompositionIssue[]) {
    return list.map((issue) => (
      <div key={issue.id} className={`logic-issue is-${issue.severity}`}>
        {SEVERITY_ICON[issue.severity]}
        <span>{issue.message}</span>
      </div>
    ));
  }

  const moduleName = (id: string) => topology.modules.find((module) => module.id === id)?.name ?? "?";

  return (
    <div className="decomposition-board">
      <input
        className="sr-only"
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void importFile(file);
        }}
      />

      <header className="recognition-bar">
        <button type="button" className="secondary-command" onClick={() => void syncState()}><Upload size={14} />同步拓扑给本地服务</button>
        <button type="button" className="secondary-command" onClick={() => void pullDecomposition()}><Download size={14} />拉取拆解提案</button>
        <button type="button" className="secondary-command" onClick={() => fileRef.current?.click()}><RefreshCw size={14} />从文件导入</button>
        <button type="button" className="secondary-command" disabled={topology.nodes.length === 0} onClick={seedModules}><Wand2 size={14} />按区域生成模块</button>
        {status ? <span className="recognition-status">{status}</span> : null}
      </header>

      <div className="decomposition-body">
        <section className="decomposition-main">
          <div className="decomposition-summary">
            <div><span>模块</span><strong>{summary.modules}</strong></div>
            <div><span>已分配区域</span><strong>{summary.assigned}</strong></div>
            <div className={summary.unassigned ? "is-warn" : ""}><span>未分配</span><strong>{summary.unassigned}</strong></div>
            <div><span>模块间连接</span><strong>{summary.moduleLinks}</strong></div>
            <div><span>模块内部链路</span><strong>{summary.internal}</strong></div>
          </div>

          <div className="decomposition-issues">
            {issues.length === 0 ? <p className="field-help">拆解没有发现问题。</p> : renderIssues(issues)}
          </div>

          {summary.modules === 0 ? (
            <div className="empty-workspace concept-empty" style={{ height: "auto", padding: 32 }}>
              <h3><Layers size={16} />还没有模块划分</h3>
              <p>
                先「同步拓扑给本地服务」，然后在 DSH 里让我按连通性、楼层与设计意图给拆解提案；<br />
                也可以先点「按区域生成模块」得到一个一对一的合法起点，再手工合并。
              </p>
            </div>
          ) : (
            <div className="module-cards">
              {topology.modules.map((module, index) => {
                const color = moduleColor(index);
                const external = moduleLinks.filter((link) => link.fromModuleId === module.id || link.toModuleId === module.id);
                const nodes = module.nodeIds.map((nodeId) => topology.nodes.find((node) => node.id === nodeId)).filter(Boolean);
                return (
                  <article key={module.id} className="module-card" style={{ borderTopColor: color }}>
                    <header>
                      <i style={{ background: color }} />
                      <strong>{module.name}</strong>
                      <span>{nodes.length} 区域</span>
                    </header>
                    <div className="module-card-nodes">
                      {nodes.length === 0 ? <em>空模块</em> : nodes.map((node) => (
                        <button key={node?.id} type="button" onClick={() => { selectNode(node?.id ?? null); setConceptPane("topology"); }}>
                          {node?.name}
                        </button>
                      ))}
                    </div>
                    <footer>
                      对外 {external.length} 条
                      {external.length ? <> · {external.map((link) => `${link.label}→${link.fromModuleId === module.id ? moduleName(link.toModuleId) : moduleName(link.fromModuleId)}`).join("、")}</> : null}
                    </footer>
                  </article>
                );
              })}
            </div>
          )}

          {summary.unassigned > 0 ? (
            <section className="unassigned-pool">
              <h4><CircleAlert size={13} />未分配区域 {summary.unassigned}</h4>
              <div className="module-card-nodes">
                {topology.nodes.filter((node) => !topology.modules.some((module) => module.nodeIds.includes(node.id))).map((node) => (
                  <span key={node.id} className="unassigned-chip">
                    {node.name}
                    <select value="" onChange={(event) => { if (event.target.value) setNodeModule(node.id, event.target.value); }}>
                      <option value="">移入…</option>
                      {topology.modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                    </select>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <aside className="recognition-list">
          <div className="recognition-list-head">
            <strong>拆解提案</strong>
            {decomposition ? <span>{decomposition.proposer.name} v{decomposition.proposer.version}</span> : null}
          </div>
          {decomposition ? (
            <>
              <p className="field-help">{decomposition.name}</p>
              {decomposition.warnings.map((warning) => <div key={warning} className="logic-issue is-info"><span>{warning}</span></div>)}
              <div className="recognition-items">
                {decomposition.modules.map((module) => (
                  <div key={module.tempId} className="recognition-item">
                    <span>
                      <strong>{module.name}</strong>
                      <small>
                        {module.nodeIds.length} 区域 ·{" "}
                        {module.nodeIds.map((id) => topology.nodes.find((node) => node.id === id)?.name ?? "?").join("、")}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              <div className="recognition-warnings">{renderIssues(candidateIssues)}</div>
              <div className="recognition-actions">
                <button type="button" className="primary-command" disabled={candidateBlocked} onClick={() => useProjectStore.getState().applyDecompositionCandidate()}>
                  套用拆解
                </button>
                <button type="button" className="secondary-command" onClick={() => { setDecomposition(null); setStatus(""); }}>丢弃提案</button>
              </div>
            </>
          ) : (
            <p className="field-help" style={{ marginTop: 0 }}>
              还没有提案。同步拓扑后让我读一遍，会给出「哪些区域合成一个模块」以及模块之间的连接；
              规则会兜底检查未分配、跨层、孤岛与模块图不连通。
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
