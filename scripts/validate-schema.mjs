// 严格复刻 app-v2/src/domain/project-schema.ts 的 Zod 校验，用普通 JS 实现，
// 用于离线确认一个 BlockOutTools V2 关卡 JSON 能被 app 的 projectSchema 接受。
// 用法: node scripts/validate-schema.mjs <path-to-blockout.json>
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("Usage: node scripts/validate-schema.mjs <path-to-blockout.json>"); process.exit(2); }
const p = JSON.parse(readFileSync(file, "utf8"));
const errors = [];

const isFinite = (v) => typeof v === "number" && Number.isFinite(v);
const elem3 = (v) => (Array.isArray(v) && v.length === 3 && v.every(isFinite));
const elem2 = (v) => (Array.isArray(v) && v.length === 2 && v.every(isFinite));
const positive = (v) => isFinite(v) && v > 0;
const rgba = (v) => Array.isArray(v) && v.length === 4 && v.every((c) => isFinite(c) && c >= 0 && c <= 1);
const transform = (id, t) => {
  if (!t || !elem3(t.position)) errors.push(`${id}: transform.position 需为 3 元有限数组`);
  if (!isFinite(t.rotation)) errors.push(`${id}: transform.rotation 需为有限数`);
};
const blockBase = (id, b) => {
  if (typeof b.id !== "string" || b.id.length < 1) errors.push(`block 缺少非空 id`);
  if (typeof b.name !== "string" || b.name.length < 1) errors.push(`${id || "block"}: name 需非空字符串`);
  transform(id, b.transform);
};

const checkBlock = (b) => {
  blockBase(b.id, b);
  const P = b.parameters;
  if (b.type === "box") {
    if (!P || !Array.isArray(P.BoxSize) || !P.BoxSize.every(positive)) errors.push(`${b.id}: BoxSize 需为正数三元组`);
  } else if (b.type === "doorway") {
    if (!P || !Array.isArray(P.DoorwaySize) || !P.DoorwaySize.every(positive)) errors.push(`${b.id}: DoorwaySize 需为正数三元组`);
    if (!isFinite(P.TopThickness) || P.TopThickness < 0) errors.push(`${b.id}: TopThickness 需为非负`);
    if (!isFinite(P.SideThickness) || P.SideThickness < 0) errors.push(`${b.id}: SideThickness 需为非负`);
  } else if (b.type === "stairs-linear") {
    if (!P || !Array.isArray(P.StairsSize) || !P.StairsSize.every(positive)) errors.push(`${b.id}: StairsSize 需为正数三元组`);
    if (!Number.isInteger(P.NumberOfSteps) || P.NumberOfSteps < 1 || P.NumberOfSteps > 1000) errors.push(`${b.id}: NumberOfSteps 需为 1..1000 整数`);
    if (!["BOX", "CLOSED", "SLOPED"].includes(P.StairsType)) errors.push(`${b.id}: StairsType 非法`);
  } else if (b.type === "port") {
    if (!positive(P.width) || !positive(P.depth)) errors.push(`${b.id}: port width/depth 需为正`);
  } else {
    errors.push(`${b.id}: 未知积木类型 ${b.type}`);
  }
  if (P) {
    for (const key of ["blockout_material_color", "blockout_material_top_color"]) {
      if (P[key] !== undefined && !rgba(P[key])) errors.push(`${b.id}: ${key} 需为 0..1 RGBA`);
    }
  }
};

if (p.schemaVersion !== 2) errors.push("schemaVersion 需为 2");
if (typeof p.projectId !== "string" || p.projectId.length < 1) errors.push("projectId 需非空");
if (typeof p.name !== "string" || p.name.length < 1) errors.push("name 需非空");
if (!Array.isArray(p.modules)) errors.push("modules 需为数组"); else for (const m of p.modules) {
  if (typeof m.id !== "string" || m.id.length < 1) errors.push("module id 需非空");
  if (typeof m.name !== "string" || m.name.length < 1) errors.push(`module ${m.id}: name 需非空`);
  if (!Number.isInteger(m.revision) || m.revision < 0) errors.push(`module ${m.id}: revision 需为非负整数`);
  if (!Array.isArray(m.blocks)) errors.push(`module ${m.id}: blocks 需为数组`); else for (const b of m.blocks) checkBlock(b);
}
if (!Array.isArray(p.instances)) errors.push("instances 需为数组"); else for (const inst of p.instances) {
  if (typeof inst.id !== "string" || inst.id.length < 1) errors.push("instance id 需非空");
  if (typeof inst.definitionId !== "string" || inst.definitionId.length < 1) errors.push(`instance ${inst.id}: definitionId 需非空`);
  if (typeof inst.name !== "string" || inst.name.length < 1) errors.push(`instance ${inst.id}: name 需非空`);
  if (!elem2(inst.graphPosition)) errors.push(`instance ${inst.id}: graphPosition 需为 2 元有限数组`);
  transform(inst.id, inst.assemblyTransform);
}
if (!Array.isArray(p.connections)) errors.push("connections 需为数组"); else for (const c of p.connections) {
  const validType = ["door", "one-way-door", "stairs", "spiral-stairs", "elevator", "one-way-elevator", "road", "drop"];
  if (typeof c.id !== "string" || c.id.length < 1) errors.push("connection id 需非空");
  if (!validType.includes(c.type)) errors.push(`connection ${c.id}: type 非法 ${c.type}`);
  for (const key of ["sourceInstanceId", "sourcePortId", "targetInstanceId", "targetPortId"]) if (typeof c[key] !== "string" || c[key].length < 1) errors.push(`connection ${c.id}: ${key} 需非空`);
  if (!Array.isArray(c.waypoints)) errors.push(`connection ${c.id}: waypoints 需为数组`); else for (const wp of c.waypoints) if (!elem2(wp)) errors.push(`connection ${c.id}: waypoint 需为 2 元有限数组`);
}
const prof = p.blockoutProfile;
if (!prof) errors.push("blockoutProfile 缺失"); else {
  for (const key of ["enabled", "enforceUeImport"]) if (typeof prof[key] !== "boolean") errors.push(`blockoutProfile.${key} 需为布尔`);
  for (const key of ["capsuleRadius", "capsuleHalfHeight", "maxStepHeight", "minDoorWidth", "minDoorHeight", "maxStairRise", "minStairTread"]) if (!positive(prof[key])) errors.push(`blockoutProfile.${key} 需为正数`);
}
if (typeof p.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(p.updatedAt)) errors.push("updatedAt 需为 ISO-8601 带 Z 的日期时间字符串");

if (errors.length) {
  console.error("Schema 校验失败:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("OK: 该文件可通过 app 的 projectSchema（Zod）校验。");
