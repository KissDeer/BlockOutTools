import { useEffect, useMemo, useState } from "react";
import { CircleAlert, FileText, Ruler, Stamp, Trash2 } from "lucide-react";
import { checkInputsCompleteness, INPUT_KINDS, latestProposal, proposalState } from "../../domain/concept-inputs";
import { NumberField } from "../../components/NumberField";
import { TextField } from "../../components/TextField";
import { useProjectStore } from "../../store/project-store";
import { useCurrentTopology } from "./use-current-topology";

export function ConceptInputInspector() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();
  const selectedInputId = useProjectStore((state) => state.selectedInputId);
  const updateInput = useProjectStore((state) => state.updateLogicInput);
  const removeInput = useProjectStore((state) => state.removeLogicInput);
  const recordProposal = useProjectStore((state) => state.recordProposal);
  const [pixelDistance, setPixelDistance] = useState(100);
  const [realDistance, setRealDistance] = useState(1000);

  const inputs = topology.inputs;
  const item = inputs.items.find((entry) => entry.id === selectedInputId) ?? null;
  const completeness = useMemo(() => checkInputsCompleteness(inputs), [inputs]);
  const proposal = useMemo(() => latestProposal(topology.proposals), [topology.proposals]);
  const state = proposalState(inputs, proposal);

  const [textDraft, setTextDraft] = useState(item?.text ?? "");
  useEffect(() => setTextDraft(item?.text ?? ""), [item?.id, item?.text]);

  if (item) {
    const meta = INPUT_KINDS[item.kind];
    const calibration = item.calibration;
    return (
      <div className="inspector-content">
        <header className="inspector-heading">
          <span>{meta.label}</span>
          <strong>{item.name}</strong>
          <small>{meta.hint}</small>
        </header>

        {item.imageData ? (
          <section className="inspector-section">
            <h3>预览</h3>
            <div className="input-preview"><img src={item.imageData} alt={item.name} /></div>
            {item.pixelSize ? <p className="field-help">{item.pixelSize[0]} × {item.pixelSize[1]} px</p> : null}
          </section>
        ) : null}

        <section className="inspector-section">
          <h3>属性</h3>
          <div className="field-grid">
            <TextField label="名称" value={item.name} onCommit={(name) => updateInput(item.id, { name })} />
            <TextField label="来源文件" value={item.ref} onCommit={(ref) => updateInput(item.id, { ref })} />
            <TextField label="备注" value={item.note} onCommit={(note) => updateInput(item.id, { note })} />
          </div>
        </section>

        {!meta.image ? (
          <section className="inspector-section">
            <h3>内容</h3>
            <textarea
              className="input-textarea"
              rows={10}
              value={textDraft}
              placeholder={item.kind === "rules" ? "把拆分规范、命名约定、硬性约束写在这里；后续补充会让已登记的拆解结果标为过期。" : "补充说明…"}
              onChange={(event) => setTextDraft(event.target.value)}
              onBlur={() => { if (textDraft !== item.text) updateInput(item.id, { text: textDraft }); }}
            />
            <p className="field-help">内容参与 digest 计算，改动会递增 rev 并使已登记的拆解结果过期。</p>
          </section>
        ) : null}

        {item.kind === "scope-map" || item.kind === "logic-topology" ? (
          <section className="inspector-section">
            <h3><Ruler size={13} /> 比例标定</h3>
            {calibration ? (
              <p className="field-help" style={{ marginTop: 0 }}>
                {calibration.cmPerPixel.toFixed(4)} cm/px · {calibration.confirmed ? "已确认" : "待确认"}
              </p>
            ) : (
              <p className="field-help" style={{ marginTop: 0 }}>还没有标定比例。没有比例时，拆解给出的相对位置只能按 estimated 处理。</p>
            )}
            <div className="field-grid two-columns">
              <NumberField label="已知线段像素长度" value={pixelDistance} min={0.01} unit="px" onCommit={setPixelDistance} />
              <NumberField label="该线段真实长度" value={realDistance} min={0.01} onCommit={setRealDistance} />
            </div>
            <button
              type="button"
              className="primary-command"
              style={{ marginTop: 8 }}
              onClick={() => updateInput(item.id, { calibration: { cmPerPixel: realDistance / pixelDistance, origin: [0, 0], rotation: 0, confirmed: true } })}
            >
              应用比例校准
            </button>
            {calibration ? (
              <button
                type="button"
                className="secondary-command"
                style={{ marginTop: 6 }}
                onClick={() => updateInput(item.id, { calibration: { ...calibration, confirmed: !calibration.confirmed } })}
              >
                {calibration.confirmed ? "标记为待确认" : "标记为已确认"}
              </button>
            ) : null}
          </section>
        ) : null}

        <div className="inspector-commands">
          <button type="button" className="danger-command" onClick={() => removeInput(item.id)}><Trash2 size={14} />移除这份输入</button>
        </div>
      </div>
    );
  }

  return (
    <div className="inspector-content">
      <header className="inspector-heading">
        <span>输入上下文包</span>
        <strong>{inputs.items.length} 份材料 · rev {inputs.revision}</strong>
        <small>拆解前必须看全这里的所有输入</small>
      </header>

      <section className="inspector-section">
        <h3>完整性</h3>
        {completeness.ok ? (
          <p className="field-help" style={{ marginTop: 0 }}>必需输入齐全，可以开始拆解。</p>
        ) : (
          <>
            <p className="field-help" style={{ marginTop: 0 }}>缺少必需输入，拆解会被拒绝：</p>
            {completeness.missing.map((kind) => (
              <div key={kind} className="logic-issue is-error"><CircleAlert size={13} /><span>{INPUT_KINDS[kind].label} —— {INPUT_KINDS[kind].hint}</span></div>
            ))}
          </>
        )}
        <code className="object-id">digest {inputs.digest}</code>
      </section>

      <section className="inspector-section">
        <h3>拆解结果</h3>
        {state === "none" ? <p className="field-help" style={{ marginTop: 0 }}>还没有登记。登记后，输入一旦变化就会自动标为过期。</p> : null}
        {state === "current" ? (
          <dl className="summary-list">
            <div><dt>状态</dt><dd>与输入一致</dd></div>
            <div><dt>依据 rev</dt><dd>{proposal?.basedOnInputsRevision}</dd></div>
            <div><dt>区域 / 链路</dt><dd>{proposal?.nodeCount} / {proposal?.linkCount}</dd></div>
          </dl>
        ) : null}
        {state === "stale" ? (
          <div className="logic-issue is-warning">
            <Stamp size={13} />
            <span>登记于 rev {proposal?.basedOnInputsRevision}，当前 rev {inputs.revision}：输入已变更，请重新核对后再交付。</span>
          </div>
        ) : null}
        <button type="button" className="primary-command" style={{ marginTop: 8 }} disabled={!completeness.ok} onClick={() => recordProposal()}>
          <Stamp size={14} />{state === "none" ? "登记拆解结果" : "重新登记"}
        </button>
      </section>

      <section className="inspector-section">
        <h3>怎么用</h3>
        <p className="field-help" style={{ marginTop: 0 }}>
          <FileText size={12} /> 逻辑拓扑图与范围图是必需项；规范与说明可以后续补充。<br />
          补充或修改任何输入后，已登记的拆解结果会自动标为过期，不会被静默沿用。
        </p>
      </section>
    </div>
  );
}
