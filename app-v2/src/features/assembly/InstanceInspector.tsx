import { CopyPlus, ExternalLink, Trash2 } from "lucide-react";
import { NumberField } from "../../components/NumberField";
import { useProjectStore } from "../../store/project-store";

export function InstanceInspector() {
  const project = useProjectStore((state) => state.project);
  const selectedId = useProjectStore((state) => state.selectedInstanceId);
  const connectionType = useProjectStore((state) => state.connectionType);
  const setConnectionType = useProjectStore((state) => state.setConnectionType);
  const updateTransform = useProjectStore((state) => state.updateInstanceTransform);
  const openModule = useProjectStore((state) => state.openModule);
  const duplicate = useProjectStore((state) => state.duplicateSelectedInstance);
  const remove = useProjectStore((state) => state.deleteSelectedInstance);
  const instance = project.instances.find((item) => item.id === selectedId);
  const module = project.modules.find((item) => item.id === instance?.definitionId);

  if (!instance || !module) return <div className="empty-inspector"><span>未选择模块</span><small>选择无限画布中的模块实例查看属性</small></div>;
  const transform = instance.assemblyTransform;

  return (
    <div className="inspector-content">
      <header className="inspector-heading"><span>实例</span><strong>{instance.name}</strong><small>{module.name}</small></header>
      <section className="inspector-section">
        <h3>实际组装 Transform</h3>
        <div className="field-grid two-columns">
          <NumberField label="X" value={transform.position[0]} onCommit={(value) => updateTransform(instance.id, { ...transform, position: [value, transform.position[1], transform.position[2]] })} />
          <NumberField label="Y" value={transform.position[1]} onCommit={(value) => updateTransform(instance.id, { ...transform, position: [transform.position[0], value, transform.position[2]] })} />
          <NumberField label="Z" value={transform.position[2]} onCommit={(value) => updateTransform(instance.id, { ...transform, position: [transform.position[0], transform.position[1], value] })} />
          <NumberField label="旋转" value={transform.rotation} unit="°" step={15} onCommit={(value) => updateTransform(instance.id, { ...transform, rotation: value })} />
        </div>
        <p className="field-help">关系图拖动不会修改这里的坐标。</p>
      </section>
      <section className="inspector-section">
        <h3>连接形式</h3>
        <select value={connectionType} onChange={(event) => setConnectionType(event.target.value as typeof connectionType)}>
          <option value="door">普通门</option>
          <option value="one-way-door">单向门</option>
          <option value="stairs">楼梯</option>
          <option value="spiral-stairs">螺旋楼梯</option>
          <option value="elevator">普通电梯</option>
          <option value="one-way-elevator">单向电梯</option>
          <option value="road">普通路</option>
          <option value="drop">单向下落路</option>
        </select>
        <p className="field-help">拖动俯视缩略图中的出入口箭头建立连接。</p>
      </section>
      <section className="inspector-section">
        <h3>模块内容</h3>
        <dl className="summary-list"><div><dt>积木</dt><dd>{module.blocks.length}</dd></div><div><dt>出入口</dt><dd>{module.blocks.filter((block) => block.type === "port").length}</dd></div><div><dt>修订</dt><dd>r{module.revision}</dd></div></dl>
      </section>
      <div className="inspector-commands">
        <button type="button" className="primary-command" onClick={() => openModule(instance.id)}><ExternalLink size={15} />编辑内部</button>
        <button type="button" className="secondary-command" onClick={duplicate}><CopyPlus size={15} />复用实例</button>
        <button type="button" className="danger-command" onClick={remove}><Trash2 size={15} />删除实例</button>
      </div>
    </div>
  );
}
