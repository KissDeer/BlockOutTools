import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ProjectLibrary } from "./project-library";
import { createDemoProject } from "../src/domain/demo-project";

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true }); });
it("round-trips split files after restart and prevents stale concurrent writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "blockout-library-test-")); directories.push(root);
  const library = new ProjectLibrary(root);
  const project = createDemoProject();
  const first = await library.save(project, null);
  const manifest = JSON.parse(await readFile(join(root, first.key, "project.blockout.json"), "utf8"));
  expect(manifest.modules).toBeUndefined();
  expect(manifest.moduleFiles).toHaveLength(2);
  expect((await new ProjectLibrary(root).read(first.key)).project).toEqual(project);
  project.modules[0].name = "edited";
  const writes = await Promise.allSettled([library.save(project, first.revision), library.save(createDemoProject(), first.revision)]);
  expect(writes.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
  expect(await readdir(join(root, first.key, "modules"))).toHaveLength(3);
  expect((await library.list()).items).toHaveLength(1);
  await expect(library.read("../../outside")).rejects.toThrow("项目路径无效");
});
it("detects edits to a module even when its manifest is unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "blockout-library-test-")); directories.push(root);
  const library = new ProjectLibrary(root), project = createDemoProject();
  const first = await library.save(project, null);
  const manifest = JSON.parse(await readFile(join(root, first.key, "project.blockout.json"), "utf8"));
  const modulePath = join(root, first.key, manifest.moduleFiles[0]);
  const module = JSON.parse(await readFile(modulePath, "utf8")); module.name = "Git changed module";
  await writeFile(modulePath, JSON.stringify(module), "utf8");
  const modified = await library.read(first.key);
  expect(modified.revision).not.toBe(first.revision);
  await expect(library.save(project, first.revision)).rejects.toThrow("磁盘文件已被");
  await expect(library.save(project, modified.revision)).rejects.toThrow("模块内容文件被外部改写");
});
