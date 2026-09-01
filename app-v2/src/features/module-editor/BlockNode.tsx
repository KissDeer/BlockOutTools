import { useEffect, useRef } from "react";
import Konva from "konva";
import { Arrow, Group, Line, Rect, Text, Transformer } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { blockPlanSize } from "../../domain/catalog";
import type { Block, Rgba } from "../../domain/types";
import type { TransformMode } from "../../store/project-store";

function rgbaToCss(color: Rgba, alpha = 1): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3] * alpha})`;
}

function snap(value: number, grid = 50): number {
  return Math.round(value / grid) * grid;
}

function resizedBlock(block: Block, width: number, height: number): Block {
  const next = structuredClone(block);
  if (next.type === "box") next.parameters.BoxSize = [width, height, next.parameters.BoxSize[2]];
  if (next.type === "doorway") next.parameters.DoorwaySize = [width, Math.max(1, height - next.parameters.SideThickness * 2), next.parameters.DoorwaySize[2]];
  if (next.type === "stairs-linear") next.parameters.StairsSize = [width, height, next.parameters.StairsSize[2]];
  if (next.type === "port") { next.parameters.depth = width; next.parameters.width = height; }
  return next;
}

interface BlockNodeProps {
  block: Block;
  selected: boolean;
  mode: TransformMode;
  onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (block: Block) => void;
}

export function BlockNode({ block, selected, mode, onSelect, onChange }: BlockNodeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [width, height] = blockPlanSize(block);

  useEffect(() => {
    if (!selected || !groupRef.current || !transformerRef.current) return;
    transformerRef.current.nodes([groupRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selected, mode]);

  function commitTransform() {
    const node = groupRef.current;
    if (!node) return;
    const nextWidth = Math.max(10, snap(width * Math.abs(node.scaleX()), 10));
    const nextHeight = Math.max(10, snap(height * Math.abs(node.scaleY()), 10));
    const next = resizedBlock(block, nextWidth, nextHeight);
    next.transform.position = [snap(node.x()), snap(node.y()), block.transform.position[2]];
    next.transform.rotation = Math.round(node.rotation());
    node.scale({ x: 1, y: 1 });
    onChange(next);
  }

  const fill = block.type === "port" ? "rgba(216,168,78,.15)" : rgbaToCss(block.parameters.blockout_material_color, 0.78);
  return (
    <>
      <Group
        ref={groupRef}
        x={block.transform.position[0]}
        y={block.transform.position[1]}
        rotation={block.transform.rotation}
        draggable={mode === "move"}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={commitTransform}
        onTransformEnd={commitTransform}
      >
        {block.type === "port" ? (
          <>
            <Arrow points={[-width / 2, 0, width / 2, 0]} pointerLength={34} pointerWidth={34} stroke="#d8a84e" fill="#d8a84e" strokeWidth={18} opacity={0.92} />
            <Rect x={-width / 2} y={-height / 2} width={width} height={height} stroke="#d8a84e" dash={[20, 12]} strokeWidth={7} fill={fill} />
          </>
        ) : (
          <Rect x={-width / 2} y={-height / 2} width={width} height={height} fill={fill} stroke={selected ? "#6bd2b4" : "#59635c"} strokeWidth={selected ? 9 : 5} />
        )}
        {block.type === "doorway" ? (
          <Rect x={-width / 2 + width * 0.18} y={-height / 2 + height * 0.2} width={width * 0.64} height={height * 0.6} stroke="#eef2ee" strokeWidth={7} dash={[16, 9]} opacity={0.8} />
        ) : null}
        {block.type === "stairs-linear" ? Array.from({ length: Math.min(24, block.parameters.NumberOfSteps - 1) }, (_, index) => {
          const y = -height / 2 + (height / block.parameters.NumberOfSteps) * (index + 1);
          return <Line key={index} points={[-width / 2, y, width / 2, y]} stroke="rgba(238,242,238,.55)" strokeWidth={4} />;
        }) : null}
        <Text text={block.name} x={-width / 2 + 12} y={-height / 2 + 10} width={Math.max(60, width - 24)} fontSize={44} fill="#eef2ee" ellipsis wrap="none" listening={false} />
      </Group>
      {selected ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled={mode === "rotate" || mode === "scale"}
          resizeEnabled={mode === "scale"}
          enabledAnchors={mode === "scale" ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"] : []}
          borderStroke="#6bd2b4"
          borderStrokeWidth={5}
          anchorFill="#eef2ee"
          anchorStroke="#4bb89a"
          anchorSize={28}
          rotateAnchorOffset={56}
          boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10 ? oldBox : newBox}
        />
      ) : null}
    </>
  );
}
