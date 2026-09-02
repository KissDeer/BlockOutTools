import { useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, ChartNoAxesColumnIncreasing, DoorOpen } from "lucide-react";
import type { ModuleDefinition, ModuleInstance, PortBlock } from "../../domain/types";
import { createModulePreviewModel, type PreviewBlock } from "./module-preview-model";

export interface ModuleNodeData extends Record<string, unknown> {
  instance: ModuleInstance;
  module: ModuleDefinition;
  occupiedPortKeys: string[];
  pendingPortKey: string | null;
  onOpen: (instanceId: string) => void;
  onPortClick: (instanceId: string, portId: string) => void;
}

function handlePosition(port: PortBlock): Position {
  const angle = ((port.transform.rotation % 360) + 360) % 360;
  if (angle < 45 || angle >= 315) return Position.Right;
  if (angle < 135) return Position.Bottom;
  if (angle < 225) return Position.Left;
  return Position.Top;
}

function rgbaToCss(color: [number, number, number, number], alpha = 1): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3] * alpha})`;
}

function PlanBlock({ item }: { item: PreviewBlock }) {
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

export function ModuleNode({ data, selected }: NodeProps) {
  const nodeData = data as ModuleNodeData;
  const { instance, module, occupiedPortKeys, pendingPortKey, onOpen, onPortClick } = nodeData;
  const { ports, boxCount, stairCount, doorCount, preview, previewBlocks } = useMemo(() => {
    const nextPreview = createModulePreviewModel(module);
    return {
      ports: module.blocks.filter((block): block is PortBlock => block.type === "port"),
      boxCount: module.blocks.filter((block) => block.type === "box").length,
      stairCount: module.blocks.filter((block) => block.type === "stairs-linear").length,
      doorCount: module.blocks.filter((block) => block.type === "doorway").length,
      preview: nextPreview,
      previewBlocks: [...nextPreview.blocks].sort((a, b) => {
        if (a.block.type === "port") return 1;
        if (b.block.type === "port") return -1;
        return b.width * b.height - a.width * a.height;
      }),
    };
  }, [module]);

  return (
    <div className={`module-node ${selected ? "is-selected" : ""}`} onDoubleClick={() => onOpen(instance.id)}>
      <header><span>{instance.name}</span><small>Z {instance.assemblyTransform.position[2]}</small></header>
      <div className="module-node-body">
        <strong title={module.name}>{module.name}</strong>
        <div className="module-plan" aria-label={`${module.name} 内部俯视缩略图`}>
          <svg viewBox={`0 0 ${preview.width} ${preview.height}`} role="img">
            <title>{module.name} 内部俯视缩略图</title>
            {previewBlocks.map((item) => <PlanBlock key={item.block.id} item={item} />)}
          </svg>
          {preview.blocks.filter((item): item is PreviewBlock & { block: PortBlock } => item.block.type === "port").map((item) => {
            const portKey = `${instance.id}::${item.block.id}`;
            const occupied = occupiedPortKeys.includes(portKey);
            const pending = pendingPortKey === portKey;
            return (
              <Handle
                key={item.block.id}
                id={item.block.id}
                type="source"
                position={handlePosition(item.block)}
                isConnectable={!occupied}
                className={`module-port ${occupied ? "is-occupied" : ""} ${pending ? "is-pending" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!occupied) onPortClick(instance.id, item.block.id);
                }}
                style={{
                  left: `${item.x / preview.width * 100}%`,
                  top: `${item.y / preview.height * 100}%`,
                  "--port-angle": `${item.rotation}deg`,
                } as React.CSSProperties}
                title={`${item.block.name} · 内部 (${item.block.transform.position[0]}, ${item.block.transform.position[1]}) · ${item.rotation}°`}
              />
            );
          })}
        </div>
        <div className="module-node-meta">
          <div className="module-node-stats">
            <span title="Box"><Box size={13} />{boxCount}</span>
            <span title="Doorway"><DoorOpen size={13} />{doorCount}</span>
            <span title="Stairs"><ChartNoAxesColumnIncreasing size={13} />{stairCount}</span>
          </div>
          <small>{ports.length} 个出入口</small>
        </div>
      </div>
    </div>
  );
}
