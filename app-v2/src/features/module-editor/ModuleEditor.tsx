import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Stage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Grid3X3, Move, RotateCw, Scaling, ScanSearch } from "lucide-react";
import { IconButton } from "../../components/IconButton";
import { useProjectStore } from "../../store/project-store";
import { BlockNode } from "./BlockNode";
import { createModulePreviewModel } from "../assembly/module-preview-model";
import { ReferenceTools, ReferenceUnderlay } from "./ReferenceTools";

const GRID_SIZE = 50;
const WORLD_LIMIT = 5000;

function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function ModuleEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const size = useElementSize(containerRef);
  const project = useProjectStore((state) => state.project);
  const activeInstanceId = useProjectStore((state) => state.activeInstanceId);
  const activeModuleId = useProjectStore((state) => state.activeModuleId);
  const selectedIds = useProjectStore((state) => state.selectedBlockIds);
  const mode = useProjectStore((state) => state.transformMode);
  const setMode = useProjectStore((state) => state.setTransformMode);
  const setSelected = useProjectStore((state) => state.setSelectedBlocks);
  const updateBlock = useProjectStore((state) => state.updateBlock);
  const [spacePressed, setSpacePressed] = useState(false);
  const [grid, setGrid] = useState(GRID_SIZE);
  const [stageTransform, setStageTransform] = useState({ x: size.width / 2, y: size.height / 2, scale: 0.24 });
  const instance = project.instances.find((item) => item.id === activeInstanceId);
  // 从阶段一的逻辑节点进入模块时没有实例，直接按 activeModuleId 解析
  const module = project.modules.find((item) => item.id === activeModuleId) ?? project.modules.find((item) => item.id === instance?.definitionId);

  useEffect(() => setStageTransform((current) => ({ ...current, x: size.width / 2, y: size.height / 2 })), [size.height, size.width]);
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

  if (!module) return <div className="empty-workspace">模块不存在或已被删除</div>;

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
        <button type="button" className="fit-command" onClick={() => { const model = createModulePreviewModel(module, size.width, size.height, 60); const centerX = (model.bounds.minX + model.bounds.maxX) / 2; const centerY = (model.bounds.minY + model.bounds.maxY) / 2; setStageTransform({ x: size.width / 2 - centerX * model.scale, y: size.height / 2 - centerY * model.scale, scale: model.scale }); }}><ScanSearch size={15} />适应模块</button>
        <ReferenceTools module={module} />
        <span className="editor-toolbar-hint">按住 Space 拖动画布 · 滚轮缩放</span>
      </div>
      <div className={`konva-host ${spacePressed ? "is-panning" : ""}`} ref={containerRef}>
        <Stage
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
          <Layer listening={false}>{module.reference ? <ReferenceUnderlay reference={module.reference} /> : null}</Layer>
          <Layer>
            {module.blocks.map((block) => (
              <BlockNode key={block.id} block={block} selected={selectedIds.includes(block.id)} mode={mode} grid={grid} panning={spacePressed} onSelect={(event) => selectBlock(block.id, event)} onChange={updateBlock} />
            ))}
          </Layer>
        </Stage>
        <div className="canvas-scale">{Math.round(stageTransform.scale * 400)}%</div>
      </div>
    </div>
  );
}
