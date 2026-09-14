import { useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Download, Info, LocateFixed, MoreHorizontal, TriangleAlert, Upload, X } from "lucide-react";
import { decompositionCandidateSchema, summarizeDecomposition, validateDecomposition, validateDecompositionCandidate, type DecompositionIssue } from "../../domain/concept-decomposition";
import { useProjectStore } from "../../store/project-store";
import { conceptSnapshot } from "./concept-snapshot";
import { DecompositionCanvas } from "./DecompositionCanvas";
import { useDecompositionUI } from "./decomposition-ui-store";
import { useCurrentTopology, useRootTopology } from "./use-current-topology";
import "./decomposition-panels.css";

const SEVERITY_ICON = { error: <CircleAlert size={13} />, warning: <TriangleAlert size={13} />, info: <Info size={13} /> } as const;

export function ConceptDecompositionBoard() {
  const topology = useCurrentTopology();
  const rootTopology = useRootTopology();
  const scopeId = useProjectStore((state) => state.conceptScopeId);
  const decomposition = useProjectStore((state) => state.decomposition);
  const setDecomposition = useProjectStore((state) => state.setDecomposition);
  const seedModules = useProjectStore((state) => state.seedModules);
  const setConceptPane = useProjectStore((state) => state.setConceptPane);
  const setSelection = useDecompositionUI((state) => state.setSelection);
  const focusNodes = useDecompositionUI((state) => state.focusNodes);
  const fileRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const [status, setStatus] = useState("");
  const [panel, setPanel] = useState<"checks" | "proposal" | null>(null);
  const issues = useMemo(() => validateDecomposition(topology), [topology]);
  const summary = useMemo(() => summarizeDecomposition(topology), [topology]);
  const unassigned = topology.nodes.filter((node) => !topology.modules.some((module) => module.nodeIds.includes(node.id))).map((node) => node.id);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const blockedReason = !summary.modules ? "请先框选区域，组成至少一个模块" : summary.unassigned ? `还有 ${summary.unassigned} 个区域未分配` : errors ? `请先解决检查结果中的 ${errors} 个错误` : "模块划分已就绪，进入基础构型";
  const canContinue = summary.modules > 0 && summary.unassigned === 0 && errors === 0;
  const candidateIssues = useMemo(() => decomposition ? validateDecompositionCandidate(decomposition, topology) : [], [decomposition, topology]);
  const closeMore = () => { if (moreRef.current) moreRef.current.open = false; };

  async function syncState() {
    closeMore();
    setStatus("正在同步拓扑到本地服务…");
    try {
      const response = await fetch("/api/concept/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conceptSnapshot(rootTopology, scopeId)) });
      const data = await response.json() as { error?: string };
      setStatus(!response.ok || data.error ? `同步失败：${data.error ?? response.status}` : "已同步拓扑，可以在 DSH 里请求拆解提案");
    } catch { setStatus("同步失败：本地服务不可用"); }
  }

  async function pullDecomposition() {
    closeMore();
    setStatus("正在拉取拆解提案…");
    try {
      const response = await fetch("/api/concept/decomposition");
      if (!response.ok) { setStatus(`拉取失败：${response.status}`); return; }
      const data = await response.json() as { candidate: unknown; receivedAt: string };
      if (!data.candidate) { setStatus("本地服务上还没有拆解提案"); return; }
      const parsed = decompositionCandidateSchema.safeParse(data.candidate);
      if (!parsed.success) { setStatus("拆解提案格式不合法"); return; }
      setDecomposition(parsed.data);
      setPanel("proposal");
      setStatus(`已拉取提案（${data.receivedAt}）`);
    } catch { setStatus("拉取失败：本地服务不可用"); }
  }

  async function importFile(file: File) {
    try {
      const parsed = decompositionCandidateSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) { setStatus("拆解提案格式不合法"); return; }
      setDecomposition(parsed.data);
      setPanel("proposal");
      setStatus(`已导入提案：${parsed.data.name}`);
    } catch { setStatus("提案文件读取失败"); }
  }

  function renderIssues(list: DecompositionIssue[]) {
    return list.map((issue) => <div key={issue.id} className={`logic-issue is-${issue.severity}`}>{SEVERITY_ICON[issue.severity]}<span>{issue.message}</span></div>);
  }

  return <div className="decomposition-workspace">
    <input className="sr-only" ref={fileRef} type="file" accept=".json,application/json" onChange={(event) => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importFile(file);
    }} />
    <header className="decomposition-workspace-toolbar">
      <div className="decomposition-workspace-counts"><strong>{summary.modules} 个模块</strong><span className={summary.unassigned ? "is-warn" : ""}>未分配 {summary.unassigned}</span></div>
      <button type="button" className="secondary-command" disabled={!unassigned.length} onClick={() => { setSelection(unassigned); focusNodes(unassigned); }}><LocateFixed size={14} />定位未分配</button>
      <button type="button" className={`secondary-command ${panel === "checks" ? "is-active" : ""}`} aria-expanded={panel === "checks"} onClick={() => setPanel(panel === "checks" ? null : "checks")}><CheckCircle2 size={14} />检查结果{errors ? ` · ${errors}` : ""}</button>
      <span className="decomposition-workspace-next" title={blockedReason}>
        <button type="button" className="primary-command" aria-describedby="decomposition-next-reason" disabled={!canContinue} onClick={() => setConceptPane("configuration")}>进入构型<ArrowRight size={14} /></button>
      </span>
      <details className="decomposition-workspace-more" ref={moreRef}>
        <summary className="secondary-command"><MoreHorizontal size={14} />更多{decomposition ? <i aria-label="有待处理提案" /> : null}</summary>
        <div className="decomposition-workspace-menu">
          <button type="button" onClick={() => { closeMore(); setPanel(panel === "proposal" ? null : "proposal"); }}>拆解提案{decomposition ? " · 待处理" : ""}</button>
          <button type="button" onClick={() => void syncState()}><Upload size={13} />同步拓扑给本地服务</button>
          <button type="button" onClick={() => void pullDecomposition()}><Download size={13} />拉取拆解提案</button>
          <button type="button" onClick={() => { closeMore(); fileRef.current?.click(); }}>从文件导入提案</button>
          <div className="decomposition-workspace-menu-divider" />
          <button type="button" disabled={!topology.nodes.length} onClick={() => { seedModules(); setSelection([]); closeMore(); setStatus("已替换模块划分：每个区域独立成模块。Ctrl+Z 可撤销。"); }}>每个区域独立成模块</button>
          <small>替换当前全部划分，保留区域与连线；可一次撤销。</small>
        </div>
      </details>
    </header>
    <div className="decomposition-workspace-guidance"><span id="decomposition-next-reason">{canContinue ? "框选组成模块 · 拖入 / 拖出调整归属 · Ctrl+Z 撤销" : blockedReason}</span>{status ? <span role="status">{status}</span> : null}</div>
    <div className="decomposition-workspace-body">
      <div className="decomposition-workspace-canvas"><DecompositionCanvas /></div>
      {panel ? <aside className="decomposition-workspace-drawer" aria-label={panel === "checks" ? "拆解检查结果" : "拆解提案"}>
        <header><strong>{panel === "checks" ? "检查结果" : "拆解提案"}</strong><button type="button" className="secondary-command" aria-label="关闭侧栏" onClick={() => setPanel(null)}><X size={14} /></button></header>
        {panel === "checks" ? <>
          <p className="field-help">{summary.assigned} 个区域已分配 · {summary.moduleLinks} 条模块间连接</p>
          {issues.length ? renderIssues(issues) : <p className="field-help">拆解没有发现问题，可以进入构型。</p>}
        </> : decomposition ? <>
          <p className="field-help">{decomposition.name} · {decomposition.proposer.name} v{decomposition.proposer.version}</p>
          {decomposition.warnings.map((warning) => <div key={warning} className="logic-issue is-info"><Info size={13} /><span>{warning}</span></div>)}
          <div className="recognition-items">{decomposition.modules.map((module) => <div key={module.tempId} className="recognition-item"><span><strong>{module.name}</strong><small>{module.nodeIds.length} 区域 · {module.nodeIds.map((id) => topology.nodes.find((node) => node.id === id)?.name ?? "?").join("、")}</small></span></div>)}</div>
          {renderIssues(candidateIssues)}
          <p className="field-help">套用会替换当前全部模块划分，可一次撤销。</p>
          <div className="decomposition-context-actions">
            <button type="button" className="primary-command" disabled={candidateIssues.some((issue) => issue.severity === "error")} onClick={() => { useProjectStore.getState().applyDecompositionCandidate(); setSelection([]); }}>套用拆解</button>
            <button type="button" className="secondary-command" onClick={() => { setDecomposition(null); setStatus(""); }}>丢弃提案</button>
          </div>
        </> : <p className="field-help">还没有提案。可从“更多”同步拓扑、拉取提案或导入 JSON；也可以直接在画布上框选分组。</p>}
      </aside> : null}
    </div>
  </div>;
}
