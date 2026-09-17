import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "./project-store";
import { createDemoProject } from "../domain/demo-project";
import { createEmptyTopology } from "../domain/concept";
import { addLogicNode, createLogicModule } from "../domain/concept-commands";
import { createQuickModuleDraft } from "../domain/module-draft";
import { ensureLogicModule, placeModuleDefinition } from "../domain/module-workflow";
import { projectSchema } from "../domain/project-schema";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
});
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture() {
  const node = addLogicNode(createEmptyTopology(), [1200, 3400]);
  const group = createLogicModule(node.topology, "教堂", [node.node.id]);
  const project = { ...createDemoProject(), concept: group.topology };
  return { project, group: group.module, node: node.node };
}

describe("topology-driven module workflow", () => {
  it("opens an empty stable definition without placing or changing existing geometry", () => {
    const { project, group } = fixture();
    const result = ensureLogicModule(project, group.id);
    expect(result.module?.blocks).toEqual([]);
    expect(result.project.instances).toBe(project.instances);
    expect(result.project.connections).toBe(project.connections);
    expect(result.project.modules.slice(0, project.modules.length)).toEqual(project.modules);
    expect(ensureLogicModule(result.project, group.id).project).toBe(result.project);
    expect(projectSchema.parse(result.project).concept?.modules[0].moduleDefinitionId).toBe(result.module?.id);
  });

  it("retains the node's geometry and selection through edit undo and redo", () => {
    const { project, node } = fixture();
    const store = useProjectStore.getState;
    store().replaceProject(project);
    store().setSelectedLogicNode(node.id);
    store().setLevelPath([node.id]);
    // 进入没有子层的节点 = 几何层，编的是**这个节点自己的**积木
    expect(store()).toMatchObject({ levelPath: [node.id], activeNodeId: node.id, activeInstanceId: null });
    store().addBlock("box");
    expect(store().currentBlocks).toHaveLength(1);
    store().undo();
    expect(store()).toMatchObject({ levelPath: [node.id], activeNodeId: node.id });
    expect(store().currentBlocks).toEqual([]);
    store().redo();
    expect(store().currentBlocks).toHaveLength(1);
    // 退回上一层：层级清空，回到整图
    store().returnFromModule();
    expect(store()).toMatchObject({ levelPath: [], activeNodeId: null, currentBlocks: [] });
  });

  it("places one module without resetting old instances, does not turn topology coordinates into space", () => {
    const { project, group } = fixture();
    project.instances[0].assemblyTransform = { position: [512, 112, 73], rotation: 42 };
    const opened = ensureLogicModule(project, group.id);
    const placed = placeModuleDefinition(opened.project, opened.module!.id);
    expect(placed.project.instances.slice(0, project.instances.length)).toEqual(project.instances);
    expect(placed.instance?.assemblyTransform.position).not.toEqual([1200, 3400, 0]);
    expect(placeModuleDefinition(placed.project, opened.module!.id).project).toBe(placed.project);
    expect(projectSchema.safeParse(placed.project).success).toBe(true);
  });

  it("renames a uniquely bound definition without losing references, but protects shared definition names", () => {
    const { project, group } = fixture();
    const store = useProjectStore.getState;
    // 改名要能传给模块定义，前提是这个分组真的绑定了定义（旧数据形态）
    const opened = ensureLogicModule(project, group.id);
    const moduleId = opened.module!.id;
    store().replaceProject(opened.project);
    // 走遗留模块这条路：几何仍挂在模块定义上
    store().openModuleById(moduleId);
    expect(store().activeModuleId).toBe(moduleId);
    store().addBlock("box", [300, 600, 40]);
    const module = store().project.modules.find((item) => item.id === moduleId)!;
    const brief = { purpose: "回环探索", goals: "获得钥匙后返回主厅" };
    store().updateModule({ ...module, designBrief: brief });
    store().acceptProject({ ...store().project, designContext: { goal: "项目目标", constraints: "", materials: [
      { id: "module-reference", name: "结构说明", kind: "note", text: "中央挑空", imageData: "", moduleIds: [moduleId] },
    ] } });
    const blocks = store().project.modules.find((item) => item.id === moduleId)!.blocks;
    expect(blocks).toHaveLength(1);
    const materials = store().project.designContext!.materials;

    store().updateLogicModule(group.id, { name: "教堂中庭" });
    const renamed = store().project.modules.find((item) => item.id === moduleId)!;
    expect(renamed.name).toBe("教堂中庭");
    expect(renamed.blocks).toBe(blocks);
    expect(renamed.designBrief).toEqual(brief);
    expect(store().project.designContext?.materials).toEqual(materials);
    expect(store().project.designContext?.materials[0].moduleIds).toEqual([moduleId]);
    expect(store().project.concept?.modules.find((item) => item.id === group.id)?.moduleDefinitionId).toBe(moduleId);

    const current = store().project;
    store().acceptProject({ ...current, concept: { ...current.concept!, modules: [...current.concept!.modules,
      { id: "shared-alias", name: "教堂复用入口", nodeIds: [], moduleDefinitionId: moduleId, note: "共享定义" },
    ] } });
    store().updateLogicModule(group.id, { name: "东侧教堂" });
    expect(store().project.concept?.modules.find((item) => item.id === group.id)?.name).toBe("东侧教堂");
    const shared = store().project.modules.find((item) => item.id === moduleId)!;
    expect(shared.name).toBe("教堂中庭");
    expect(shared.blocks).toBe(blocks);
    expect(shared.designBrief).toEqual(brief);
    expect(store().project.designContext?.materials).toEqual(materials);
    expect(projectSchema.safeParse(store().project).success).toBe(true);
  });

  it("renaming a grouping no longer touches geometry: node blocks live on the node", () => {
    const { project, group, node } = fixture();
    const store = useProjectStore.getState;
    store().replaceProject(project);
    store().setLevelPath([node.id]);
    expect(store().activeNodeId).toBe(node.id);
    store().addBlock("box", [120, 340, 40]);
    expect(store().currentBlocks).toHaveLength(1);
    store().updateLogicModule(group.id, { name: "教堂中庭" });
    // 分组只是画个框，已经不是几何的承载体
    expect(store().project.concept?.modules.find((item) => item.id === group.id)?.name).toBe("教堂中庭");
    expect(store().currentBlocks).toHaveLength(1);
    expect(store().project.concept?.nodes[0].blocks).toHaveLength(1);
  });

  it("preview and cancel write nothing; apply is one undo step and stale drafts are rejected", () => {
    const { project, group } = fixture();
    const store = useProjectStore.getState;
    // 草案是针对**模块定义**的旧能力（节点几何没有草案），所以走遗留模块这条路
    const opened = ensureLogicModule(project, group.id);
    const moduleId = opened.module!.id;
    store().replaceProject(opened.project);
    store().openModuleById(moduleId);
    expect(store().activeModuleId).toBe(moduleId);
    const before = store().project;
    const historyCount = store().past.length;
    const draft = createQuickModuleDraft(before, moduleId);
    store().setModuleDraft(draft);
    store().addBlock("box");
    expect(store().project).toBe(before);
    store().setModuleDraft(null);
    expect(store().past.length).toBe(historyCount);
    store().setModuleDraft(draft);
    expect(store().applyModuleDraft()).toEqual([]);
    expect(store().past.length).toBe(historyCount + 1);
    store().undo();
    expect(store().project).toBe(before);
    // 撤销不把人踢出当前层级
    expect(store().activeModuleId).toBe(moduleId);
    store().addBlock("box");
    store().setModuleDraft(draft);
    expect(store().applyModuleDraft().join()).toContain("几何");
  });

  it("refreshes an unplaced module locally without project writes, then returns to the overall snapshot", () => {
    const { project, group } = fixture();
    project.instances[0].assemblyTransform = { position: [9000, 12000, 600], rotation: 73 };
    const opened = ensureLogicModule(project, group.id);
    const moduleId = opened.module!.id;
    const store = useProjectStore.getState;
    store().replaceProject(opened.project);
    store().openModuleById(moduleId);
    expect(store().activeModuleId).toBe(moduleId);
    store().addBlock("box", [760, 240, 30]);
    const currentProject = store().project;
    const history = store().past;
    const originalInstances = structuredClone(currentProject.instances);
    expect(currentProject.instances.some((instance) => instance.definitionId === moduleId)).toBe(false);

    store().refreshPreview();
    const localSnapshot = store().previewProject!;
    expect(store()).toMatchObject({ previewModuleId: moduleId, previewOpen: true, previewDirty: false, previewRevision: 1 });
    expect(store().project).toBe(currentProject);
    expect(store().past).toBe(history);
    expect(store().past).toHaveLength(history.length);
    expect(store().project.instances).toEqual(originalInstances);
    expect(localSnapshot).not.toBe(currentProject);
    expect(localSnapshot.instances).toHaveLength(1);
    expect(localSnapshot.instances[0]).toMatchObject({ definitionId: moduleId, assemblyTransform: { position: [0, 0, 0], rotation: 0 } });
    expect(localSnapshot.modules.find((module) => module.id === moduleId)?.blocks[0].transform.position).toEqual([760, 240, 30]);
    expect(localSnapshot.connections).toEqual([]);
    expect(projectSchema.safeParse(localSnapshot).success).toBe(true);

    store().showAssembly();
    store().refreshPreview();
    expect(store()).toMatchObject({ previewModuleId: null, previewOpen: true, previewDirty: false, previewRevision: 2 });
    expect(store().previewProject).toBe(currentProject);
    expect(store().previewProject?.instances).toEqual(originalInstances);
    expect(store().project).toBe(currentProject);
    expect(store().past).toBe(history);
  });

  it("clears preview and navigation on project replacement and preserves instance return", () => {
    const store = useProjectStore.getState;
    const project = createDemoProject();
    store().replaceProject(project); store().showAssembly(); store().openModule(project.instances[0].id);
    store().addBlock("box"); store().undo(); store().returnFromModule();
    expect(store()).toMatchObject({ levelPath: [] });
    store().openModule(project.instances[0].id);
    store().refreshPreview();
    expect(store()).toMatchObject({ previewModuleId: project.instances[0].definitionId, previewRevision: 1, previewOpen: true, previewDirty: false });
    expect(store().previewProject).not.toBeNull();
    store().setModuleDraft(createQuickModuleDraft(store().project, project.modules[0].id));
    store().replaceProject(createDemoProject());
    expect(store()).toMatchObject({ moduleDraft: null, activeModuleId: null, conceptScopeId: null, levelPath: [],
      previewProject: null, previewModuleId: null, previewRevision: 0, previewOpen: false, previewDirty: true });
  });
});
