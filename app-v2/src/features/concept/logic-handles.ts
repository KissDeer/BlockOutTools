import type { LogicHandleSide, LogicLink } from "../../domain/concept";
import type { Vec2 } from "../../domain/types";

export function asLogicHandleSide(value: string | null): LogicHandleSide | undefined {
  return value === "top" || value === "right" || value === "bottom" || value === "left" ? value : undefined;
}

/** 旧连线随节点排版选择相向的边；手动选择的连接点始终保留。 */
export function resolveLogicHandles(
  link: Pick<LogicLink, "sourceHandle" | "targetHandle">,
  from: Vec2 = [0, 0],
  to: Vec2 = [1, 0],
): { sourceHandle: LogicHandleSide; targetHandle: LogicHandleSide } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sourceHandle = horizontal ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
  const targetHandle = horizontal ? (dx >= 0 ? "left" : "right") : (dy >= 0 ? "top" : "bottom");
  return { sourceHandle: link.sourceHandle ?? sourceHandle, targetHandle: link.targetHandle ?? targetHandle };
}
