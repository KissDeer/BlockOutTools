import { expect, it, vi } from "vitest";
import { createEmptyTopology } from "./concept";
import { addBlock, updateBlock } from "./commands";
import { createDemoProject } from "./demo-project";
import * as fingerprinting from "./fingerprint";
import { duplicateMaterialGroups, resolveModuleContext } from "./workflow-context";
import type { DesignMaterial } from "./types";

it("reuses image scans while source references survive, but rehashes after real cloning commands", () => {
  const project = createDemoProject();
  const moduleId = project.modules[0].id;
  const image = (letter: string) => `data:image/png;base64,${letter.repeat(4096)}`;
  project.designContext = { goal: "", constraints: "", materials: [{ id: "shared", name: "项目图", kind: "structure", text: "", imageData: image("A"), moduleIds: [] }] };
  project.concept = createEmptyTopology();
  project.concept.inputs.items = [{ id: "legacy", kind: "mood", name: "旧氛围图", ref: "", imageData: image("B"), pixelSize: [1, 1], text: "", note: "", addedAt: "", calibration: null }];
  project.modules[0].reference = { id: "reference", name: "底图", imageData: image("C"), pixelSize: [1, 1], origin: [0, 0], cmPerPixel: 1, rotation: 0, opacity: 1, visible: true, confirmed: false, legend: "" };
  const spy = vi.spyOn(fingerprinting, "fingerprint");
  const imageScans = () => spy.mock.calls.filter(([value]) => value.startsWith("data:image/")).length;
  try {
    const initial = resolveModuleContext(project, moduleId);
    expect(imageScans()).toBe(3);
    const edited = { ...project, modules: project.modules.map((module) => module.id === moduleId ? { ...module, revision: module.revision + 1, blocks: module.blocks.map((block) => ({ ...block, name: `${block.name}已编辑` })) } : module) };
    // Structural sharing is a cache hit; this is not how existing geometry commands clone projects.
    expect(resolveModuleContext(edited, moduleId).contextDigest).toBe(initial.contextDigest);
    expect(resolveModuleContext(edited, moduleId).contextDigest).toBe(initial.contextDigest);
    expect(imageScans()).toBe(3);

    const sources = [project.designContext.materials[0], project.concept.inputs.items[0], project.modules[0].reference];
    let previousDigest = initial.contextDigest;
    for (const [index, source] of sources.entries()) {
      source.imageData = image(String.fromCharCode(68 + index));
      const changed = resolveModuleContext(edited, moduleId);
      expect(changed.contextDigest).not.toBe(previousDigest);
      expect(imageScans()).toBe(4 + index);
      previousDigest = changed.contextDigest;
    }
    expect(resolveModuleContext(structuredClone(edited), moduleId).contextDigest).toBe(previousDigest);
    expect(imageScans()).toBe(9);
    const added = addBlock(edited, moduleId, "box").project;
    expect(resolveModuleContext(added, moduleId).contextDigest).toBe(previousDigest);
    expect(imageScans()).toBe(12);
    resolveModuleContext(added, moduleId);
    expect(imageScans()).toBe(12);
    const updated = updateBlock(added, moduleId, { ...added.modules[0].blocks[0], name: "实际命令改动" });
    expect(resolveModuleContext(updated, moduleId).contextDigest).toBe(previousDigest);
    expect(imageScans()).toBe(15);
    resolveModuleContext(updated, moduleId);
    expect(imageScans()).toBe(15);
    sources[0].imageData = "data:image/png;base64,?";
    expect(resolveModuleContext(edited, moduleId).warnings.some((warning) => warning.includes("项目图") && warning.includes("不可读取"))).toBe(true);
  } finally {
    spy.mockRestore();
  }
});

/** 同名资料：不猜哪份是当前版本，但必须让用户和 agent 都能区分 */
function withMaterials(materials: DesignMaterial[]) {
  const project = createDemoProject();
  const moduleId = project.modules[0].id;
  project.concept = createEmptyTopology();
  project.designContext = { goal: "", constraints: "", materials };
  return { project, moduleId };
}

it("同名但内容不同的资料会编号并给出警告，不擅自取舍", () => {
  const { project, moduleId } = withMaterials([
    { id: "m1", name: "logic-topology.png", kind: "structure", text: "", imageData: "data:image/png;base64,QUFB", moduleIds: [] },
    { id: "m2", name: "logic-topology.png", kind: "structure", text: "", imageData: "data:image/png;base64,QkJC", moduleIds: [] },
    { id: "m3", name: "scope-map.png", kind: "structure", text: "", imageData: "data:image/png;base64,Q0ND", moduleIds: [] },
  ]);
  const context = resolveModuleContext(project, moduleId);

  // 三份都留着，不自动丢弃任何一份
  expect(context.materials.map((item) => item.id)).toEqual(["m1", "m2", "m3"]);
  expect(context.materials[0].variantLabel).toBe("同名 1/2");
  expect(context.materials[1].variantLabel).toBe("同名 2/2");
  expect(context.materials[2].variantLabel).toBe("");
  // 内容不同的指纹必须不同，界面与 agent 才能据以区分
  expect(context.materials[0].contentDigest).not.toBe(context.materials[1].contentDigest);
  expect(context.warnings.some((warning) => warning.includes("同名但内容不同") && warning.includes("1/2"))).toBe(true);
});

it("同名且内容相同的资料提示可以移除多余的", () => {
  const same = "data:image/png;base64,QUFB";
  const { project, moduleId } = withMaterials([
    { id: "m1", name: "重复图.png", kind: "structure", text: "", imageData: same, moduleIds: [] },
    { id: "m2", name: "重复图.png", kind: "structure", text: "", imageData: same, moduleIds: [] },
  ]);
  const context = resolveModuleContext(project, moduleId);
  expect(context.materials[0].contentDigest).toBe(context.materials[1].contentDigest);
  expect(context.warnings.some((warning) => warning.includes("内容完全相同") && warning.includes("保留任意一份"))).toBe(true);
});

it("文字资料也按内容区分，不重名时不产生噪音", () => {
  const { project, moduleId } = withMaterials([
    { id: "m1", name: "拆分规范", kind: "rules", text: "净宽 180", imageData: "", moduleIds: [] },
    { id: "m2", name: "拆分规范", kind: "rules", text: "净宽 240", imageData: "", moduleIds: [] },
    { id: "m3", name: "另一份", kind: "note", text: "随便", imageData: "", moduleIds: [] },
  ]);
  const context = resolveModuleContext(project, moduleId);
  expect(context.materials[0].variantLabel).toBe("同名 1/2");
  expect(context.materials[0].contentDigest).not.toBe(context.materials[1].contentDigest);
  expect(context.materials[2].variantLabel).toBe("");
  expect(context.warnings.filter((warning) => warning.includes("同名"))).toHaveLength(1);
});

it("同名分组保留原始顺序，只返回重复的组", () => {
  const items = [{ name: "a" }, { name: "b" }, { name: "a" }, { name: "a" }];
  const groups = duplicateMaterialGroups(items);
  expect([...groups.keys()]).toEqual(["a"]);
  expect(groups.get("a")!.map((item) => items.indexOf(item))).toEqual([0, 2, 3]);
  expect(duplicateMaterialGroups([{ name: "x" }, { name: "y" }]).size).toBe(0);
});

it("提示指向资料真正存放的地方，不指错入口", () => {
  const { project, moduleId } = withMaterials([
    { id: "m1", name: "重复图.png", kind: "structure", text: "", imageData: "data:image/png;base64,QUFB", moduleIds: [] },
    { id: "m2", name: "重复图.png", kind: "structure", text: "", imageData: "data:image/png;base64,QUFB", moduleIds: [] },
  ]);
  // designContext 里的资料 → 模块参考栏的「资料管理」
  expect(resolveModuleContext(project, moduleId).warnings.some((warning) => warning.includes("模块参考栏的「资料管理」"))).toBe(true);

  // 旧作用域输入 → 「历史资料管理」
  const legacy = withMaterials([]);
  legacy.project.concept!.inputs.items = [
    { id: "i1", kind: "logic-topology", name: "旧拓扑.png", ref: "", imageData: "data:image/png;base64,QUFB", pixelSize: [1, 1], text: "", note: "", addedAt: "", calibration: null },
    { id: "i2", kind: "logic-topology", name: "旧拓扑.png", ref: "", imageData: "data:image/png;base64,QUFB", pixelSize: [1, 1], text: "", note: "", addedAt: "", calibration: null },
  ];
  expect(resolveModuleContext(legacy.project, legacy.moduleId).warnings.some((warning) => warning.includes("「历史资料管理」"))).toBe(true);
});
