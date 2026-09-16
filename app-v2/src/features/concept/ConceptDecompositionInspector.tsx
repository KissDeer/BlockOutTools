import { useMemo, useState } from "react";
import { CornerDownRight, Hammer, Layers, Maximize2, Minimize2, Plus, Trash2 } from "lucide-react";
import { NumberField } from "../../components/NumberField";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { NODE_ROLES, type LogicNodeRole } from "../../domain/concept";
import { deriveModuleLinks } from "../../domain/concept-decomposition";
import { useProjectStore } from "../../store/project-store";
import { useDecompositionUI } from "./decomposition-ui-store";
import { moduleColor } from "./module-colors";
import { useCurrentTopology } from "./use-current-topology";
import { confirmModuleChange } from "./confirm-module-change";
import "./decomposition-panels.css";

const ROLE_OPTIONS = (Object.keys(NODE_ROLES) as LogicNodeRole[]).map((value) => ({ value, label: NODE_ROLES[value] }));

export function ConceptDecompositionInspector() {
  const topology = useCurrentTopology();
  const project = useProjectStore((state) => state.project);
  const openModule = useProjectStore((state) => state.openLogicModule);
  const selectedNodeIds = useDecompositionUI((state) => state.selectedNodeIds);
  const selectedModuleId = useDecompositionUI((state) => state.selectedModuleId);
  const setSelection = useDecompositionUI((state) => state.setSelection);
  const focusNodes = useDecompositionUI((state) => state.focusNodes);
  const updateLogicModule = useProjectStore((state) => state.updateLogicModule);
  const removeLogicModule = useProjectStore((state) => state.removeLogicModule);
  const expandLogicModule = useProjectStore((state) => state.expandLogicModule);
  const collapseLogicModule = useProjectStore((state) => state.collapseLogicModule);
  const setConceptScope = useProjectStore((state) => state.setConceptScope);
  const updateNode = useProjectStore((state) => state.updateLogicNode);
  const addLogicModule = useProjectStore((state) => state.addLogicModule);
  const editDecomposition = useProjectStore((state) => state.editDecomposition);
  const [newName, setNewName] = useState("");
  const selected = topology.nodes.filter((node) => selectedNodeIds.includes(node.id));
  const selectedModule = topology.modules.find((module) => module.id === selectedModuleId);
  const moduleLinks = useMemo(() => deriveModuleLinks(topology), [topology]);
  const node = selected.length === 1 ? selected[0] : null;
  const owner = node ? topology.modules.find((module) => module.nodeIds.includes(node.id)) : null;
  const members = selectedModule ? topology.nodes.filter((item) => selectedModule.nodeIds.includes(item.id)) : [];
  const external = selectedModule ? moduleLinks.filter((link) => link.fromModuleId === selectedModule.id || link.toModuleId === selectedModule.id) : [];
  const membership = selected.map((item) => topology.modules.find((module) => module.nodeIds.includes(item.id))?.id ?? "");
  const sharedMembership = membership.every((id) => id === membership[0]) ? membership[0] ?? "" : "mixed";

  function createGroup() {
    const name = newName.trim();
    if (!name || !selected.length) return;
    if (!confirmModuleChange(project, topology, selected.map((item) => item.id), "__new_module__")) return;
    addLogicModule(name, selected.map((item) => item.id));
    setNewName("");
  }

  return <div className="inspector-content decomposition-context">
    <header className="inspector-heading">
      <span>{selectedModule ? "模块" : node ? "逻辑区域" : selected.length ? "批量编辑" : "逻辑拓扑"}</span>
      <strong>{selectedModule?.name ?? node?.name ?? (selected.length ? `已选 ${selected.length} 个区域` : "在画布上组织模块")}</strong>
      <small>{selectedModule ? `${members.length} 个区域 · ${external.length} 条模块间连接` : node ? `${NODE_ROLES[node.role]} · 逻辑层 F${node.floor}` : "归属变化在松开鼠标时生效，支持 Ctrl+Z 撤销"}</small>
    </header>
    {selectedModule ? <>
      <section className="inspector-section">
        <h3>模块属性</h3><TextField label="模块名称" value={selectedModule.name} onCommit={(name) => updateLogicModule(selectedModule.id, { name })} />
        <p className="field-help">拖动标题移动整个模块；双击标题直接搭建。折叠只改变显示，区域与连线保持不变。</p>
        <button type="button" className="primary-command" onClick={() => openModule(selectedModule.id)}><Hammer size={14} />搭建模块</button>
      </section>
      <section className="inspector-section"><h3>成员区域 · {members.length}</h3>
        <div className="decomposition-member-list">{members.length ? members.map((item) => <button type="button" key={item.id} onClick={() => { setSelection([item.id]); focusNodes([item.id]); }}>{item.name}<small>F{item.floor}</small></button>) : <p className="field-help">这是一个空模块。将区域拖入框内即可加入。</p>}</div>
      </section>
      {external.length ? <section className="inspector-section"><h3>模块间连接 · {external.length}</h3>
        {external.map((link) => <div className="logic-link-row" key={link.linkId}><span><strong>{link.label}</strong> {link.traversal === "both" ? "↔" : link.fromModuleId === selectedModule.id ? "→" : "←"} {topology.modules.find((module) => module.id === (link.fromModuleId === selectedModule.id ? link.toModuleId : link.fromModuleId))?.name ?? "?"}</span><em>{link.traversal === "both" ? "双向" : "单向"}{link.requiresKeyName ? ` · ${link.requiresKeyName}` : ""}</em></div>)}
      </section> : null}
      <section className="inspector-section"><details className="decomposition-context-details"><summary>层级与更多属性</summary>
        <TextField label="备注" value={selectedModule.note} onCommit={(note) => updateLogicModule(selectedModule.id, { note })} />
        <div className="decomposition-context-actions">
          {selectedModule.childScopeId ? <button type="button" className="secondary-command" onClick={() => setConceptScope(selectedModule.childScopeId!)}><CornerDownRight size={13} />进入子作用域</button> : null}
          <button type="button" className="secondary-command" title={selectedModule.childScopeId ? "解除引用，子作用域本身保留" : "模块内部还有一层时使用"} onClick={() => selectedModule.childScopeId ? collapseLogicModule(selectedModule.id) : expandLogicModule(selectedModule.id)}>{selectedModule.childScopeId ? <Minimize2 size={13} /> : <Maximize2 size={13} />}{selectedModule.childScopeId ? "收起子作用域" : "展开为子作用域"}</button>
        </div>
      </details></section>
      <div className="inspector-commands"><button type="button" className="danger-command" onClick={() => { if (!confirmModuleChange(project, topology, selectedModule.nodeIds, null)) return; removeLogicModule(selectedModule.id); setSelection(members.map((item) => item.id)); }}><Trash2 size={14} />解散模块</button><p className="field-help">保留全部区域、连线、已有白盒和实例，成员变为未归属；可一次撤销。</p></div>
    </> : selected.length ? <>
      {node ? <section className="inspector-section"><h3>区域属性</h3><div className="field-grid">
        <TextField label="名称" value={node.name} onCommit={(name) => updateNode(node.id, { name })} />
        <SelectField label="角色" value={node.role} options={ROLE_OPTIONS} onCommit={(role) => updateNode(node.id, { role })} />
        <NumberField label="逻辑层号" value={node.floor} step={1} unit="" onCommit={(floor) => updateNode(node.id, { floor: Math.round(floor) })} />
        <TextField label="说明" value={node.note} onCommit={(note) => updateNode(node.id, { note })} />
      </div></section> : <section className="inspector-section"><h3>已选区域</h3><p className="field-help">{selected.map((item) => item.name).join("、")}</p></section>}
      <section className="inspector-section"><h3>{node ? "所属模块" : "批量调整归属"}</h3>
        <p className="field-help">{node ? owner ? `当前属于“${owner.name}”。拖到其他模块即可改归属。` : "当前未分配。拖入模块框即可加入。" : "拖动已选区域可一起移入其他模块，也可在这里统一调整。"}</p>
        <label className="select-field"><span>{node ? "调整归属" : "全部移入"}</span><select aria-label="调整模块归属" value={sharedMembership} onChange={(event) => { const moduleId = event.target.value || null; if (confirmModuleChange(project, topology, selected.map((item) => item.id), moduleId)) editDecomposition({ assignments: selected.map((item) => ({ nodeId: item.id, moduleId })) }); }}>
          {sharedMembership === "mixed" ? <option value="mixed" disabled>来自多个模块</option> : null}
          <option value="">未分配</option>{topology.modules.map((module) => <option value={module.id} key={module.id}>{module.name}</option>)}
        </select></label>
        {membership.some(Boolean) ? <button type="button" className="secondary-command" onClick={() => { if (confirmModuleChange(project, topology, selected.map((item) => item.id), null)) editDecomposition({ assignments: selected.map((item) => ({ nodeId: item.id, moduleId: null })) }); }}>移出模块</button> : null}
      </section>
      <section className="inspector-section"><h3><Layers size={13} />组成新模块</h3>
        <form className="decomposition-create-form" onSubmit={(event) => { event.preventDefault(); createGroup(); }}><label className="text-field"><span>新模块名称</span><input value={newName} placeholder="例如：教堂" onChange={(event) => setNewName(event.target.value)} /></label><button type="submit" className="primary-command" disabled={!newName.trim()}><Plus size={13} />组成模块</button></form>
        <p className="field-help">把所选 {selected.length} 个区域放入新模块，原有连线保持不变。</p>
      </section>
    </> : <section className="inspector-section"><h3>直接在画布上操作</h3><ol className="decomposition-instructions"><li>空白处拖框，选中一组区域。</li><li>点“组成模块”，输入名称。</li><li>拖入、拖出模块框，调整归属。</li><li>拖动模块标题，移动整组。</li></ol><p className="field-help">Ctrl / ⌘ + 点击可追加选择。选中区域或模块后，这里显示对应属性。</p></section>}
    {!selectedModule && topology.modules.length ? <section className="inspector-section"><h3>模块 · {topology.modules.length}</h3><div className="decomposition-module-list">{topology.modules.map((module, index) => <button type="button" key={module.id} onClick={() => { setSelection([], module.id); focusNodes(module.nodeIds); }}><i style={{ background: moduleColor(index) }} /><span>{module.name}</span><small>{module.nodeIds.length}</small></button>)}</div></section> : null}
  </div>;
}
