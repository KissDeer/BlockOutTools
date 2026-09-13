import type { PreviewBlock } from "./module-preview-model";

export function rgbaToCss(color: [number, number, number, number], alpha = 1): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3] * alpha})`;
}

/** 俯视缩略图绘制顺序：出入口最后画，大块在下、小块在上，避免被盖住 */
export function sortPreviewBlocks(blocks: PreviewBlock[]): PreviewBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.block.type === "port") return 1;
    if (b.block.type === "port") return -1;
    return b.width * b.height - a.width * a.height;
  });
}

/** 单个积木的俯视图元：Box 实心、Doorway 留门洞、楼梯画踏步线、Port 画出入口轮廓 */
export function PlanBlock({ item }: { item: PreviewBlock }) {
  const { block, x, y, width, height, rotation } = item;
  if (block.type === "port") {
    return (
      <g transform={`translate(${x} ${y}) rotate(${rotation})`} className="module-plan-port-footprint">
        <rect x={-width / 2} y={-height / 2} width={width} height={height} />
      </g>
    );
  }

  const fill = rgbaToCss(block.parameters.blockout_material_color, block.type === "box" ? 0.66 : 0.76);
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`} className={`module-plan-block type-${block.type}`}>
      <title>{block.name}</title>
      <rect x={-width / 2} y={-height / 2} width={width} height={height} fill={fill} />
      {block.type === "doorway" ? (
        <rect className="module-plan-door-opening" x={-width * 0.32} y={-height * 0.3} width={width * 0.64} height={height * 0.6} />
      ) : null}
      {block.type === "stairs-linear" ? Array.from({ length: Math.min(16, block.parameters.NumberOfSteps - 1) }, (_, index) => {
        const stepY = -height / 2 + (height / block.parameters.NumberOfSteps) * (index + 1);
        return <line key={index} x1={-width / 2} y1={stepY} x2={width / 2} y2={stepY} />;
      }) : null}
    </g>
  );
}
