const STRUCTURE_SCHEMA_VERSION = 2;

export const CONNECTION_TYPES = Object.freeze([
  { id: "door", label: "普通门", shortLabel: "门", directional: false, arrows: "none", lineStyle: "solid", offset: { forward: 0, z: 0 } },
  { id: "one-way-door", label: "单向门", shortLabel: "单向门", directional: true, arrows: "end", lineStyle: "solid", offset: { forward: 0, z: 0 } },
  { id: "stairs", label: "楼梯", shortLabel: "楼梯", directional: "vertical", arrows: "both", lineStyle: "solid", offset: { forward: 400, z: 300 } },
  { id: "spiral-stairs", label: "螺旋楼梯", shortLabel: "螺旋", directional: "vertical", arrows: "both", lineStyle: "dashed", offset: { forward: 0, z: 300 } },
  { id: "elevator", label: "普通电梯", shortLabel: "电梯", directional: false, arrows: "both", lineStyle: "dotted", offset: { forward: 0, z: 300 } },
  { id: "one-way-elevator", label: "单向电梯", shortLabel: "单向电梯", directional: true, arrows: "end", lineStyle: "dotted", offset: { forward: 0, z: 300 } },
  { id: "road", label: "普通路", shortLabel: "道路", directional: false, arrows: "none", lineStyle: "wide", offset: { forward: 500, z: 0 } },
  { id: "drop", label: "单向下落路", shortLabel: "下落", directional: true, arrows: "end", lineStyle: "dashed", offset: { forward: 250, z: -300 } },
]);

const CONNECTION_TYPE_BY_ID = new Map(CONNECTION_TYPES.map((type) => [type.id, type]));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round(finite(value) * 1000) / 1000;
}

function normalizeAngle(value) {
  let angle = finite(value) % 360;
  if (angle < 0) angle += 360;
  return round(angle);
}

function rotatePoint(point, degrees) {
  const radians = finite(degrees) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: round(finite(point.x) * cosine - finite(point.y) * sine),
    y: round(finite(point.x) * sine + finite(point.y) * cosine),
  };
}

function transformedPoint(point, origin, transform) {
  const rotated = rotatePoint({
    x: finite(point.x) - finite(origin.x),
    y: finite(point.y) - finite(origin.y),
  }, transform.rotation);
  return {
    x: round(finite(transform.x) + rotated.x),
    y: round(finite(transform.y) + rotated.y),
  };
}

function localPointToWorld(position, transform) {
  const rotated = rotatePoint(position, transform.rotation);
  return {
    x: round(finite(transform.x) + rotated.x),
    y: round(finite(transform.y) + rotated.y),
    z: round(finite(transform.z) + finite(position.z)),
  };
}

export function emptyStructureGraph() {
  return {
    schemaVersion: STRUCTURE_SCHEMA_VERSION,
    modules: [],
    instances: [],
    connections: [],
  };
}

export function structureGraph(level) {
  const graph = level?.structureGraph;
  if (!graph || typeof graph !== "object") return emptyStructureGraph();
  return {
    schemaVersion: STRUCTURE_SCHEMA_VERSION,
    modules: Array.isArray(graph.modules) ? graph.modules : [],
    instances: Array.isArray(graph.instances) ? graph.instances : [],
    connections: Array.isArray(graph.connections) ? graph.connections.map((connection) => ({
      ...connection,
      waypoints: Array.isArray(connection.waypoints)
        ? connection.waypoints.map((point) => ({ x: round(point?.x), y: round(point?.y) }))
        : [],
    })) : [],
  };
}

function rotatedRectPoints(shape) {
  const width = Math.abs(finite(shape.width));
  const height = Math.abs(finite(shape.height));
  const center = { x: finite(shape.x) + width / 2, y: finite(shape.y) + height / 2 };
  return [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ].map((point) => {
    const rotated = rotatePoint(point, shape.rotation);
    return { x: center.x + rotated.x, y: center.y + rotated.y };
  });
}

function shapePoints(shape) {
  if (shape.type === "circle") {
    const radius = Math.abs(finite(shape.radius));
    return [
      { x: finite(shape.x) - radius, y: finite(shape.y) - radius },
      { x: finite(shape.x) + radius, y: finite(shape.y) + radius },
    ];
  }
  if (Array.isArray(shape.wallCenterline) && shape.wallCenterline.length > 0) {
    const margin = Math.abs(finite(shape.wallThickness ?? shape.strokeWidth, 0)) / 2;
    return shape.wallCenterline.flatMap((point) => [
      { x: finite(point.x) - margin, y: finite(point.y) - margin },
      { x: finite(point.x) + margin, y: finite(point.y) + margin },
    ]);
  }
  if (Number.isFinite(Number(shape.x)) && Number.isFinite(Number(shape.y))) {
    return rotatedRectPoints(shape);
  }
  return [];
}

export function layerBounds(level, layerId) {
  const points = [];
  for (const shape of level.shapes ?? []) {
    if (shape.layerId === layerId) points.push(...shapePoints(shape));
  }
  for (const entity of level.entities ?? []) {
    if (entity.layerId !== layerId) continue;
    const position = entity.position ?? entity;
    points.push({ x: finite(position.x), y: finite(position.y) });
  }
  if (points.length === 0) {
    return { x: -200, y: -150, width: 400, height: 300 };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    x: round(minX),
    y: round(minY),
    width: round(Math.max(1, maxX - minX)),
    height: round(Math.max(1, maxY - minY)),
  };
}

function withGraph(level, graph) {
  return { ...level, structureGraph: graph };
}

export function createModuleFromLayer(level, layerId, options = {}) {
  const layer = level.layers?.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`未找到图层：${layerId}`);
  const graph = clone(structureGraph(level));
  if (graph.modules.some((module) => module.sourceLayerId === layerId)) {
    throw new Error("当前图层已经建立了结构模块");
  }
  const bounds = layerBounds(level, layerId);
  const origin = {
    x: round(bounds.x + bounds.width / 2),
    y: round(bounds.y + bounds.height / 2),
    z: round(layer.height),
  };
  const moduleId = options.moduleId ?? createId("module");
  const instanceId = options.instanceId ?? createId("instance");
  graph.modules.push({
    id: moduleId,
    name: String(options.name ?? layer.name ?? `模块 ${graph.modules.length + 1}`),
    sourceLayerId: layerId,
    ownsSourceLayer: false,
    origin,
    ports: [],
  });
  graph.instances.push({
    id: instanceId,
    moduleId,
    name: String(options.instanceName ?? layer.name ?? `实例 ${graph.instances.length + 1}`),
    transform: { x: origin.x, y: origin.y, z: origin.z, rotation: 0 },
  });
  return { level: withGraph(level, graph), moduleId, instanceId };
}

export function createEmptyStructureModule(level, options = {}) {
  const graph = clone(structureGraph(level));
  const moduleNumber = graph.modules.length + 1;
  const moduleId = options.moduleId ?? createId("module");
  const instanceId = options.instanceId ?? createId("instance");
  const sourceLayerId = options.sourceLayerId ?? createId("module-layer");
  const name = String(options.name ?? `模块 ${moduleNumber}`);
  const transform = {
    x: round(options.transform?.x),
    y: round(options.transform?.y),
    z: round(options.transform?.z),
    rotation: normalizeAngle(options.transform?.rotation),
  };
  const sourceLayer = {
    id: sourceLayerId,
    name: `${name} · 内部`,
    visible: true,
    locked: false,
    height: 0,
    color: String(options.layerColor ?? "#8E8E86"),
    showWalls: true,
  };

  graph.modules.push({
    id: moduleId,
    name,
    sourceLayerId,
    ownsSourceLayer: true,
    origin: { x: 0, y: 0, z: 0 },
    ports: [],
  });
  graph.instances.push({
    id: instanceId,
    moduleId,
    name: String(options.instanceName ?? `${name} 1`),
    transform,
  });

  return {
    level: withGraph({
      ...level,
      layers: [...(level.layers ?? []), sourceLayer],
    }, graph),
    moduleId,
    instanceId,
    sourceLayerId,
  };
}

export function duplicateModuleInstance(level, instanceId, options = {}) {
  const graph = clone(structureGraph(level));
  const source = graph.instances.find((instance) => instance.id === instanceId);
  if (!source) throw new Error(`未找到模块实例：${instanceId}`);
  const siblings = graph.instances.filter((instance) => instance.moduleId === source.moduleId);
  const instance = {
    ...clone(source),
    id: options.instanceId ?? createId("instance"),
    name: String(options.name ?? `${source.name} ${siblings.length + 1}`),
    transform: {
      ...source.transform,
      x: round(source.transform.x + finite(options.offsetX, 200)),
      y: round(source.transform.y + finite(options.offsetY, 200)),
    },
  };
  graph.instances.push(instance);
  return { level: withGraph(level, graph), instanceId: instance.id };
}

export function createModuleInstance(level, moduleId, options = {}) {
  const graph = clone(structureGraph(level));
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  if (!module) throw new Error(`未找到结构模块：${moduleId}`);
  const siblings = graph.instances.filter((instance) => instance.moduleId === moduleId);
  const reference = siblings.at(-1);
  const instance = {
    id: options.instanceId ?? createId("instance"),
    moduleId,
    name: String(options.name ?? `${module.name} ${siblings.length + 1}`),
    transform: {
      x: round(options.transform?.x ?? finite(reference?.transform.x, module.origin.x) + (reference ? 200 : 0)),
      y: round(options.transform?.y ?? finite(reference?.transform.y, module.origin.y) + (reference ? 200 : 0)),
      z: round(options.transform?.z ?? finite(reference?.transform.z, module.origin.z)),
      rotation: normalizeAngle(options.transform?.rotation ?? reference?.transform.rotation),
    },
  };
  graph.instances.push(instance);
  return { level: withGraph(level, graph), instanceId: instance.id };
}

export function updateStructureModule(level, moduleId, updates = {}) {
  const graph = clone(structureGraph(level));
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  if (!module) throw new Error(`未找到结构模块：${moduleId}`);
  if (updates.name != null) module.name = String(updates.name);
  if (updates.name == null || !module.ownsSourceLayer) return withGraph(level, graph);
  return withGraph({
    ...level,
    layers: (level.layers ?? []).map((layer) => (
      layer.id === module.sourceLayerId
        ? { ...layer, name: `${module.name} · 内部` }
        : layer
    )),
  }, graph);
}

export function updateModuleInstance(level, instanceId, updates) {
  const graph = clone(structureGraph(level));
  const index = graph.instances.findIndex((instance) => instance.id === instanceId);
  if (index < 0) throw new Error(`未找到模块实例：${instanceId}`);
  const current = graph.instances[index];
  graph.instances[index] = {
    ...current,
    ...(updates.name == null ? {} : { name: String(updates.name) }),
    transform: {
      ...current.transform,
      ...(updates.transform ?? {}),
      x: round(updates.transform?.x ?? current.transform.x),
      y: round(updates.transform?.y ?? current.transform.y),
      z: round(updates.transform?.z ?? current.transform.z),
      rotation: normalizeAngle(updates.transform?.rotation ?? current.transform.rotation),
    },
  };
  return withGraph(level, graph);
}

export function addModulePort(level, moduleId, values = {}) {
  const graph = clone(structureGraph(level));
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  if (!module) throw new Error(`未找到结构模块：${moduleId}`);
  const port = {
    id: values.id ?? createId("port"),
    name: String(values.name ?? `出入口 ${module.ports.length + 1}`),
    position: {
      x: round(values.position?.x),
      y: round(values.position?.y),
      z: round(values.position?.z),
    },
    facing: normalizeAngle(values.facing),
  };
  module.ports.push(port);
  return { level: withGraph(level, graph), portId: port.id };
}

export function updateModulePort(level, moduleId, portId, updates) {
  const graph = clone(structureGraph(level));
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  const index = module?.ports.findIndex((port) => port.id === portId) ?? -1;
  if (!module || index < 0) throw new Error(`未找到出入口：${portId}`);
  const current = module.ports[index];
  module.ports[index] = {
    ...current,
    ...(updates.name == null ? {} : { name: String(updates.name) }),
    position: {
      ...current.position,
      ...(updates.position ?? {}),
      x: round(updates.position?.x ?? current.position.x),
      y: round(updates.position?.y ?? current.position.y),
      z: round(updates.position?.z ?? current.position.z),
    },
    facing: normalizeAngle(updates.facing ?? current.facing),
  };
  return withGraph(level, graph);
}

function modulePortShapePosition(shape, module) {
  const width = Math.abs(finite(shape.width));
  const height = Math.abs(finite(shape.height));
  return {
    x: round(finite(shape.x) + width / 2 - finite(module.origin.x)),
    y: round(finite(shape.y) + height / 2 - finite(module.origin.y)),
    z: round(shape.modulePort?.z),
  };
}

function portFromShape(shape, module, index) {
  return {
    id: String(shape.modulePort?.id ?? `port-${shape.id}`),
    name: String(shape.modulePort?.name ?? `出入口 ${index + 1}`),
    position: modulePortShapePosition(shape, module),
    facing: normalizeAngle(shape.rotation),
  };
}

export function materializeModulePortShapes(level, moduleId) {
  const graph = structureGraph(level);
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  if (!module) throw new Error(`未找到结构模块：${moduleId}`);
  const existingPortIds = new Set((level.shapes ?? [])
    .filter((shape) => shape.layerId === module.sourceLayerId && shape.modulePort?.id)
    .map((shape) => String(shape.modulePort.id)));
  const missingPorts = module.ports.filter((port) => !existingPortIds.has(String(port.id)));
  if (missingPorts.length === 0) return level;

  const shapes = missingPorts.map((port) => {
    const width = 100;
    const height = 24;
    const centerX = finite(module.origin.x) + finite(port.position?.x);
    const centerY = finite(module.origin.y) + finite(port.position?.y);
    return {
      id: createId("module-port-shape"),
      type: "rect",
      x: round(centerX - width / 2),
      y: round(centerY - height / 2),
      width,
      height,
      rotation: normalizeAngle(port.facing),
      color: "#E59A42",
      opacity: 0.82,
      area: width * height,
      layerId: module.sourceLayerId,
      modulePort: {
        id: String(port.id),
        name: String(port.name ?? "出入口"),
        z: round(port.position?.z),
      },
    };
  });
  return { ...level, shapes: [...(level.shapes ?? []), ...shapes] };
}

export function syncModulePortsFromShapes(level, moduleId) {
  const currentGraph = structureGraph(level);
  const currentModule = currentGraph.modules.find((candidate) => candidate.id === moduleId);
  if (!currentModule) throw new Error(`未找到结构模块：${moduleId}`);
  const seenPortIds = new Set();
  const portShapes = [];
  let shapesChanged = false;
  const shapes = (level.shapes ?? []).map((shape) => {
    if (shape.layerId !== currentModule.sourceLayerId || !shape.modulePort) return shape;
    const requestedId = String(shape.modulePort.id ?? `port-${shape.id}`);
    let portId = requestedId;
    if (seenPortIds.has(portId)) {
      portId = `port-${shape.id}`;
      let suffix = 2;
      while (seenPortIds.has(portId)) portId = `port-${shape.id}-${suffix++}`;
    }
    seenPortIds.add(portId);
    const normalized = portId === shape.modulePort.id
      ? shape
      : { ...shape, modulePort: { ...shape.modulePort, id: portId } };
    if (normalized !== shape) shapesChanged = true;
    portShapes.push(normalized);
    return normalized;
  });
  const ports = portShapes.map((shape, index) => portFromShape(shape, currentModule, index));
  const validPortIds = new Set(ports.map((port) => port.id));
  const instanceIds = new Set(currentGraph.instances
    .filter((instance) => instance.moduleId === moduleId)
    .map((instance) => instance.id));
  const connections = currentGraph.connections.filter((connection) => !(
    (instanceIds.has(connection.from.instanceId) && !validPortIds.has(connection.from.portId))
    || (instanceIds.has(connection.to.instanceId) && !validPortIds.has(connection.to.portId))
  ));
  if (JSON.stringify(currentModule.ports) === JSON.stringify(ports)
    && connections.length === currentGraph.connections.length
    && !shapesChanged) {
    return level;
  }

  const graph = clone(currentGraph);
  graph.modules = graph.modules.map((module) => (
    module.id === moduleId ? { ...module, ports } : module
  ));
  graph.connections = connections.map(clone);
  return withGraph(shapesChanged ? { ...level, shapes } : level, graph);
}

export function syncAllModulePortsFromShapes(level) {
  let synchronized = level;
  for (const module of structureGraph(level).modules) {
    const hasPortShapes = (synchronized.shapes ?? []).some((shape) => (
      shape.layerId === module.sourceLayerId && shape.modulePort
    ));
    if (hasPortShapes) synchronized = syncModulePortsFromShapes(synchronized, module.id);
  }
  return synchronized;
}

export function worldPort(graphValue, reference) {
  const graph = graphValue?.modules ? graphValue : structureGraph(graphValue);
  const instance = graph.instances.find((candidate) => candidate.id === reference.instanceId);
  const module = instance && graph.modules.find((candidate) => candidate.id === instance.moduleId);
  const port = module?.ports.find((candidate) => candidate.id === reference.portId);
  if (!instance || !module || !port) throw new Error("连接引用了不存在的出入口");
  return {
    ...localPointToWorld(port.position, instance.transform),
    facing: normalizeAngle(instance.transform.rotation + port.facing),
    instance,
    module,
    port,
  };
}

function sameEndpoint(left, right) {
  return left.instanceId === right.instanceId && left.portId === right.portId;
}

function isEndpointConnected(graph, endpoint) {
  return graph.connections.some((connection) => (
    sameEndpoint(connection.from, endpoint) || sameEndpoint(connection.to, endpoint)
  ));
}

function connectedInstanceIds(graph, startInstanceId) {
  const visited = new Set([startInstanceId]);
  const queue = [startInstanceId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const connection of graph.connections) {
      let neighbor = null;
      if (connection.from.instanceId === current) neighbor = connection.to.instanceId;
      if (connection.to.instanceId === current) neighbor = connection.from.instanceId;
      if (neighbor && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited;
}

function setInstanceFromPort(graph, endpoint, worldPosition, worldFacing) {
  const instance = graph.instances.find((candidate) => candidate.id === endpoint.instanceId);
  const module = instance && graph.modules.find((candidate) => candidate.id === instance.moduleId);
  const port = module?.ports.find((candidate) => candidate.id === endpoint.portId);
  if (!instance || !module || !port) throw new Error("连接引用了不存在的出入口");
  const rotation = normalizeAngle(worldFacing - port.facing);
  const rotatedPort = rotatePoint(port.position, rotation);
  instance.transform = {
    x: round(worldPosition.x - rotatedPort.x),
    y: round(worldPosition.y - rotatedPort.y),
    z: round(worldPosition.z - finite(port.position.z)),
    rotation,
  };
}

function alignConnectionNeighbor(graph, connection, fixedInstanceId) {
  const type = CONNECTION_TYPE_BY_ID.get(connection.type) ?? CONNECTION_TYPES[0];
  if (connection.from.instanceId === fixedInstanceId) {
    const source = worldPort(graph, connection.from);
    const radians = source.facing * Math.PI / 180;
    setInstanceFromPort(graph, connection.to, {
      x: source.x + Math.cos(radians) * type.offset.forward,
      y: source.y + Math.sin(radians) * type.offset.forward,
      z: source.z + type.offset.z,
    }, normalizeAngle(source.facing + 180));
    return connection.to.instanceId;
  }

  const target = worldPort(graph, connection.to);
  const sourceFacing = normalizeAngle(target.facing + 180);
  const radians = sourceFacing * Math.PI / 180;
  setInstanceFromPort(graph, connection.from, {
    x: target.x - Math.cos(radians) * type.offset.forward,
    y: target.y - Math.sin(radians) * type.offset.forward,
    z: target.z - type.offset.z,
  }, sourceFacing);
  return connection.from.instanceId;
}

function realignGraph(graph, anchorInstanceId) {
  if (!graph.instances.some((instance) => instance.id === anchorInstanceId)) return graph;
  const visited = new Set([anchorInstanceId]);
  const queue = [anchorInstanceId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const connection of graph.connections) {
      if (connection.from.instanceId !== current && connection.to.instanceId !== current) continue;
      const neighbor = connection.from.instanceId === current
        ? connection.to.instanceId
        : connection.from.instanceId;
      if (visited.has(neighbor)) continue;
      alignConnectionNeighbor(graph, connection, current);
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return graph;
}

export function realignStructureGraph(level, anchorInstanceId) {
  const graph = clone(structureGraph(level));
  return withGraph(level, realignGraph(graph, anchorInstanceId));
}

export function updateStructureAssembly(level, instanceId, updates) {
  return updateModuleInstance(level, instanceId, updates);
}

export function connectModulePorts(level, values) {
  const graph = clone(structureGraph(level));
  const connectionType = CONNECTION_TYPE_BY_ID.get(values.type);
  if (!connectionType) throw new Error(`未知连接形式：${values.type}`);
  if (!values.from || !values.to || sameEndpoint(values.from, values.to)) {
    throw new Error("请选择两个不同的出入口");
  }
  if (values.from.instanceId === values.to.instanceId) {
    throw new Error("同一个模块实例的出入口不能互相连接");
  }
  if (isEndpointConnected(graph, values.from) || isEndpointConnected(graph, values.to)) {
    throw new Error("一个出入口只能建立一条连接");
  }

  if (connectedInstanceIds(graph, values.from.instanceId).has(values.to.instanceId)) {
    throw new Error("两个模块实例已经通过其他出入口相连");
  }

  const connection = {
    id: values.id ?? createId("connection"),
    type: connectionType.id,
    from: clone(values.from),
    to: clone(values.to),
    waypoints: Array.isArray(values.waypoints)
      ? values.waypoints.map((point) => ({ x: round(point?.x), y: round(point?.y) }))
      : [],
  };
  graph.connections.push(connection);
  return { level: withGraph(level, graph), connectionId: connection.id };
}

export function updateConnectionWaypoints(level, connectionId, waypoints) {
  const graph = clone(structureGraph(level));
  const connection = graph.connections.find((candidate) => candidate.id === connectionId);
  if (!connection) throw new Error(`未找到连接路线：${connectionId}`);
  connection.waypoints = Array.isArray(waypoints)
    ? waypoints.map((point) => ({ x: round(point?.x), y: round(point?.y) }))
    : [];
  return withGraph(level, graph);
}

export function disconnectModulePorts(level, connectionId) {
  const graph = clone(structureGraph(level));
  graph.connections = graph.connections.filter((connection) => connection.id !== connectionId);
  return withGraph(level, graph);
}

export function removeModulePort(level, moduleId, portId) {
  const graph = clone(structureGraph(level));
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  if (!module) return level;
  module.ports = module.ports.filter((port) => port.id !== portId);
  const instanceIds = new Set(graph.instances
    .filter((instance) => instance.moduleId === moduleId)
    .map((instance) => instance.id));
  graph.connections = graph.connections.filter((connection) => !(
    (instanceIds.has(connection.from.instanceId) && connection.from.portId === portId)
    || (instanceIds.has(connection.to.instanceId) && connection.to.portId === portId)
  ));
  return withGraph(level, graph);
}

export function removeModuleInstance(level, instanceId) {
  const graph = clone(structureGraph(level));
  graph.instances = graph.instances.filter((instance) => instance.id !== instanceId);
  graph.connections = graph.connections.filter((connection) => (
    connection.from.instanceId !== instanceId && connection.to.instanceId !== instanceId
  ));
  return withGraph(level, graph);
}

export function removeStructureModule(level, moduleId) {
  const graph = clone(structureGraph(level));
  const module = graph.modules.find((candidate) => candidate.id === moduleId);
  const instanceIds = new Set(graph.instances
    .filter((instance) => instance.moduleId === moduleId)
    .map((instance) => instance.id));
  graph.modules = graph.modules.filter((module) => module.id !== moduleId);
  graph.instances = graph.instances.filter((instance) => instance.moduleId !== moduleId);
  graph.connections = graph.connections.filter((connection) => (
    !instanceIds.has(connection.from.instanceId) && !instanceIds.has(connection.to.instanceId)
  ));
  if (!module?.ownsSourceLayer) return withGraph(level, graph);

  const sourceLayerId = module.sourceLayerId;
  return withGraph({
    ...level,
    layers: (level.layers ?? []).filter((layer) => layer.id !== sourceLayerId),
    shapes: (level.shapes ?? []).filter((shape) => shape.layerId !== sourceLayerId),
    entities: (level.entities ?? []).filter((entity) => entity.layerId !== sourceLayerId),
  }, graph);
}

function transformPointArray(points, origin, transform) {
  if (!Array.isArray(points)) return points;
  return points.map((point) => transformedPoint(point, origin, transform));
}

function transformShape(shape, module, instance, layerId) {
  const next = clone(shape);
  next.id = `${shape.id}--${instance.id}`;
  next.layerId = layerId;
  next.structureModuleId = module.id;
  next.structureInstanceId = instance.id;
  next.rotation = normalizeAngle(finite(shape.rotation) + instance.transform.rotation);

  if (shape.type === "circle") {
    const center = transformedPoint({ x: shape.x, y: shape.y }, module.origin, instance.transform);
    next.x = center.x;
    next.y = center.y;
  } else if (Number.isFinite(Number(shape.x)) && Number.isFinite(Number(shape.y))) {
    const width = finite(shape.width);
    const height = finite(shape.height);
    const center = transformedPoint({
      x: finite(shape.x) + width / 2,
      y: finite(shape.y) + height / 2,
    }, module.origin, instance.transform);
    next.x = round(center.x - width / 2);
    next.y = round(center.y - height / 2);
  }

  for (const key of ["wallCenterline", "points", "vertices", "polygonPoints"]) {
    if (Array.isArray(shape[key])) next[key] = transformPointArray(shape[key], module.origin, instance.transform);
  }
  return next;
}

function transformEntity(entity, module, instance, layerId) {
  const next = clone(entity);
  const position = entity.position ?? entity;
  const transformed = transformedPoint(position, module.origin, instance.transform);
  next.id = `${entity.id}--${instance.id}`;
  next.layerId = layerId;
  next.structureModuleId = module.id;
  next.structureInstanceId = instance.id;
  next.rotation = normalizeAngle(finite(entity.rotation) + instance.transform.rotation);
  if (entity.position) next.position = { ...entity.position, ...transformed };
  else Object.assign(next, transformed);
  return next;
}

export function resolveStructureAssemblyGraph(level) {
  const graph = clone(structureGraph(level));
  const visited = new Set();
  for (const instance of graph.instances) {
    if (visited.has(instance.id)) continue;
    realignGraph(graph, instance.id);
    for (const instanceId of connectedInstanceIds(graph, instance.id)) visited.add(instanceId);
  }
  return graph;
}

export function resolveStructureGraphLevel(level, resolvedGraph = null) {
  const graph = resolvedGraph?.modules ? resolvedGraph : resolveStructureAssemblyGraph(level);
  if (graph.modules.length === 0) return level;
  const moduleById = new Map(graph.modules.map((module) => [module.id, module]));
  const sourceLayerIds = new Set(graph.modules.map((module) => module.sourceLayerId));
  const sourceLayerById = new Map((level.layers ?? []).map((layer) => [layer.id, layer]));
  const layers = (level.layers ?? []).filter((layer) => !sourceLayerIds.has(layer.id)).map(clone);
  const shapes = (level.shapes ?? [])
    .filter((shape) => !sourceLayerIds.has(shape.layerId) && !shape.modulePort)
    .map(clone);
  const entities = (level.entities ?? []).filter((entity) => !sourceLayerIds.has(entity.layerId)).map(clone);

  for (const instance of graph.instances) {
    const module = moduleById.get(instance.moduleId);
    const sourceLayer = module && sourceLayerById.get(module.sourceLayerId);
    if (!module || !sourceLayer) continue;
    const layerId = `structure-${instance.id}`;
    layers.push({
      ...clone(sourceLayer),
      id: layerId,
      name: instance.name,
      height: round(instance.transform.z),
      structureModuleId: module.id,
      structureInstanceId: instance.id,
    });
    shapes.push(...(level.shapes ?? [])
      .filter((shape) => shape.layerId === module.sourceLayerId && !shape.modulePort)
      .map((shape) => transformShape(shape, module, instance, layerId)));
    entities.push(...(level.entities ?? [])
      .filter((entity) => entity.layerId === module.sourceLayerId)
      .map((entity) => transformEntity(entity, module, instance, layerId)));
  }

  return { ...level, shapes, entities, layers, structureResolved: true };
}

export function connectionType(typeId) {
  return CONNECTION_TYPE_BY_ID.get(typeId) ?? CONNECTION_TYPES[0];
}

export { normalizeAngle, rotatePoint, STRUCTURE_SCHEMA_VERSION };
