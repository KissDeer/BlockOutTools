import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { BLOCK_DEFINITIONS, CATALOG, createBlock } from "./catalog";
import { blockSchema, projectSchema } from "./project-schema";
import { buildDeploymentGeometry } from "./deployment-geometry";
import { buildLocalUEDryRun } from "./ue-plan";
import example from "./block-library/box/examples/floor-wall.blockout.json";

describe("block library integration", () => {
  it("registers every definition and preserves all declared default fields", () => {
    const root = new URL("./block-library/", import.meta.url);
    const folders = readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => item.name).sort();
    expect(CATALOG.map((item) => item.type).sort()).toEqual(folders);
    for (const definition of BLOCK_DEFINITIONS) {
      const item = CATALOG.find((entry) => entry.type === definition.type)!;
      const block = createBlock(item.type);
      expect(blockSchema.parse(block)).toEqual(block);
      expect(block.parameters).toEqual(definition.defaults.parameters);
      const disk = JSON.parse(readFileSync(new URL(definition.type + "/definition.json", root), "utf8"));
      expect(disk).toEqual(definition);
    }
  });

  it("creates independent parameters and positions without changing the catalog", () => {
    const position: [number, number, number] = [10, 20, 30];
    const first = createBlock("box", position);
    const second = createBlock("box");
    if (first.type !== "box" || second.type !== "box") throw new Error("wrong type");
    first.parameters.BoxSize[0] = 99;
    first.parameters.blockout_material_color[0] = 0;
    first.transform.position[0] = 50;
    expect(position).toEqual([10, 20, 30]);
    expect(second.parameters.BoxSize).toEqual([600, 400, 40]);
    expect(second.parameters.blockout_material_color[0]).toBe(0.22);
    expect(first.id).not.toBe(second.id);
    expect(createBlock("box").parameters).toEqual(second.parameters);
  });

  it("loads the Box example with matching floor and wall surfaces in preview and UE plan", () => {
    const project = projectSchema.parse(example);
    const geometry = buildDeploymentGeometry(project);
    const floor = geometry.find((item) => item.sourceBlockId === "example_box_floor")!;
    const wall = geometry.find((item) => item.sourceBlockId === "example_box_wall")!;
    expect(floor.position[2] + floor.size[2] / 2).toBe(300);
    expect(wall.position[2] - wall.size[2] / 2).toBe(300);
    const plan = buildLocalUEDryRun(project);
    expect(plan.actors.map((actor) => actor.location[2])).toEqual([260, 300]);
    for (const actor of plan.actors) {
      expect(Object.keys(actor.parameters).sort()).toEqual(["BoxSize", "blockout_material_color", "blockout_material_top_color"].sort());
    }
  });
});
