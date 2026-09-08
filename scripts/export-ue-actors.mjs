// 把一个 BlockOutTools V2 关卡 JSON 导出为 UE Actor 计划（与 app 内 ue-plan.ts 语义一致）。
// 离线（vite/vitest 在沙盒无法运行）时，用本脚本产出可直接交给 UE 设计师的 Actor 清单。
// 用法: node scripts/export-ue-actors.mjs <path-to-blockout.json> [--out <dir>]
//   --out 缺省时输出到 <关卡同目录>/ue-plan/<关卡文件名>.actors.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, basename, resolve, join } from "node:path";

const fileArg = process.argv[2];
if (!fileArg) { console.error("Usage: node scripts/export-ue-actors.mjs <path-to-blockout.json> [--out <dir>]"); process.exit(2); }
const outIdx = process.argv.indexOf("--out");
const outDir = outIdx >= 0 ? process.argv[outIdx + 1] : null;

const project = JSON.parse(readFileSync(fileArg, "utf8"));

const CONNECTION_RULES = {
  door: { forward: 0, vertical: 0 }, "one-way-door": { forward: 0, vertical: 0 },
  stairs: { forward: 400, vertical: 300 }, "spiral-stairs": { forward: 0, vertical: 300 },
  elevator: { forward: 0, vertical: 300 }, "one-way-elevator": { forward: 0, vertical: 300 },
  road: { forward: 500, vertical: 0 }, drop: { forward: 250, vertical: -300 },
};
const CLASS_PATH = {
  box: "/BlockoutToolsPlugin/Blueprints/Blockout_Box.Blockout_Box_C",
  doorway: "/BlockoutToolsPlugin/Blueprints/Blockout_Doorway.Blockout_Doorway_C",
  "stairs-linear": "/BlockoutToolsPlugin/Blueprints/Blockout_Stairs_Linear.Blockout_Stairs_Linear_C",
};

const normalizeRotation = (r) => ((r % 360) + 360) % 360;
const angularDistance = (l, r) => Math.min(Math.abs(normalizeRotation(l) - normalizeRotation(r)) % 360, 360 - Math.abs(normalizeRotation(l) - normalizeRotation(r)) % 360);
const rotate2d = (x, y, deg) => { const radians = deg * Math.PI / 180; return [x * Math.cos(radians) - y * Math.sin(radians), x * Math.sin(radians) + y * Math.cos(radians)]; };
const offsetFor = (type, rot) => { const r = CONNECTION_RULES[type]; const [x, y] = rotate2d(r.forward, 0, rot); return [x, y, r.vertical]; };
const worldPortPose = (t, port) => { const [x, y] = rotate2d(port.transform.position[0], port.transform.position[1], t.rotation); return { position: [t.position[0] + x, t.position[1] + y, t.position[2] + port.transform.position[2]], rotation: normalizeRotation(t.rotation + port.transform.rotation) }; };
const transformFromPortPose = (port, pose) => { const rotation = normalizeRotation(pose.rotation - port.transform.rotation); const [x, y] = rotate2d(port.transform.position[0], port.transform.position[1], rotation); return { position: [pose.position[0] - x, pose.position[1] - y, pose.position[2] - port.transform.position[2]], rotation }; };
const solveTarget = (type, srcTransform, srcPort, tgtPort) => { const srcPose = worldPortPose(srcTransform, srcPort); const off = offsetFor(type, srcPose.rotation); return transformFromPortPose(tgtPort, { position: [srcPose.position[0] + off[0], srcPose.position[1] + off[1], srcPose.position[2] + off[2]], rotation: normalizeRotation(srcPose.rotation + 180) }); };
const solveSource = (type, tgtTransform, srcPort, tgtPort) => { const tgtPose = worldPortPose(tgtTransform, tgtPort); const sr = normalizeRotation(tgtPose.rotation - 180); const off = offsetFor(type, sr); return transformFromPortPose(srcPort, { position: [tgtPose.position[0] - off[0], tgtPose.position[1] - off[1], tgtPose.position[2] - off[2]], rotation: sr }); };

const definitions = new Map(project.modules.map((m) => [m.id, m]));
const references = new Map();
for (const instance of project.instances) { const def = definitions.get(instance.definitionId); if (!def) continue; for (const b of def.blocks) if (b.type === "port") references.set(`${instance.id}:${b.id}`, { instance, port: b }); }
const connRef = (c) => { const s = references.get(`${c.sourceInstanceId}:${c.sourcePortId}`); const t = references.get(`${c.targetInstanceId}:${c.targetPortId}`); return s && t ? [s, t] : null; };

const byInstance = new Map();
for (const c of project.connections) for (const id of [c.sourceInstanceId, c.targetInstanceId]) { const arr = byInstance.get(id) ?? []; arr.push(c); byInstance.set(id, arr); }
const transforms = new Map();
const instanceById = new Map(project.instances.map((i) => [i.id, i]));
const rootOrder = [...new Set([...project.connections.map((c) => c.sourceInstanceId), ...project.instances.map((i) => i.id)])];
for (const rootId of rootOrder) {
  const root = instanceById.get(rootId);
  if (!root || transforms.has(root.id)) continue;
  transforms.set(root.id, structuredClone(root.assemblyTransform));
  const q = [root.id];
  for (let i = 0; i < q.length; i += 1) {
    const curId = q[i]; const curT = transforms.get(curId); if (!curT) continue;
    for (const c of byInstance.get(curId) ?? []) {
      const pair = connRef(c); if (!pair) continue; const [src, tgt] = pair;
      const curIsSrc = c.sourceInstanceId === curId; const other = curIsSrc ? tgt : src;
      if (transforms.has(other.instance.id)) continue;
      transforms.set(other.instance.id, curIsSrc ? solveTarget(c.type, curT, src.port, tgt.port) : solveSource(c.type, curT, src.port, tgt.port));
      q.push(other.instance.id);
    }
  }
}

// 组装残差（用于说明哪些连接提示需要人工核对）
const assemblyIssues = [];
for (const c of project.connections) {
  const pair = connRef(c); const st = transforms.get(c.sourceInstanceId); const tt = transforms.get(c.targetInstanceId);
  if (!pair || !st || !tt) continue; const [src, tgt] = pair;
  const sp = worldPortPose(st, src.port); const tp = worldPortPose(tt, tgt.port); const off = offsetFor(c.type, sp.rotation);
  const exp = [sp.position[0] + off[0], sp.position[1] + off[1], sp.position[2] + off[2]];
  const pe = Math.hypot(tp.position[0] - exp[0], tp.position[1] - exp[1], tp.position[2] - exp[2]);
  const re = angularDistance(tp.rotation, sp.rotation + 180);
  if (pe > 0.1 || re > 0.1) assemblyIssues.push({ connectionId: c.id, positionError: pe, rotationError: re });
}

const actors = [];
for (const instance of project.instances) {
  const def = definitions.get(instance.definitionId); if (!def) continue;
  const transform = transforms.get(instance.id) ?? instance.assemblyTransform;
  for (const b of def.blocks) {
    if (b.type === "port") continue;
    const [ox, oy] = rotate2d(b.transform.position[0], b.transform.position[1], transform.rotation);
    actors.push({
      syncKey: `${project.projectId}/${instance.id}/${b.id}`,
      label: `${instance.name} / ${b.name}`,
      blockType: b.type,
      blueprintClassPath: CLASS_PATH[b.type] ?? "",
      location: [transform.position[0] + ox, -(transform.position[1] + oy), transform.position[2] + b.transform.position[2]],
      rotation: [0, 0, -(transform.rotation + b.transform.rotation)],
      parameters: structuredClone(b.parameters),
    });
  }
}

const plan = {
  projectId: project.projectId,
  name: project.name,
  actorCount: actors.length,
  actors,
  assemblyIssues,
};

const targetFile = outDir ? join(outDir, `${basename(fileArg, ".json")}.actors.json`) : join(dirname(resolve(fileArg)), "ue-plan", `${basename(fileArg, ".json")}.actors.json`);
mkdirSync(dirname(targetFile), { recursive: true });
writeFileSync(targetFile, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

console.log(`Exported ${targetFile}`);
console.log(`project: ${project.name}`);
console.log(`UE Actor plan: ${actors.length} actors; assembly issues: ${assemblyIssues.length}`);
for (const issue of assemblyIssues) console.log(`  · ${issue.connectionId} posErr=${issue.positionError.toFixed(1)} rotErr=${issue.rotationError.toFixed(1)}`);
console.log(`sample actor: ${JSON.stringify(actors[0])}`);
