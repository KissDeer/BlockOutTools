import { describe, expect, it } from "vitest";
import lothricProject from "../../../layouts/lothric-high-wall-v2.blockout.json";
import { resolveAssembly } from "./assembly-resolver";
import { addConnection, duplicateInstance, renameProject } from "./commands";
import { createDemoProject } from "./demo-project";
import { buildDeploymentGeometry } from "./deployment-geometry";
import { projectSchema } from "./project-schema";
import { buildLocalUEDryRun } from "./ue-plan";
import { validateProject } from "./validation";

describe("BlockOutTools V2 domain", () => {
  it("validates the seeded project with the versioned schema", () => {
    expect(projectSchema.parse(createDemoProject()).schemaVersion).toBe(2);
  });

  it("keeps UE actor identity stable when the project is renamed", () => {
    const project = createDemoProject();
    const before = buildLocalUEDryRun(project).actors.map((actor) => actor.syncKey);
    const after = buildLocalUEDryRun(renameProject(project, "重新命名的项目")).actors.map((actor) => actor.syncKey);
    expect(after).toEqual(before);
  });

  it("creates independent actor identities for a reused module instance", () => {
    const project = createDemoProject();
    const sourceId = project.instances[0].id;
    const duplicated = duplicateInstance(project, sourceId);
    expect(duplicated.instance).not.toBeNull();
    const keys = buildLocalUEDryRun(duplicated.project).actors.map((actor) => actor.syncKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(buildLocalUEDryRun(project).actorCount);
  });

  it("excludes ports and expands doorway and stair preview geometry", () => {
    const project = createDemoProject();
    const geometry = buildDeploymentGeometry(project);
    expect(geometry.some((primitive) => primitive.sourceBlockId.startsWith("port_"))).toBe(false);
    expect(geometry.filter((primitive) => primitive.sourceBlockId === "block_demo_doorway")).toHaveLength(3);
    expect(geometry.filter((primitive) => primitive.sourceBlockId === "block_demo_stairs")).toHaveLength(10);
  });

  it("solves connected module transforms from facing ports", () => {
    const project = createDemoProject();
    const resolved = resolveAssembly(project);
    const source = resolved.instances.find((instance) => instance.id === "instance_courtyard");
    const target = resolved.instances.find((instance) => instance.id === "instance_tower");
    expect(resolved.issues).toEqual([]);
    expect(source?.assemblyTransform).toEqual(project.instances[0].assemblyTransform);
    expect(target?.assemblyTransform.position).toEqual([1220, 0, 290]);
    expect(target?.assemblyTransform.rotation).toBe(0);
  });

  it("reports traversal errors using the same block identity", () => {
    const project = createDemoProject();
    const module = project.modules[0];
    const stairs = module.blocks.find((block) => block.id === "block_demo_stairs");
    if (!stairs || stairs.type !== "stairs-linear") throw new Error("missing fixture stairs");
    stairs.parameters.StairsSize = [180, 180, 260];
    stairs.parameters.NumberOfSteps = 8;
    const issues = validateProject(project);
    expect(issues.map((issue) => issue.rule)).toEqual(expect.arrayContaining(["STAIR_MAX_RISE", "STAIR_MIN_TREAD"]));
    expect(issues.every((issue) => issue.blockId === stairs.id)).toBe(true);
  });

  it("rejects a second connection on an occupied port", () => {
    const project = createDemoProject();
    const next = addConnection(project, "door", "instance_courtyard", "port_demo_east", "instance_tower", "port_tower_east");
    expect(next).toBe(project);
  });

  it("loads the deterministic Lothric reference as complete V2 topology", () => {
    const project = projectSchema.parse(lothricProject);
    const blocks = project.modules.flatMap((module) => module.blocks);
    const ports = new Set(blocks.filter((block) => block.type === "port").map((block) => block.id));
    expect(project.modules).toHaveLength(10);
    expect(project.connections).toHaveLength(13);
    expect(ports.size).toBe(26);
    expect(project.connections.every((connection) => ports.has(connection.sourcePortId) && ports.has(connection.targetPortId))).toBe(true);
    expect(validateProject(project)).toEqual([]);
    expect(resolveAssembly(project).issues).toEqual([]);
    expect(buildLocalUEDryRun(project).assemblyIssues).toEqual([]);
    expect(buildDeploymentGeometry(project).length).toBeGreaterThan(500);
  });
});
