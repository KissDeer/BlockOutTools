import { useMemo } from "react";
import { CircleAlert, MapPin } from "lucide-react";
import { LOGIC_KINDS, NODE_ROLES, type LogicNodeRole } from "../../domain/concept";
import { summarizeCandidate, validateCandidate } from "../../domain/concept-candidate";
import { NumberField } from "../../components/NumberField";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { useProjectStore } from "../../store/project-store";
import { useCurrentTopology } from "./use-current-topology";

const ROLE_OPTIONS = (Object.keys(NODE_ROLES) as LogicNodeRole[]).map((role) => ({ value: role, label: NODE_ROLES[role] }));

export function ConceptCandidateInspector() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();
  const candidate = useProjectStore((state) => state.candidate);
  const selectedNodeId = useProjectStore((state) => state.selectedCandidateNodeId);
  const excluded = useProjectStore((state) => state.candidateExcluded);
  const updateCandidateNode = useProjectStore((state) => state.updateCandidateNode);
  const toggleCandidateItem = useProjectStore((state) => state.toggleCandidateItem);

  const issues = useMemo(() => (candidate ? validateCandidate(candidate, topology) : []), [candidate, topology]);
  const summary = useMemo(() => (candidate ? summarizeCandidate(candidate) : null), [candidate]);
  const node = candidate?.nodes.find((item) => item.tempId === selectedNodeId) ?? null;

  if (!candidate) {
    return (
      <div className="inspector-content">
        <header className="inspector-heading">
          <span>识别候选</span>
          <strong>还没有候选</strong>
          <small>候选只存在于本次会话，套用后才写进拓扑</small>
        </header>
        <section className="inspector-section">
          <h3>怎么用</h3>
          <p className="field-help" style={{ marginTop: 0 }}>
            1. 在「输入上下文」里导入逻辑拓扑图与范围图。<br />
            2. 点「同步输入给本地服务」，图片会落到本地磁盘，DSH 里的 agent 就能直接读图。<br />
            3. agent 给出候选后点「拉取候选」，在范围图上核对位置与连接。<br />
            4. 逐条确认无误再「套用候选」——套用只是一次可撤销事务，不会删除已有内容。
          </p>
        </section>
      </div>
    );
  }

  if (node) {
    return (
      <div className="inspector-content">
        <header className="inspector-heading">
          <span>候选区域</span>
          <strong>{node.name}</strong>
          <small>{node.scopeMapPoint ? `范围图内 (${node.scopeMapPoint[0]}, ${node.scopeMapPoint[1]}) px` : "未给出位置"}</small>
        </header>

        <section className="inspector-section">
          <h3>属性</h3>
          <div className="field-grid">
            <TextField label="名称" value={node.name} onCommit={(name) => updateCandidateNode(node.tempId, { name })} />
            <SelectField label="角色" value={node.role} options={ROLE_OPTIONS} onCommit={(role) => updateCandidateNode(node.tempId, { role })} />
            <NumberField label="逻辑层号" value={node.floor} step={1} unit="" onCommit={(floor) => updateCandidateNode(node.tempId, { floor: Math.round(floor) })} />
          </div>
        </section>

        <section className="inspector-section">
          <h3><MapPin size={13} /> 相对位置与标高</h3>
          <p className="field-help" style={{ marginTop: 0 }}>
            位置以范围图原始像素为准；套用时按范围图标定换算成厘米。直接拖图上的标记也可以改。
          </p>
          <div className="field-grid two-columns">
            <NumberField label="图内 X" value={node.scopeMapPoint?.[0] ?? 0} step={1} unit="px" onCommit={(x) => updateCandidateNode(node.tempId, { scopeMapPoint: [x, node.scopeMapPoint?.[1] ?? 0] })} />
            <NumberField label="图内 Y" value={node.scopeMapPoint?.[1] ?? 0} step={1} unit="px" onCommit={(y) => updateCandidateNode(node.tempId, { scopeMapPoint: [node.scopeMapPoint?.[0] ?? 0, y] })} />
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(node.elevation)}
              onChange={(event) => updateCandidateNode(node.tempId, { elevation: event.target.checked ? { base: 0, top: 400 } : null })}
            />
            给出相对标高
          </label>
          {node.elevation ? (
            <div className="field-grid two-columns">
              <NumberField label="底面标高" value={node.elevation.base} onCommit={(base) => updateCandidateNode(node.tempId, { elevation: { base, top: node.elevation?.top ?? base } })} />
              <NumberField label="顶面标高" value={node.elevation.top} onCommit={(top) => updateCandidateNode(node.tempId, { elevation: { base: node.elevation?.base ?? 0, top } })} />
            </div>
          ) : null}
        </section>

        <div className="inspector-commands">
          <button type="button" className={excluded.includes(node.tempId) ? "secondary-command" : "danger-command"} onClick={() => toggleCandidateItem(node.tempId)}>
            {excluded.includes(node.tempId) ? "恢复这条候选" : "排除这条候选"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inspector-content">
      <header className="inspector-heading">
        <span>识别候选</span>
        <strong>{candidate.name}</strong>
        <small>{candidate.recognizer.name} v{candidate.recognizer.version} · 依据 digest {candidate.basedOnInputsDigest}</small>
      </header>

      <section className="inspector-section">
        <h3>规模</h3>
        <dl className="summary-list">
          <div><dt>区域</dt><dd>{summary?.nodes}</dd></div>
          <div><dt>链路</dt><dd>{summary?.links}</dd></div>
          <div><dt>钥匙</dt><dd>{summary?.keys}</dd></div>
          <div><dt>已给位置</dt><dd>{summary?.placed} / {summary?.nodes}</dd></div>
          <div><dt>已给标高</dt><dd>{summary?.located} / {summary?.nodes}</dd></div>
          <div><dt>已排除</dt><dd>{excluded.length}</dd></div>
        </dl>
      </section>

      <section className="inspector-section">
        <h3>可用的链路类型</h3>
        <div className="logic-kind-grid" style={{ padding: 0 }}>
          {(Object.keys(LOGIC_KINDS) as (keyof typeof LOGIC_KINDS)[]).map((kind) => (
            <span key={kind} className="logic-kind-chip" style={{ cursor: "default" }}>
              <i style={{ background: LOGIC_KINDS[kind].color }} />
              {LOGIC_KINDS[kind].label}
            </span>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <h3>检查</h3>
        {issues.length === 0 ? <p className="field-help" style={{ marginTop: 0 }}>没有发现问题，可以套用。</p> : null}
        {issues.map((issue) => (
          <div key={issue.id} className={`logic-issue is-${issue.severity === "error" ? "error" : "warning"}`}>
            <CircleAlert size={13} /><span>{issue.message}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
