import { useMemo, useRef, useState } from "react";
import { CircleAlert, Download, Layers, RefreshCw, TriangleAlert, Upload, Wand2 } from "lucide-react";
import { configurationCandidateSchema, summarizeConfiguration, validateConfiguration } from "../../domain/concept-configuration";
import { useProjectStore } from "../../store/project-store";
import { conceptSnapshot } from "./concept-snapshot";
import { moduleColor } from "./module-colors";
import { useCurrentTopology, useRootTopology } from "./use-current-topology";

export function ConceptConfigurationBoard() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();
  // 快照要给 agent 全树：构型可能发生在任何一层
  const rootTopology = useRootTopology();
  const scopeId = useProjectStore((state) => state.conceptScopeId);
  const configuration = useProjectStore((state) => state.configuration);
  const setConfiguration = useProjectStore((state) => state.setConfiguration);
  const generateConfiguration = useProjectStore((state) => state.generateConfiguration);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  const issues = useMemo(() => (configuration ? validateConfiguration(topology, configuration) : []), [configuration, topology]);
  const summary = useMemo(() => (configuration ? summarizeConfiguration(configuration) : null), [configuration]);
  const blocked = issues.some((issue) => issue.severity === "error");

  async function syncState() {
    setStatus("正在同步拓扑与划分…");
    try {
      const response = await fetch("/api/concept/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conceptSnapshot(rootTopology, scopeId)) });
      const data = (await response.json()) as { error?: string };
      setStatus(data.error ? `同步失败：${data.error}` : "已同步，可以在 DSH 里让我给基础构型");
    } catch {
      setStatus("同步失败：本地服务不可用");
    }
  }

  async function pullConfiguration() {
    setStatus("正在拉取基础构型…");
    try {
      const response = await fetch("/api/concept/configuration");
      const data = (await response.json()) as { candidate: unknown; receivedAt: string };
      if (!data.candidate) { setStatus("本地服务上还没有基础构型"); return; }
      const parsed = configurationCandidateSchema.safeParse(data.candidate);
      if (!parsed.success) { setStatus("基础构型格式不合法"); return; }
      setConfiguration(parsed.data);
      setStatus(`已拉取构型（${data.receivedAt}）`);
    } catch {
      setStatus("拉取失败：本地服务不可用");
    }
  }

  async function importFile(file: File) {
    try {
      const parsed = configurationCandidateSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) { setStatus("基础构型格式不合法"); return; }
      setConfiguration(parsed.data);
      setStatus(`已导入构型：${parsed.data.name}`);
    } catch {
      setStatus("构型文件读取失败");
    }
  }

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
        <button type="button" className="secondary-command" onClick={() => void pullConfiguration()}><Download size={14} />拉取构型提案</button>
        <button type="button" className="secondary-command" onClick={() => fileRef.current?.click()}><RefreshCw size={14} />从文件导入</button>
        <button type="button" className="secondary-command" disabled={topology.modules.length === 0} onClick={generateConfiguration}><Wand2 size={14} />按角色模板生成</button>
        {status ? <span className="recognition-status">{status}</span> : null}
      </header>

      <div className="decomposition-body">
        <section className="decomposition-main">
          <div className="decomposition-summary">
            <div><span>模块</span><strong>{topology.modules.length}</strong></div>
            <div><span>体块</span><strong>{summary?.areas ?? 0}</strong></div>
            <div><span>端口</span><strong>{summary?.ports ?? 0}</strong></div>
            <div><span>已落成模块定义</span><strong>{topology.modules.filter((module) => module.moduleDefinitionId).length}</strong></div>
          </div>

          {topology.modules.length === 0 ? (
            <div className="empty-workspace concept-empty" style={{ height: "auto", padding: 32 }}>
              <h3><Layers size={16} />先完成横向拆解</h3>
              <p>基础构型是按模块生成的：先把区域分成模块，再给每个模块生成体块与端口。</p>
            </div>
          ) : (
            <div className="plan-canvas">
              <h3>平面位置图</h3>
              <p className="field-help">按区域在范围图上的相对位置与体块尺寸绘制；没有构型时只画中心点。</p>
              <ConfigurationPlan />
            </div>
          )}

          {issues.length ? (
            <div className="decomposition-issues" style={{ marginTop: 12 }}>
              {issues.map((issue) => (
                <div key={issue.id} className={`logic-issue is-${issue.severity}`}>
                  {issue.severity === "error" ? <CircleAlert size={13} /> : <TriangleAlert size={13} />}
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <aside className="recognition-list">
          <div className="recognition-list-head">
            <strong>构型提案</strong>
            {configuration ? <span>{configuration.proposer.name} v{configuration.proposer.version}</span> : null}
          </div>
          {configuration ? (
            <>
              <p className="field-help">{configuration.name}</p>
              {configuration.warnings.map((warning) => <div key={warning} className="logic-issue is-info"><span>{warning}</span></div>)}
              <div className="recognition-items">
                {configuration.modules.map((entry) => {
                  const module = topology.modules.find((item) => item.id === entry.moduleId);
                  return (
                    <div key={entry.moduleId} className="recognition-item">
                      <span>
                        <strong>{module?.name ?? entry.moduleId}</strong>
                        <small>{entry.areas.length} 体块 · {entry.ports.length} 端口</small>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="recognition-actions">
                <button type="button" className="primary-command" disabled={blocked} onClick={() => useProjectStore.getState().applyConfigurationCandidate()}>
                  套用构型
                </button>
                <button type="button" className="secondary-command" onClick={() => { setConfiguration(null); setStatus(""); }}>丢弃提案</button>
              </div>
            </>
          ) : (
            <p className="field-help" style={{ marginTop: 0 }}>
              还没有构型。可以点「按角色模板生成」得到一个确定性的起点，或「同步拓扑给本地服务」后让我按区域角色、相对位置与对外连接给出更贴合的体块布局。
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** 平面位置图：读**已落成**的模块定义（体块 + 模块原点），套用之后仍然能看 */
function ConfigurationPlan() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();

  const model = useMemo(() => {
    const moduleIndexOf = new Map(topology.modules.map((module, index) => [module.id, index]));
    const items: { id: string; name: string; center: [number, number]; width: number; depth: number; color: string; sized: boolean }[] = [];

    for (const module of topology.modules) {
      const definition = module.moduleDefinitionId ? project.modules.find((item) => item.id === module.moduleDefinitionId) : null;
      if (!definition) continue;
      const origin = module.relativeOrigin ?? [0, 0];
      const color = moduleColor(moduleIndexOf.get(module.id) ?? 0);
      for (const block of definition.blocks) {
        if (block.type !== "box") continue;
        items.push({
          id: block.id,
          name: block.name,
          center: [block.transform.position[0] + origin[0], block.transform.position[1] + origin[1]],
          width: block.parameters.BoxSize[0],
          depth: block.parameters.BoxSize[1],
          color,
          sized: true,
        });
      }
    }

    // 还没落成构型的区域退化成中心点
    const covered = new Set(topology.modules.filter((module) => module.moduleDefinitionId).flatMap((module) => module.nodeIds));
    for (const node of topology.nodes) {
      if (covered.has(node.id) || !node.relativePosition) continue;
      items.push({ id: node.id, name: node.name, center: node.relativePosition, width: 400, depth: 400, color: "#5d6673", sized: false });
    }

    if (items.length === 0) return null;
    const minX = Math.min(...items.map((item) => item.center[0] - item.width / 2));
    const maxX = Math.max(...items.map((item) => item.center[0] + item.width / 2));
    const minY = Math.min(...items.map((item) => item.center[1] - item.depth / 2));
    const maxY = Math.max(...items.map((item) => item.center[1] + item.depth / 2));
    const padding = 400;
    const scale = Math.min(880 / Math.max(1, maxX - minX + padding * 2), 460 / Math.max(1, maxY - minY + padding * 2));
    return { items, minX: minX - padding, minY: minY - padding, scale };
  }, [project.modules, topology]);

  if (!model) {
    return <div className="plan-empty">还没有可绘制的内容：先在「识别」里按范围图定位，再在「构型」里生成或拉取构型。</div>;
  }
  const X = (value: number) => (value - model.minX) * model.scale;
  return (
    <svg className="plan-svg" viewBox={`0 0 ${900} 480`} role="img" aria-label="平面位置图">
      {model.items.map((item) => (
        <g key={item.id}>
          <rect
            x={X(item.center[0] - item.width / 2)}
            y={X(item.center[1] - item.depth / 2)}
            width={item.width * model.scale}
            height={item.depth * model.scale}
            fill={item.sized ? `${item.color}33` : "none"}
            stroke={item.color}
            strokeWidth={item.sized ? 2 : 1.5}
            strokeDasharray={item.sized ? undefined : "6 5"}
          />
          <text x={X(item.center[0])} y={X(item.center[1]) + 5} textAnchor="middle" fill="#eef2ee" fontSize={15} stroke="#0f1215" strokeWidth={4} paintOrder="stroke">
            {item.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
