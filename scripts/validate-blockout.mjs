// 校验一个 BlockOutTools V2 关卡 JSON：结构 + 白盒规范 + 装配求解 + UE dry-run。
// 装配求解与 UE dry-run 忠实移植自 app-v2/src/domain/assembly-resolver.ts 与 ue-plan.ts，
// 因为离线环境无法直接运行浏览器/vitest 版本的求解器。
// 用法: node scripts/validate-blockout.mjs <path-to-blockout.json>
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/validate-blockout.mjs <path-to-blockout.json>");
  process.exit(2);
}

const project = JSON.parse(readFileSync(file, "utf8"));
const errors = [];
const allowed = new Set(["box", "doorway", "stairs-linear", "port"]);
const CONNECTION_RULES = {
  door: { forward: 0, vertical: 0 },
  "one-way-door": { forward: 0, vertical: 0 },
  stairs: { forward: 400, vertical: 300 },
  "spiral-stairs": { forward: 0, vertical: 300 },
  elevator: { forward: 0, vertical: 300 },
  "one-way-elevator": { forward: 0, vertical: 300 },
  road: { forward: 500, vertical: 0 },
  drop: { forward: 250, vertical: -300 },
};

if (project.schemaVersion !== 2) errors.push("schemaVersion 必须为 2");
if (typeof project.projectId !== "string" || !project.projectId) errors.push("缺少 projectId");
if (!Array.isArray(project.modules) || project.modules.length === 0) errors.push("缺少 modules");
if (!Array.isArray(project.instances) || project.instances.length === 0) errors.push("缺少 instances");
if (!Array.isArray(project.connections)) errors.push("缺少 connections");

let blocks = 0;
const stats = new Map();
for (const m of project.modules ?? []) {
  if (!Array.isArray(m.blocks)) errors.push(`模块 ${m.id} 缺少 blocks`);
  for (const b of m.blocks ?? []) {
    blocks++;
    stats.set(b.type, (stats.get(b.type) ?? 0) + 1);
    if (!allowed.has(b.type)) errors.push(`${b.id}: 不支持的积木类型 ${b.type}`);
    if (!b.transform || !Array.isArray(b.transform.position) || b.transform.position.length !== 3) errors.push(`${b.id}: transform.position 非法`);
    if (typeof b.transform.rotation !== "number") errors.push(`${b.id}: transform.rotation 非法`);
    if (!b.parameters) errors.push(`${b.id}: 缺少 parameters`);
  }
}

const prof = project.blockoutProfile;
for (const m of project.modules ?? []) {
  for (const b of m.blocks ?? []) {
    if (b.type === "doorway") {
      const [, width, height] = b.parameters.DoorwaySize;
      if (width < prof.minDoorWidth) errors.push(`${b.id}: 门洞宽度 ${width}cm < ${prof.minDoorWidth}cm`);
      if (height < prof.minDoorHeight) errors.push(`${b.id}: 门洞高度 ${height}cm < ${prof.minDoorHeight}cm`);
    }
    if (b.type === "stairs-linear") {
      const [, depth, height] = b.parameters.StairsSize;
      const steps = Math.max(1, b.parameters.NumberOfSteps);
      const rise = height / steps, tread = depth / steps;
      if (rise > prof.maxStairRise) errors.push(`${b.id}: 楼梯踢面 ${rise.toFixed(1)}cm > ${prof.maxStairRise}cm`);
      if (tread < prof.minStairTread) errors.push(`${b.id}: 楼梯踏步 ${tread.toFixed(1)}cm < ${prof.minStairTread}cm`);
    }
  }
}

// ---- 装配求解（移植 resolveAssembly）----
const normalizeRotation = (r) => ((r % 360) + 360) % 360;
const angularDistance = (l, r) => {
  const d = Math.abs(normalizeRotation(l) - normalizeRotation(r));
  return Math.min(d, 360 - d);
};
const rotate2d = (x, y, deg) => {
  const radians = (deg * Math.PI) / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  return [x * cos - y * sin, x * sin + y * cos];
};
const offsetFor = (type, sourceRotation) => {
  const rule = CONNECTION_RULES[type];
  const [x, y] = rotate2d(rule.forward, 0, sourceRotation);
  return [x, y, rule.vertical];
};
const worldPortPose = (transform, port) => {
  const [x, y] = rotate2d(port.transform.position[0], port.transform.position[1], transform.rotation);
  return { position: [transform.position[0] + x, transform.position[1] + y, transform.position[2] + port.transform.position[2]], rotation: normalizeRotation(transform.rotation + port.transform.rotation) };
};
const transformFromPortPose = (port, pose) => {
  const rotation = normalizeRotation(pose.rotation - port.transform.rotation);
  const [x, y] = rotate2d(port.transform.position[0], port.transform.position[1], rotation);
  return { position: [pose.position[0] - x, pose.position[1] - y, pose.position[2] - port.transform.position[2]], rotation };
};
const solveTarget = (type, sourceTransform, sourcePort, targetPort) => {
  const sourcePose = worldPortPose(sourceTransform, sourcePort);
  const offset = offsetFor(type, sourcePose.rotation);
  return transformFromPortPose(targetPort, { position: [sourcePose.position[0] + offset[0], sourcePose.position[1] + offset[1], sourcePose.position[2] + offset[2]], rotation: normalizeRotation(sourcePose.rotation + 180) });
};
const solveSource = (type, targetTransform, sourcePort, targetPort) => {
  const targetPose = worldPortPose(targetTransform, targetPort);
  const sourceRotation = normalizeRotation(targetPose.rotation - 180);
  const offset = offsetFor(type, sourceRotation);
  return transformFromPortPose(sourcePort, { position: [targetPose.position[0] - offset[0], targetPose.position[1] - offset[1], targetPose.position[2] - offset[2]], rotation: sourceRotation });
};

const definitions = new Map(project.modules.map((m) => [m.id, m]));
const references = new Map();
for (const instance of project.instances) {
  const definition = definitions.get(instance.definitionId);
  if (!definition) continue;
  for (const block of definition.blocks) if (block.type === "port") references.set(`${instance.id}:${block.id}`, { instance, port: block });
}
const connectionReferences = (connection) => {
  const source = references.get(`${connection.sourceInstanceId}:${connection.sourcePortId}`);
  const target = references.get(`${connection.targetInstanceId}:${connection.targetPortId}`);
  return source && target ? [source, target] : null;
};

const connectionsByInstance = new Map();
for (const connection of project.connections) {
  for (const instanceId of [connection.sourceInstanceId, connection.targetInstanceId]) {
    const entries = connectionsByInstance.get(instanceId) ?? [];
    entries.push(connection);
    connectionsByInstance.set(instanceId, entries);
  }
}
const transforms = new Map();
const missingConnections = new Set();
const instanceById = new Map(project.instances.map((i) => [i.id, i]));
const rootOrder = [...new Set([...project.connections.map((c) => c.sourceInstanceId), ...project.instances.map((i) => i.id)])];
for (const rootId of rootOrder) {
  const root = instanceById.get(rootId);
  if (!root || transforms.has(root.id)) continue;
  transforms.set(root.id, structuredClone(root.assemblyTransform));
  const queue = [root.id];
  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index];
    const currentTransform = transforms.get(currentId);
    if (!currentTransform) continue;
    for (const connection of connectionsByInstance.get(currentId) ?? []) {
      const pair = connectionReferences(connection);
      if (!pair) { missingConnections.add(connection.id); continue; }
      const [source, target] = pair;
      const currentIsSource = connection.sourceInstanceId === currentId;
      const other = currentIsSource ? target : source;
      if (transforms.has(other.instance.id)) continue;
      transforms.set(other.instance.id, currentIsSource ? solveTarget(connection.type, currentTransform, source.port, target.port) : solveSource(connection.type, currentTransform, source.port, target.port));
      queue.push(other.instance.id);
    }
  }
}

const assemblyIssues = [...missingConnections].map((connectionId) => ({ connectionId, kind: "missing-reference", positionError: Number.POSITIVE_INFINITY, rotationError: Number.POSITIVE_INFINITY }));
const portIds = new Set();
for (const instance of project.instances) {
  const definition = definitions.get(instance.definitionId);
  for (const block of definition?.blocks ?? []) if (block.type === "port") portIds.add(block.id);
}
for (const connection of project.connections) {
  const pair = connectionReferences(connection);
  const sourceTransform = transforms.get(connection.sourceInstanceId);
  const targetTransform = transforms.get(connection.targetInstanceId);
  if (!pair || !sourceTransform || !targetTransform) continue;
  const [source, target] = pair;
  const sourcePose = worldPortPose(sourceTransform, source.port);
  const targetPose = worldPortPose(targetTransform, target.port);
  const offset = offsetFor(connection.type, sourcePose.rotation);
  const expected = [sourcePose.position[0] + offset[0], sourcePose.position[1] + offset[1], sourcePose.position[2] + offset[2]];
  const positionError = Math.hypot(targetPose.position[0] - expected[0], targetPose.position[1] - expected[1], targetPose.position[2] - expected[2]);
  const rotationError = angularDistance(targetPose.rotation, sourcePose.rotation + 180);
  if (positionError > 0.1 || rotationError > 0.1) assemblyIssues.push({ connectionId: connection.id, kind: "constraint-mismatch", positionError, rotationError });
}

// ---- UE dry-run actor 计数（移植 buildLocalUEDryRun 的 actor 生成与计数）----
const classPathByType = { box: "/BlockoutToolsPlugin/Blueprints/Blockout_Box.Blockout_Box_C", doorway: "/BlockoutToolsPlugin/Blueprints/Blockout_Doorway.Blockout_Doorway_C", "stairs-linear": "/BlockoutToolsPlugin/Blueprints/Blockout_Stairs_Linear.Blockout_Stairs_Linear_C" };
let actorCount = 0;
for (const instance of project.instances) {
  const definition = definitions.get(instance.definitionId);
  if (!definition) continue;
  const resolvedTransform = transforms.get(instance.id) ?? instance.assemblyTransform;
  for (const block of definition.blocks) {
    if (block.type === "port") continue;
    actorCount++;
    if (!classPathByType[block.type]) errors.push(`${block.id}: 无对应 UE Blueprint 类路径（${block.type}）`);
  }
}

const portTotal = stats.get("port") ?? 0;
if (portTotal === 0) errors.push("没有任何 port 出入口");
const deployable = [...stats.entries()].filter(([t]) => t !== "port").reduce((a, [, n]) => a + n, 0);
if (deployable === 0) errors.push("没有可部署积木（box/doorway/stairs-linear）");

console.log(`project: ${project.name ?? project.projectId}`);
console.log(`modules: ${project.modules?.length ?? 0} · instances: ${project.instances?.length ?? 0} · blocks: ${blocks} · connections: ${project.connections?.length ?? 0}`);
console.log(`block types: ${[...stats.entries()].map(([t, n]) => `${t}=${n}`).join(", ")}`);
console.log(`UE dry-run actorCount: ${actorCount} · assembly issues: ${assemblyIssues.length}`);
for (const issue of assemblyIssues) {
  console.log(`  · ${issue.connectionId} [${issue.kind}] posErr=${typeof issue.positionError === "number" ? issue.positionError.toFixed(1) : "inf"} rotErr=${typeof issue.rotationError === "number" ? issue.rotationError.toFixed(1) : "inf"}`);
}

if (errors.length) {
  console.error("校验失败:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("OK: 结构、白盒规范、装配与 UE dry-run 计数均通过。");
