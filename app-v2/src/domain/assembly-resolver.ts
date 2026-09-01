import type { BlockoutProject, Connection, ConnectionType, ModuleInstance, PortBlock, Transform, Vec3 } from "./types";

export interface ConnectionRule {
  forward: number;
  vertical: number;
}

export interface AssemblyConstraintIssue {
  connectionId: string;
  kind: "missing-reference" | "constraint-mismatch";
  positionError: number;
  rotationError: number;
}

export interface ResolvedAssembly {
  instances: ModuleInstance[];
  issues: AssemblyConstraintIssue[];
}

export const CONNECTION_RULES: Record<ConnectionType, ConnectionRule> = {
  door: { forward: 0, vertical: 0 },
  "one-way-door": { forward: 0, vertical: 0 },
  stairs: { forward: 400, vertical: 300 },
  "spiral-stairs": { forward: 0, vertical: 300 },
  elevator: { forward: 0, vertical: 300 },
  "one-way-elevator": { forward: 0, vertical: 300 },
  road: { forward: 500, vertical: 0 },
  drop: { forward: 250, vertical: -300 },
};

interface PortReference {
  instance: ModuleInstance;
  port: PortBlock;
}

interface PortPose {
  position: Vec3;
  rotation: number;
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

function angularDistance(left: number, right: number): number {
  const difference = Math.abs(normalizeRotation(left) - normalizeRotation(right));
  return Math.min(difference, 360 - difference);
}

function rotate2d(x: number, y: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [x * cos - y * sin, x * sin + y * cos];
}

function offsetFor(type: ConnectionType, sourceRotation: number): Vec3 {
  const rule = CONNECTION_RULES[type];
  const [x, y] = rotate2d(rule.forward, 0, sourceRotation);
  return [x, y, rule.vertical];
}

function worldPortPose(transform: Transform, port: PortBlock): PortPose {
  const [x, y] = rotate2d(port.transform.position[0], port.transform.position[1], transform.rotation);
  return {
    position: [
      transform.position[0] + x,
      transform.position[1] + y,
      transform.position[2] + port.transform.position[2],
    ],
    rotation: normalizeRotation(transform.rotation + port.transform.rotation),
  };
}

function transformFromPortPose(port: PortBlock, pose: PortPose): Transform {
  const rotation = normalizeRotation(pose.rotation - port.transform.rotation);
  const [x, y] = rotate2d(port.transform.position[0], port.transform.position[1], rotation);
  return {
    position: [pose.position[0] - x, pose.position[1] - y, pose.position[2] - port.transform.position[2]],
    rotation,
  };
}

function solveTarget(type: ConnectionType, sourceTransform: Transform, sourcePort: PortBlock, targetPort: PortBlock): Transform {
  const sourcePose = worldPortPose(sourceTransform, sourcePort);
  const offset = offsetFor(type, sourcePose.rotation);
  return transformFromPortPose(targetPort, {
    position: [sourcePose.position[0] + offset[0], sourcePose.position[1] + offset[1], sourcePose.position[2] + offset[2]],
    rotation: normalizeRotation(sourcePose.rotation + 180),
  });
}

function solveSource(type: ConnectionType, targetTransform: Transform, sourcePort: PortBlock, targetPort: PortBlock): Transform {
  const targetPose = worldPortPose(targetTransform, targetPort);
  const sourceRotation = normalizeRotation(targetPose.rotation - 180);
  const offset = offsetFor(type, sourceRotation);
  return transformFromPortPose(sourcePort, {
    position: [targetPose.position[0] - offset[0], targetPose.position[1] - offset[1], targetPose.position[2] - offset[2]],
    rotation: sourceRotation,
  });
}

function resolveReferences(project: BlockoutProject): Map<string, PortReference> {
  const definitions = new Map(project.modules.map((module) => [module.id, module]));
  const references = new Map<string, PortReference>();
  for (const instance of project.instances) {
    const definition = definitions.get(instance.definitionId);
    if (!definition) continue;
    for (const block of definition.blocks) {
      if (block.type === "port") references.set(`${instance.id}:${block.id}`, { instance, port: block });
    }
  }
  return references;
}

function connectionReferences(references: Map<string, PortReference>, connection: Connection): [PortReference, PortReference] | null {
  const source = references.get(`${connection.sourceInstanceId}:${connection.sourcePortId}`);
  const target = references.get(`${connection.targetInstanceId}:${connection.targetPortId}`);
  return source && target ? [source, target] : null;
}

export function resolveAssembly(project: BlockoutProject): ResolvedAssembly {
  const references = resolveReferences(project);
  const connectionsByInstance = new Map<string, Connection[]>();
  for (const connection of project.connections) {
    for (const instanceId of [connection.sourceInstanceId, connection.targetInstanceId]) {
      const entries = connectionsByInstance.get(instanceId) ?? [];
      entries.push(connection);
      connectionsByInstance.set(instanceId, entries);
    }
  }

  const transforms = new Map<string, Transform>();
  const missingConnections = new Set<string>();
  const instanceById = new Map(project.instances.map((instance) => [instance.id, instance]));
  const rootOrder = [...new Set([...project.connections.map((connection) => connection.sourceInstanceId), ...project.instances.map((instance) => instance.id)])];
  for (const rootId of rootOrder) {
    const root = instanceById.get(rootId);
    if (!root) continue;
    if (transforms.has(root.id)) continue;
    transforms.set(root.id, structuredClone(root.assemblyTransform));
    const queue = [root.id];
    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      const currentTransform = transforms.get(currentId);
      if (!currentTransform) continue;
      for (const connection of connectionsByInstance.get(currentId) ?? []) {
        const pair = connectionReferences(references, connection);
        if (!pair) {
          missingConnections.add(connection.id);
          continue;
        }
        const [source, target] = pair;
        const currentIsSource = connection.sourceInstanceId === currentId;
        const other = currentIsSource ? target : source;
        if (transforms.has(other.instance.id)) continue;
        const transform = currentIsSource
          ? solveTarget(connection.type, currentTransform, source.port, target.port)
          : solveSource(connection.type, currentTransform, source.port, target.port);
        transforms.set(other.instance.id, transform);
        queue.push(other.instance.id);
      }
    }
  }

  const issues: AssemblyConstraintIssue[] = [...missingConnections].map((connectionId) => ({
    connectionId,
    kind: "missing-reference",
    positionError: Number.POSITIVE_INFINITY,
    rotationError: Number.POSITIVE_INFINITY,
  }));

  for (const connection of project.connections) {
    const pair = connectionReferences(references, connection);
    const sourceTransform = transforms.get(connection.sourceInstanceId);
    const targetTransform = transforms.get(connection.targetInstanceId);
    if (!pair || !sourceTransform || !targetTransform) continue;
    const [source, target] = pair;
    const sourcePose = worldPortPose(sourceTransform, source.port);
    const targetPose = worldPortPose(targetTransform, target.port);
    const offset = offsetFor(connection.type, sourcePose.rotation);
    const expected: Vec3 = [sourcePose.position[0] + offset[0], sourcePose.position[1] + offset[1], sourcePose.position[2] + offset[2]];
    const positionError = Math.hypot(targetPose.position[0] - expected[0], targetPose.position[1] - expected[1], targetPose.position[2] - expected[2]);
    const rotationError = angularDistance(targetPose.rotation, sourcePose.rotation + 180);
    if (positionError > 0.1 || rotationError > 0.1) issues.push({ connectionId: connection.id, kind: "constraint-mismatch", positionError, rotationError });
  }

  return {
    instances: project.instances.map((instance) => ({
      ...instance,
      assemblyTransform: structuredClone(transforms.get(instance.id) ?? instance.assemblyTransform),
    })),
    issues,
  };
}
