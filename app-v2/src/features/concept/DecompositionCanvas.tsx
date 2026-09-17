import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Background, ConnectionMode, Controls, MarkerType, ReactFlow, SelectionMode,
  type Connection as FlowConnection, type Edge, type EdgeTypes, type Node, type NodeChange, type OnNodeDrag, type NodeTypes, type Viewport,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import { LOGIC_KINDS, TRAVERSALS, type LogicTopology } from "../../domain/concept";
import { nodeInterior } from "../../domain/concept-scopes";
import { useProjectStore } from "../../store/project-store";
import { LogicEdgeView, type LogicEdgeData } from "./LogicEdgeView";
import { LogicNodeView, type LogicNodeData } from "./LogicNodeView";
import { asLogicHandleSide, resolveLogicHandles } from "./logic-handles";
import { useCurrentTopology } from "./use-current-topology";
import "./decomposition-canvas.css";

// XYFlow positions the outer wrapper; these views only render their content.
const nodeTypes: NodeTypes = {
  logic: memo(LogicNodeView, (before, after) => before.data === after.data && before.selected === after.selected),
};
const edgeTypes: EdgeTypes = { logic: LogicEdgeView };
const fitViewOptions = { padding: 0.24, maxZoom: 1 };
const multiSelectionKeyCode = ["Control", "Meta"];
const panOnDrag = [1, 2];
/** 视口按层级各记一份：换一层再回来还停在原处，不要重新 fitView */
const viewports = new Map<string, Viewport>();
type Position = { x: number; y: number };

/**
 * 一次拖动会话。
 *
 * 拖动过程中 XYFlow 只报坐标变化：边拖边写 store 会把一次拖动拆成几十条历史，
 * 所以中途只落在本地 state，松手时才提交。
 */
interface DragSession {
  topology: LogicTopology;
  positions: Record<string, Position>;
  nodeIds: string[];
}

export function DecompositionCanvas() {
  const topology = useCurrentTopology();
  const project = useProjectStore((state) => state.project);
  const scopeId = useProjectStore((state) => state.conceptScopeId);
  const addNode = useProjectStore((state) => state.addLogicNode);
  const moveNodes = useProjectStore((state) => state.moveLogicNodes);
  const logicKind = useProjectStore((state) => state.logicKind);
  const addLink = useProjectStore((state) => state.addLogicLink);
  const selectedLinkId = useProjectStore((state) => state.selectedLogicLinkId);
  const selectedNodeId = useProjectStore((state) => state.selectedLogicNodeId);
  const selectNode = useProjectStore((state) => state.setSelectedLogicNode);
  const selectLink = useProjectStore((state) => state.setSelectedLogicLink);
  const enterLevel = useProjectStore((state) => state.enterNode);
  /**
   * 画布自己的多选：框选与多选拖动看它。
   * store 里只有一个 `selectedLogicNodeId`（检查器与落位编辑读它），所以两边各留一份、
   * 各管各的：store 选中谁，画布上就看得见谁；画布上选了谁，也告诉 store。
   */
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(selectedNodeId ? [selectedNodeId] : []);
  /** 事件回调拿不到最新的 state（闭包是旧的），选中项的权威副本放这里 */
  const selectionRef = useRef(selectedNodeIds);
  const setSelection = useCallback((ids: string[]) => {
    selectionRef.current = ids;
    setSelectedNodeIds(ids);
  }, []);
  const [localPositions, setLocalPositions] = useState<Record<string, Position>>({});
  /**
   * XYFlow 量到的节点尺寸。
   *
   * 受控 `nodes` 一变，XYFlow 就按我们给的对象重建内部节点，并**把量到的尺寸清掉重测**；
   * 不把尺寸写回去，拖动时每帧都会重测一遍，连接点位置跟着抖。
   */
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const drag = useRef<DragSession | null>(null);
  const scopeKey = `${project.projectId}:${scopeId ?? "root"}`;
  const savedViewport = viewports.get(scopeKey);

  useEffect(() => {
    // 换层：选中项与拖动快照都属于上一层，不能带到新的一层
    drag.current = null;
    setSelection([]);
    setLocalPositions({});
  }, [scopeKey, setSelection]);

  useEffect(() => {
    // 层级树、检查器可能替我们选中了一个区域（进叶子节点时会自动选中它），画布上要看得见
    if (selectedNodeId && !selectionRef.current.includes(selectedNodeId)) setSelection([selectedNodeId]);
  }, [selectedNodeId, setSelection]);

  useEffect(() => {
    // 撤销、刷新项目或检查器改过拓扑之后，拖动快照与选中项都可能指向已经不存在的节点
    drag.current = null;
    setLocalPositions({});
    const existing = new Set(topology.nodes.map((node) => node.id));
    const valid = selectionRef.current.filter((id) => existing.has(id));
    if (valid.length !== selectionRef.current.length) setSelection(valid);
  }, [topology, setSelection]);

  const positions = useMemo(() => Object.fromEntries(topology.nodes.map((node) => [node.id, localPositions[node.id] ?? { x: node.graphPosition[0], y: node.graphPosition[1] }])), [topology.nodes, localPositions]);

  /**
   * 提交一批排版坐标。
   *
   * 走 store 的批量入口：一次拖动 = 一条历史。逐个调 `updateLogicNode` 会把
   * 拖三个节点变成三条历史，撤销一次只回去一个。
   */
  const commitPositions = useCallback((moved: { nodeId: string; position: Position }[]) => {
    moveNodes(moved.map(({ nodeId, position }) => ({ nodeId, position: [position.x, position.y] as [number, number] })));
  }, [moveNodes]);

  const logicNodes = useMemo<Node[]>(() => {
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    topology.links.forEach((link) => {
      incoming.set(link.to, (incoming.get(link.to) ?? 0) + 1);
      outgoing.set(link.from, (outgoing.get(link.from) ?? 0) + 1);
    });
    const selected = new Set(selectedNodeIds);
    return topology.nodes.map((node) => {
      // 节点内部：几何直接挂在节点自己身上，坐标就是节点局部厘米
      const interior = nodeInterior(topology, node.id);
      return {
        id: node.id, type: "logic", position: { x: node.graphPosition[0], y: node.graphPosition[1] }, selected: selected.has(node.id), connectable: true,
        data: {
          node, interiorBlocks: interior.blocks ?? [], childCount: interior.childCount, linkCount: interior.linkCount,
          isStart: topology.startNodeId === node.id, incoming: incoming.get(node.id) ?? 0,
          outgoing: outgoing.get(node.id) ?? 0, showPreview: true,
        } satisfies LogicNodeData,
        ...(sizes[node.id] ? { measured: sizes[node.id] } : {}),
      };
    });
  }, [topology, selectedNodeIds, sizes]);

  const previousNodes = useRef(new Map<string, Node>());
  const nodes = useMemo<Node[]>(() => {
    const next = logicNodes.map((base) => {
      const position = positions[base.id] ?? base.position;
      const previous = previousNodes.current.get(base.id);
      if (previous && previous.data === base.data && previous.selected === base.selected && previous.measured === base.measured
        && previous.position.x === position.x && previous.position.y === position.y) return previous;
      return { ...base, position };
    });
    previousNodes.current = new Map(next.map((node) => [node.id, node]));
    return next;
  }, [logicNodes, positions]);

  const edgeTemplates = useMemo(() => {
    // 同两个区域之间可以有多条链路，按"排序后的节点对"归堆错开，标签才不会叠在一起
    const groups = new Map<string, typeof topology.links>();
    topology.links.forEach((link) => {
      const key = [link.from, link.to].sort().join("|");
      groups.set(key, [...(groups.get(key) ?? []), link]);
    });
    const lanes = new Map<string, { a: string; b: string; distance: number }>();
    for (const [key, links] of groups) {
      const [a, b] = key.split("|");
      links.forEach((link, index) => lanes.set(link.id, { a, b, distance: (index - (links.length - 1) / 2) * 88 }));
    }
    const keys = new Map(topology.keys.map((key) => [key.id, key.name]));
    return topology.links.map((link) => {
      const meta = LOGIC_KINDS[link.logic];
      return { link, lane: lanes.get(link.id)!, edge: { id: link.id, source: link.from, target: link.to, type: "logic", selectable: true, selected: link.id === selectedLinkId,
        data: { color: meta.color, dash: meta.dash, label: link.label, kindLabel: meta.label,
          keyName: keys.get(link.requires ?? "") ?? null,
          traversalLabel: link.traversal === "both" ? "" : TRAVERSALS[link.traversal], offset: [0, -26] } satisfies LogicEdgeData,
        markerEnd: link.traversal !== "both" ? { type: MarkerType.ArrowClosed, color: meta.color, width: 16, height: 16 } : undefined } satisfies Edge<LogicEdgeData> };
    });
  }, [topology.links, topology.keys, selectedLinkId]);
  const edgeCache = useMemo(() => ({ edges: [] as Edge<LogicEdgeData>[] }), [edgeTemplates]);
  const edges = useMemo(() => {
    const next = edgeTemplates.map(({ link, lane, edge }, index) => {
      const from = positions[edge.source], to = positions[edge.target];
      const handles = resolveLogicHandles(link, from ? [from.x, from.y] : undefined, to ? [to.x, to.y] : undefined);
      const a = positions[lane.a], b = positions[lane.b];
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
  }, [edgeTemplates, edgeCache, positions]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const positionChanges = changes.filter((change) => change.type === "position" && change.position);
    if (positionChanges.length) {
      if (!drag.current && positionChanges.every((change) => change.type === "position" && !change.dragging)) {
        // XYFlow's arrow-key movement emits position changes without drag callbacks.
        commitPositions(positionChanges.flatMap((change) => change.type === "position" && change.position
          ? [{ nodeId: change.id, position: { x: change.position.x, y: change.position.y } }] : []));
      } else setLocalPositions((previous) => {
        const next = { ...previous };
        positionChanges.forEach((change) => { if (change.type === "position" && change.position) next[change.id] = change.position; });
        return next;
      });
    }
    const dimensionChanges = changes.filter((change) => change.type === "dimensions" && change.dimensions);
    if (dimensionChanges.length) setSizes((previous) => {
      const next = { ...previous }; let changed = false;
      dimensionChanges.forEach((change) => {
        if (change.type !== "dimensions" || !change.dimensions) return;
        if (next[change.id]?.width === change.dimensions.width && next[change.id]?.height === change.dimensions.height) return;
        next[change.id] = change.dimensions; changed = true;
      });
      return changed ? next : previous;
    });
    const selectionChanges = changes.filter((change) => change.type === "select");
    if (selectionChanges.length) {
      const ids = new Set(selectionRef.current);
      let last: string | null = null;
      selectionChanges.forEach((change) => {
        if (change.type !== "select") return;
        if (change.selected) { ids.add(change.id); last = change.id; } else ids.delete(change.id);
      });
      const next = [...ids];
      setSelection(next);
      // 检查器读的是 store 里的选中项：画布上选了谁就告诉它，否则右侧会一直停在上一个区域
      if (last) selectNode(last);
      else if (!next.length) selectNode(null);
    }
  }, [commitPositions, selectNode, setSelection]);

  function startDrag(node: Node, draggedNodes: Node[]) {
    if (drag.current) return;
    // 多选时 XYFlow 把一起拖的节点都报过来：起点位置要一起记下，松手才算得出位移
    drag.current = { topology, positions, nodeIds: [...new Set([node.id, ...draggedNodes.map((item) => item.id)])] };
  }

  function stopDrag(node: Node, draggedNodes: Node[]) {
    const session = drag.current;
    if (!session || session.topology !== topology) return;
    // 用事件里带着的最新坐标，不要读 state：最后一次位置变化可能还没渲染到闭包里
    const latest = new Map([node, ...draggedNodes].map((item) => [item.id, item.position]));
    const moved = session.nodeIds.flatMap((id) => {
      const position = latest.get(id) ?? positions[id];
      const origin = session.positions[id];
      if (!position || !origin || (origin.x === position.x && origin.y === position.y)) return [];
      return [{ nodeId: id, position }];
    });
    drag.current = null;
    commitPositions(moved);
    setLocalPositions({});
  }

  // Keep XYFlow's store props stable while reading the latest topology/positions.
  const dragHandlers = useRef({ startDrag, stopDrag });
  useLayoutEffect(() => { dragHandlers.current = { startDrag, stopDrag }; });
  const onNodeDragStart = useCallback<OnNodeDrag>((_, node, nodes) => dragHandlers.current.startDrag(node, nodes), []);
  const onNodeDragStop = useCallback<OnNodeDrag>((_, node, nodes) => dragHandlers.current.stopDrag(node, nodes), []);
  const onPaneClick = useCallback(() => { setSelection([]); selectLink(null); selectNode(null); }, [setSelection, selectLink, selectNode]);

  function onConnect(connection: FlowConnection) {
    if (!connection.source || !connection.target) return;
    setSelection([]);
    addLink(connection.source, connection.target, logicKind, {
      sourceHandle: asLogicHandleSide(connection.sourceHandle), targetHandle: asLogicHandleSide(connection.targetHandle),
    });
  }

  if (!topology.nodes.length) return <div className="empty-workspace concept-empty">
    <h3>从逻辑拓扑开始</h3><p>添加区域、连接路线；双击区域进入它内部，<br />在里面拼体块，或者再分一层子区域。</p>
    <button type="button" className="primary-command" onClick={() => addNode()}><Plus size={15} />添加第一个区域</button>
  </div>;

  return <div className="concept-canvas decomposition-canvas">
    <ReactFlow key={scopeKey} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      onNodesChange={onNodesChange} connectionMode={ConnectionMode.Loose} onConnect={onConnect}
      onEdgeClick={(_, edge) => { setSelection([]); selectLink(edge.id); }}
      // 双击进入节点内部：这是唯一的"进入"入口，人不会离开这张画布
      onNodeDoubleClick={(_, node) => enterLevel(node.id)}
      defaultViewport={savedViewport} fitView={!savedViewport} onMoveEnd={(_, viewport) => viewports.set(scopeKey, viewport)}
      fitViewOptions={fitViewOptions} minZoom={0.15} maxZoom={1.8}
      selectionOnDrag selectionMode={SelectionMode.Partial} selectionKeyCode={null} multiSelectionKeyCode={multiSelectionKeyCode}
      panOnDrag={panOnDrag} deleteKeyCode={null}
      onPaneClick={onPaneClick}
      // 位置只从 onNodesChange 进（拖动回调只标出会话起止），两处都改会把每次移动做两遍
      onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop}>
      <Background gap={24} size={1} color="#323832" />
      <Controls showInteractive={false} />
    </ReactFlow>
    <div className="canvas-mode-label">连线：{LOGIC_KINDS[logicKind].label} · 从边缘连接点拖出</div>
    <div className="decomp-canvas-help">空白处框选 · Ctrl / ⌘ 多选 · 中键 / 右键平移 · <strong>双击节点进入它内部</strong>；节点里显示已经拼好的内容</div>
  </div>;
}
