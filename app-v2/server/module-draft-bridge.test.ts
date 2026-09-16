import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { createDemoProject } from "../src/domain/demo-project";
import { confirmModuleShape, createModuleDraftRequest, createQuickModuleDraft } from "../src/domain/module-draft";
import { ModuleDraftInbox } from "./module-draft-bridge";
import { ProjectLibrary } from "./project-library";

it("isolates agent responses by request, project, module and snapshot", () => {
  const project = createDemoProject();
  const inbox = new ModuleDraftInbox();
  const request = createModuleDraftRequest(project, project.modules[0].id);
  const other = createModuleDraftRequest(project, project.modules[1].id);
  inbox.submitRequest(request); inbox.submitRequest(other);
  const draft = { ...createQuickModuleDraft(project, project.modules[0].id), requestId: request.requestId, source: "agent" as const };
  expect(() => inbox.submitResult(other.requestId, draft)).toThrow("不一致");
  expect(() => inbox.submitResult(request.requestId, { ...draft, contextDigest: "stale" })).toThrow("不一致");
  expect(() => inbox.submitRequest({ ...request, moduleId: other.moduleId })).toThrow();
  inbox.submitResult(request.requestId, draft);
  expect(inbox.get(request.requestId).status).toBe("ready");
  expect(inbox.get(other.requestId)).toMatchObject({ status: "waiting", candidate: null });
  expect(inbox.list("unknown-project")).toEqual([]);
  expect(() => inbox.get("unknown-request")).toThrow("不存在");
});

it("persists module briefs, shape baselines and shared material only once in split files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blockout-workflow-library-"));
  try {
    let project = createDemoProject();
    project.designContext = { goal: "探索", constraints: "尺度", materials: [{ id: "shared", name: "结构参考", kind: "structure", text: "", imageData: "data:image/png;base64,YQ==", moduleIds: project.modules.map((module) => module.id) }] };
    project.modules[0].designBrief = { purpose: "引导", goals: "发现捷径" };
    project = confirmModuleShape(project, project.modules[0].id);
    const saved = await new ProjectLibrary(directory).save(project, null);
    const reopened = await new ProjectLibrary(directory).read(saved.key);
    expect(reopened.project).toEqual(project);
    const manifest = JSON.parse(await readFile(join(directory, saved.key, "project.blockout.json"), "utf8"));
    const module = JSON.parse(await readFile(join(directory, saved.key, manifest.moduleFiles[0]), "utf8"));
    expect(manifest.designContext.materials).toHaveLength(1);
    expect(module.designBrief).toEqual(project.modules[0].designBrief);
    expect(module.designContext).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true });
  }
});
