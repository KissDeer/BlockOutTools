/** 模块配色：按模块索引取色，让"哪些区域属于同一个模块"在画布上一眼可见 */
const MODULE_COLORS = ["#4bb89a", "#d8a84e", "#7fb2d8", "#df7062", "#b08bd8", "#6bd2b4", "#c9a227", "#8f9a91"];

export function moduleColor(index: number): string {
  return MODULE_COLORS[((index % MODULE_COLORS.length) + MODULE_COLORS.length) % MODULE_COLORS.length];
}
