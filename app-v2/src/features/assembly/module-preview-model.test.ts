import { describe, expect, it } from "vitest";
import type { BoxBlock, ModuleDefinition, PortBlock } from "../../domain/types";
import { createModulePreviewModel, rotatedBlockBounds } from "./module-preview-model";

const box = (id: string, x: number, y: number, width: number, height: number, rotation = 0): BoxBlock => ({
  id,
  name: id,
  type: "box",
  transform: { position: [x, y, 0], rotation },
  parameters: {
    BoxSize: [width, height, 40],
    blockout_material_color: [0.2, 0.5, 0.4, 1],
    blockout_material_top_color: [0.6, 0.8, 0.7, 1],
  },
});

const port = (id: string, x: number, y: number, rotation: number): PortBlock => ({
  id,
  name: id,
  type: "port",
  transform: { position: [x, y, 0], rotation },
  parameters: { width: 120, depth: 80 },
});

function moduleWith(blocks: ModuleDefinition["blocks"]): ModuleDefinition {
  return { id: "module_test", name: "Test", revision: 1, blocks };
}

describe("module preview model", () => {
  it("uses the rotated plan bounds of blocks", () => {
    const bounds = rotatedBlockBounds(box("wall", 100, -50, 400, 200, 90));
    expect(bounds.width).toBeCloseTo(200);
    expect(bounds.height).toBeCloseTo(400);
    expect(bounds.minX).toBeCloseTo(0);
    expect(bounds.maxY).toBeCloseTo(150);
  });

  it("preserves the relative internal position and facing of ports", () => {
    const preview = createModulePreviewModel(moduleWith([
      box("floor", 0, 0, 1000, 600),
      port("north", 350, -220, 270),
      port("south", -200, 220, 90),
    ]));
    const north = preview.blocks.find((item) => item.block.id === "north");
    const south = preview.blocks.find((item) => item.block.id === "south");

    expect(north).toBeDefined();
    expect(south).toBeDefined();
    expect(north!.x).toBeGreaterThan(south!.x);
    expect(north!.y).toBeLessThan(south!.y);
    expect(north!.rotation).toBe(270);
    expect(south!.rotation).toBe(90);
  });

  it("refits the whole module when an internal block size changes", () => {
    const marker = box("marker", 200, 0, 100, 100);
    const compact = createModulePreviewModel(moduleWith([box("floor", 0, 0, 600, 400), marker]));
    const expanded = createModulePreviewModel(moduleWith([box("floor", 0, 0, 1600, 900), marker]));
    const compactMarker = compact.blocks.find((item) => item.block.id === "marker")!;
    const expandedMarker = expanded.blocks.find((item) => item.block.id === "marker")!;

    expect(expanded.scale).toBeLessThan(compact.scale);
    expect(expandedMarker.width).toBeLessThan(compactMarker.width);
    expect(expanded.blocks.every((item) => item.x >= 0 && item.x <= expanded.width && item.y >= 0 && item.y <= expanded.height)).toBe(true);
  });
});
