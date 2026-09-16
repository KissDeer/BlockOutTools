import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Download, RefreshCw, Sparkles, Upload, X } from "lucide-react";
import { confirmModuleShape, createModuleDraftRequest, createQuickModuleDraft, moduleDraftDiff, moduleDraftSchema, moduleShapeStatus, validateModuleDraft, type ModuleDraft, type ModuleDraftRequest } from "../../domain/module-draft";
import { geometryDigest, resolveModuleContext } from "../../domain/workflow-context";
import type { ModuleContext } from "../../domain/workflow-context";
import { useProjectStore } from "../../store/project-store";
import "./module-draft.css";

const SHAPE_LABELS = { empty: "尚未搭建", unconfirmed: "形态待确认", confirmed: "形态已确认", stale: "变更后待核对" };
const requestSessions = new Map<string, ModuleDraftRequest>();

function ReferenceList({ context }: { context: ModuleContext }) {
  function imageLabel(item: ModuleContext["materials"][number]) {
    if (item.imageData) return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(item.imageData) ? "含原图数据，待 agent 核验" : "原图数据无效";
    return item.kind === "structure" || item.kind === "mood" ? "缺少原图，仅文字" : "文字材料";
  }
  return <details className="draft-reference-list" open>
    <summary>本次参考 · {context.materials.length} 份资料</summary>
    <p>项目目标与约束 · 模块目的与目标 · {context.nodes.length} 个区域 · {context.internalLinks.length} 条内部通路 · {context.externalLinks.length} 个对外要求 · 现有几何</p>
    {context.materials.map((item) => <div key={item.id}><span>{item.name}</span><small>{item.source} · {imageLabel(item)}</small></div>)}
    {!context.materials.length ? <p>尚无图片；可以用拓扑和文字起稿，默认尺度需列为假设。</p> : null}
    {context.warnings.map((warning, index) => <p className="draft-error" key={`${index}:${warning}`}>{warning}</p>)}
    <small>仅显示当前模块相关材料。结构、氛围与目标仍需人工核对。</small>
  </details>;
}

function downloadRequest(request: ModuleDraftRequest) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(request, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `${request.moduleId}-ai-request.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ModuleDraftPanel({ moduleId }: { moduleId: string }) {
  const project = useProjectStore((state) => state.project);
  const pendingDraft = useProjectStore((state) => state.moduleDraft);
  const draft = pendingDraft?.moduleId === moduleId && pendingDraft.projectId === project.projectId ? pendingDraft : null;
  const context = useMemo(() => resolveModuleContext(project, moduleId), [project, moduleId]);
  const shapeStatus = moduleShapeStatus(project, moduleId);
  const errors = useMemo(() => draft ? validateModuleDraft(project, draft) : [], [project, draft]);
  const diff = useMemo(() => draft ? moduleDraftDiff(project, draft) : null, [project, draft]);
  const [expanded, setExpanded] = useState(false);
  const [intent, setIntent] = useState("");
  const [request, setRequest] = useState<ModuleDraftRequest | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const affectedInstances = project.instances.filter((instance) => instance.definitionId === moduleId).length;

  useEffect(() => {
    sequence.current += 1;
    const saved = requestSessions.get(`${project.projectId}:${moduleId}`) ?? null;
    setRequest(saved); setStatus(saved ? "已恢复此模块的请求，可继续读取返回草案；采用前会重新核对当前要求与几何" : "");
    setBusy(false); setConfirmReplace(false); setExpanded(false); setIntent(saved?.intent ?? "");
    return () => { sequence.current += 1; };
  }, [project.projectId, moduleId]);
  useEffect(() => setConfirmReplace(false), [draft]);

  function acceptPreview(candidate: ModuleDraft, expectedRequestId?: string) {
    const state = useProjectStore.getState();
    if (state.project.projectId !== project.projectId || candidate.moduleId !== moduleId) return;
    if (expectedRequestId && candidate.requestId !== expectedRequestId) { setStatus("草案不属于本次请求，请让 agent 使用当前 requestId"); return; }
    const issues = validateModuleDraft(state.project, candidate);
    if (issues.length) { setStatus(`草案不能采用：${issues.join("；")}`); return; }
    state.setModuleDraft(candidate);
    setStatus(candidate.source === "template" ? "规则体块草案已显示，可先查看，再决定采用" : "AI 草案已在当前画布预览，项目尚未改动");
    setExpanded(true);
  }

  async function prepareRequest() {
    const job = ++sequence.current;
    setRequest(null); setBusy(true); setStatus("正在准备本模块材料…");
    try {
      const state = useProjectStore.getState();
      const next = createModuleDraftRequest(state.project, moduleId, intent);
      setRequest(next);
      requestSessions.set(`${state.project.projectId}:${moduleId}`, next);
      if (requestSessions.size > 8) requestSessions.delete(requestSessions.keys().next().value!);
      const response = await fetch("/api/module-drafts/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error(`本地服务返回 ${response.status}`);
      if (job !== sequence.current) return;
      setStatus("材料已准备，等待 agent。本工具不会自动启动模型；可复制任务交给本地 agent，或导出请求文件。");
    } catch (error) {
      if (job !== sequence.current) return;
      setStatus(`准备或同步失败：${error instanceof Error ? error.message : "连接失败"}。已生成的请求可导出交给 agent，也可修正后重试。`);
    } finally { if (job === sequence.current) setBusy(false); }
  }

  async function pullDraft() {
    if (!request) return;
    const job = ++sequence.current;
    setBusy(true); setStatus("正在检查本次请求的返回…");
    try {
      const response = await fetch(`/api/module-drafts/${encodeURIComponent(request.requestId)}`);
      if (!response.ok) throw new Error(`本地服务返回 ${response.status}`);
      const result = await response.json() as { candidate?: unknown };
      if (job !== sequence.current) return;
      if (!result.candidate) { setStatus("材料已准备，等待 agent；本次请求还没有返回草案"); return; }
      const parsed = moduleDraftSchema.safeParse(result.candidate);
      if (!parsed.success) { setStatus(`返回格式无效：${parsed.error.issues[0]?.message ?? "缺少草案字段"}`); return; }
      acceptPreview(parsed.data, request.requestId);
    } catch (error) { if (job === sequence.current) setStatus(`读取失败：${error instanceof Error ? error.message : "连接失败"}，可以重试`); }
    finally { if (job === sequence.current) setBusy(false); }
  }

  async function importDraft(file: File) {
    if (!request) { setStatus("请先准备本模块请求，再导入该请求生成的草案"); return; }
    const job = ++sequence.current;
    try {
      const parsed = moduleDraftSchema.safeParse(JSON.parse(await file.text()));
      if (job !== sequence.current) return;
      if (!parsed.success) { setStatus(`草案格式无效：${parsed.error.issues[0]?.message ?? "无法识别"}`); return; }
      acceptPreview(parsed.data, request.requestId);
    } catch { if (job === sequence.current) setStatus("无法读取草案，请使用有效的 JSON 文件"); }
  }

  async function copyTask() {
    if (!request) return;
    const origin = window.location.origin;
    const task = `为 BlockOutTools 的模块“${context.moduleName}”制作局部布局草案。\n读取 ${origin}/api/module-drafts/${encodeURIComponent(request.requestId)} 中的 request，实际查看 context.materials 中 imageData 可读取的图片。图片不可读时列出限制，不得声称已经参考。遵守 context 中成员、内部链路、单向和锁钥语义、外部接口要求。仅生成本模块局部厘米坐标，不修改逻辑拓扑或模块归属。\n输出 ModuleDraft JSON：{version:1,requestId,projectId,moduleId,contextDigest,geometryDigest,source:"agent",blocks,assumptions:[]}。前六项身份和摘要必须沿用 request；blocks 遵循项目 Block 类型，provenance 使用当前区域或链路 ID。说明尺度和方位假设；不要自动采用。将草案 POST 到 ${origin}/api/module-drafts/${encodeURIComponent(request.requestId)}/result，或提供 JSON 文件供导入。\n本次补充：${request.intent || "无"}`;
    try { await navigator.clipboard.writeText(task); setStatus("任务已复制，可发送给本地 agent；完成后点击“读取返回草案”"); }
    catch { setStatus("剪贴板不可用，请导出请求文件交给 agent"); }
  }

  function applyDraft() {
    if (!draft || errors.length) return;
    if (diff && diff.existingBlocks > 0 && !confirmReplace) { setConfirmReplace(true); return; }
    const issues = useProjectStore.getState().applyModuleDraft();
    setStatus(issues.length ? issues.join("；") : "草案已采用，可继续手工调整；一次撤销可恢复原模块");
    if (!issues.length) setConfirmReplace(false);
  }

  function confirmShape() {
    const state = useProjectStore.getState();
    try { state.acceptProject(confirmModuleShape(state.project, moduleId)); setStatus("形态已确认；相关要求或几何变化后会提示重新核对"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "暂不能确认形态"); }
  }

  return <section className="module-draft-panel" aria-label="模块初始化与形态状态">
    <header className="module-draft-toolbar">
      <button type="button" className="secondary-command" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><Sparkles size={14} />AI 初始化参考<ChevronDown size={12} /></button>
      <button type="button" className="secondary-command" disabled={Boolean(draft) || busy} onClick={() => { try { acceptPreview(createQuickModuleDraft(useProjectStore.getState().project, moduleId)); } catch (error) { setStatus(error instanceof Error ? error.message : "无法创建体块草案"); setExpanded(true); } }}>快速体块起稿</button>
      <span className={`module-shape-status shape-${shapeStatus}`}>{SHAPE_LABELS[shapeStatus]}</span>
      <button type="button" className="draft-confirm-shape" disabled={Boolean(draft) || shapeStatus === "empty" || shapeStatus === "confirmed"} onClick={confirmShape}><Check size={13} />标记形态已确认</button>
    </header>
    {expanded || draft ? <div className="module-draft-body">
      {draft ? <div className="draft-preview-summary">
        <strong>{draft.source === "agent" ? "AI 草案" : "快速体块草案"} · 预览中，尚未写入</strong>
        {diff ? <p>新增 {diff.added} · 修改 {diff.changed} · 移除 {diff.removed} 个体块；移除 {diff.removedConnections} 条实际对接；影响 {affectedInstances} 个已放置实例。</p> : null}
        {draft.assumptions.length ? <ul>{draft.assumptions.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul> : null}
        {errors.length ? <p className="draft-error" role="alert">草案已过期或不满足要求：{errors.join("；")}。请取消后重新准备。</p> : null}
        {confirmReplace ? <p className="draft-replace-warning">将替换当前模块的 {diff?.existingBlocks ?? 0} 个体块。未被保留的积木会移除，受影响的实际对接按上方差异处理。资料与拓扑保持原样。</p> : null}
        <div className="draft-actions"><button type="button" className="primary-command" disabled={errors.length > 0} onClick={applyDraft}>{confirmReplace ? "确认替换当前模块" : "采用草案"}</button><button type="button" className="secondary-command" onClick={() => { useProjectStore.getState().setModuleDraft(null); setConfirmReplace(false); setStatus("已取消预览，原模块未改动"); }}><X size={13} />取消预览</button></div>
      </div> : <div className="draft-request-layout">
        <div><label className="draft-intent-label">本次补充意图<textarea rows={2} aria-label="AI 初始化补充意图" value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="例如：围绕中央挑空组织回环，保留向屋顶的单向出口" /></label><div className="draft-actions"><button type="button" className="primary-command" disabled={busy} onClick={() => void prepareRequest()}><Upload size={13} />{request ? "重新准备材料" : "准备本模块材料"}</button>{request ? <><button type="button" className="secondary-command" onClick={() => void copyTask()}>复制 agent 任务</button><button type="button" className="secondary-command" onClick={() => downloadRequest(request)}><Download size={13} />导出请求</button><button type="button" className="secondary-command" disabled={busy} onClick={() => void pullDraft()}><RefreshCw size={13} />读取返回草案</button><button type="button" className="secondary-command" disabled={busy} onClick={() => fileRef.current?.click()}>导入草案</button></> : null}</div></div>
        <ReferenceList context={request?.context ?? context} />
      </div>}
      {request && (request.contextDigest !== context.contextDigest || request.geometryDigest !== geometryDigest(project, moduleId)) ? <p className="draft-error">请求发出后，本模块的拓扑、参考要求或几何已变化。请重新准备材料，旧返回不会覆盖当前模块。</p> : null}
      {status ? <p className="draft-status" role="status">{status}</p> : null}
      <input ref={fileRef} type="file" className="sr-only" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importDraft(file); }} />
    </div> : status ? <p className="draft-status is-compact" role="status">{status}</p> : null}
  </section>;
}
