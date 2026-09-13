import { useMemo } from "react";
import { createModulePreviewModel } from "../assembly/module-preview-model";
import { PlanBlock, sortPreviewBlocks } from "../assembly/module-plan-blocks";
import type { ModuleDefinition } from "../../domain/types";

interface ModulePlanPreviewProps {
  module: ModuleDefinition;
  width?: number;
  height?: number;
  className?: string;
}

/** 模块内部俯视缩略图：直接复用组装层同一套模型，避免出现第二套几何解释 */
export function ModulePlanPreview({ module, width = 228, height = 116, className = "" }: ModulePlanPreviewProps) {
  const preview = useMemo(() => createModulePreviewModel(module, width, height), [module, width, height]);
  const ordered = useMemo(() => sortPreviewBlocks(preview.blocks), [preview]);

  return (
    <div className={`module-plan-preview ${className}`} style={{ width, height }}>
      <svg viewBox={`0 0 ${preview.width} ${preview.height}`} role="img" aria-label={`${module.name} 内部俯视缩略图`}>
        <title>{module.name} 内部俯视缩略图</title>
        {ordered.map((item) => <PlanBlock key={item.block.id} item={item} />)}
      </svg>
      {module.blocks.length === 0 ? <span className="module-plan-empty">空模块</span> : null}
    </div>
  );
}
