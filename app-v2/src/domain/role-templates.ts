import type { LogicNodeRole } from "./concept";

/**
 * 按区域角色的默认体块尺寸（厘米）。
 *
 * 这是**确定性规则，不是 AI**：快速体块起稿用它给出一个可用的起点，
 * 生成的积木都要标 `estimated`，并在 assumptions 里说明默认尺度未经核对。
 *
 * 原来住在 `concept-configuration.ts`（已退役的"构型"功能）里，挪出来独立存在 ——
 * 它是"角色 → 默认尺寸"这一条规则，和构型那套候选/校验没有关系。
 */
export const ROLE_TEMPLATES: Record<LogicNodeRole, { width: number; depth: number; height: number; label: string }> = {
  start: { width: 1800, depth: 1800, height: 400, label: "起点小厅" },
  transition: { width: 1200, depth: 3600, height: 400, label: "走廊" },
  hub: { width: 3000, depth: 3000, height: 500, label: "枢纽大厅" },
  combat: { width: 3600, depth: 3000, height: 600, label: "战斗区" },
  reward: { width: 2000, depth: 2000, height: 400, label: "奖励间" },
  boss: { width: 4200, depth: 3600, height: 800, label: "Boss 区" },
  secret: { width: 1200, depth: 1200, height: 300, label: "隐藏区域" },
};
