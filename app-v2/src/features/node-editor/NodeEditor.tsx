import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Stage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Grid3X3, Move, RotateCw, Scaling, ScanSearch } from "lucide-react";
import { IconButton } from "../../components/IconButton";
import { useProjectStore, type EditableGeometry } from "../../store/project-store";
import { BlockNode } from "./BlockNode";
import { createNodePreviewModel } from "../node-preview/node-preview-model";

const GRID_SIZE = 50;
const WORLD_LIMIT = 5000;
type Viewport = { x: number; y: number; scale: number };
// 会话内的相机缓存：在层级之间来回跳时回到上次看的位置
const nodeViewports = new Map<string, Viewport & { width: number; height: number }>();

function fitGeometry(geometry: EditableGeometry, width: number, height: number) {
  const model = createNodePreviewModel(geometry, width, height, 60);
  const scale = geometry.blocks.length ? Math.min(8, model.scale) : 0.24;
  const centerX = (model.bounds.minX + model.bounds.maxX) / 2;
  const centerY = (model.bounds.minY + model.bounds.maxY) / 2;
  return { x: width / 2 - centerX * scale, y: height / 2 - centerY * scale, scale };
}

function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * 几何编辑器。它不关心自己编辑的是"节点自己的几何"还是"遗留模块定义的几何"，
 * 拿到哪份就编哪份 —— 两者的坐标都是局部厘米，编辑操作完全一样。
 */
export function NodeEditor({ geometry }: { geometry: EditableGeometry }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const size = useElementSize(containerRef);
  const project = useProjectStore((state) => state.project);
  const selectedIds = useProjectStore((state) => state.selectedBlockIds);
  const mode = useProjectStore((state) => state.transformMode);
  const setMode = useProjectStore((state) => state.setTransformMode);
  const setSelected = useProjectStore((state) => state.setSelectedBlocks);
  const updateBlock = useProjectStore((state) => state.updateBlock);
  const [spacePressed, setSpacePressed] = useState(false);
  const [grid, setGrid] = useState(GRID_SIZE);
  const [stageTransform, setStageTransform] = useState({ x: size.width / 2, y: size.height / 2, scale: 0.24 });
  const fittedViewport = useRef<{ projectId: string; geometryId: string; width: number; height: number } | null>(null);
  const viewportKey = `${project.projectId}:${geometry.id}`;
  const shownGeometry = geometry;

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const previous = fittedViewport.current;
    // Fit on entry, not on block edits. Resizing keeps the current world center and zoom.
    if (!previous || previous.projectId !== project.projectId || previous.geometryId !== geometry.id) {
      const saved = nodeViewports.get(viewportKey);
      setStageTransform(saved ? { x: saved.x + (size.width - saved.width) / 2, y: saved.y + (size.height - saved.height) / 2, scale: saved.scale } : fitGeometry(geometry, size.width, size.height));
    } else if (previous.width !== size.width || previous.height !== size.height) {
      setStageTransform((current) => ({ ...current, x: current.x + (size.width - previous.width) / 2, y: current.y + (size.height - previous.height) / 2 }));
    }
    fittedViewport.current = { projectId: project.projectId, geometryId: geometry.id, ...size };
  }, [geometry, project.projectId, size.height, size.width, viewportKey]);
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    nodeViewports.set(viewportKey, { ...stageTransform, ...size });
    if (nodeViewports.size > 100) nodeViewports.delete(nodeViewports.keys().next().value!);
  }, [viewportKey, stageTransform, size]);
  useEffect(() => {
    const onDown = (event: KeyboardEvent) => { if (event.code === "Space" && !document.querySelector('[role="dialog"]') && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)) { event.preventDefault(); setSpacePressed(true); } };
    const onUp = (event: KeyboardEvent) => { if (event.code === "Space") setSpacePressed(false); };
    const onBlur = () => setSpacePressed(false);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onDown); window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); window.removeEventListener("blur", onBlur); };
  }, []);

  const gridLines = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let value = -WORLD_LIMIT; value <= WORLD_LIMIT; value += GRID_SIZE) {
      const major = value % 500 === 0;
      result.push(<Line key={`v${value}`} points={[value, -WORLD_LIMIT, value, WORLD_LIMIT]} stroke={major ? "#353b36" : "#272c28"} strokeWidth={major ? 3 : 1.5} listening={false} />);
      result.push(<Line key={`h${value}`} points={[-WORLD_LIMIT, value, WORLD_LIMIT, value]} stroke={major ? "#353b36" : "#272c28"} strokeWidth={major ? 3 : 1.5} listening={false} />);
    }
    return result;
  }, []);

  function selectBlock(blockId: string, event: KonvaEventObject<MouseEvent | TouchEvent>) {
    const append = "shiftKey" in event.evt && event.evt.shiftKey;
    setSelected(append ? selectedIds.includes(blockId) ? selectedIds.filter((id) => id !== blockId) : [...selectedIds, blockId] : [blockId]);
  }

  return (
    <div className="module-editor">
      <div className="editor-toolbar">
        <div className="toolbar-group" role="group" aria-label="变换模式">
          <IconButton label="W 移动" active={mode === "move"} onClick={() => setMode("move")}><Move size={16} /></IconButton>
          <IconButton label="E 旋转" active={mode === "rotate"} onClick={() => setMode("rotate")}><RotateCw size={16} /></IconButton>
          <IconButton label="R 缩放" active={mode === "scale"} onClick={() => setMode("scale")}><Scaling size={16} /></IconButton>
        </div>
        <div className="toolbar-separator" />
        <span className="toolbar-state"><Grid3X3 size={15} /><select aria-label="吸附间距" value={grid} onChange={(event) => setGrid(Number(event.target.value))}><option value={0}>自由移动</option>{[1, 10, 50, 100].map((value) => <option key={value} value={value}>吸附 {value}cm</option>)}</select></span>
        <button type="button" className="fit-command" onClick={() => setStageTransform(fitGeometry(shownGeometry, size.width, size.height))}><ScanSearch size={15} />适应内容</button>
        <span className="editor-toolbar-hint">按住 Space 拖动画布 · 滚轮缩放</span>
      </div>
      <div className={`konva-host ${spacePressed ? "is-panning" : ""}`} ref={containerRef}>
        {size.width > 0 && size.height > 0 ? <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={stageTransform.x}
          y={stageTransform.y}
          scaleX={stageTransform.scale}
          scaleY={stageTransform.scale}
          draggable={spacePressed}
          onDragEnd={(event) => {
            if (!spacePressed) return;
            setStageTransform((current) => ({ ...current, x: event.target.x(), y: event.target.y() }));
          }}
          onWheel={(event) => {
            event.evt.preventDefault();
            const stage = stageRef.current;
            const pointer = stage?.getPointerPosition();
            if (!stage || !pointer) return;
            const oldScale = stage.scaleX();
            const world = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
            const nextScale = Math.max(0.001, Math.min(8, oldScale * (event.evt.deltaY > 0 ? 0.9 : 1.1)));
            setStageTransform({ x: pointer.x - world.x * nextScale, y: pointer.y - world.y * nextScale, scale: nextScale });
          }}
          onMouseDown={(event) => { if (event.target === event.target.getStage()) setSelected([]); }}
        >
          <Layer listening={false}><Group>{gridLines}</Group></Layer>
          <Layer>
            {shownGeometry.blocks.map((block) => (
              <BlockNode key={block.id} block={block} selected={selectedIds.includes(block.id)} mode={mode} grid={grid} panning={spacePressed} onSelect={(event) => selectBlock(block.id, event)} onChange={(block) => updateBlock(block)} />
            ))}
          </Layer>
        </Stage> : null}
        <div className="canvas-scale">{Math.round(stageTransform.scale * 100)}%</div>
      </div>
    </div>
  );
}
