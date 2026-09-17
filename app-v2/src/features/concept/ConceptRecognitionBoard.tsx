import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Download, ImageOff, ImagePlus, RefreshCw, Upload } from "lucide-react";
import { LOGIC_KINDS } from "../../domain/concept";
import { recognitionCandidateSchema, summarizeCandidate, validateCandidate, type RecognitionCandidate } from "../../domain/concept-candidate";
import { useProjectStore } from "../../store/project-store";
import { useCurrentTopology } from "./use-current-topology";

const IMAGE_FIELD_KIND = "logic-topology" as const;

export function ConceptRecognitionBoard() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();
  const candidate = useProjectStore((state) => state.candidate);
  const excluded = useProjectStore((state) => state.candidateExcluded);
  const selectedNodeId = useProjectStore((state) => state.selectedCandidateNodeId);
  const setCandidate = useProjectStore((state) => state.setCandidate);
  const selectCandidateNode = useProjectStore((state) => state.setSelectedCandidateNode);
  const updateCandidateNode = useProjectStore((state) => state.updateCandidateNode);
  const addLogicInput = useProjectStore((state) => state.addLogicInput);

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ width: 900, height: 620 });
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [candidate]);

  const scopeMap = useMemo(() => {
    const byId = candidate?.scopeMapInputId ? topology.inputs.items.find((item) => item.id === candidate.scopeMapInputId) : null;
    return byId ?? topology.inputs.items.find((item) => item.kind === "scope-map") ?? null;
  }, [candidate?.scopeMapInputId, topology.inputs.items]);

  const issues = useMemo(() => (candidate ? validateCandidate(candidate, topology) : []), [candidate, topology]);
  const summary = useMemo(() => (candidate ? summarizeCandidate(candidate) : null), [candidate]);
  const blocked = issues.some((issue) => issue.severity === "error");

  const imageWidth = scopeMap?.pixelSize?.[0] ?? 0;
  const imageHeight = scopeMap?.pixelSize?.[1] ?? 0;
  const scale = imageWidth && imageHeight
    ? Math.min((size.width - 32) / imageWidth, (size.height - 32) / imageHeight, 1)
    : 1;

  async function syncInputs() {
    setStatus("正在同步输入到本地服务…");
    try {
      const response = await fetch("/api/concept/inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest: topology.inputs.digest, revision: topology.inputs.revision, items: topology.inputs.items }),
      });
      const data = (await response.json()) as { count?: number; root?: string; error?: string };
      setStatus(data.error ? `同步失败：${data.error}` : `已同步 ${data.count} 份输入到 ${data.root}，可以让 DSH 里的 agent 读图了`);
    } catch {
      setStatus("同步失败：本地服务不可用");
    }
  }

  async function pullCandidate() {
    setStatus("正在从本地服务拉取候选…");
    try {
      const response = await fetch("/api/concept/candidate");
      const data = (await response.json()) as { candidate: unknown; receivedAt: string };
      if (!data.candidate) { setStatus("本地服务上还没有候选"); return; }
      const parsed = recognitionCandidateSchema.safeParse(data.candidate);
      if (!parsed.success) { setStatus("候选格式不合法"); return; }
      setCandidate(parsed.data);
      setStatus(`已拉取候选（${data.receivedAt}）`);
    } catch {
      setStatus("拉取失败：本地服务不可用");
    }
  }

  async function importFile(file: File) {
    try {
      const parsed = recognitionCandidateSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) { setStatus("候选格式不合法"); return; }
      setCandidate(parsed.data);
      setStatus(`已导入候选：${parsed.data.name}`);
    } catch {
      setStatus("候选文件读取失败");
    }
  }

  /**
   * 在识别这一步直接收图。
   * 候选要落在图上，所以范围图是识别的前置；让入口停在这里，人就不用先猜"要去哪一格加图"。
   */
  async function addTopologyImage(file: File) {
    if (file.size > 10 * 1024 * 1024) { setStatus("图片请限制在 10MB 以内"); return; }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image = new window.Image();
      image.src = data;
      await image.decode();
      addLogicInput({ kind: IMAGE_FIELD_KIND, name: file.name, ref: file.name, imageData: data, pixelSize: [image.width, image.height] });
      setStatus(`已加入拓扑图 ${file.name}（${image.width}×${image.height}）。现在同步给本地服务，让我读图。`);
    } catch {
      setStatus("图片读取失败");
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round((event.clientX - rect.left) / scale);
    const y = Math.round((event.clientY - rect.top) / scale);
    updateCandidateNode(dragging, { scopeMapPoint: [Math.max(0, x), Math.max(0, y)] });
  }

  return (
    <div className="recognition-board">
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
      <input
        className="sr-only"
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void addTopologyImage(file);
        }}
      />

      <header className="recognition-bar">
        <button type="button" className="secondary-command" onClick={() => imageRef.current?.click()}><ImagePlus size={14} />添加拓扑图</button>
        <button type="button" className="secondary-command" onClick={() => void syncInputs()}><Upload size={14} />同步输入给本地服务</button>
        <button type="button" className="secondary-command" onClick={() => void pullCandidate()}><Download size={14} />拉取候选</button>
        <button type="button" className="secondary-command" onClick={() => fileRef.current?.click()}><RefreshCw size={14} />从文件导入</button>
        {candidate ? <span className="recognition-meta">{candidate.name} · {candidate.recognizer.name} v{candidate.recognizer.version}</span> : null}
        {status ? <span className="recognition-status">{status}</span> : null}
      </header>

      {candidate ? (
        <div className="recognition-body">
          <div className="scope-map-viewport" ref={viewportRef}>
            {scopeMap?.imageData ? (
              <div className="scope-map-stage" style={{ width: imageWidth * scale, height: imageHeight * scale }}>
                <img src={scopeMap.imageData} alt={scopeMap.name} width={imageWidth * scale} height={imageHeight * scale} />
                <svg
                  className={`scope-map-overlay ${dragging ? "is-dragging" : ""}`}
                  viewBox={`0 0 ${imageWidth} ${imageHeight}`}
                  width={imageWidth * scale}
                  height={imageHeight * scale}
                  onPointerMove={onPointerMove}
                  onPointerUp={() => setDragging(null)}
                  onPointerLeave={() => setDragging(null)}
                >
                  {candidate.links.map((link) => {
                    const from = candidate.nodes.find((node) => node.tempId === link.from);
                    const to = candidate.nodes.find((node) => node.tempId === link.to);
                    if (!from?.scopeMapPoint || !to?.scopeMapPoint) return null;
                    const meta = LOGIC_KINDS[link.logic];
                    const muted = excluded.includes(link.tempId);
                    return (
                      <g key={link.tempId} opacity={muted ? 0.22 : 0.9}>
                        <line
                          x1={from.scopeMapPoint[0]} y1={from.scopeMapPoint[1]}
                          x2={to.scopeMapPoint[0]} y2={to.scopeMapPoint[1]}
                          stroke={meta.color} strokeWidth={3} strokeDasharray={meta.dash ? "10 7" : undefined}
                        />
                        <text
                          x={(from.scopeMapPoint[0] + to.scopeMapPoint[0]) / 2}
                          y={(from.scopeMapPoint[1] + to.scopeMapPoint[1]) / 2 - 8}
                          fill={meta.color} fontSize={13} textAnchor="middle" stroke="#0f1215" strokeWidth={4} paintOrder="stroke"
                        >
                          {link.label || meta.label}
                        </text>
                      </g>
                    );
                  })}
                  {candidate.nodes.map((node) => {
                    if (!node.scopeMapPoint) return null;
                    const muted = excluded.includes(node.tempId);
                    const active = selectedNodeId === node.tempId;
                    return (
                      <g
                        key={node.tempId}
                        className="scope-map-marker"
                        opacity={muted ? 0.25 : 1}
                        onPointerDown={(event) => { event.stopPropagation(); (event.target as Element).setPointerCapture?.(event.pointerId); setDragging(node.tempId); selectCandidateNode(node.tempId); }}
                      >
                        <circle
                          cx={node.scopeMapPoint[0]} cy={node.scopeMapPoint[1]} r={active ? 15 : 12}
                          fill={active ? "rgba(75,184,154,.4)" : "rgba(24,27,25,.72)"}
                          stroke={active ? "var(--accent-strong)" : "#d8a84e"} strokeWidth={3}
                        />
                        <text
                          x={node.scopeMapPoint[0]} y={node.scopeMapPoint[1] - 20}
                          fill="#eef2ee" fontSize={15} textAnchor="middle" stroke="#0f1215" strokeWidth={5} paintOrder="stroke"
                        >
                          {node.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : (
              <div className="empty-workspace concept-empty">
                <h3><ImageOff size={16} /> 找不到用于定位的范围图</h3>
                <p>先在「输入上下文」里导入范围图，候选节点才有地方落位。</p>
              </div>
            )}
          </div>

          <aside className="recognition-list">
            <div className="recognition-list-head">
              <strong>候选条目</strong>
              <span>{summary?.nodes} 区域 · {summary?.links} 链路 · {summary?.keys} 钥匙</span>
            </div>
            <p className="field-help">在图上拖动标记可修正位置。取消勾选的条目不会被套用。</p>
            <div className="recognition-items">
              {candidate.nodes.map((node) => (
                <label key={node.tempId} className={`recognition-item ${selectedNodeId === node.tempId ? "is-selected" : ""}`}>
                  <input type="checkbox" checked={!excluded.includes(node.tempId)} onChange={() => useProjectStore.getState().toggleCandidateItem(node.tempId)} />
                  <span onClick={() => selectCandidateNode(node.tempId)}>
                    <strong>{node.name}</strong>
                    <small>
                      {node.scopeMapPoint ? `图内 (${node.scopeMapPoint[0]}, ${node.scopeMapPoint[1]})` : "未给出位置"}
                      {node.elevation ? ` · 标高 ${node.elevation.base}~${node.elevation.top}` : ""}
                    </small>
                  </span>
                </label>
              ))}
              {candidate.links.map((link) => (
                <label key={link.tempId} className="recognition-item">
                  <input type="checkbox" checked={!excluded.includes(link.tempId)} onChange={() => useProjectStore.getState().toggleCandidateItem(link.tempId)} />
                  <span>
                    <strong>{link.label || LOGIC_KINDS[link.logic].label}</strong>
                    <small>{LOGIC_KINDS[link.logic].label}{link.traversal !== "both" ? " · 单向" : ""}</small>
                  </span>
                </label>
              ))}
              {candidate.keys.map((key) => (
                <label key={key.tempId} className="recognition-item">
                  <input type="checkbox" checked={!excluded.includes(key.tempId)} onChange={() => useProjectStore.getState().toggleCandidateItem(key.tempId)} />
                  <span><strong>🔑 {key.name}</strong><small>解锁 {key.unlocks.length} 条链路</small></span>
                </label>
              ))}
            </div>

            {candidate.warnings.length ? (
              <div className="recognition-warnings">
                {candidate.warnings.map((warning) => <div key={warning} className="logic-issue is-info"><span>{warning}</span></div>)}
              </div>
            ) : null}
            {issues.length ? (
              <div className="recognition-warnings">
                {issues.map((issue) => (
                  <div key={issue.id} className={`logic-issue is-${issue.severity === "error" ? "error" : "warning"}`}>
                    <CircleAlert size={13} /><span>{issue.message}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="recognition-actions">
              <button type="button" className="primary-command" disabled={blocked} onClick={() => useProjectStore.getState().applyRecognitionCandidate()}>
                套用候选
              </button>
              <button type="button" className="secondary-command" onClick={() => { setCandidate(null); setStatus(""); }}>丢弃候选</button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="empty-workspace concept-empty">
          <h3>还没有识别候选</h3>
          <p>
            先「添加拓扑图」并「同步输入给本地服务」，然后在 DSH 里让我读图并给出候选；<br />
            再点「拉取候选」，逐条确认后套用。也可以直接「从文件导入」一份候选 JSON。
          </p>
        </div>
      )}
    </div>
  );
}
