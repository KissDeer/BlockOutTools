import type { ConnectionType } from "./types";

export const CONNECTION_LABELS: Record<ConnectionType, string> = {
  door: "普通门", "one-way-door": "单向门", stairs: "楼梯", "spiral-stairs": "螺旋楼梯",
  elevator: "普通电梯", "one-way-elevator": "单向电梯", road: "普通路", drop: "单向下落路",
};
