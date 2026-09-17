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
import { childScopeIdOf } from "../../domain/concept-scopes";
import { validateTopology } from "../../domain/concept-validation";
import { NumberField } from "../../components/NumberField";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { useProjectStore } from "../../store/project-store";
import { NodePlanPreview } from "../node-preview/NodePlanPreview";
import { useCurrentTopology } from "./use-current-topology";

const LOGIC_OPTIONS = (Object.keys(LOGIC_KINDS) as LogicKind[]).map((kind) => ({ value: kind, label: LOGIC_KINDS[kind].label }));
const ROLE_OPTIONS = (Object.keys(NODE_ROLES) as LogicNodeRole[]).map((role) => ({ value: role, label: NODE_ROLES[role] }));
const TRAVERSAL_OPTIONS = (Object.keys(TRAVERSALS) as LogicTraversal[]).map((value) => ({ value, label: TRAVERSALS[value] }));

export function ConceptInspector() {
  const topology = useCurrentTopology();
  const selectedNodeId = useProjectStore((state) => state.selectedLogicNodeId);
  const selectedLinkId = useProjectStore((state) => state.selectedLogicLinkId);
  const updateNode = useProjectStore((state) => state.updateLogicNode);
  const removeNode = useProjectStore((state) => state.removeLogicNode);
  const updateLink = useProjectStore((state) => state.updateLogicLink);
  const removeLink = useProjectStore((state) => state.removeLogicLink);
  const addLogicKey = useProjectStore((state) => state.addLogicKey);
  const setStartNode = useProjectStore((state) => state.setLogicStartNode);
  const enterNode = useProjectStore((state) => state.enterNode);
  const addNodeSubLevel = useProjectStore((state) => state.addNodeSubLevel);
  const collapseSubLevel = useProjectStore((state) => state.collapseSubLevel);
  /** 根层的节点直接相对整张图；子层里的相对它父节点。只影响怎么跟人解释这个坐标 */
  const inRootScope = useProjectStore((state) => state.conceptScopeId === null);
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
    const isStart = topology.startNodeId === node.id;
    const relatedLinks = topology.links.filter((item) => item.from === node.id || item.to === node.id);
    const relatedIssues = issues.filter((issue) => issue.nodeIds.includes(node.id));
    const hasSubLevel = Boolean(childScopeIdOf(topology, node.id));
    const nodeBlocks = node.blocks ?? [];

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
          <h3>这个区域的内部</h3>
          {/* 节点是唯一的容器：几何直接挂在它身上，不再需要先归到一个模块里 */}
          <p className="field-help">
            {hasSubLevel
              ? "里面已经分出了子区域。进去后左边是子区域的逻辑图，右边是这个区域自己的体块。"
              : "进去拼这个区域自己的体块。需要再分一层子区域时，随时可以在里面加。"}
          </p>
          {nodeBlocks.length ? <NodePlanPreview blocks={nodeBlocks} name={node.name} width={268} height={152} /> : null}
          <button type="button" className="primary-command" onClick={() => enterNode(node.id)}><ExternalLink size={14} />进入「{node.name}」{hasSubLevel ? "（分屏）" : ""}</button>
          {hasSubLevel
            ? <button type="button" className="secondary-command" onClick={() => collapseSubLevel(node.id)}>收掉子区域层（几何保留）</button>
            : <button type="button" className="secondary-command" onClick={() => addNodeSubLevel(node.id)}><Plus size={14} />在里面加一层子区域</button>}
        </section>

        <section className="inspector-section">
          <h3>落位与朝向</h3>
          {/*
            这里编的不是画布排版，而是**真实坐标**：节点在父级里的落位，
            同时就是它自己那套坐标的原点。它的积木和子层内容全部相对这个点。
          */}
          <p className="field-help">
            {inRootScope
              ? "相对整张图的原点，单位厘米。这里的位置直接决定 3D 预览与 UE 导出落在哪里。"
              : "相对它所在那一层（也就是它父节点）的原点，单位厘米。改这里会带着它内部的积木和子区域一起移动。"}
          </p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(node.relativePosition)}
              onChange={(event) => updateNode(node.id, { relativePosition: event.target.checked ? [0, 0] : null })}
            />已确定落位
          </label>
          {node.relativePosition ? <>
            <div className="field-grid two-columns">
              <NumberField label="X" unit="cm" value={node.relativePosition[0]} onCommit={(x) => updateNode(node.id, { relativePosition: [x, node.relativePosition?.[1] ?? 0] })} />
              <NumberField label="Y" unit="cm" value={node.relativePosition[1]} onCommit={(y) => updateNode(node.id, { relativePosition: [node.relativePosition?.[0] ?? 0, y] })} />
            </div>
            <NumberField label="朝向" unit="°" value={node.relativeRotation ?? 0} step={15} onCommit={(rotation) => updateNode(node.id, { relativeRotation: rotation })} />
          </> : <p className="status-warning">还没有落位：展平与导出会把它按原点处理，多个未落位的区域会叠在一起，看起来像少了几块。</p>}
        </section>

        <section className="inspector-section">
          <h3>标高要求</h3>
          <p className="field-help">逻辑层号只作提示。确定的标高会成为搭建依据；未确定时可以留空。</p>
          <label className="checkbox-field"><input type="checkbox" checked={Boolean(node.elevation)} onChange={(event) => updateNode(node.id, { elevation: event.target.checked ? { base: 0, top: 400 } : null })} />已确定标高</label>
          {node.elevation ? <div className="field-grid two-columns">
            <NumberField label="底面标高" value={node.elevation.base} onCommit={(base) => updateNode(node.id, { elevation: { base, top: node.elevation?.top ?? base } })} />
            <NumberField label="顶面标高" value={node.elevation.top} onCommit={(top) => updateNode(node.id, { elevation: { base: node.elevation?.base ?? 0, top } })} />
          </div> : null}
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
          <button type="button" className="danger-command" onClick={() => removeNode(node.id)}><Trash2 size={14} />删除区域</button>
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
