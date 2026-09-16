import { expect, it, vi } from "vitest";
import { createEmptyTopology } from "./concept";
import { addBlock, updateBlock } from "./commands";
import { createDemoProject } from "./demo-project";
import * as fingerprinting from "./fingerprint";
import { resolveModuleContext } from "./workflow-context";

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
