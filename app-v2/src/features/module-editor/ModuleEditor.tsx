import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Stage } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Grid3X3, Magnet, Move, RotateCw, Scaling, ScanSearch } from "lucide-react";
import { IconButton } from "../../components/IconButton";
import { useProjectStore } from "../../store/project-store";
import { BlockNode } from "./BlockNode";

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
  const selectedIds = useProjectStore((state) => state.selectedBlockIds);
  const mode = useProjectStore((state) => state.transformMode);
  const setMode = useProjectStore((state) => state.setTransformMode);
  const setSelected = useProjectStore((state) => state.setSelectedBlocks);
  const updateBlock = useProjectStore((state) => state.updateBlock);
  const [spacePressed, setSpacePressed] = useState(false);
  const [stageTransform, setStageTransform] = useState({ x: size.width / 2, y: size.height / 2, scale: 0.24 });
  const instance = project.instances.find((item) => item.id === activeInstanceId);
  const module = project.modules.find((item) => item.id === instance?.definitionId);

  useEffect(() => setStageTransform((current) => ({ ...current, x: size.width / 2, y: size.height / 2 })), [size.height, size.width]);
  useEffect(() => {
    const onDown = (event: KeyboardEvent) => { if (event.code === "Space" && !(event.target instanceof HTMLInputElement)) setSpacePressed(true); };
    const onUp = (event: KeyboardEvent) => { if (event.code === "Space") setSpacePressed(false); };
    window.addEventListener("keydown", onDown); window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
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
        <span className="toolbar-state"><Grid3X3 size={15} />网格 50cm</span>
        <span className="toolbar-state"><Magnet size={15} />吸附开启</span>
        <button type="button" className="fit-command" onClick={() => setStageTransform({ x: size.width / 2, y: size.height / 2, scale: 0.24 })}><ScanSearch size={15} />适应模块</button>
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
            const nextScale = Math.max(0.08, Math.min(1.2, oldScale * (event.evt.deltaY > 0 ? 0.9 : 1.1)));
            setStageTransform({ x: pointer.x - world.x * nextScale, y: pointer.y - world.y * nextScale, scale: nextScale });
          }}
          onMouseDown={(event) => { if (event.target === event.target.getStage()) setSelected([]); }}
        >
          <Layer listening={false}><Group>{gridLines}</Group></Layer>
          <Layer>
            {module.blocks.map((block) => (
              <BlockNode key={block.id} block={block} selected={selectedIds.includes(block.id)} mode={mode} onSelect={(event) => selectBlock(block.id, event)} onChange={updateBlock} />
            ))}
          </Layer>
        </Stage>
        <div className="canvas-scale">{Math.round(stageTransform.scale * 400)}%</div>
      </div>
    </div>
  );
}
