import { useMemo, useState } from "react";
import { ExternalLink, Flag, Plus, Trash2 } from "lucide-react";
import {
  LOGIC_KINDS,
  NODE_ROLES,
  TRAVERSALS,
  type LogicKind,
  type LogicNodeRole,
  type LogicTraversal,
} from "../../domain/concept";
import { topologyStats } from "../../domain/concept-commands";
import { validateTopology } from "../../domain/concept-validation";
import { NumberField } from "../../components/NumberField";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { useProjectStore } from "../../store/project-store";
import { ModulePlanPreview } from "./ModulePlanPreview";
import { useCurrentTopology } from "./use-current-topology";
import { confirmModuleChange } from "./confirm-module-change";

const LOGIC_OPTIONS = (Object.keys(LOGIC_KINDS) as LogicKind[]).map((kind) => ({ value: kind, label: LOGIC_KINDS[kind].label }));
const ROLE_OPTIONS = (Object.keys(NODE_ROLES) as LogicNodeRole[]).map((role) => ({ value: role, label: NODE_ROLES[role] }));
const TRAVERSAL_OPTIONS = (Object.keys(TRAVERSALS) as LogicTraversal[]).map((value) => ({ value, label: TRAVERSALS[value] }));

export function ConceptInspector() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();
  const selectedNodeId = useProjectStore((state) => state.selectedLogicNodeId);
  const selectedLinkId = useProjectStore((state) => state.selectedLogicLinkId);
  const updateNode = useProjectStore((state) => state.updateLogicNode);
  const removeNode = useProjectStore((state) => state.removeLogicNode);
  const updateLink = useProjectStore((state) => state.updateLogicLink);
  const removeLink = useProjectStore((state) => state.removeLogicLink);
  const addLogicKey = useProjectStore((state) => state.addLogicKey);
  const setStartNode = useProjectStore((state) => state.setLogicStartNode);
  const addLogicModule = useProjectStore((state) => state.addLogicModule);
  const openLogicModule = useProjectStore((state) => state.openLogicModule);
  const openModuleById = useProjectStore((state) => state.openModuleById);
  const [keyFoundAt, setKeyFoundAt] = useState("");

  const issues = useMemo(() => validateTopology(topology), [topology]);
  const stats = useMemo(() => topologyStats(topology), [topology]);

  const node = topology.nodes.find((item) => item.id === selectedNodeId) ?? null;
  const link = topology.links.find((item) => item.id === selectedLinkId) ?? null;

  /* ---------------- 选中链路 ---------------- */
  if (link) {
    const from = topology.nodes.find((item) => item.id === link.from);
    const to = topology.nodes.find((item) => item.id === link.to);
    const key = topology.keys.find((item) => item.id === link.requires);
    const related = issues.filter((issue) => issue.linkIds.includes(link.id));
    return (
      <div className="inspector-content">
        <header className="inspector-heading">
          <span>逻辑链路</span>
          <strong>{link.label} · {LOGIC_KINDS[link.logic].label}</strong>
          <small>{from?.name ?? "?"} → {to?.name ?? "?"}</small>
        </header>

        <section className="inspector-section">
          <h3>链路属性</h3>
          <div className="field-grid">
            <TextField label="标注字母" value={link.label} onCommit={(value) => updateLink(link.id, { label: value })} />
            <SelectField label="链路类型" value={link.logic} options={LOGIC_OPTIONS} onCommit={(value) => updateLink(link.id, { logic: value })} />
            <SelectField label="通行方向" value={link.traversal} options={TRAVERSAL_OPTIONS} onCommit={(value) => updateLink(link.id, { traversal: value })} />
          </div>
          <p className="field-help">逻辑链路只表达“怎么连通”，不产生几何，也不决定真实距离。</p>
        </section>

        {link.logic === "locked-door" ? (
          <section className="inspector-section">
            <h3>锁钥</h3>
            {key ? (
              <dl className="summary-list">
                <div><dt>钥匙</dt><dd>{key.name}</dd></div>
                <div><dt>取得位置</dt><dd>{topology.nodes.find((item) => item.id === key.foundAt)?.name ?? "?"}</dd></div>
              </dl>
            ) : (
              <>
                <label className="select-field">
                  <span>钥匙在这取得</span>
                  <select value={keyFoundAt} onChange={(event) => setKeyFoundAt(event.target.value)}>
                    <option value="">选择区域…</option>
                    {topology.nodes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <button type="button" className="primary-command" style={{ marginTop: 8 }} disabled={!keyFoundAt} onClick={() => { addLogicKey(keyFoundAt, link.id); setKeyFoundAt(""); }}>
                  <Plus size={14} />创建钥匙
                </button>
                <p className="field-help">未指定钥匙的锁钥门会让玩家永远无法通过，校验会直接报错。</p>
              </>
            )}
          </section>
        ) : null}

        <section className="inspector-section">
          <h3>说明</h3>
          <TextField label="备注" value={link.note} onCommit={(value) => updateLink(link.id, { note: value })} />
        </section>

        {related.length ? (
          <section className="inspector-section">
            <h3>这条链路的问题</h3>
            {related.map((issue) => <div key={issue.id} className={`logic-issue is-${issue.severity}`}><span>{issue.message}</span></div>)}
          </section>
        ) : null}

        <div className="inspector-commands">
          <button type="button" className="danger-command" onClick={() => removeLink(link.id)}><Trash2 size={14} />删除链路</button>
        </div>
      </div>
    );
  }

  /* ---------------- 选中区域 ---------------- */
  if (node) {
    const ownerModule = topology.modules.find((item) => item.nodeIds.includes(node.id)) ?? null;
    const module = project.modules.find((item) => item.id === (ownerModule?.moduleDefinitionId ?? node.moduleId)) ?? null;
    const isStart = topology.startNodeId === node.id;
    const relatedLinks = topology.links.filter((item) => item.from === node.id || item.to === node.id);
    const relatedIssues = issues.filter((issue) => issue.nodeIds.includes(node.id));

    return (
      <div className="inspector-content">
        <header className="inspector-heading">
          <span>逻辑区域</span>
          <strong>{node.name}</strong>
          <small>{NODE_ROLES[node.role]} · 逻辑层 F{node.floor}{isStart ? " · 起点" : ""}</small>
        </header>

        <section className="inspector-section">
          <h3>区域属性</h3>
          <div className="field-grid">
            <TextField label="名称" value={node.name} onCommit={(value) => updateNode(node.id, { name: value })} />
            <SelectField label="角色" value={node.role} options={ROLE_OPTIONS} onCommit={(value) => updateNode(node.id, { role: value })} />
            <NumberField label="逻辑层号" value={node.floor} step={1} unit="" onCommit={(value) => updateNode(node.id, { floor: Math.round(value) })} />
            <TextField label="说明" value={node.note} onCommit={(value) => updateNode(node.id, { note: value })} />
          </div>
          <button type="button" className={isStart ? "primary-command" : "secondary-command"} style={{ marginTop: 8 }} onClick={() => setStartNode(isStart ? null : node.id)}>
            <Flag size={14} />{isStart ? "当前起点" : "设为起点"}
          </button>
        </section>

        <section className="inspector-section">
          <h3>所属模块</h3>
          {ownerModule ? <>
            <p className="field-help">{ownerModule.name} · {ownerModule.nodeIds.length} 个区域。拖入其他模块或使用画布上方“移动到”调整归属。</p>
            {module?.blocks.length ? <ModulePlanPreview module={module} width={268} height={152} /> : null}
            <button type="button" className="primary-command" onClick={() => openLogicModule(ownerModule.id)}><ExternalLink size={14} />搭建{ownerModule.name}</button>
          </> : <>
            <p className="field-help">框选相关区域组成模块，或将此区域拖入已有模块。其他模块未完成不影响当前搭建。</p>
            <button type="button" className="secondary-command" onClick={() => addLogicModule(`${node.name} 模块`, [node.id])}><Plus size={14} />此区域组成模块</button>
            {module ? <button type="button" className="secondary-command" onClick={() => openModuleById(module.id)}>打开旧版绑定模块</button> : null}
          </>}
        </section>

        <section className="inspector-section">
          <h3>标高要求</h3>
          <p className="field-help">逻辑层号只作提示。确定的标高会成为模块搭建依据；未确定时可以留空。</p>
          <label className="checkbox-field"><input type="checkbox" checked={Boolean(node.elevation)} onChange={(event) => updateNode(node.id, { elevation: event.target.checked ? { base: 0, top: 400 } : null })} />已确定标高</label>
          {node.elevation ? <div className="field-grid two-columns">
            <NumberField label="底面标高" value={node.elevation.base} onCommit={(base) => updateNode(node.id, { elevation: { base, top: node.elevation?.top ?? base } })} />
            <NumberField label="顶面标高" value={node.elevation.top} onCommit={(top) => updateNode(node.id, { elevation: { base: node.elevation?.base ?? 0, top } })} />
          </div> : null}
          {node.relativePosition ? <details><summary>保留的来源位置</summary><p className="field-help">({Math.round(node.relativePosition[0])}, {Math.round(node.relativePosition[1])}) cm；仅供旧资料追溯，不是进入模块的前置条件。</p></details> : null}
        </section>

        {relatedLinks.length ? (
          <section className="inspector-section">
            <h3>关联链路 {relatedLinks.length}</h3>
            {relatedLinks.map((item) => {
              const otherId = item.from === node.id ? item.to : item.from;
              const otherName = topology.nodes.find((candidate) => candidate.id === otherId)?.name ?? "?";
              return (
                <div key={item.id} className="logic-link-row">
                  <i style={{ background: LOGIC_KINDS[item.logic].color }} />
                  <span><strong>{item.label}</strong> {item.from === node.id ? "→" : "←"} {otherName}</span>
                  <em>{LOGIC_KINDS[item.logic].label}</em>
                </div>
              );
            })}
          </section>
        ) : null}

        {relatedIssues.length ? (
          <section className="inspector-section">
            <h3>这个区域的问题</h3>
            {relatedIssues.map((issue) => <div key={issue.id} className={`logic-issue is-${issue.severity}`}><span>{issue.message}</span></div>)}
          </section>
        ) : null}

        <div className="inspector-commands">
          <button type="button" className="danger-command" onClick={() => { if (confirmModuleChange(project, topology, [node.id], null)) removeNode(node.id); }}><Trash2 size={14} />删除区域</button>
        </div>
      </div>
    );
  }

  /* ---------------- 未选中 ---------------- */
  return (
    <div className="inspector-content">
      <header className="inspector-heading">
        <span>逻辑拓扑</span>
        <strong>{stats.nodes} 个区域</strong>
        <small>只表达逻辑结构，与真实位置无关</small>
      </header>

      <section className="inspector-section">
        <h3>拓扑统计</h3>
        <dl className="summary-list">
          <div><dt>区域</dt><dd>{stats.nodes}</dd></div>
          <div><dt>链路</dt><dd>{stats.links}</dd></div>
          <div><dt>单向链路</dt><dd>{stats.oneWay}</dd></div>
          <div><dt>锁钥门</dt><dd>{stats.locked}</dd></div>
          <div><dt>钥匙</dt><dd>{stats.keys}</dd></div>
        </dl>
      </section>

      <section className="inspector-section">
        <h3>继续搭建</h3>
        <p className="field-help">框选区域组成模块，双击模块标题即可进入内部搭建。逻辑问题会持续提醒；参考图和全局坐标都不是手工搭建的前置条件。</p>
      </section>

      <section className="inspector-section">
        <h3>怎么用</h3>
        <p className="field-help" style={{ marginTop: 0 }}>
          选中区域或链路查看详情。<br />
          从这个区域拖到另一个区域即可建立链路；先在左栏选好链路类型。<br />
          拖入模块可调整归属；模块可折叠查看关系，展开后继续编辑区域。
        </p>
      </section>
    </div>
  );
}
