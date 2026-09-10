import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import type { Vec2 } from "../../domain/types";
import { useProjectStore } from "../../store/project-store";

export function RoutingEdge(props: EdgeProps) {
  const points = (props.data?.waypoints ?? []) as Vec2[];
  const [drag, setDrag] = useState<{ index: number; point: Vec2 } | null>(null);
  const update = useProjectStore((state) => state.updateConnectionWaypoints);
  const { screenToFlowPosition } = useReactFlow();
  const visible = points.map((point, index) => index === drag?.index ? drag.point : point);
  const route: Vec2[] = [[props.sourceX, props.sourceY], ...visible, [props.targetX, props.targetY]];
  const [smooth, labelX, labelY] = getSmoothStepPath(props);
  const path = points.length ? route.map((point, i) => `${i ? "L" : "M"} ${point[0]} ${point[1]}`).join(" ") : smooth;
  return <>
    <g onDoubleClick={(event) => {
      event.stopPropagation();
      const click = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      let best = Infinity, insertAt = 0;
      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i], b = route[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((click.x - a[0]) * dx + (click.y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        const distance = Math.hypot(click.x - a[0] - t * dx, click.y - a[1] - t * dy);
        if (distance < best) { best = distance; insertAt = i; }
      }
      const next = [...points]; next.splice(insertAt, 0, [click.x, click.y]); update(props.id, next);
    }}>
      <BaseEdge id={props.id} path={path} markerStart={props.markerStart} markerEnd={props.markerEnd} style={props.style} interactionWidth={28} label={props.label} labelX={points.length ? visible[Math.floor(visible.length / 2)][0] : labelX} labelY={points.length ? visible[Math.floor(visible.length / 2)][1] - 18 : labelY} labelStyle={props.labelStyle} labelBgStyle={props.labelBgStyle} />
    </g>
    {props.selected ? <EdgeLabelRenderer>{visible.map((point, index) => <button key={index} className="route-point nodrag nopan" title="拖动折点；双击删除" style={{ transform: `translate(-50%, -50%) translate(${point[0]}px, ${point[1]}px)` }}
      onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDrag({ index, point }); }}
      onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const next = screenToFlowPosition({ x: event.clientX, y: event.clientY }); setDrag({ index, point: [next.x, next.y] }); }}
      onPointerUp={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; event.currentTarget.releasePointerCapture(event.pointerId); if (drag) update(props.id, points.map((p, i) => i === index ? drag.point : p)); setDrag(null); }}
      onPointerCancel={() => setDrag(null)}
      onDoubleClick={(event) => { event.stopPropagation(); update(props.id, points.filter((_, i) => i !== index)); }} />)}</EdgeLabelRenderer> : null}
  </>;
}
