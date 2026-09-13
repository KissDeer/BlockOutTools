import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";
import { NODE_ROLES, type LogicNode } from "../../domain/concept";
import type { ModuleDefinition } from "../../domain/types";
import { ModulePlanPreview } from "./ModulePlanPreview";

export interface LogicNodeData extends Record<string, unknown> {
  node: LogicNode;
  module: ModuleDefinition | null;
  isStart: boolean;
  incoming: number;
  outgoing: number;
  showPreview: boolean;
}

export function LogicNodeView({ data, selected }: NodeProps) {
  const { node, module, isStart, incoming, outgoing, showPreview } = data as LogicNodeData;

  return (
    <div className={`logic-node role-${node.role} ${selected ? "is-selected" : ""} ${isStart ? "is-start" : ""}`}>
      <Handle type="target" position={Position.Left} className="logic-handle" />
      <div className="logic-node-head">
        <span className={`logic-role role-${node.role}`}>{NODE_ROLES[node.role]}</span>
        <span className="logic-floor">F{node.floor}</span>
        {isStart ? <span className="logic-start"><Flag size={11} />起点</span> : null}
      </div>
      <div className="logic-node-name" title={node.name}>{node.name}</div>
      {module && showPreview ? (
        <div className="logic-node-preview">
          <ModulePlanPreview module={module} width={152} height={76} />
          <span className="logic-node-preview-meta">{module.blocks.length} 积木 · {module.blocks.filter((block) => block.type === "port").length} 出入口</span>
        </div>
      ) : null}
      {!module ? <div className="logic-node-unbound">未绑定模块</div> : null}
      <div className="logic-node-foot"><span>进 {incoming}</span><span>出 {outgoing}</span></div>
      <Handle type="source" position={Position.Right} className="logic-handle" />
    </div>
  );
}
