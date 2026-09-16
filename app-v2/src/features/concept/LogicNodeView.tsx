import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Boxes, Flag, Route } from "lucide-react";
import { NODE_ROLES, type LogicNode } from "../../domain/concept";
import type { Block } from "../../domain/types";
import { ModulePlanPreview } from "./ModulePlanPreview";

export interface LogicNodeData extends Record<string, unknown> {
  node: LogicNode;
  /** 这个节点内部的**展平**几何：多层嵌套时给的是最终结果 */
  interiorBlocks: Block[];
  /** 内部还有几个区域、几条链路 */
  childCount: number;
  linkCount: number;
  isStart: boolean;
  incoming: number;
  outgoing: number;
  showPreview: boolean;
  /** 所属拆解模块（若有） */
  group: { name: string; color: string } | null;
}

const PREVIEW_WIDTH = 152;
const PREVIEW_HEIGHT = 76;

/** 节点内部几何的缩略图：多层嵌套已经展平，这里画的就是最终结果 */
function InteriorPlan({ blocks }: { blocks: Block[] }) {
  // 复用整体摆放那套俯视缩略图，保证同一份几何在哪儿画都长一样
  return <ModulePlanPreview module={{ id: "node-interior", name: "内部", revision: 0, blocks }} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} />;
}

export function LogicNodeView({ data, selected }: NodeProps) {
  const { node, interiorBlocks, childCount, linkCount, isStart, incoming, outgoing, showPreview, group } = data as LogicNodeData;
  const built = interiorBlocks.length > 0;
  const hasInterior = childCount > 0 || built;

  return (
    <div
      className={`logic-node role-${node.role} ${selected ? "is-selected" : ""} ${isStart ? "is-start" : ""} ${hasInterior ? "has-interior" : ""}`}
      style={group ? { borderTopColor: group.color, borderTopWidth: 3 } : undefined}
    >
      {[
        { side: Position.Top, label: "上" },
        { side: Position.Right, label: "右" },
        { side: Position.Bottom, label: "下" },
        { side: Position.Left, label: "左" },
      ].map(({ side, label }) => (
        <Handle key={side} id={side} type="source" position={side} className="logic-handle" title={`${label}侧连接点：拖出或接入连线`} aria-label={`${label}侧连接点：拖出或接入连线`} />
      ))}
      <div className="logic-node-head">
        <span className={`logic-role role-${node.role}`}>{NODE_ROLES[node.role]}</span>
        <span className="logic-floor">F{node.floor}</span>
        {group ? <span className="logic-module-badge" style={{ color: group.color, borderColor: group.color }} title={`所属模块：${group.name}`}>{group.name}</span> : null}
        {isStart ? <span className="logic-start"><Flag size={11} />起点</span> : null}
      </div>
      <div className="logic-node-name" title={node.name}>{node.name}</div>
      {showPreview && built ? (
        <div className="logic-node-preview">
          <InteriorPlan blocks={interiorBlocks} />
          <span className="logic-node-preview-meta">
            <Boxes size={11} />{interiorBlocks.filter((block) => block.type !== "port").length} 体块 · {interiorBlocks.filter((block) => block.type === "port").length} 出入口
          </span>
        </div>
      ) : null}
      {/* 里面还有什么：即使还没搭，也要先告诉人里面有几个东西、怎么连 */}
      {showPreview && !built && childCount > 0 ? (
        <div className="logic-node-interior">
          <Route size={12} />里面 {childCount} 个区域 · {linkCount} 条链路
        </div>
      ) : null}
      {showPreview && !built && childCount === 0 ? <div className="logic-node-unbound">内部还是空的</div> : null}
      <div className="logic-node-foot">
        <span>进 {incoming}</span><span>出 {outgoing}</span>
        {hasInterior ? <span className="logic-node-enter">双击进入</span> : null}
      </div>
    </div>
  );
}
