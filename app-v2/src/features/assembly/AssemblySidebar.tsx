import { useMemo, useState } from "react";
import { CopyPlus, Layers3, Plus } from "lucide-react";
import { useProjectStore } from "../../store/project-store";
import { allModules } from "../../domain/concept-scopes";
import { modulePlacementPaths } from "../../domain/module-workflow";
import { moduleShapeStatus } from "../../domain/module-draft";
import type { BlockoutProject, ModuleDefinition } from "../../domain/types";

const SHAPE_LABELS = { empty: "未搭建", unconfirmed: "形态待确认", confirmed: "形态已确认", stale: "要求或几何已变化 · 待核对" };

function ModuleCard({ module, project }: { module: ModuleDefinition; project: BlockoutProject }) {
  const selectedId = useProjectStore((state) => state.selectedInstanceId);
  const [pathKey, setPathKey] = useState("");
  const instances = project.instances.filter((item) => item.definitionId === module.id);
  const select = useProjectStore((state) => state.setSelectedInstance);
  const paths = modulePlacementPaths(project, module.id);
  const selectedPath = paths.length === 1 ? paths[0] : paths.find((option) => JSON.stringify(option.path) === pathKey);
  const placed = instances.some((instance) => !selectedPath || JSON.stringify(instance.scopePath ?? []) === JSON.stringify(selectedPath.path));
  const ports = module.blocks.filter((block) => block.type === "port");
  const connected = instances.reduce((count, instance) => count + project.connections.filter((link) => link.sourceInstanceId === instance.id || link.targetInstanceId === instance.id).length, 0);
  function place() {
    const state = useProjectStore.getState();
    const id = state.placeModule(module.id, selectedPath?.path);
    if (id) state.showAssembly();
  }
  return <article className={`workflow-module-card ${instances.some((instance) => instance.id === selectedId) ? "is-selected" : ""}`}>
    <strong>{module.name}</strong>
    <p>{SHAPE_LABELS[moduleShapeStatus(project, module.id)]}<br />{instances.length ? `${instances.length} 实例 · ${connected} 已对接端点` : "尚未放入整体"} · {ports.length} 出入口</p>
    {paths.length > 1 && <select aria-label={`${module.name}的放置路径`} value={selectedPath ? pathKey : ""} onChange={(event) => setPathKey(event.target.value)}><option value="">选择复用路径</option>{paths.map((option) => <option key={JSON.stringify(option.path)} value={JSON.stringify(option.path)}>{option.label} / {module.name}</option>)}</select>}
    <div className="module-card-actions"><button type="button" className="secondary-command" onClick={() => useProjectStore.getState().openModuleById(module.id)}>编辑内部</button><button type="button" className="secondary-command" disabled={paths.length > 1 && !selectedPath} onClick={place}>{placed ? "定位实例" : "放入整体"}</button></div>
    {instances.map((instance) => <button key={instance.id} type="button" className="instance-choice" aria-pressed={selectedId === instance.id} onClick={() => select(instance.id)} onDoubleClick={() => useProjectStore.getState().openModule(instance.id)}>{instance.name} · {instance.assemblyTransform.position.join(", ")} cm</button>)}
  </article>;
}

export function AssemblySidebar() {
  const project = useProjectStore((state) => state.project);
  const selectedInstanceId = useProjectStore((state) => state.selectedInstanceId);
  const addModule = useProjectStore((state) => state.addModule);
  const duplicate = useProjectStore((state) => state.duplicateSelectedInstance);
  const openLogicModule = useProjectStore((state) => state.openLogicModule);
  const pending = useMemo(() => project.concept ? allModules(project.concept).filter(({ module }) => module.childScopeId || !project.modules.some((definition) => definition.id === module.moduleDefinitionId)) : [], [project.concept, project.modules]);
  return <div className="sidebar-content">
    <div className="sidebar-heading"><div><span>拓扑模块与整体实例</span><strong>{project.modules.length + pending.length}</strong></div><Layers3 size={16} /></div>
    <div className="sidebar-actions">
      <button type="button" className="primary-command" onClick={() => addModule()}><Plus size={15} />独立模块</button>
      <button type="button" className="secondary-command" disabled={!selectedInstanceId} onClick={duplicate}><CopyPlus size={15} />复用所选实例</button>
    </div>
    <div className="workflow-module-list">
      {pending.map(({ module }) => <article key={module.id} className="workflow-module-card"><strong>{module.name}</strong><p>{module.nodeIds.length} 个区域 · {module.childScopeId ? "包含子层模块" : "未搭建 · 可直接开始"}</p><button type="button" className="secondary-command" onClick={() => openLogicModule(module.id)}>{module.childScopeId ? "进入子层" : "搭建模块"}</button></article>)}
      {project.modules.map((module) => <ModuleCard key={module.id} module={module} project={project} />)}
    </div>
    <div className="sidebar-footnote">放入整体仅添加所选模块，使用临时摆放。关系图用于排版；在右侧调整厘米位置与旋转，再核对出入口。</div>
  </div>;
}
