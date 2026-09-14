import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Background, ConnectionMode, Controls, MarkerType, ReactFlow, SelectionMode,
  type Edge, type EdgeTypes, type Node, type NodeChange, type NodeProps, type NodeTypes, type ReactFlowInstance,
} from "@xyflow/react";
import { MoreHorizontal, PackagePlus, X } from "lucide-react";
import { LOGIC_KINDS, TRAVERSALS, type LogicModule, type LogicTopology } from "../../domain/concept";
import { useProjectStore } from "../../store/project-store";
import { LogicEdgeView, type LogicEdgeData } from "./LogicEdgeView";
import { LogicNodeView, type LogicNodeData } from "./LogicNodeView";
import { resolveLogicHandles } from "./logic-handles";
import { moduleColor } from "./module-colors";
import { useCurrentTopology } from "./use-current-topology";
import { useDecompositionUI } from "./decomposition-ui-store";
import { dropModuleAt, moduleFrames, type ModuleFrame } from "./decomposition-geometry";
import "./decomposition-canvas.css";

interface FrameData extends Record<string, unknown> {
  module: LogicModule;
  color: string;
  active: boolean;
  target: boolean;
}

function ModuleFrameView({ data }: NodeProps) {
  const { module, color, active, target } = data as FrameData;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(module.name);
  const [menu, setMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const select = useDecompositionUI((state) => state.setSelection);
  const rename = useProjectStore((state) => state.updateLogicModule);
  const dissolve = useProjectStore((state) => state.removeLogicModule);

  function finishRename() {
    if (!renaming) return;
    if (name.trim() && name.trim() !== module.name) rename(module.id, { name: name.trim() });
    setRenaming(false);
  }

  return <div className={`decomp-frame ${active ? "is-active" : ""} ${target ? "is-target" : ""} ${module.nodeIds.length ? "" : "is-empty"}`} style={{ "--module-color": color } as React.CSSProperties}>
    <div className="decomp-frame-title" onClick={() => select([], module.id)} onDoubleClick={() => { setName(module.name); setRenaming(true); }} title={module.nodeIds.length ? "拖动标题移动整个模块；双击修改名称" : "双击修改名称；拖入区域后可整体移动"}>
      {renaming ? <input className="nodrag nowheel" aria-label="模块名称" autoFocus value={name} onChange={(event) => setName(event.target.value)}
        onBlur={finishRename} onKeyDown={(event) => { if (event.key === "Enter") finishRename(); if (event.key === "Escape") setRenaming(false); event.stopPropagation(); }} />
        : <strong>{module.name}</strong>}
      <span>{module.nodeIds.length} 区域</span>
      <button className="nodrag" type="button" aria-label={`${module.name}菜单`} title="模块操作" onClick={(event) => {
        event.stopPropagation(); select([], module.id);
        const bounds = event.currentTarget.getBoundingClientRect();
        setMenuPosition({ x: Math.max(8, Math.min(window.innerWidth - 190, bounds.right - 174)), y: Math.min(window.innerHeight - 132, bounds.bottom + 6) });
        setMenu(!menu);
      }}><MoreHorizontal size={16} /></button>
    </div>
    {!module.nodeIds.length ? <div className="decomp-frame-empty">拖入区域加入此模块</div> : null}
    {menu ? createPortal(<div className="decomp-frame-menu nodrag nowheel" style={{ position: "fixed", left: menuPosition.x, top: menuPosition.y, right: "auto", "--module-color": color } as React.CSSProperties}>
      <button type="button" onClick={() => { setName(module.name); setRenaming(true); setMenu(false); }}>重命名</button>
      <button type="button" onClick={() => { dissolve(module.id); select(module.nodeIds); }}>解散模块，保留区域</button>
      <button type="button" onClick={() => setMenu(false)}>关闭</button>
    </div>, document.body) : null}
  </div>;
}

const nodeTypes: NodeTypes = { logic: LogicNodeView, moduleFrame: ModuleFrameView };
const edgeTypes: EdgeTypes = { logic: LogicEdgeView };
type Position = { x: number; y: number };
interface DragSession {
  topology: LogicTopology;
  frames: ModuleFrame[];
  positions: Record<string, Position>;
  nodeIds: string[];
  anchorId: string;
  frameId: string | null;
  frameOrigin: Position | null;
  target: string | null;
}

export function DecompositionCanvas() {
  const topology = useCurrentTopology();
  const project = useProjectStore((state) => state.project);
  const scopeId = useProjectStore((state) => state.conceptScopeId);
  const edit = useProjectStore((state) => state.editDecomposition);
  const addModule = useProjectStore((state) => state.addLogicModule);
  const { selectedNodeIds, selectedModuleId, setSelection, focusNodeIds, focusRevision, reset } = useDecompositionUI();
  const [localPositions, setLocalPositions] = useState<Record<string, Position>>({});
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [dragView, setDragView] = useState<{ frames: ModuleFrame[]; target: string | null; frameId: string | null } | null>(null);
  const drag = useRef<DragSession | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const scopeKey = `${project.projectId}:${scopeId ?? "root"}`;

  useEffect(() => {
    reset(scopeKey);
    setLocalPositions({}); setDragView(null); drag.current = null; setCreating(false);
  }, [scopeKey, reset]);

  useEffect(() => {
    // An undo, project refresh or inspector edit invalidates the drag snapshot.
    drag.current = null; setDragView(null); setLocalPositions({});
    const existing = new Set(topology.nodes.map((node) => node.id));
    const selection = useDecompositionUI.getState();
    const validIds = selection.selectedNodeIds.filter((id) => existing.has(id));
    const validModule = topology.modules.some((module) => module.id === selection.selectedModuleId) ? selection.selectedModuleId : null;
    if (validIds.length !== selection.selectedNodeIds.length || validModule !== selection.selectedModuleId) setSelection(validIds, validModule);
  }, [topology, setSelection]);

  useEffect(() => {
    if (!flow || !focusNodeIds.length) return;
    void flow.fitView({ nodes: focusNodeIds.map((id) => ({ id })), padding: 0.45, maxZoom: 1.1, duration: 280 });
  }, [focusRevision, focusNodeIds, flow]);

  const positions = useMemo(() => Object.fromEntries(topology.nodes.map((node) => [node.id, localPositions[node.id] ?? { x: node.graphPosition[0], y: node.graphPosition[1] }])), [topology.nodes, localPositions]);
  const frames = useMemo(() => moduleFrames(topology.modules, topology.nodes.map((node) => ({ id: node.id, ...positions[node.id], width: sizes[node.id]?.width ?? 186, height: sizes[node.id]?.height ?? 112 }))), [topology, positions, sizes]);
  const visibleFrames = dragView?.frames ?? frames;
  const groupOf = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    topology.modules.forEach((group, index) => group.nodeIds.forEach((id) => map.set(id, { id: group.id, name: group.name, color: moduleColor(index) })));
    return map;
  }, [topology.modules]);

  const nodes = useMemo<Node[]>(() => {
    const modulesById = new Map(project.modules.map((module) => [module.id, module]));
    const flowFrames: Node[] = visibleFrames.filter((frame) => topology.modules.some((module) => module.id === frame.id)).map((frame) => {
      const index = topology.modules.findIndex((module) => module.id === frame.id);
      return { id: `frame:${frame.id}`, type: "moduleFrame", position: { x: frame.x, y: frame.y },
        style: { width: frame.width, height: frame.height }, width: frame.width, height: frame.height,
        // Frames have explicit dimensions. Retain them as measured too: XYFlow
        // reconstructs its internal nodes when this controlled array changes.
        measured: { width: frame.width, height: frame.height },
        data: { module: topology.modules[index], color: moduleColor(index), active: selectedModuleId === frame.id, target: dragView?.target === frame.id } satisfies FrameData,
        zIndex: -10, selectable: false, draggable: topology.modules[index].nodeIds.length > 0, dragHandle: ".decomp-frame-title", connectable: false };
    });
    return [...flowFrames, ...topology.nodes.map((node) => ({
      id: node.id, type: "logic", position: positions[node.id], selected: selectedNodeIds.includes(node.id), connectable: false,
      data: { node, module: node.moduleId ? modulesById.get(node.moduleId) ?? null : null,
        isStart: topology.startNodeId === node.id, incoming: topology.links.filter((link) => link.to === node.id).length,
        outgoing: topology.links.filter((link) => link.from === node.id).length, showPreview: false, group: groupOf.get(node.id) ?? null } satisfies LogicNodeData,
      ...(sizes[node.id] ? { measured: sizes[node.id] } : {}),
    }))];
  }, [topology, project.modules, visibleFrames, selectedModuleId, selectedNodeIds, dragView?.target, positions, sizes, groupOf]);

  const edges = useMemo<Edge[]>(() => {
    const groups = new Map<string, typeof topology.links>();
    topology.links.forEach((link) => { const key = [link.from, link.to].sort().join("|"); groups.set(key, [...(groups.get(key) ?? []), link]); });
    const offsets = new Map<string, [number, number]>();
    for (const [key, links] of groups) {
      const [a, b] = key.split("|").map((id) => positions[id]);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      links.forEach((link, index) => { const lane = (index - (links.length - 1) / 2) * 88; offsets.set(link.id, [-dy / length * lane, dx / length * lane - 26]); });
    }
    return topology.links.map((link) => {
      const meta = LOGIC_KINDS[link.logic];
      const from = positions[link.from], to = positions[link.to];
      return { id: link.id, source: link.from, target: link.to, type: "logic", selectable: false,
        ...resolveLogicHandles(link, from ? [from.x, from.y] : undefined, to ? [to.x, to.y] : undefined),
        data: { color: meta.color, dash: meta.dash, label: link.label, kindLabel: meta.label,
          keyName: topology.keys.find((key) => key.id === link.requires)?.name ?? null,
          traversalLabel: link.traversal === "both" ? "" : TRAVERSALS[link.traversal], offset: offsets.get(link.id) ?? [0, -26] } satisfies LogicEdgeData,
        markerEnd: link.traversal !== "both" ? { type: MarkerType.ArrowClosed, color: meta.color, width: 16, height: 16 } : undefined };
    });
  }, [topology.links, topology.keys, positions]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const positionChanges = changes.filter((change) => change.type === "position" && change.position && !change.id.startsWith("frame:"));
    if (positionChanges.length && !drag.current?.frameId) {
      if (!drag.current && positionChanges.every((change) => change.type === "position" && !change.dragging)) {
        // XYFlow's arrow-key movement emits position changes without drag callbacks.
        edit({ positions: positionChanges.flatMap((change) => change.type === "position" && change.position
          ? [{ nodeId: change.id, position: [change.position.x, change.position.y] as [number, number] }] : []) });
      } else setLocalPositions((previous) => {
        const next = { ...previous };
        positionChanges.forEach((change) => { if (change.type === "position" && change.position) next[change.id] = change.position; });
        return next;
      });
    }
    const dimensionChanges = changes.filter((change) => change.type === "dimensions" && !change.id.startsWith("frame:"));
    if (dimensionChanges.length) setSizes((previous) => {
      const next = { ...previous }; let changed = false;
      dimensionChanges.forEach((change) => {
        if (change.type !== "dimensions" || !change.dimensions) return;
        if (next[change.id]?.width === change.dimensions.width && next[change.id]?.height === change.dimensions.height) return;
        next[change.id] = change.dimensions; changed = true;
      });
      return changed ? next : previous;
    });
    const selectionChanges = changes.filter((change) => change.type === "select" && !change.id.startsWith("frame:"));
    if (selectionChanges.length) {
      const ids = new Set(useDecompositionUI.getState().selectedNodeIds);
      selectionChanges.forEach((change) => { if (change.type === "select") { if (change.selected) ids.add(change.id); else ids.delete(change.id); } });
      setSelection([...ids]);
    }
  }, [setSelection, edit]);

  function startDrag(node: Node, draggedNodes: Node[]) {
    if (drag.current) return;
    const frameId = node.type === "moduleFrame" ? node.id.slice(6) : null;
    const module = topology.modules.find((item) => item.id === frameId);
    const nodeIds = frameId ? module?.nodeIds ?? [] : [...new Set([node.id, ...draggedNodes.filter((item) => item.type !== "moduleFrame").map((item) => item.id)])];
    drag.current = { topology, frames, positions, nodeIds, anchorId: node.id, frameId,
      frameOrigin: frameId ? node.position : null, target: null };
    if (frameId) setSelection([], frameId);
    setDragView({ frames, target: null, frameId });
  }

  function updateDrag(node: Node, draggedNodes: Node[]) {
    const session = drag.current;
    if (!session || session.topology !== topology) return;
    if (session.frameId && session.frameOrigin) {
      const dx = node.position.x - session.frameOrigin.x, dy = node.position.y - session.frameOrigin.y;
      const moved = Object.fromEntries(session.nodeIds.filter((id) => session.positions[id]).map((id) => [id, { x: session.positions[id].x + dx, y: session.positions[id].y + dy }]));
      setLocalPositions((previous) => ({ ...previous, ...moved }));
      setDragView({ frameId: session.frameId, target: null, frames: session.frames.map((frame) => frame.id === session.frameId ? { ...frame, x: frame.x + dx, y: frame.y + dy } : frame) });
      return;
    }
    const anchor = draggedNodes.find((item) => item.id === session.anchorId) ?? node;
    const size = sizes[anchor.id] ?? { width: 186, height: 112 };
    session.target = dropModuleAt({ x: anchor.position.x + size.width / 2, y: anchor.position.y + size.height / 2 }, session.frames);
    setDragView({ frames: session.frames, target: session.target, frameId: null });
  }

  function stopDrag(node: Node, draggedNodes: Node[]) {
    const session = drag.current;
    if (!session || session.topology !== topology) return;
    updateDrag(node, draggedNodes);
    let moved: { nodeId: string; position: [number, number] }[];
    if (session.frameId && session.frameOrigin) {
      const dx = node.position.x - session.frameOrigin.x, dy = node.position.y - session.frameOrigin.y;
      moved = session.nodeIds.filter((id) => session.positions[id]).map((id) => ({ nodeId: id, position: [session.positions[id].x + dx, session.positions[id].y + dy] }));
    } else {
      const latest = new Map([node, ...draggedNodes].map((item) => [item.id, item.position]));
      moved = session.nodeIds.map((id) => { const position = latest.get(id) ?? positions[id]; return { nodeId: id, position: [position.x, position.y] }; });
    }
    drag.current = null;
    edit({ positions: moved, assignments: session.frameId ? undefined : session.nodeIds.map((nodeId) => ({ nodeId, moduleId: session.target })) });
    setLocalPositions({}); setDragView(null);
  }

  function createGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim() || !selectedNodeIds.length) return;
    addModule(newName.trim(), selectedNodeIds);
    setCreating(false); setNewName("");
  }

  const draggedGroup = dragView?.target ? topology.modules.find((module) => module.id === dragView.target) : null;
  const draggingIds = drag.current?.nodeIds ?? [];
  const leaving = draggingIds.some((id) => groupOf.has(id));

  return <div className="concept-canvas decomposition-canvas">
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={setFlow}
      onNodesChange={onNodesChange} connectionMode={ConnectionMode.Loose} nodesConnectable={false} edgesFocusable={false}
      fitView fitViewOptions={{ padding: 0.24, maxZoom: 1 }} minZoom={0.15} maxZoom={1.8}
      selectionOnDrag selectionMode={SelectionMode.Partial} selectionKeyCode={null} multiSelectionKeyCode={["Control", "Meta"]}
      panOnDrag={[1, 2]} deleteKeyCode={null}
      onPaneClick={() => { setSelection([]); setCreating(false); }}
      onNodeDragStart={(_, node, nodes) => startDrag(node, nodes)}
      onNodeDrag={(_, node, nodes) => updateDrag(node, nodes)}
      onNodeDragStop={(_, node, nodes) => stopDrag(node, nodes)}
      onSelectionDragStart={(_, nodes) => { if (nodes[0]) startDrag(nodes[0], nodes); }}
      onSelectionDrag={(_, nodes) => { if (nodes[0]) updateDrag(nodes[0], nodes); }}
      onSelectionDragStop={(_, nodes) => { if (nodes[0]) stopDrag(nodes[0], nodes); }}>
      <Background gap={24} size={1} color="#323832" />
      <Controls showInteractive={false} />
    </ReactFlow>
    {selectedNodeIds.length && !dragView ? <div className="decomp-selection-actions">
      {creating ? <form onSubmit={createGroup}>
        <input aria-label="新模块名称" placeholder="输入模块名称" value={newName} autoFocus onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCreating(false); }} />
        <button type="submit" disabled={!newName.trim()}>创建模块</button>
        <button type="button" aria-label="取消创建模块" onClick={() => setCreating(false)}><X size={14} /></button>
      </form> : <>
        <span>已选 {selectedNodeIds.length} 个区域</span>
        <button type="button" onClick={() => { setCreating(true); setNewName(""); }}><PackagePlus size={15} />组成模块</button>
        <select aria-label="批量移动到模块" value="" onChange={(event) => {
          if (!event.target.value) return;
          edit({ assignments: selectedNodeIds.map((nodeId) => ({ nodeId, moduleId: event.target.value === "__unassigned__" ? null : event.target.value })) });
        }}>
          <option value="" disabled>移动到…</option>
          {topology.modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
          <option value="__unassigned__">移出模块</option>
        </select>
        <button type="button" aria-label="清除区域选择" onClick={() => setSelection([])}><X size={14} /></button>
      </>}
    </div> : null}
    {dragView ? <div className="decomp-drag-feedback" role="status">
      {dragView.frameId ? "移动整个模块 · 区域归属保持不变" : draggedGroup ? `松开加入「${draggedGroup.name}」 · ${draggingIds.length} 个区域` : leaving ? `松开移出模块 · ${draggingIds.length} 个区域` : "松开保持未归属"}
    </div> : null}
    <div className="decomp-canvas-help">左键框选区域 · Ctrl / ⌘ 多选 · 中键 / 右键平移 · 拖入模块调整归属 · 拖标题整体移动</div>
  </div>;
}
