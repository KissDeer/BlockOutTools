import { describe, expect, it } from "vitest";
import { createEmptyTopology } from "./concept";
import { createDemoProject } from "./demo-project";
import { buildDeploymentGeometry } from "./deployment-geometry";
import { createModulePreviewProject } from "./module-preview-project";
import { projectSchema } from "./project-schema";

describe("module-local 3D snapshot", () => {
  it("renders an unplaced module without creating a persisted instance", () => {
    const project = createDemoProject();
    project.instances = [];
    project.connections = [];
    project.assemblyAnchorInstanceId = undefined;
    const before = structuredClone(project);
    const snapshot = createModulePreviewProject(project, project.modules[0].id);
    expect(buildDeploymentGeometry(snapshot).length).toBeGreaterThan(0);
    expect(snapshot.instances).toHaveLength(1);
    expect(snapshot.instances[0].definitionId).toBe(project.modules[0].id);
    expect(project).toEqual(before);
  });

  it("uses local coordinates while preserving assembly positions and all referenced definitions", () => {
    const project = createDemoProject();
    project.instances[0].assemblyTransform = { position: [100000, 200000, 300000], rotation: 73 };
    project.assemblyAnchorInstanceId = project.instances[0].id;
    project.concept = createEmptyTopology();
    project.concept.modules = project.modules.map((module, index) => ({ id: `group-${index}`, name: module.name, nodeIds: [], moduleDefinitionId: module.id, note: "" }));
    project.designContext = { goal: "测试目标", constraints: "", materials: [{ id: "shared", name: "共享资料", kind: "note", text: "保留关联", imageData: "", moduleIds: project.modules.map((module) => module.id) }] };
    const before = structuredClone(project);
    const snapshot = createModulePreviewProject(project, project.modules[0].id);
    expect(projectSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.modules).toEqual(project.modules);
    expect(snapshot.concept).toEqual(project.concept);
    expect(snapshot.designContext).toEqual(project.designContext);
    expect(snapshot.instances[0].assemblyTransform).toEqual({ position: [0, 0, 0], rotation: 0 });
    expect(snapshot.connections).toEqual([]);
    expect(buildDeploymentGeometry(snapshot).every((primitive) => primitive.sourceInstanceId === "__preview_module__")).toBe(true);
    snapshot.modules[0].blocks[0].transform.position[0] = 99999;
    expect(project).toEqual(before);
  });

  it("rejects a missing definition instead of silently showing the overall assembly", () => {
    expect(() => createModulePreviewProject(createDemoProject(), "missing")).toThrow("预览模块不存在");
  });
});
