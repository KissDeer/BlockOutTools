import { describe, expect, it } from "vitest";
import { createEmptyScope, createEmptyTopology } from "./concept";
import { createDemoProject } from "./demo-project";
import { ensureLogicModule, modulePlacementPaths, placeModuleDefinition } from "./module-workflow";

function sharedDefinitionFixture() {
  const project = createDemoProject();
  const moduleId = project.modules[0].id;
  const child = createEmptyScope("shared-scope", "共享内部");
  child.modules = [{ id: "leaf", name: "内部模块", nodeIds: [], note: "", moduleDefinitionId: moduleId }];
  const topology = createEmptyTopology();
  topology.modules = ["parent-a", "parent-b"].map((id) => ({ id, name: id, nodeIds: [], note: "", childScopeId: child.id }));
  topology.scopes = [child];
  project.concept = topology;
  project.instances = [];
  project.connections = [];
  delete project.assemblyAnchorInstanceId;
  return { project, moduleId, child };
}

describe("module placement paths", () => {
  it("requires a real selected path for reused scopes and rejects stale or foreign paths without writes", () => {
    const { project, moduleId } = sharedDefinitionFixture();
    const before = structuredClone(project);
    expect(modulePlacementPaths(project, moduleId).map((option) => option.path)).toEqual([["parent-a"], ["parent-b"]]);
    for (const path of [undefined, [], ["missing"], ["parent-a", "leaf"]]) {
      expect(placeModuleDefinition(project, moduleId, path)).toEqual({ project, instance: null });
    }
    expect(project).toEqual(before);
  });

  it("keeps each reuse placement independent, retains saved transforms, and owns the supplied path array", () => {
    const { project, moduleId } = sharedDefinitionFixture();
    const suppliedPath = ["parent-a"];
    const first = placeModuleDefinition(project, moduleId, suppliedPath);
    suppliedPath[0] = "mutated-after-placement";
    expect(first.instance?.scopePath).toEqual(["parent-a"]);
    first.instance!.assemblyTransform = { position: [123, -456, 87], rotation: 61 };
    const second = placeModuleDefinition(first.project, moduleId, ["parent-b"]);
    expect(second.project.instances).toHaveLength(2);
    expect(second.instance?.scopePath).toEqual(["parent-b"]);
    expect(second.project.instances[0].assemblyTransform).toEqual({ position: [123, -456, 87], rotation: 61 });
    const reopened = placeModuleDefinition(second.project, moduleId, ["parent-a"]);
    expect(reopened.project).toBe(second.project);
    expect(reopened.instance?.id).toBe(first.instance?.id);
  });

  it("deduplicates logical aliases with the same existing definition and parent path", () => {
    const { project, moduleId } = sharedDefinitionFixture();
    project.concept!.modules = ["alias-a", "alias-b"].map((id) => ({ id, name: id, nodeIds: [], note: "", moduleDefinitionId: moduleId }));
    expect(modulePlacementPaths(project, moduleId)).toEqual([{ path: [], label: "根层" }]);
    const placed = placeModuleDefinition(project, moduleId);
    expect(placed.instance?.scopePath).toEqual([]);
    expect(placeModuleDefinition(placed.project, moduleId).project).toBe(placed.project);
  });

  it("retains a legacy root instance without a stored path and rejects invented paths for independent definitions", () => {
    const project = createDemoProject();
    const instance = project.instances[0];
    const moduleId = instance.definitionId;
    expect(placeModuleDefinition(project, moduleId, ["missing"])).toEqual({ project, instance: null });
    expect(placeModuleDefinition(project, moduleId, []).instance).toBe(instance);
    project.concept = createEmptyTopology();
    project.concept.modules = [{ id: "root-module", name: "Root", nodeIds: [], note: "", moduleDefinitionId: moduleId }];
    expect(placeModuleDefinition(project, moduleId, []).project).toBe(project);
    expect(placeModuleDefinition(project, moduleId).instance).toBe(instance);
  });

  it("opening an existing nested definition or a parent only resolves navigation", () => {
    const { project, moduleId, child } = sharedDefinitionFixture();
    expect(ensureLogicModule(project, "leaf")).toEqual({ project, module: project.modules.find((module) => module.id === moduleId) });
    expect(ensureLogicModule(project, "parent-a")).toEqual({ project, module: null, childScopeId: child.id });
    expect(project.instances).toEqual([]);
  });
});
