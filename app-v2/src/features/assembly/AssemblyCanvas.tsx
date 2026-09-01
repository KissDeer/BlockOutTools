import { useMemo } from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Connection as FlowConnection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { useProjectStore } from "../../store/project-store";
import { ModuleNode, type ModuleNodeData } from "./ModuleNode";

const nodeTypes: NodeTypes = { module: ModuleNode };

const connectionLabels = {
  door: "普通门",
  "one-way-door": "单向门",
  stairs: "楼梯",
  "spiral-stairs": "螺旋楼梯",
  elevator: "普通电梯",
  "one-way-elevator": "单向电梯",
  road: "普通路",
  drop: "单向下落路",
};

export function AssemblyCanvas() {
  const project = useProjectStore((state) => state.project);
  const selectedInstanceId = useProjectStore((state) => state.selectedInstanceId);
  const connectionType = useProjectStore((state) => state.connectionType);
  const selectInstance = useProjectStore((state) => state.setSelectedInstance);
  const openModule = useProjectStore((state) => state.openModule);
  const updateGraph = useProjectStore((state) => state.updateInstanceGraph);
  const connectPorts = useProjectStore((state) => state.connectPorts);

  const occupied = useMemo(() => new Set(project.connections.flatMap((connection) => [connection.sourcePortId, connection.targetPortId])), [project.connections]);
  const modules = useMemo(() => new Map(project.modules.map((module) => [module.id, module])), [project.modules]);
  const nodes = useMemo<Node<ModuleNodeData>[]>(() => project.instances.flatMap((instance) => {
    const module = modules.get(instance.definitionId);
    if (!module) return [];
    return [{
      id: instance.id,
      type: "module",
      position: { x: instance.graphPosition[0], y: instance.graphPosition[1] },
      selected: instance.id === selectedInstanceId,
      data: { instance, module, occupiedPortIds: [...occupied], onOpen: openModule },
    }];
  }), [modules, occupied, openModule, project.instances, selectedInstanceId]);

  const edges = useMemo<Edge[]>(() => project.connections.map((connection) => ({
    id: connection.id,
    source: connection.sourceInstanceId,
    sourceHandle: connection.sourcePortId,
    target: connection.targetInstanceId,
    targetHandle: connection.targetPortId,
    type: "smoothstep",
    label: connectionLabels[connection.type],
    markerEnd: connection.type === "stairs" || connection.type === "door" || connection.type === "road" ? undefined : { type: MarkerType.ArrowClosed, color: "#d8a84e" },
    style: { stroke: connection.type.includes("door") ? "#4bb89a" : "#d8a84e", strokeWidth: 2, strokeDasharray: connection.type === "elevator" ? "5 4" : undefined },
    labelStyle: { fill: "#d6ddd7", fontSize: 11 },
    labelBgStyle: { fill: "#202421", fillOpacity: 0.92 },
  })), [project.connections]);

  function onConnect(connection: FlowConnection) {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
    connectPorts(connection.source, connection.sourceHandle, connection.target, connection.targetHandle);
  }

  return (
    <div className="assembly-canvas" aria-label="模块组装无限画布">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.28, maxZoom: 1.15 }}
        minZoom={0.25}
        maxZoom={1.8}
        onNodeClick={(_, node) => selectInstance(node.id)}
        onPaneClick={() => selectInstance(null)}
        onNodeDragStop={(_, node) => updateGraph(node.id, [node.position.x, node.position.y])}
        onConnect={onConnect}
        deleteKeyCode={null}
      >
        <Background gap={24} size={1} color="#323832" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#4b675d" maskColor="rgba(13,15,14,.72)" />
      </ReactFlow>
      <div className="canvas-mode-label">连线：{connectionLabels[connectionType]}</div>
    </div>
  );
}
