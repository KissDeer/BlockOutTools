import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

export interface LogicEdgeData extends Record<string, unknown> {
  color: string;
  dash: boolean;
  label: string;
  kindLabel: string;
  keyName: string | null;
  traversalLabel: string;
  /**
   * 垂直偏移量，由画布按"排序后的节点对"统一算好。
   * 不能在边内部按 source→target 现算：反向链路的垂直向量会同时翻转，把偏移抵消掉，
   * 导致 A→B 与 B→A 两条边的标签完全重合。
   */
  offset: [number, number];
}

export function LogicEdgeView(props: EdgeProps) {
  const data = props.data as LogicEdgeData;
  const [ox, oy] = data.offset;
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = props;
  const cx = (sx + tx) / 2 + ox;
  const cy = (sy + ty) / 2 + oy;
  const midX = 0.25 * sx + 0.5 * cx + 0.25 * tx;
  const midY = 0.25 * sy + 0.5 * cy + 0.25 * ty;
  const path = `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`;

  return (
    <>
      <path d={path} fill="none" stroke="transparent" strokeWidth={22} />
      <path
        d={path}
        fill="none"
        stroke={data.color}
        strokeWidth={props.selected ? 3.5 : 2.4}
        strokeDasharray={data.dash ? "7 5" : undefined}
        markerEnd={props.markerEnd}
        opacity={props.selected ? 1 : 0.9}
      />
      <EdgeLabelRenderer>
        <div
          className={`logic-edge-label ${props.selected ? "is-selected" : ""} ${data.dash ? "is-dash" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`, borderColor: data.color }}
        >
          <strong style={{ color: data.color }}>{data.label}</strong>
          <span>{data.kindLabel}</span>
          {data.keyName ? <em>🔑 {data.keyName}</em> : null}
          {data.traversalLabel ? <i>{data.traversalLabel}</i> : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
