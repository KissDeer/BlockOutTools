import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Background, ConnectionMode, Controls, Handle, MarkerType, Position as HandlePosition, ReactFlow, SelectionMode,
  type Connection as FlowConnection, type Edge, type EdgeTypes, type Node, type NodeChange, type OnNodeDrag, type NodeProps, type NodeTypes, type ReactFlowInstance, type Viewport,
} from "@xyflow/react";
import { ChevronDown, ChevronRight, Hammer, MoreHorizontal, PackagePlus, Plus, X } from "lucide-react";
import { LOGIC_KINDS, TRAVERSALS, type LogicModule, type LogicTopology } from "../../domain/concept";
import { useProjectStore } from "../../store/project-store";
import { LogicEdgeView, type LogicEdgeData } from "./LogicEdgeView";
import { LogicNodeView, type LogicNodeData } from "./LogicNodeView";
import { asLogicHandleSide, resolveLogicHandles } from "./logic-handles";
import { moduleColor } from "./module-colors";
import { useCurrentTopology } from "./use-current-topology";
import { useDecompositionUI } from "./decomposition-ui-store";
import { dropModuleAt, moduleFrames, type ModuleFrame } from "./decomposition-geometry";
import { confirmModuleChange } from "./confirm-module-change";
import "./decomposition-canvas.css";

interface FrameData extends Record<string, unknown> {
  module: LogicModule;
  color: string;
  active: boolean;
  target: boolean;
  collapsed: boolean;
}

function ModuleFrameView({ data }: NodeProps) {
  const { module, color, active, target, collapsed } = data as FrameData;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(module.name);
  const [menu, setMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const select = useDecompositionUI((state) => state.setSelection);
  const rename = useProjectStore((state) => state.updateLogicModule);
  const dissolve = useProjectStore((state) => state.removeLogicModule);
  const openModule = useProjectStore((state) => state.openLogicModule);
  const toggleCollapsed = useDecompositionUI((state) => state.toggleCollapsed);
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();

  function finishRename() {
    if (!renaming) return;
    if (name.trim() && name.trim() !== module.name) rename(module.id, { name: name.trim() });
    setRenaming(false);
  }

  return <div className={`decomp-frame ${active ? "is-active" : ""} ${target ? "is-target" : ""} ${collapsed ? "is-collapsed" : ""} ${module.nodeIds.length ? "" : "is-empty"}`} style={{ "--module-color": color } as React.CSSProperties}>
    {/* Keep handles mounted while expanded: remapped edges can render before
        XYFlow remeasures a newly collapsed frame. Hidden handles retain bounds. */}
    {[HandlePosition.Top, HandlePosition.Right, HandlePosition.Bottom, HandlePosition.Left].map((side) => <Handle key={side} id={side} type="source" position={side} isConnectable={false} className="module-summary-handle" />)}
    <div className="decomp-frame-title" onClick={() => select([], module.id)} onDoubleClick={() => openModule(module.id)} title="拖动标题移动整个模块；双击搭建模块">
      <button className="nodrag" type="button" aria-label={`${collapsed ? "展开" : "折叠"}${module.name}`} title={collapsed ? "展开区域" : "折叠为模块关系"} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); select([], module.id); toggleCollapsed(module.id); }}>{collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
      {renaming ? <input className="nodrag nowheel" aria-label="模块名称" autoFocus value={name} onChange={(event) => setName(event.target.value)} onDoubleClick={(event) => event.stopPropagation()}
        onBlur={finishRename} onKeyDown={(event) => { if (event.key === "Enter") finishRename(); if (event.key === "Escape") setRenaming(false); event.stopPropagation(); }} />
        : <strong>{module.name}</strong>}
      <span>{module.nodeIds.length} 区域</span>
      <button className="nodrag" type="button" aria-label={`搭建${module.name}`} title="搭建模块" onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); select([], module.id); openModule(module.id); }}><Hammer size={15} /></button>
      <button className="nodrag" type="button" aria-label={`${module.name}菜单`} title="模块操作" onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => {
        event.stopPropagation(); select([], module.id);
        const bounds = event.currentTarget.getBoundingClientRect();
        setMenuPosition({ x: Math.max(8, Math.min(window.innerWidth - 190, bounds.right - 174)), y: Math.min(window.innerHeight - 132, bounds.bottom + 6) });
        setMenu(!menu);
      }}><MoreHorizontal size={16} /></button>
    </div>
    {collapsed ? <div className="decomp-frame-summary">模块关系 · 展开后编辑区域连接</div> : !module.nodeIds.length ? <div className="decomp-frame-empty">拖入区域加入此模块</div> : null}
    {menu ? createPortal(<div className="decomp-frame-menu nodrag nowheel" style={{ position: "fixed", left: menuPosition.x, top: menuPosition.y, right: "auto", "--module-color": color } as React.CSSProperties}>
      <button type="button" onClick={() => { setName(module.name); setRenaming(true); setMenu(false); }}>重命名</button>
      <button type="button" onClick={() => { if (!confirmModuleChange(project, topology, module.nodeIds, null)) return; dissolve(module.id); select(module.nodeIds); }}>解散模块，保留区域</button>
      <button type="button" onClick={() => setMenu(false)}>关闭</button>
    </div>, document.body) : null}
  </div>;
}

// XYFlow positions the outer wrapper; these views only render their content.
const nodeTypes: NodeTypes = {
  logic: memo(LogicNodeView, (before, after) => before.data === after.data && before.selected === after.selected),
  moduleFrame: memo(ModuleFrameView, (before, after) => before.data === after.data),
};
const edgeTypes: EdgeTypes = { logic: LogicEdgeView };
const fitViewOptions = { padding: 0.24, maxZoom: 1 };
const multiSelectionKeyCode = ["Control", "Meta"];
const panOnDrag = [1, 2];
const viewports = new Map<string, Viewport>();
const focusedRevisions = new Map<string, number>();
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
  const addNode = useProjectStore((state) => state.addLogicNode);
  const logicKind = useProjectStore((state) => state.logicKind);
  const addLink = useProjectStore((state) => state.addLogicLink);
  const selectedLinkId = useProjectStore((state) => state.selectedLogicLinkId);
  const selectedNodeId = useProjectStore((state) => state.selectedLogicNodeId);
  const selectLink = useProjectStore((state) => state.setSelectedLogicLink);
  const { selectedNodeIds, selectedModuleId, setSelection, focusNodeIds, focusRevision, collapsedModuleIds, reset } = useDecompositionUI();
  const [localPositions, setLocalPositions] = useState<Record<string, Position>>({});
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [dragView, setDragView] = useState<{ frames: ModuleFrame[]; target: string | null; frameId: string | null } | null>(null);
  const drag = useRef<DragSession | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const scopeKey = `${project.projectId}:${scopeId ?? "root"}`;
  const savedViewport = viewports.get(scopeKey);

  useEffect(() => {
    reset(scopeKey);
    setLocalPositions({}); setDragView(null); drag.current = null; setCreating(false);
  }, [scopeKey, reset]);

  useEffect(() => {
    if (selectedNodeId && !useDecompositionUI.getState().selectedNodeIds.includes(selectedNodeId)) setSelection([selectedNodeId]);
  }, [selectedNodeId, setSelection]);

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
    if (!flow || !focusNodeIds.length || focusedRevisions.get(scopeKey) === focusRevision) return;
    const reveal = topology.modules.filter((module) => collapsedModuleIds.includes(module.id) && module.nodeIds.some((id) => focusNodeIds.includes(id)));
    if (reveal.length) {
      useDecompositionUI.setState({ collapsedModuleIds: collapsedModuleIds.filter((id) => !reveal.some((module) => module.id === id)) });
      return;
    }
    focusedRevisions.set(scopeKey, focusRevision);
    void flow.fitView({ nodes: focusNodeIds.map((id) => ({ id })), padding: 0.45, maxZoom: 1.1, duration: 280 });
  }, [focusRevision, focusNodeIds, flow, scopeKey, collapsedModuleIds, topology.modules]);

  const positions = useMemo(() => Object.fromEntries(topology.nodes.map((node) => [node.id, localPositions[node.id] ?? { x: node.graphPosition[0], y: node.graphPosition[1] }])), [topology.nodes, localPositions]);
  // Drop targets stay frozen during a gesture, so bounds only need committed positions.
  const frames = useMemo(() => moduleFrames(topology.modules, topology.nodes.map((node) => ({ id: node.id, x: node.graphPosition[0], y: node.graphPosition[1], width: sizes[node.id]?.width ?? 186, height: sizes[node.id]?.height ?? 112 })))
    .map((frame) => collapsedModuleIds.includes(frame.id) ? { ...frame, width: 288, height: 82 } : frame), [topology, sizes, collapsedModuleIds]);
  const visibleFrames = dragView?.frames ?? frames;
  const groupOf = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    topology.modules.forEach((group, index) => group.nodeIds.forEach((id) => map.set(id, { id: group.id, name: group.name, color: moduleColor(index) })));
    return map;
  }, [topology.modules]);

  const logicNodes = useMemo<Node[]>(() => {
    const modulesById = new Map(project.modules.map((module) => [module.id, module]));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    topology.links.forEach((link) => {
      incoming.set(link.to, (incoming.get(link.to) ?? 0) + 1);
      outgoing.set(link.from, (outgoing.get(link.from) ?? 0) + 1);
    });
    const selected = new Set(selectedNodeIds);
    return topology.nodes.filter((node) => !collapsedModuleIds.includes(groupOf.get(node.id)?.id ?? "")).map((node) => ({
      id: node.id, type: "logic", position: { x: node.graphPosition[0], y: node.graphPosition[1] }, selected: selected.has(node.id), connectable: true,
      data: { node, module: node.moduleId ? modulesById.get(node.moduleId) ?? null : null,
        isStart: topology.startNodeId === node.id, incoming: incoming.get(node.id) ?? 0,
        outgoing: outgoing.get(node.id) ?? 0, showPreview: false, group: groupOf.get(node.id) ?? null } satisfies LogicNodeData,
      ...(sizes[node.id] ? { measured: sizes[node.id] } : {}),
    }));
  }, [topology, project.modules, selectedNodeIds, sizes, groupOf, collapsedModuleIds]);

  const frameNodes = useMemo<Node[]>(() => frames.map((frame) => {
      const index = topology.modules.findIndex((module) => module.id === frame.id);
      return { id: `frame:${frame.id}`, type: "moduleFrame", position: { x: frame.x, y: frame.y },
        style: { width: frame.width, height: frame.height }, width: frame.width, height: frame.height,
        // Frames have explicit dimensions. Retain them as measured too: XYFlow
        // reconstructs its internal nodes when this controlled array changes.
        measured: { width: frame.width, height: frame.height },
        data: { module: topology.modules[index], color: moduleColor(index), active: selectedModuleId === frame.id, target: dragView?.target === frame.id, collapsed: collapsedModuleIds.includes(frame.id) } satisfies FrameData,
        zIndex: -10, selectable: false, draggable: topology.modules[index].nodeIds.length > 0, dragHandle: ".decomp-frame-title", connectable: false };
    }), [frames, topology.modules, selectedModuleId, dragView?.target, collapsedModuleIds]);

  const previousNodes = useRef(new Map<string, Node>());
  const nodes = useMemo<Node[]>(() => {
    const framePositions = new Map(visibleFrames.map((frame) => [`frame:${frame.id}`, { x: frame.x, y: frame.y }]));
    const next = [...frameNodes, ...logicNodes].map((base) => {
      const position = framePositions.get(base.id) ?? positions[base.id] ?? base.position;
      const previous = previousNodes.current.get(base.id);
      if (previous && previous.data === base.data && previous.selected === base.selected && previous.measured === base.measured
        && previous.position.x === position.x && previous.position.y === position.y) return previous;
      return { ...base, position };
    });
    previousNodes.current = new Map(next.map((node) => [node.id, node]));
    return next;
  }, [frameNodes, logicNodes, visibleFrames, positions]);

  const edgeTemplates = useMemo(() => {
    const visualEndpoint = (id: string) => {
      const group = groupOf.get(id);
      return group && collapsedModuleIds.includes(group.id) ? `frame:${group.id}` : id;
    };
    const visibleLinks = topology.links.map((link) => ({ link, source: visualEndpoint(link.from), target: visualEndpoint(link.to) }))
      .filter(({ source, target }) => source !== target);
    const groups = new Map<string, typeof topology.links>();
    visibleLinks.forEach(({ link, source, target }) => { const key = [source, target].sort().join("|"); groups.set(key, [...(groups.get(key) ?? []), link]); });
    const lanes = new Map<string, { a: string; b: string; distance: number }>();
    for (const [key, links] of groups) {
      const [a, b] = key.split("|");
      links.forEach((link, index) => lanes.set(link.id, { a, b, distance: (index - (links.length - 1) / 2) * 88 }));
    }
    const keys = new Map(topology.keys.map((key) => [key.id, key.name]));
    return visibleLinks.map(({ link, source, target }) => {
      const meta = LOGIC_KINDS[link.logic];
      return { link, lane: lanes.get(link.id)!, edge: { id: link.id, source, target, type: "logic", selectable: true, selected: link.id === selectedLinkId,
        data: { color: meta.color, dash: meta.dash, label: link.label, kindLabel: meta.label,
          keyName: keys.get(link.requires ?? "") ?? null,
          traversalLabel: link.traversal === "both" ? "" : TRAVERSALS[link.traversal], offset: [0, -26] } satisfies LogicEdgeData,
        markerEnd: link.traversal !== "both" ? { type: MarkerType.ArrowClosed, color: meta.color, width: 16, height: 16 } : undefined } satisfies Edge<LogicEdgeData> };
    });
  }, [topology.links, topology.keys, groupOf, collapsedModuleIds, selectedLinkId]);
  const edgeCache = useMemo(() => ({ edges: [] as Edge<LogicEdgeData>[] }), [edgeTemplates]);
  const edges = useMemo(() => {
    const visualPositions = { ...positions, ...Object.fromEntries(visibleFrames.map((frame) => [`frame:${frame.id}`, { x: frame.x, y: frame.y }])) };
    const next = edgeTemplates.map(({ link, lane, edge }, index) => {
      const from = visualPositions[edge.source], to = visualPositions[edge.target];
      const handles = resolveLogicHandles({ sourceHandle: edge.source === link.from ? link.sourceHandle : undefined,
        targetHandle: edge.target === link.to ? link.targetHandle : undefined }, from ? [from.x, from.y] : undefined, to ? [to.x, to.y] : undefined);
      const a = visualPositions[lane.a], b = visualPositions[lane.b];
      const dx = a && b ? b.x - a.x : 0, dy = a && b ? b.y - a.y : 0, length = Math.hypot(dx, dy) || 1;
      const offset: [number, number] = [-dy / length * lane.distance, dx / length * lane.distance - 26];
      const previous = edgeCache.edges[index];
      if (previous && previous.sourceHandle === handles.sourceHandle && previous.targetHandle === handles.targetHandle
        && previous.data?.offset[0] === offset[0] && previous.data.offset[1] === offset[1]) return previous;
      return { ...edge, ...handles, data: { ...edge.data, offset } };
    });
    if (next.length === edgeCache.edges.length && next.every((edge, index) => edge === edgeCache.edges[index])) return edgeCache.edges;
    edgeCache.edges = next;
    return next;
  }, [edgeTemplates, edgeCache, positions, visibleFrames]);

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
    setDragView((previous) => previous?.target === session.target ? previous : { frames: session.frames, target: session.target, frameId: null });
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
    if (session.frameId || confirmModuleChange(project, topology, session.nodeIds, session.target)) {
      edit({ positions: moved, assignments: session.frameId ? undefined : session.nodeIds.map((nodeId) => ({ nodeId, moduleId: session.target })) });
    }
    setLocalPositions({}); setDragView(null);
  }

  // Keep XYFlow's store props stable while reading the latest topology/positions.
  const dragHandlers = useRef({ startDrag, updateDrag, stopDrag });
  useLayoutEffect(() => { dragHandlers.current = { startDrag, updateDrag, stopDrag }; });
  const onNodeDragStart = useCallback<OnNodeDrag>((_, node, nodes) => dragHandlers.current.startDrag(node, nodes), []);
  const onNodeDrag = useCallback<OnNodeDrag>((_, node, nodes) => dragHandlers.current.updateDrag(node, nodes), []);
  const onNodeDragStop = useCallback<OnNodeDrag>((_, node, nodes) => dragHandlers.current.stopDrag(node, nodes), []);
  const onPaneClick = useCallback(() => { setSelection([]); selectLink(null); setCreating(false); }, [setSelection, selectLink]);

  function onConnect(connection: FlowConnection) {
    if (!connection.source || !connection.target || connection.source.startsWith("frame:") || connection.target.startsWith("frame:")) return;
    setSelection([]);
    addLink(connection.source, connection.target, logicKind, {
      sourceHandle: asLogicHandleSide(connection.sourceHandle), targetHandle: asLogicHandleSide(connection.targetHandle),
    });
  }

  function createGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim() || !selectedNodeIds.length) return;
    if (!confirmModuleChange(project, topology, selectedNodeIds, "__new_module__")) return;
    addModule(newName.trim(), selectedNodeIds);
    setCreating(false); setNewName("");
  }

  const draggedGroup = dragView?.target ? topology.modules.find((module) => module.id === dragView.target) : null;
  const draggingIds = drag.current?.nodeIds ?? [];
  const leaving = draggingIds.some((id) => groupOf.has(id));

  if (!topology.nodes.length && !topology.modules.length) return <div className="empty-workspace concept-empty">
    <h3>从逻辑拓扑开始</h3><p>添加区域、连接路线，再框选区域组成模块。<br />模块可以直接进入搭建，无需先提供图片或世界坐标。</p>
    <button type="button" className="primary-command" onClick={() => addNode()}><Plus size={15} />添加第一个区域</button>
  </div>;

  return <div className="concept-canvas decomposition-canvas">
    <ReactFlow key={scopeKey} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={setFlow}
      onNodesChange={onNodesChange} connectionMode={ConnectionMode.Loose} onConnect={onConnect}
      onEdgeClick={(_, edge) => { setSelection([]); selectLink(edge.id); }}
      defaultViewport={savedViewport} fitView={!savedViewport} onMoveEnd={(_, viewport) => viewports.set(scopeKey, viewport)}
      fitViewOptions={fitViewOptions} minZoom={0.15} maxZoom={1.8}
      selectionOnDrag selectionMode={SelectionMode.Partial} selectionKeyCode={null} multiSelectionKeyCode={multiSelectionKeyCode}
      panOnDrag={panOnDrag} deleteKeyCode={null}
      onPaneClick={onPaneClick}
      // XYFlow invokes these for selection drags too; registering both duplicates each update.
      onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}>
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
          const moduleId = event.target.value === "__unassigned__" ? null : event.target.value;
          if (confirmModuleChange(project, topology, selectedNodeIds, moduleId)) edit({ assignments: selectedNodeIds.map((nodeId) => ({ nodeId, moduleId })) });
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
    <div className="canvas-mode-label">连线：{LOGIC_KINDS[logicKind].label} · 从边缘连接点拖出</div>
    <div className="decomp-canvas-help">空白处框选 · Ctrl / ⌘ 多选 · 中键 / 右键平移 · 拖入模块调整归属 · 双击模块标题开始搭建</div>
  </div>;
}
