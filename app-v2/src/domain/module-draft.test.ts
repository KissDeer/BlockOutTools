import { describe, expect, it } from "vitest";
import { createBlock } from "./catalog";
import { createEmptyScope, createEmptyTopology, type LogicNode } from "./concept";
import { createDemoProject } from "./demo-project";
import { applyModuleDraft, confirmModuleShape, createModuleDraftRequest, createQuickModuleDraft, moduleDraftDiff, moduleShapeStatus, validateModuleDraft } from "./module-draft";
import { parseProjectFile } from "./persistence";
import { projectSchema } from "./project-schema";
import type { BlockoutProject } from "./types";
import { resolveModuleContext } from "./workflow-context";

function fixture(): BlockoutProject {
  const node = (id: string): LogicNode => ({ id, name: id, role: "combat", floor: 0, graphPosition: [0, 0], relativePosition: null, elevation: null, note: "" });
  const concept = createEmptyTopology();
  concept.nodes = [node("a"), node("b"), node("c")];
  concept.links = [
    { id: "inside", label: "A", from: "a", to: "b", logic: "normal", traversal: "both", requires: null, note: "内部通路" },
    { id: "outside", label: "B", from: "b", to: "c", logic: "locked-door", traversal: "forward", requires: "key", note: "外部入口" },
  ];
  concept.keys = [{ id: "key", name: "钥匙", foundAt: "a", unlocks: ["outside"], note: "" }];
  concept.modules = [
    { id: "group-a", name: "主厅", nodeIds: ["a", "b"], moduleDefinitionId: "module-a", note: "探索后战斗" },
    { id: "group-b", name: "外部", nodeIds: ["c"], moduleDefinitionId: "module-b", note: "" },
  ];
  const demo = createDemoProject();
  return { ...demo, assemblyAnchorInstanceId: undefined, modules: [{ id: "module-a", name: "主厅", revision: 0, blocks: [] }, { id: "module-b", name: "外部", revision: 0, blocks: [] }], instances: [], connections: [], concept };
}

describe("module-scoped context", () => {
  it("uses shared and module materials without duplicating originals or leaking another module", () => {
    const project = fixture();
    project.designContext = { goal: "先紧后松", constraints: "净宽至少 180cm", materials: [
      { id: "shared", name: "尺度", kind: "rules", text: "180cm", imageData: "", moduleIds: [] },
      { id: "mine", name: "结构", kind: "structure", text: "", imageData: "data:image/png;base64,YQ==", moduleIds: ["module-a", "module-b"] },
      { id: "other", name: "氛围", kind: "mood", text: "", imageData: "data:image/png;base64,Yg==", moduleIds: ["module-b"] },
    ] };
    const before = structuredClone(project);
    const context = resolveModuleContext(project, "module-a");
    expect(context.materials.map((item) => item.id)).toEqual(["shared", "mine"]);
    expect(context.internalLinks.map((link) => link.id)).toEqual(["inside"]);
    expect(context.externalLinks.map((link) => link.id)).toEqual(["outside"]);
    expect(context.keys[0].id).toBe("key");
    expect(context.purpose).toBe("探索后战斗");
    expect(project).toEqual(before);
    project.designContext.materials[2].imageData = "data:image/png;base64,Yw==";
    expect(resolveModuleContext(project, "module-a").contextDigest).toBe(context.contextDigest);
    project.designContext.materials[1].imageData = "data:image/png;base64,Yw==";
    expect(resolveModuleContext(project, "module-a").contextDigest).not.toBe(context.contextDigest);
  });

  it("inherits root and owning scope inputs while preserving readable images and missing-image warnings", () => {
    const project = fixture();
    const root = project.concept!;
    const child = createEmptyScope("child", "子层");
    child.nodes = root.nodes;
    child.links = root.links;
    child.keys = root.keys;
    child.modules = root.modules;
    const input = { id: "same-id", kind: "mood" as const, name: "图", ref: "reference.png", imageData: "data:image/png;base64,YQ==", pixelSize: [1, 1] as [number, number], text: "", note: "", addedAt: "", calibration: null };
    root.nodes = []; root.links = []; root.keys = [];
    root.modules = [{ id: "parent", name: "父模块", nodeIds: [], childScopeId: child.id, note: "" }];
    root.scopes = [child];
    root.inputs.items = [input];
    child.inputs.items = [{ ...input, imageData: "" }];
    const context = resolveModuleContext(project, "module-a");
    expect(context.materials).toHaveLength(2);
    expect(new Set(context.materials.map((item) => item.id)).size).toBe(2);
    expect(context.materials[0].imageData).toBe(input.imageData);
    expect(context.warnings.some((warning) => warning.includes("没有原图"))).toBe(true);
    expect(createModuleDraftRequest(project, "module-a").context.materials).toEqual(context.materials);
  });

  it("allows topology rearrangement while invalidating relevant logic, notes and key semantics", () => {
    const project = fixture();
    const draft = createQuickModuleDraft(project, "module-a");
    project.concept!.nodes[0].graphPosition = [8000, -2000];
    project.concept!.nodes[0].relativePosition = [9000, 500];
    project.concept!.links[0].sourceHandle = "left";
    expect(validateModuleDraft(project, draft)).toEqual([]);
    project.concept!.keys[0].note = "仅允许一次使用";
    expect(validateModuleDraft(project, draft).join()).toContain("相关拓扑或资料");
  });
});

describe("safe local module drafts", () => {
  it("lays out unpositioned member areas without overlaps and adds only external ports", () => {
    const project = fixture();
    const draft = createQuickModuleDraft(project, "module-a");
    const areas = draft.blocks.filter((block) => block.type === "box");
    expect(areas).toHaveLength(2);
    expect(areas[1].transform.position[0] - areas[0].transform.position[0]).toBeGreaterThan((areas[0].parameters.BoxSize[0] + areas[1].parameters.BoxSize[0]) / 2);
    expect(draft.blocks.filter((block) => block.type === "port").map((block) => block.provenance?.featureId)).toEqual(["outside"]);
    expect(draft.source).toBe("template");
    expect(draft.assumptions.join()).toContain("未调用 AI");
    expect(validateModuleDraft(project, draft)).toEqual([]);
    expect(project.modules[0].blocks).toEqual([]);
  });

  it("rejects stale hand edits, wrong targets, missing areas and forged source references", () => {
    const project = fixture();
    const draft = createQuickModuleDraft(project, "module-a");
    const changed = structuredClone(project);
    changed.modules[0].blocks.push(createBlock("box"));
    expect(() => applyModuleDraft(changed, draft)).toThrow("手工编辑");
    expect(validateModuleDraft(project, { ...draft, projectId: "foreign" }).join()).toContain("其他项目");
    expect(validateModuleDraft(project, { ...draft, moduleId: "missing" }).join()).toContain("不存在");
    expect(validateModuleDraft(project, { ...draft, blocks: draft.blocks.slice(1) }).join()).toContain("遗漏区域");
    const forged = structuredClone(draft);
    forged.blocks[0].provenance!.featureId = "unknown";
    expect(validateModuleDraft(project, forged).join()).toContain("未知来源");
  });

  it("rejects duplicate IDs, internal ports, invalid geometry and topology mutations in payload", () => {
    const project = fixture();
    const draft = createQuickModuleDraft(project, "module-a");
    const invalid = structuredClone(draft);
    invalid.blocks[1].id = invalid.blocks[0].id;
    expect(validateModuleDraft(project, invalid).join()).toContain("ID 重复");
    const duplicate = structuredClone(draft.blocks[0]);
    duplicate.id = "different-id-same-source";
    expect(validateModuleDraft(project, { ...draft, blocks: [...draft.blocks, duplicate] }).join()).toContain("语义来源重复");
    const wrongSource = structuredClone(draft);
    wrongSource.blocks[0].provenance!.sourceId = "other-group";
    expect(validateModuleDraft(project, wrongSource).join()).toContain("未知来源");
    const port = structuredClone(draft.blocks.find((block) => block.type === "port")!);
    port.id = "internal-port";
    port.provenance!.featureId = "inside";
    expect(validateModuleDraft(project, { ...draft, blocks: [...draft.blocks, port] }).join()).toContain("跨模块链路");
    const malformed = structuredClone(draft);
    if (malformed.blocks[0].type === "box") malformed.blocks[0].parameters.BoxSize[0] = -2;
    expect(validateModuleDraft(project, malformed).length).toBeGreaterThan(0);
    expect(validateModuleDraft(project, { ...draft, concept: {} }).length).toBeGreaterThan(0);
  });

  it("preserves port identity and placed instance transforms when replacing a draft", () => {
    let project = fixture();
    project = applyModuleDraft(project, createQuickModuleDraft(project, "module-a"));
    project = applyModuleDraft(project, createQuickModuleDraft(project, "module-b"));
    const sourcePort = project.modules[0].blocks.find((block) => block.type === "port")!;
    const targetPort = project.modules[1].blocks.find((block) => block.type === "port")!;
    project.instances = [
      { id: "instance-a", name: "A", definitionId: "module-a", graphPosition: [20, 30], assemblyTransform: { position: [123, 456, 789], rotation: 45 } },
      { id: "instance-b", name: "B", definitionId: "module-b", graphPosition: [80, 30], assemblyTransform: { position: [900, 400, 20], rotation: 90 } },
    ];
    project.connections = [{ id: "connection", type: "locked-door", sourceInstanceId: "instance-a", sourcePortId: sourcePort.id, targetInstanceId: "instance-b", targetPortId: targetPort.id, waypoints: [] }];
    const draft = createQuickModuleDraft(project, "module-a");
    draft.blocks.forEach((block, index) => { block.id = `agent-new-${index}`; block.transform.position[1] += 500; });
    const before = structuredClone(project);
    const result = applyModuleDraft(project, draft);
    expect(result.connections).toEqual(project.connections);
    expect(result.instances).toEqual(project.instances);
    expect(result.modules[0].blocks.find((block) => block.type === "port")!.id).toBe(sourcePort.id);
    expect(result.concept).toEqual(project.concept);
    expect(project).toEqual(before);
  });

  it("reports and removes only connections whose replaced manual port disappears", () => {
    const project = fixture();
    const manual = createBlock("port");
    const neighbor = createBlock("port");
    project.modules[0].blocks = [manual]; project.modules[1].blocks = [neighbor];
    project.instances = [{ id: "a", definitionId: "module-a", name: "A", graphPosition: [0, 0], assemblyTransform: { position: [0, 0, 0], rotation: 0 } }, { id: "b", definitionId: "module-b", name: "B", graphPosition: [0, 0], assemblyTransform: { position: [0, 0, 0], rotation: 0 } }];
    project.connections = [{ id: "manual-connection", type: "door", sourceInstanceId: "a", sourcePortId: manual.id, targetInstanceId: "b", targetPortId: neighbor.id, waypoints: [] }];
    const draft = createQuickModuleDraft(project, "module-a");
    const hijacked = structuredClone(draft);
    hijacked.blocks.find((block) => block.type === "port")!.id = manual.id;
    expect(validateModuleDraft(project, hijacked).join()).toContain("其他语义来源");
    expect(moduleDraftDiff(project, draft)).toMatchObject({ removed: 1, removedConnections: 1, existingBlocks: 1 });
    expect(applyModuleDraft(project, draft).connections).toEqual([]);
  });

  it("tracks shape confirmation against relevant requirements and geometry only", () => {
    let project = fixture();
    expect(moduleShapeStatus(project, "module-a")).toBe("empty");
    project = applyModuleDraft(project, createQuickModuleDraft(project, "module-a"));
    expect(moduleShapeStatus(project, "module-a")).toBe("unconfirmed");
    project = confirmModuleShape(project, "module-a");
    project.concept!.nodes[0].graphPosition = [999, 1000];
    expect(moduleShapeStatus(project, "module-a")).toBe("confirmed");
    project.modules[0].blocks[0].transform.position[0] += 1;
    expect(moduleShapeStatus(project, "module-a")).toBe("stale");
  });

  it("round-trips additive context fields while old projects preserve geometry exactly", () => {
    const old = createDemoProject();
    expect(parseProjectFile(JSON.stringify(old))).toEqual(old);
    let project = fixture();
    project.designContext = { goal: "体验", constraints: "尺度", materials: [{ id: "ref", name: "共享结构", kind: "structure", text: "", imageData: "data:image/png;base64,YQ==", moduleIds: ["module-a", "module-b"] }] };
    project.modules[0].designBrief = { purpose: "入口引导", goals: "学习路径" };
    project = confirmModuleShape(applyModuleDraft(project, createQuickModuleDraft(project, "module-a")), "module-a");
    expect(parseProjectFile(JSON.stringify(project))).toEqual(project);
    expect(projectSchema.safeParse(project).success).toBe(true);
  });
});
