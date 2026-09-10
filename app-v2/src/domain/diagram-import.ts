import { z } from "zod";
import { createBlock } from "./catalog";
import { fitStairs } from "./spatial";
import type { Block, BlockoutProfile, DiagramReference, ModuleDefinition, Vec2 } from "./types";

const number = z.number().finite();
const point = z.tuple([number, number]);
const common = { id: z.string().min(1), name: z.string().min(1), confirmed: z.boolean().default(false), note: z.string().default("") };
export const diagramSchema = z.object({
  schemaVersion: z.literal(1), sourceId: z.string().min(1), moduleId: z.string().min(1),
  elements: z.array(z.discriminatedUnion("kind", [
    z.object({ ...common, kind: z.literal("floor"), polygon: z.array(point).min(4), holes: z.array(z.array(point).min(4)).default([]), elevation: number, thickness: number.positive() }),
    z.object({ ...common, kind: z.literal("wall"), start: point, end: point, elevation: number, thickness: number.positive(), height: number.positive() }),
    z.object({ ...common, kind: z.literal("stairs"), lower: point, upper: point, lowerZ: number, upperZ: number, width: number.positive() }),
    z.object({ ...common, kind: z.literal("port"), position: point, elevation: number, rotation: number, width: number.positive() }),
    z.object({ ...common, kind: z.literal("route"), points: z.array(point).min(2) }),
  ])),
});

export function referencePoint(reference: DiagramReference, point: Vec2): Vec2 {
  const radians = reference.rotation * Math.PI / 180;
  const x = point[0] * reference.cmPerPixel;
  const y = point[1] * reference.cmPerPixel;
  return [reference.origin[0] + x * Math.cos(radians) - y * Math.sin(radians), reference.origin[1] + x * Math.sin(radians) + y * Math.cos(radians)];
}

function inside(point: Vec2, polygon: Vec2[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

/** Exact cell decomposition for orthogonal floor outlines; never fills holes by bounding box. */
function floorCells(polygon: Vec2[], holes: Vec2[][]): { center: Vec2; size: Vec2; key: string }[] {
  const rings = [polygon, ...holes];
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (a[0] !== b[0] && a[1] !== b[1]) throw new Error("楼板轮廓目前要求正交多边形；斜边请先拆为已校准的矩形区域，不能用外接矩形代替");
  }
  const xs = [...new Set(rings.flat().map((p) => p[0]))].sort((a, b) => a - b);
  const ys = [...new Set(rings.flat().map((p) => p[1]))].sort((a, b) => a - b);
  if (xs.length * ys.length > 10000) throw new Error("单个楼板轮廓过于复杂，请拆分区域");
  const cells = [];
  for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
    const center: Vec2 = [(xs[x] + xs[x + 1]) / 2, (ys[y] + ys[y + 1]) / 2];
    if (inside(center, polygon) && !holes.some((hole) => inside(center, hole))) cells.push({ center, size: [xs[x + 1] - xs[x], ys[y + 1] - ys[y]] as Vec2, key: `${xs[x]},${ys[y]},${xs[x + 1]},${ys[y + 1]}` });
  }
  if (!cells.length) throw new Error("楼板没有有效面积");
  return cells;
}

export function interpretDiagram(raw: unknown, module: ModuleDefinition, reference: DiagramReference, profile: BlockoutProfile): { module: ModuleDefinition; added: number; changed: number; removed: number; retained: number } {
  const input = diagramSchema.parse(raw);
  if (input.moduleId !== module.id || input.sourceId !== reference.id) throw new Error("解释文件的模块或底图身份不匹配");
  if (new Set(input.elements.map((item) => item.id)).size !== input.elements.length) throw new Error("图形特征 ID 重复");
  const generated: Block[] = [];
  for (const element of input.elements) {
    const add = (block: Block, suffix = "") => {
      block.id = `diagram:${encodeURIComponent(module.id)}:${encodeURIComponent(input.sourceId)}:${encodeURIComponent(element.id)}:${suffix}`;
      block.name = element.name;
      block.provenance = { sourceId: input.sourceId, featureId: element.id, status: element.confirmed && reference.confirmed ? "confirmed" : "estimated", note: element.note };
      generated.push(block);
    };
    if (element.kind === "floor") for (const cell of floorCells(element.polygon, element.holes)) {
      const block = createBlock("box", [...referencePoint(reference, cell.center), element.elevation]);
      if (block.type !== "box") continue;
      block.role = "floor"; block.elevationReference = "surface"; block.transform.rotation = reference.rotation;
      block.parameters.BoxSize = [cell.size[0] * reference.cmPerPixel, cell.size[1] * reference.cmPerPixel, element.thickness];
      add(block, cell.key);
    }
    if (element.kind === "wall") {
      const start = referencePoint(reference, element.start), end = referencePoint(reference, element.end);
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (length <= 0) throw new Error(`${element.name} 墙段长度为零`);
      const count = Math.ceil(length / 360);
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const block = createBlock("box", [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t, element.elevation]);
        if (block.type !== "box") continue;
        block.role = "wall"; block.parameters.BoxSize = [length / count + (count > 1 ? 2 : 0), element.thickness, element.height];
        block.transform.rotation = Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI;
        add(block, String(i));
      }
    }
    if (element.kind === "stairs") {
      const block = createBlock("stairs-linear");
      if (block.type !== "stairs-linear") continue;
      block.parameters.StairsSize[0] = element.width;
      add(fitStairs(block, [...referencePoint(reference, element.lower), element.lowerZ], [...referencePoint(reference, element.upper), element.upperZ], profile));
    }
    if (element.kind === "port") {
      const block = createBlock("port", [...referencePoint(reference, element.position), element.elevation]);
      if (block.type !== "port") continue;
      block.parameters.width = element.width; block.transform.rotation = reference.rotation + element.rotation;
      add(block);
    }
    // Routes and annotations intentionally create no collision geometry or extra ports.
  }
  const next = structuredClone(module);
  next.interpretation = input;
  const featureIds = new Set(input.elements.filter((item) => item.kind !== "route").map((item) => item.id));
  const generatedIds = new Set(generated.map((item) => item.id));
  const obsolete = module.blocks.filter((block) => block.provenance?.sourceId === input.sourceId && featureIds.has(block.provenance.featureId) && !generatedIds.has(block.id));
  // Changed floor decomposition or wall segmentation must not leave its old pieces behind.
  next.blocks = next.blocks.filter((block) => !obsolete.some((item) => item.id === block.id));
  let added = 0, changed = 0;
  for (const block of generated) {
    const index = next.blocks.findIndex((item) => item.id === block.id);
    if (index < 0) { next.blocks.push(block); added++; }
    else if (JSON.stringify(next.blocks[index]) !== JSON.stringify(block)) { next.blocks[index] = block; changed++; }
  }
  return { module: next, added, changed, removed: obsolete.length, retained: next.blocks.filter((block) => !generatedIds.has(block.id)).length };
}
