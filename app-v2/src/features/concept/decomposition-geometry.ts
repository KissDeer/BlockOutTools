import type { LogicModule } from "../../domain/concept";

export interface NodeBox { id: string; x: number; y: number; width: number; height: number }
export interface ModuleFrame { id: string; x: number; y: number; width: number; height: number }

export function moduleFrames(modules: LogicModule[], nodes: NodeBox[]): ModuleFrame[] {
  const boxes = new Map(nodes.map((node) => [node.id, node]));
  const right = Math.max(0, ...nodes.map((node) => node.x + node.width));
  let emptyIndex = 0;
  return modules.map((module) => {
    const members = module.nodeIds.flatMap((id) => boxes.has(id) ? [boxes.get(id)!] : []);
    if (!members.length) return { id: module.id, x: right + 100, y: emptyIndex++ * 190, width: 260, height: 150 };
    const x = Math.min(...members.map((node) => node.x)) - 28;
    const y = Math.min(...members.map((node) => node.y)) - 64;
    return { id: module.id, x, y,
      width: Math.max(240, Math.max(...members.map((node) => node.x + node.width)) + 28 - x),
      height: Math.max(150, Math.max(...members.map((node) => node.y + node.height)) + 28 - y) };
  });
}

/** Smallest containing frame wins, then id. Freeze this input for the entire drag. */
export function dropModuleAt(point: { x: number; y: number }, frames: ModuleFrame[]): string | null {
  return frames.filter((frame) => point.x >= frame.x && point.x <= frame.x + frame.width && point.y >= frame.y && point.y <= frame.y + frame.height)
    .sort((a, b) => a.width * a.height - b.width * b.height || a.id.localeCompare(b.id))[0]?.id ?? null;
}
