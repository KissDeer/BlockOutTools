import { useCallback, useEffect, useMemo, useState } from "react";
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
import { CONNECTION_LABELS } from "./ConnectionInspector";
import { ModuleNode, type ModuleNodeData } from "./ModuleNode";

const nodeTypes: NodeTypes = { module: ModuleNode };

interface PendingPort {
  instanceId: string;
  portId: string;
}

export function AssemblyCanvas() {
  const project = useProjectStore((state) => state.project);
  const selectedInstanceId = useProjectStore((state) => state.selectedInstanceId);
  const selectedConnectionId = useProjectStore((state) => state.selectedConnectionId);
  const connectionType = useProjectStore((state) => state.connectionType);
  const selectInstance = useProjectStore((state) => state.setSelectedInstance);
  const selectConnection = useProjectStore((state) => state.setSelectedConnection);
  const openModule = useProjectStore((state) => state.openModule);
  const updateGraph = useProjectStore((state) => state.updateInstanceGraph);
  const connectPorts = useProjectStore((state) => state.connectPorts);
  const [pendingPort, setPendingPort] = useState<PendingPort | null>(null);

  const handlePortClick = useCallback((instanceId: string, portId: string) => {
    if (!pendingPort) {
      setPendingPort({ instanceId, portId });
      selectInstance(null);
      return;
    }
    if (pendingPort.instanceId === instanceId && pendingPort.portId === portId) {
      setPendingPort(null);
      return;
    }
    connectPorts(pendingPort.instanceId, pendingPort.portId, instanceId, portId);
    setPendingPort(null);
  }, [connectPorts, pendingPort, selectInstance]);

  const occupied = useMemo(() => new Set(project.connections.flatMap((connection) => [
    `${connection.sourceInstanceId}::${connection.sourcePortId}`,
    `${connection.targetInstanceId}::${connection.targetPortId}`,
  ])), [project.connections]);
  const modules = useMemo(() => new Map(project.modules.map((module) => [module.id, module])), [project.modules]);
  const nodes = useMemo<Node<ModuleNodeData>[]>(() => project.instances.flatMap((instance) => {
    const module = modules.get(instance.definitionId);
    if (!module) return [];
    return [{
      id: instance.id,
      type: "module",
      position: { x: instance.graphPosition[0], y: instance.graphPosition[1] },
      selected: instance.id === selectedInstanceId,
      data: {
        instance,
        module,
        occupiedPortKeys: [...occupied],
        pendingPortKey: pendingPort ? `${pendingPort.instanceId}::${pendingPort.portId}` : null,
        onOpen: openModule,
        onPortClick: handlePortClick,
      },
    }];
  }), [handlePortClick, modules, occupied, openModule, pendingPort, project.instances, selectedInstanceId]);

  const edges = useMemo<Edge[]>(() => project.connections.map((connection) => ({
    id: connection.id,
    source: connection.sourceInstanceId,
    sourceHandle: connection.sourcePortId,
    target: connection.targetInstanceId,
    targetHandle: connection.targetPortId,
    type: "smoothstep",
    label: CONNECTION_LABELS[connection.type],
    selected: connection.id === selectedConnectionId,
    interactionWidth: 28,
    markerStart: ["stairs", "spiral-stairs", "elevator"].includes(connection.type) ? { type: MarkerType.ArrowClosed, color: "#d8a84e" } : undefined,
    markerEnd: ["stairs", "spiral-stairs", "elevator", "one-way-door", "one-way-elevator", "drop"].includes(connection.type) ? { type: MarkerType.ArrowClosed, color: "#d8a84e" } : undefined,
    style: {
      stroke: connection.id === selectedConnectionId ? "#eef2ee" : connection.type.includes("door") ? "#4bb89a" : "#d8a84e",
      strokeWidth: connection.id === selectedConnectionId ? 3 : 2,
      strokeDasharray: connection.type.includes("elevator") ? "5 4" : connection.type === "drop" ? "2 5" : undefined,
    },
    labelStyle: { fill: "#d6ddd7", fontSize: 11 },
    labelBgStyle: { fill: "#202421", fillOpacity: 0.92 },
  })), [project.connections, selectedConnectionId]);

  useEffect(() => {
    const cancelPending = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingPort(null);
    };
    window.addEventListener("keydown", cancelPending);
    return () => window.removeEventListener("keydown", cancelPending);
  }, []);

  function onConnect(connection: FlowConnection) {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
    connectPorts(connection.source, connection.sourceHandle, connection.target, connection.targetHandle);
    setPendingPort(null);
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
        onNodeClick={(_, node) => { setPendingPort(null); selectInstance(node.id); }}
        onEdgeClick={(_, edge) => { setPendingPort(null); selectConnection(edge.id); }}
        onPaneClick={() => { setPendingPort(null); selectInstance(null); }}
        onNodeDragStop={(_, node) => updateGraph(node.id, [node.position.x, node.position.y])}
        onConnect={onConnect}
        deleteKeyCode={null}
      >
        <Background gap={24} size={1} color="#323832" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#4b675d" maskColor="rgba(13,15,14,.72)" />
      </ReactFlow>
      <div className={`canvas-mode-label ${pendingPort ? "is-pending" : ""}`}>{pendingPort ? "已选起点 · 点击另一个出入口" : `连线：${CONNECTION_LABELS[connectionType]}`}</div>
    </div>
  );
}
