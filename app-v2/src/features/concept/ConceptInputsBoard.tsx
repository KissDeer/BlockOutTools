import { useMemo, useRef, useState } from "react";
import { CircleAlert, FileText, Image as ImageIcon, Plus, RefreshCw, Stamp, TriangleAlert } from "lucide-react";
import {
  checkInputsCompleteness,
  INPUT_KINDS,
  latestProposal,
  proposalState,
  type LogicInputItem,
  type LogicInputKind,
} from "../../domain/concept-inputs";
import { useProjectStore } from "../../store/project-store";
import { useCurrentTopology } from "./use-current-topology";

const KIND_ORDER: LogicInputKind[] = ["logic-topology", "scope-map", "mood", "rules", "note"];

export function ConceptInputsBoard() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();
  const selectedInputId = useProjectStore((state) => state.selectedInputId);
  const selectInput = useProjectStore((state) => state.setSelectedInput);
  const addLogicInput = useProjectStore((state) => state.addLogicInput);
  const recordProposal = useProjectStore((state) => state.recordProposal);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<LogicInputKind>("logic-topology");
  const [error, setError] = useState("");

  const inputs = topology.inputs;
  const completeness = useMemo(() => checkInputsCompleteness(inputs), [inputs]);
  const proposal = useMemo(() => latestProposal(topology.proposals), [topology.proposals]);
  const state = proposalState(inputs, proposal);

  function requestImage(kind: LogicInputKind) {
    pendingKind.current = kind;
    fileInput.current?.click();
  }

  async function onFile(file: File) {
    const kind = pendingKind.current;
    if (file.size > 10 * 1024 * 1024) { setError("图片请限制在 10MB 以内"); return; }
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
      addLogicInput({ kind, name: file.name, ref: file.name, imageData: data, pixelSize: [image.width, image.height] });
      setError("");
    } catch {
      setError("图片读取失败");
    }
  }

  function addText(kind: LogicInputKind) {
    const count = inputs.items.filter((item) => item.kind === kind).length + 1;
    addLogicInput({ kind, name: kind === "rules" ? `拆分规范 ${count}` : `补充说明 ${count}` });
  }

  return (
    <div className="inputs-board">
      <input
        className="sr-only"
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void onFile(file);
        }}
      />

      <header className={`inputs-summary is-${completeness.ok ? "ok" : "blocked"}`}>
        <div className="inputs-summary-main">
          <strong>输入上下文包</strong>
          <span className="rev">rev {inputs.revision}</span>
          <code className="digest" title="全部输入内容的指纹">digest {inputs.digest}</code>
        </div>
        <div className="inputs-summary-state">
          {completeness.ok
            ? <span className="state-ok">材料齐全，可以去「识别候选」读图了</span>
            : <span className="state-blocked"><CircleAlert size={13} />缺少 {completeness.missing.map((kind) => INPUT_KINDS[kind].label).join("、")}，识别会被拒绝</span>}
        </div>
      </header>

      <section className="inputs-proposal">
        <div className="proposal-row">
          <Stamp size={14} />
          {state === "none" ? <span>还没有登记识别结果。</span> : null}
          {state === "current" ? <span className="state-ok">识别结果与当前输入一致（基于 rev {proposal?.basedOnInputsRevision} · {proposal?.nodeCount} 区域 / {proposal?.linkCount} 链路）。</span> : null}
          {state === "stale" ? (
            <span className="state-blocked">
              <TriangleAlert size={13} />输入已变更，识别结果需要重新核对（登记于 rev {proposal?.basedOnInputsRevision}，当前 rev {inputs.revision}）。
            </span>
          ) : null}
        </div>
        <div className="proposal-actions">
          <button
            type="button"
            className="primary-command"
            disabled={!completeness.ok}
            title={completeness.ok ? "把当前逻辑拓扑登记为一次识别结果" : "缺少必需输入"}
            onClick={() => recordProposal()}
          >
            <Stamp size={14} />{state === "none" ? "登记识别结果" : "重新登记"}
          </button>
          {state === "stale" ? (
            <button type="button" className="secondary-command" onClick={() => selectInput(null)}>
              <RefreshCw size={14} />先看差异
            </button>
          ) : null}
        </div>
      </section>

      {completeness.warnings.length ? (
        <section className="inputs-warnings">
          {completeness.warnings.map((warning) => (
            <div key={warning.id} className="logic-issue is-warning"><TriangleAlert size={13} /><span>{warning.message}</span></div>
          ))}
        </section>
      ) : null}

      {error ? <div className="logic-issue is-error"><CircleAlert size={13} /><span>{error}</span></div> : null}

      <div className="inputs-groups">
        {KIND_ORDER.map((kind) => {
          const meta = INPUT_KINDS[kind];
          const items = inputs.items.filter((item) => item.kind === kind);
          return (
            <section key={kind} className="inputs-group">
              <div className="inputs-group-head">
                <strong>{meta.label}</strong>
                {meta.required ? <b className="is-required">必需</b> : null}
                <span>{meta.hint}</span>
                <button
                  type="button"
                  className="secondary-command"
                  onClick={() => (meta.image ? requestImage(kind) : addText(kind))}
                >
                  <Plus size={13} />添加
                </button>
              </div>
              {items.length === 0 ? (
                <p className="inputs-group-empty">{meta.required ? "还没有提供，识别会被拒绝" : "还没有提供（可选）"}</p>
              ) : (
                <div className="inputs-cards">
                  {items.map((item) => (
                    <InputCard
                      key={item.id}
                      item={item}
                      selected={item.id === selectedInputId}
                      onSelect={() => selectInput(item.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function InputCard({ item, selected, onSelect }: { item: LogicInputItem; selected: boolean; onSelect: () => void }) {
  const meta = INPUT_KINDS[item.kind];
  return (
    <button type="button" className={`input-card ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <div className="input-card-thumb">
        {item.imageData
          ? <img src={item.imageData} alt={item.name} />
          : <span className="input-card-text-icon"><FileText size={18} />{item.text ? item.text.slice(0, 46) : "（尚未填写内容）"}</span>}
      </div>
      <div className="input-card-meta">
        <strong title={item.name}>{meta.image ? <ImageIcon size={11} /> : <FileText size={11} />}{item.name}</strong>
        <small>
          {item.pixelSize ? `${item.pixelSize[0]}×${item.pixelSize[1]} px · ` : ""}
          {item.calibration ? (item.calibration.confirmed ? "比例已确认" : "比例待确认") : meta.image ? "未标定比例" : "文本"}
        </small>
      </div>
    </button>
  );
}
