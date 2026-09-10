import { describe, expect, it } from "vitest";
import { createDemoProject } from "./demo-project";
import { projectSchema } from "./project-schema";
import { resolveAssembly } from "./assembly-resolver";
import { fitStairs, stairLandings, surfaceZ } from "./spatial";
import { buildDeploymentGeometry } from "./deployment-geometry";
import { buildLocalUEDryRun } from "./ue-plan";
import { mergeProjects } from "./project-merge";
import { interpretDiagram } from "./diagram-import";
import type { DiagramReference, StairsLinearBlock } from "./types";
import { validateProject } from "./validation";

describe("spatial and reference workflow", () => {
  it("does not share demo fixtures across projects", () => {
    const a = createDemoProject(), b = createDemoProject();
    a.modules[0].blocks[0].name = "mutated";
    expect(b.modules[0].blocks[0].name).toBe("主楼板");
  });
  it("rejects duplicate identities and invalid endpoint ownership", () => {
    const project = createDemoProject();
    project.instances.push(structuredClone(project.instances[0]));
    expect(projectSchema.safeParse(project).success).toBe(false);
    project.instances.pop();
    project.connections[0].sourcePortId = "port_tower_east";
    expect(projectSchema.safeParse(project).success).toBe(false);
  });
  it("uses explicit spacing and an anchor independent of edge ordering", () => {
    const project = createDemoProject();
    project.assemblyAnchorInstanceId = "instance_tower";
    project.connections[0].spacing = { forward: 120, lateral: 70, vertical: -150 };
    const result = resolveAssembly(project);
    expect(result.issues).toEqual([]);
    expect(result.instances[1].assemblyTransform).toEqual(project.instances[1].assemblyTransform);
    expect(result.instances[0].assemblyTransform.position[2]).toBe(460);
    project.connections.reverse();
    expect(resolveAssembly(project)).toEqual(result);
  });
  it("fits rotated stairs to exact landing points and refuses inadequate run", () => {
    const project = createDemoProject();
    const stairs = project.modules[0].blocks.find((block) => block.type === "stairs-linear") as StairsLinearBlock;
    const next = fitStairs(stairs, [100, 200, 50], [700, 1000, 350], project.blockoutProfile);
    const points = stairLandings(next);
    points.lower.forEach((value, index) => expect(value).toBeCloseTo([100, 200, 50][index], 6));
    points.upper.forEach((value, index) => expect(value).toBeCloseTo([700, 1000, 350][index], 6));
    expect(() => fitStairs(stairs, [0, 0, 0], [0, 50, 300], project.blockoutProfile)).toThrow("空间不足");
    expect(stairs.parameters.StairsSize).toEqual([180, 360, 180]);
  });
  it("shares a surface datum across preview, validation and UE plans", () => {
    const project = createDemoProject();
    const floor = project.modules[0].blocks[0];
    if (floor.type !== "box") throw new Error("fixture");
    floor.role = "floor"; floor.elevationReference = "surface";
    expect(surfaceZ(floor)).toBe(0);
    expect(buildDeploymentGeometry(project).find((item) => item.sourceBlockId === floor.id)?.position[2]).toBe(-20);
    expect(buildLocalUEDryRun(project).actors.find((item) => item.label.endsWith(floor.name))?.location[2]).toBe(-40);
    expect(validateProject(project).some((item) => item.rule === "LANDING_SUPPORT")).toBe(true);
  });
  it("merges independent block edits and reports same-field or delete-edit conflicts", () => {
    const base = createDemoProject(), local = structuredClone(base), incoming = structuredClone(base);
    local.modules[0].blocks[0].name = "local";
    incoming.modules[0].blocks[1].name = "remote";
    const result = mergeProjects(base, local, incoming);
    expect(result.conflicts).toEqual([]);
    expect(result.project.modules[0].blocks[0].name).toBe("local");
    expect(result.project.modules[0].blocks[1].name).toBe("remote");
    incoming.modules[0].blocks[0].name = "remote same field";
    expect(mergeProjects(base, local, incoming).conflicts).toHaveLength(1);
    incoming.modules[0].blocks.shift();
    expect(mergeProjects(base, local, incoming).conflicts.length).toBeGreaterThan(0);
  });
  it("preserves floor holes and stable feature IDs when other features are inserted", () => {
    const project = createDemoProject(), module = project.modules[0];
    const reference: DiagramReference = { id: "ref", name: "plan", imageData: "data:image/png;base64,AA==", pixelSize: [100, 100], cmPerPixel: 2, origin: [0, 0], rotation: 0, visible: true, opacity: 0.5, confirmed: true, legend: "" };
    const floor = { id: "floor", name: "floor", confirmed: true, kind: "floor", polygon: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [[[25, 25], [75, 25], [75, 75], [25, 75]]], elevation: 0, thickness: 40 };
    const first = interpretDiagram({ schemaVersion: 1, sourceId: "ref", moduleId: module.id, elements: [floor] }, module, reference, project.blockoutProfile);
    const added = first.module.blocks.filter((item) => item.provenance);
    expect(added.reduce((area, block) => area + (block.type === "box" ? block.parameters.BoxSize[0] * block.parameters.BoxSize[1] : 0), 0)).toBe(30000);
    const second = interpretDiagram({ schemaVersion: 1, sourceId: "ref", moduleId: module.id, elements: [{ id: "route", name: "route", kind: "route", points: [[0, 0], [1, 1]] }, floor] }, first.module, reference, project.blockoutProfile);
    expect(second.added).toBe(0);
    expect(second.changed).toBe(0);
    expect(second.module.blocks.map((item) => item.id)).toEqual(first.module.blocks.map((item) => item.id));
    const changed = interpretDiagram({ schemaVersion: 1, sourceId: "ref", moduleId: module.id, elements: [{ ...floor, holes: [] }] }, first.module, reference, project.blockoutProfile);
    expect(changed.removed).toBe(8);
    expect(changed.module.blocks.filter((item) => item.provenance)).toHaveLength(1);
  });
});
