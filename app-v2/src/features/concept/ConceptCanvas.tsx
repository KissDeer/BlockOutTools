import { useMemo, useState } from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Connection as FlowConnection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { Eye, EyeOff, Plus } from "lucide-react";
import { LOGIC_KINDS, TRAVERSALS } from "../../domain/concept";
import { useProjectStore } from "../../store/project-store";
import { useCurrentTopology } from "./use-current-topology";
import { LogicEdgeView, type LogicEdgeData } from "./LogicEdgeView";
import { LogicNodeView, type LogicNodeData } from "./LogicNodeView";
import { moduleColor } from "./module-colors";

const nodeTypes: NodeTypes = { logic: LogicNodeView };
const edgeTypes: EdgeTypes = { logic: LogicEdgeView };

/** 同一对区域之间的多条链路错开距离；须大于标签宽度，否则标签仍会压在一起 */
const LANE_SPACING = 88;
/** 统一向上拱起，避免连线压住节点框 */
const LANE_ARC = -26;

export function ConceptCanvas() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();
  const selectedNodeId = useProjectStore((state) => state.selectedLogicNodeId);
  const selectedLinkId = useProjectStore((state) => state.selectedLogicLinkId);
  const logicKind = useProjectStore((state) => state.logicKind);
  const selectNode = useProjectStore((state) => state.setSelectedLogicNode);
  const selectLink = useProjectStore((state) => state.setSelectedLogicLink);
  const updateNode = useProjectStore((state) => state.updateLogicNode);
  const addLogicLink = useProjectStore((state) => state.addLogicLink);
  const addLogicNode = useProjectStore((state) => state.addLogicNode);
  const [showPreview, setShowPreview] = useState(true);

  const nodes = useMemo<Node<LogicNodeData>[]>(() => {
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    for (const link of topology.links) {
      outgoing.set(link.from, (outgoing.get(link.from) ?? 0) + 1);
      incoming.set(link.to, (incoming.get(link.to) ?? 0) + 1);
    }
    const modulesById = new Map(project.modules.map((module) => [module.id, module]));
    // 模块归属：节点 → 拆解模块（含配色索引）
    const groupOf = new Map<string, { name: string; color: string }>();
    topology.modules.forEach((group, index) => {
      for (const nodeId of group.nodeIds) groupOf.set(nodeId, { name: group.name, color: moduleColor(index) });
    });
    return topology.nodes.map((node) => ({
      id: node.id,
      type: "logic",
      position: { x: node.graphPosition[0], y: node.graphPosition[1] },
      selected: node.id === selectedNodeId,
      data: {
        node,
        module: node.moduleId ? modulesById.get(node.moduleId) ?? null : null,
        isStart: topology.startNodeId === node.id,
        incoming: incoming.get(node.id) ?? 0,
        outgoing: outgoing.get(node.id) ?? 0,
        showPreview,
        group: groupOf.get(node.id) ?? null,
      } satisfies LogicNodeData,
    }));
  }, [project.modules, selectedNodeId, showPreview, topology]);

  const edges = useMemo<Edge[]>(() => {
    /* 先按"无向节点对"分组，再算统一垂直方向，反向链路才不会互相抵消偏移 */
    const groups = new Map<string, typeof topology.links>();
    for (const link of topology.links) {
      const key = [link.from, link.to].sort().join("|");
      groups.set(key, [...(groups.get(key) ?? []), link]);
    }
    const positionOf = new Map(topology.nodes.map((node) => [node.id, node.graphPosition]));
    const offsets = new Map<string, [number, number]>();
    for (const [key, group] of groups) {
      const [firstId, secondId] = key.split("|");
      const first = positionOf.get(firstId);
      const second = positionOf.get(secondId);
      if (!first || !second) continue;
      const dx = second[0] - first[0];
      const dy = second[1] - first[1];
      const length = Math.hypot(dx, dy) || 1;
      const perpX = -dy / length;
      const perpY = dx / length;
      group.forEach((link, index) => {
        const lane = (index - (group.length - 1) / 2) * LANE_SPACING;
        offsets.set(link.id, [perpX * lane, perpY * lane + LANE_ARC]);
      });
    }

    return topology.links.map((link) => {
      const meta = LOGIC_KINDS[link.logic];
      const key = topology.keys.find((item) => item.id === link.requires);
      const directed = link.traversal !== "both";
      return {
        id: link.id,
        source: link.from,
        target: link.to,
        type: "logic",
        selected: link.id === selectedLinkId,
        data: {
          color: meta.color,
          dash: meta.dash,
          label: link.label,
          kindLabel: meta.label,
          keyName: key?.name ?? null,
          traversalLabel: link.traversal === "both" ? "" : TRAVERSALS[link.traversal],
          offset: offsets.get(link.id) ?? [0, LANE_ARC],
        } satisfies LogicEdgeData,
        markerEnd: directed ? { type: MarkerType.ArrowClosed, color: meta.color, width: 16, height: 16 } : undefined,
      } as Edge;
    });
  }, [selectedLinkId, topology]);

  function onConnect(connection: FlowConnection) {
    if (!connection.source || !connection.target) return;
    addLogicLink(connection.source, connection.target, logicKind);
  }

  if (topology.nodes.length === 0) {
    return (
      <div className="empty-workspace concept-empty">
        <h3>逻辑拓扑还是空的</h3>
        <p>先把区域列出来，再用逻辑链路把它们连起来：单向门、锁钥门、捷径、掉落、楼梯……<br />这里只表达“怎么连通”，不涉及真实位置。</p>
        <button type="button" className="primary-command" onClick={() => addLogicNode()}><Plus size={15} />添加第一个区域</button>
      </div>
    );
  }

  return (
    <div className="concept-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.26, maxZoom: 1.1 }}
        minZoom={0.2}
        maxZoom={1.8}
        onNodeClick={(_, node) => selectNode(node.id)}
        onEdgeClick={(_, edge) => selectLink(edge.id)}
        onPaneClick={() => { selectNode(null); }}
        onNodeDragStop={(_, node) => updateNode(node.id, { graphPosition: [node.position.x, node.position.y] })}
        onConnect={onConnect}
        deleteKeyCode={null}
      >
        <Background gap={24} size={1} color="#323832" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#4b675d" maskColor="rgba(13,15,14,.72)" />
      </ReactFlow>
      <div className="canvas-mode-label">连线：{LOGIC_KINDS[logicKind].label}{LOGIC_KINDS[logicKind].directed ? " · 天然单向" : ""}</div>
      <button type="button" className="concept-preview-toggle" onClick={() => setShowPreview((value) => !value)}>
        {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
        {showPreview ? "隐藏模块缩略图" : "显示模块缩略图"}
      </button>
    </div>
  );
}
