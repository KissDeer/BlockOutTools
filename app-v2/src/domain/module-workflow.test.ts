import { describe, expect, it } from "vitest";
import { createEmptyScope, createEmptyTopology } from "./concept";
import { addLogicNode } from "./concept-commands";
import { createDemoProject } from "./demo-project";
import { ensureLogicModule, modulePlacementPaths, placeModuleDefinition } from "./module-workflow";

/**
 * 旧数据的形态：几何挂在模块定义上，叶子的 `moduleDefinitionId` 记在**模块分组**里
 * （2026-09-17 二次修订后新数据改成节点直接持有 `blocks`，这条链是过渡期兜底）。
 * 两个节点各自拥有一个子层，子层里的分组指向同一个模块定义。
 */
function sharedDefinitionFixture() {
  const project = createDemoProject();
  const moduleId = project.modules[0].id;
  const inner = (groupId: string) => ({ id: groupId, name: groupId, nodeIds: [] as string[], note: "", moduleDefinitionId: moduleId });
  const childA = { ...createEmptyScope("child-a", "A 的内部"), modules: [inner("leaf-a")] };
  const childB = { ...createEmptyScope("child-b", "B 的内部"), modules: [inner("leaf-b")] };
  let topology = createEmptyTopology();
  const nodeA = addLogicNode(topology, [0, 0], { name: "parent-a" });
  topology = nodeA.topology;
  const nodeB = addLogicNode(topology, [600, 0], { name: "parent-b", childScopeId: childB.id });
  topology = nodeB.topology;
  topology.nodes.find((node) => node.id === nodeA.node.id)!.childScopeId = childA.id;
  topology.scopes = [childA, childB];
  project.concept = topology;
  project.instances = [];
  project.connections = [];
  delete project.assemblyAnchorInstanceId;
  return { project, moduleId, nodeAId: nodeA.node.id, nodeBId: nodeB.node.id };
}

describe("module placement paths", () => {
  it("两个节点各有内部时给出两条落位路径，并拒绝过期或不属于本定义的路径且不写入", () => {
    const { project, moduleId, nodeAId, nodeBId } = sharedDefinitionFixture();
    const before = structuredClone(project);
    expect(modulePlacementPaths(project, moduleId).map((option) => option.path)).toEqual([[nodeAId], [nodeBId]]);
    for (const path of [undefined, [], ["missing"], [nodeAId, "leaf-a"]]) {
      expect(placeModuleDefinition(project, moduleId, path)).toEqual({ project, instance: null });
    }
    expect(project).toEqual(before);
  });

  it("每个落位各自独立，保留已保存的变换，并且不持有调用方传进来的数组", () => {
    const { project, moduleId, nodeAId, nodeBId } = sharedDefinitionFixture();
    const suppliedPath = [nodeAId];
    const first = placeModuleDefinition(project, moduleId, suppliedPath);
    suppliedPath[0] = "mutated-after-placement";
    expect(first.instance?.scopePath).toEqual([nodeAId]);
    first.instance!.assemblyTransform = { position: [123, -456, 87], rotation: 61 };
    const second = placeModuleDefinition(first.project, moduleId, [nodeBId]);
    expect(second.project.instances).toHaveLength(2);
    expect(second.instance?.scopePath).toEqual([nodeBId]);
    expect(second.project.instances[0].assemblyTransform).toEqual({ position: [123, -456, 87], rotation: 61 });
    const reopened = placeModuleDefinition(second.project, moduleId, [nodeAId]);
    expect(reopened.project).toBe(second.project);
    expect(reopened.instance?.id).toBe(first.instance?.id);
  });

  it("整个根层只有一个落位时，重复放置不会新建实例", () => {
    const project = createDemoProject();
    const moduleId = project.modules[0].id;
    // 旧数据的形态：根层一个分组指向这个定义
    project.concept = createEmptyTopology();
    project.concept.modules = [{ id: "root-group", name: "根层分组", nodeIds: [], note: "", moduleDefinitionId: moduleId }];
    project.instances = [];
    project.connections = [];
    expect(modulePlacementPaths(project, moduleId)).toEqual([{ path: [], label: "根层" }]);
    const placed = placeModuleDefinition(project, moduleId);
    expect(placed.instance?.scopePath).toEqual([]);
    expect(placeModuleDefinition(placed.project, moduleId).project).toBe(placed.project);
  });

  it("保留没有存路径的旧根实例，并拒绝为独立定义凭空发明路径", () => {
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

  it("打开已有的内部定义或一个复合节点，只做导航解析，不产生实例", () => {
    const { project, moduleId, nodeAId, nodeBId } = sharedDefinitionFixture();
    expect(ensureLogicModule(project, "leaf-a")).toEqual({ project, module: project.modules.find((module) => module.id === moduleId) });
    expect(ensureLogicModule(project, "missing")).toEqual({ project, module: null });
    expect(project.instances).toEqual([]);
    expect(nodeAId).not.toBe(nodeBId);
  });
});
