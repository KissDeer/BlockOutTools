import { CopyPlus, Layers3, Plus } from "lucide-react";
import { useProjectStore } from "../../store/project-store";

export function AssemblySidebar() {
  const project = useProjectStore((state) => state.project);
  const selectedInstanceId = useProjectStore((state) => state.selectedInstanceId);
  const selectInstance = useProjectStore((state) => state.setSelectedInstance);
  const addModule = useProjectStore((state) => state.addModule);
  const duplicate = useProjectStore((state) => state.duplicateSelectedInstance);
  const selected = project.instances.find((item) => item.id === selectedInstanceId);

  return (
    <div className="sidebar-content">
      <div className="sidebar-heading"><div><span>模块库</span><strong>{project.modules.length}</strong></div><Layers3 size={16} /></div>
      <div className="sidebar-actions">
        <button type="button" className="primary-command" onClick={() => addModule()}><Plus size={15} />新增模块</button>
        <button type="button" className="secondary-command" disabled={!selected} onClick={duplicate}><CopyPlus size={15} />复用实例</button>
      </div>
      <div className="module-definition-list">
        {project.modules.map((module) => {
          const instances = project.instances.filter((item) => item.definitionId === module.id);
          const ports = module.blocks.filter((item) => item.type === "port").length;
          const active = selected?.definitionId === module.id;
          return (
            <button
              type="button"
              key={module.id}
              className={active ? "is-selected" : ""}
              onClick={() => selectInstance(instances[0]?.id ?? null)}
            >
              <span><strong>{module.name}</strong><small>r{module.revision}</small></span>
              <em>{instances.length} 实例 · {ports} 出入口</em>
            </button>
          );
        })}
      </div>
      <div className="sidebar-footnote">关系图位置只用于排版，不改变实际组装坐标。</div>
    </div>
  );
}
