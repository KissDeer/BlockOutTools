import { ArrowRight, Link2, Trash2 } from "lucide-react";
import type { BlockoutProject, ConnectionType, PortBlock } from "../../domain/types";
import { useProjectStore } from "../../store/project-store";
import { NumberField } from "../../components/NumberField";
import { connectionSpacing } from "../../domain/assembly-resolver";
import { CONNECTION_LABELS } from "../../domain/connection-labels";

function getEndpoint(project: BlockoutProject, instanceId: string, portId: string) {
  const instance = project.instances.find((item) => item.id === instanceId);
  const module = project.modules.find((item) => item.id === instance?.definitionId);
  const port = module?.blocks.find((item): item is PortBlock => item.type === "port" && item.id === portId);
  return { instance, port };
}

export function ConnectionInspector() {
  const project = useProjectStore((state) => state.project);
  const selectedId = useProjectStore((state) => state.selectedConnectionId);
  const updateType = useProjectStore((state) => state.updateSelectedConnectionType);
  const remove = useProjectStore((state) => state.deleteSelectedConnection);
  const updateSpacing = useProjectStore((state) => state.updateSelectedConnectionSpacing);
  const connection = project.connections.find((item) => item.id === selectedId);

  if (!connection) return null;
  const source = getEndpoint(project, connection.sourceInstanceId, connection.sourcePortId);
  const target = getEndpoint(project, connection.targetInstanceId, connection.targetPortId);
  const spacing = connectionSpacing(connection);

  return (
    <div className="inspector-content">
      <header className="inspector-heading type-heading">
        <span><Link2 size={14} />连接</span>
        <strong>{CONNECTION_LABELS[connection.type]}</strong>
        <small>拓扑与模块拼装关系</small>
      </header>
      <section className="inspector-section">
        <h3>连接类型</h3>
        <select value={connection.type} onChange={(event) => updateType(event.target.value as ConnectionType)}>
          {Object.entries(CONNECTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </section>
      <section className="inspector-section connection-endpoints">
        <h3>内部出入口</h3>
        <article>
          <span>起点</span>
          <strong>{source.instance?.name ?? "缺失实例"}</strong>
          <small>{source.port?.name ?? connection.sourcePortId}</small>
          {source.port ? <code>XY {source.port.transform.position[0]}, {source.port.transform.position[1]} · {source.port.transform.rotation}°</code> : null}
        </article>
        <ArrowRight size={15} />
        <article>
          <span>终点</span>
          <strong>{target.instance?.name ?? "缺失实例"}</strong>
          <small>{target.port?.name ?? connection.targetPortId}</small>
          {target.port ? <code>XY {target.port.transform.position[0]}, {target.port.transform.position[1]} · {target.port.transform.rotation}°</code> : null}
        </article>
      </section>
      <section className="inspector-section">
        <h3>端口相对距离</h3>
        <NumberField label="向前间距" value={spacing.forward} onCommit={(forward) => updateSpacing({ ...spacing, forward })} />
        <NumberField label="横向偏移" value={spacing.lateral} onCommit={(lateral) => updateSpacing({ ...spacing, lateral })} />
        <NumberField label="终点相对高差" value={spacing.vertical} onCommit={(vertical) => updateSpacing({ ...spacing, vertical })} />
        <p className="field-help">以起点箭头为前方。高差正数表示终点更高，负数表示更低，与是否单向通行无关。自定义距离在切换类型时保留。</p>
        <button type="button" onClick={() => updateSpacing(undefined)}>恢复该类型默认距离</button>
      </section>
      <section className="inspector-section">
        <h3>部署影响</h3>
        <dl className="summary-list">
          <div><dt>模块位姿</dt><dd>按端口求解</dd></div>
          <div><dt>连接器实体</dt><dd>不生成</dd></div>
          <div><dt>楼梯几何</dt><dd>仅模块内部积木</dd></div>
        </dl>
      </section>
      <code className="object-id" title={connection.id}>{connection.id}</code>
      <div className="inspector-commands">
        <button type="button" className="danger-command" onClick={remove}><Trash2 size={15} />删除连接</button>
      </div>
    </div>
  );
}
