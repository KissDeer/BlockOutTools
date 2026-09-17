import { useMemo } from "react";
import { createNodePreviewModel } from "./node-preview-model";
import { PlanBlock, sortPreviewBlocks } from "./plan-blocks";
import type { Block } from "../../domain/types";

interface NodePlanPreviewProps {
  /** 只要一份积木和一个名字：节点自己的几何与旧模块定义都能喂进来 */
  blocks: Block[];
  name: string;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * 节点内部的俯视缩略图。
 *
 * 铺法只有这一套（`node-preview-model`）—— 层级树、节点卡片、检查器都用它，
 * 同一份几何在哪儿画都长一样。
 */
export function NodePlanPreview({ blocks, name, width = 228, height = 116, className = "" }: NodePlanPreviewProps) {
  const preview = useMemo(() => createNodePreviewModel({ blocks }, width, height), [blocks, width, height]);
  const ordered = useMemo(() => sortPreviewBlocks(preview.blocks), [preview]);

  return (
    <div className={`module-plan-preview ${className}`} style={{ width, height }}>
      <svg viewBox={`0 0 ${preview.width} ${preview.height}`} role="img" aria-label={`${name} 内部俯视缩略图`}>
        <title>{name} 内部俯视缩略图</title>
        {ordered.map((item) => <PlanBlock key={item.block.id} item={item} />)}
      </svg>
      {blocks.length === 0 ? <span className="module-plan-empty">里面还是空的</span> : null}
    </div>
  );
}
