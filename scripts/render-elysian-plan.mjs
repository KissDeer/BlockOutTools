// 从 elysian-boulevard-rebuild.blockout.json 生成顶视平面图 SVG。
// 供导入 Photoshop / 对照地图核对空间关系。
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, "layouts/elysian-boulevard-rebuild.blockout.json");
const OUTPUT = resolve(ROOT, "layouts/elysian-boulevard-rebuild-plan.svg");

const project = JSON.parse(readFileSync(INPUT, "utf8"));
const modById = new Map(project.modules.map((m) => [m.id, m]));

// 顶视采用 X-Y 平面（Y 向下）。单位=cm，缩放到 viewBox。
const rooms = project.instances.map((inst) => {
  const mod = modById.get(inst.definitionId);
  const floor = mod.blocks.find((b) => b.name.includes("楼板"));
  const W = floor?.parameters.BoxSize[0] ?? 400;
  const D = floor?.parameters.BoxSize[1] ?? 400;
  const [x, y, z] = inst.assemblyTransform.position;
  const ports = mod.blocks.filter((b) => b.type === "port").map((p) => ({
    id: p.id,
    name: p.name,
    px: x + p.transform.position[0],
    py: y + p.transform.position[1],
  }));
  const x0 = x - W / 2;
  const y0 = y - D / 2;
  return { inst, name: inst.name, x0, y0, W, D, z, ports, x, y };
});

// 计算包围盒
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const r of rooms) {
  minX = Math.min(minX, r.x0); minY = Math.min(minY, r.y0);
  maxX = Math.max(maxX, r.x0 + r.W); maxY = Math.max(maxY, r.y0 + r.D);
}
const PAD = 400;
minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
const width = maxX - minX;
const height = maxY - minY;
const scale = 0.24; // cm -> px for viewBox display
const vbX = minX, vbY = minY, vw = width, vh = height;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 连接（画成连线）
const portIndex = new Map();
for (const r of rooms) for (const p of r.ports) portIndex.set(`${r.inst.id}:${p.id}`, p);
const connections = project.connections.map((c) => {
  const a = portIndex.get(`${c.sourceInstanceId}:${c.sourcePortId}`);
  const b = portIndex.get(`${c.targetInstanceId}:${c.targetPortId}`);
  return { type: c.type, a, b, wp: c.waypoints };
});

const connColor = { door: "#E8A33D", "one-way-door": "#E8A33D", stairs: "#5FA8D3", elevator: "#6FBF73", drop: "#C77DD9", road: "#9aa8a0" };

const parts = [];
parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(vw * scale)}" height="${Math.round(vh * scale)}" viewBox="${vbX} ${vbY} ${vw} ${vh}" font-family="Arial, 'Microsoft YaHei', sans-serif">`);
parts.push(`<rect x="${vbX}" y="${vbY}" width="${vw}" height="${vh}" fill="#14171a"/>`);
// grid
for (let gx = Math.floor(vbX / 1000) * 1000; gx <= maxX; gx += 1000) { parts.push(`<line x1="${gx}" y1="${vbY}" x2="${gx}" y2="${vbY + vh}" stroke="#20262b" stroke-width="6"/>`); }
for (let gy = Math.floor(vbY / 1000) * 1000; gy <= maxY; gy += 1000) { parts.push(`<line x1="${vbX}" y1="${gy}" x2="${vbX + vw}" y2="${gy}" stroke="#20262b" stroke-width="6"/>`); }

// connections
for (const c of connections) {
  if (!c.a || !c.b) continue;
  const col = connColor[c.type] ?? "#888";
  parts.push(`<line x1="${c.a.px}" y1="${c.a.py}" x2="${c.b.px}" y2="${c.b.py}" stroke="${col}" stroke-width="40" stroke-dasharray="${c.type === "stairs" ? "80 60" : "none"}"/>`);
  parts.push(`<text x="${(c.a.px + c.b.px) / 2}" y="${(c.a.py + c.b.py) / 2 - 60}" fill="${col}" font-size="100" text-anchor="middle">${esc(c.type)}</text>`);
}

// rooms
for (const r of rooms) {
  parts.push(`<g>`);
  // floor
  parts.push(`<rect x="${r.x0}" y="${r.y0}" width="${r.W}" height="${r.D}" rx="40" fill="#20262b" stroke="#4b8f7a" stroke-width="24"/>`);
  // label (name + z)
  const cx = r.x + r.W / 2;
  const cy = r.y + r.D / 2;
  parts.push(`<text x="${r.x0}" y="${r.y0 - 90}" fill="#eef2ee" font-size="130" >${esc(r.name)}</text>`);
  parts.push(`<text x="${r.x0}" y="${r.y0 + r.D + 150}" fill="#9da69f" font-size="105">Z ${r.z} cm · ${Math.round(r.W)}×${Math.round(r.D)}</text>`);
  // ports
  for (const p of r.ports) {
    parts.push(`<circle cx="${p.px}" cy="${p.py}" r="46" fill="#E59A42" stroke="#14171a" stroke-width="10"/>`);
    parts.push(`<text x="${p.px}" y="${p.py - 90}" fill="#E8C48A" font-size="100" text-anchor="middle">${esc(p.name)}</text>`);
  }
  parts.push(`</g>`);
}

parts.push(`</svg>`);
const svg = parts.join("\n");
await writeFile(OUTPUT, svg, "utf8");
console.log(`Wrote ${OUTPUT} (${svg.length} bytes), rooms=${rooms.length}, connections=${connections.length}`);
