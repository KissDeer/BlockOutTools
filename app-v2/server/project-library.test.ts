import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ProjectLibrary } from "./project-library";
import { createDemoProject } from "../src/domain/demo-project";

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true }); });

/** 建一个临时项目库目录，并登记退出时清理 */
async function libraryInTempDir() {
  const root = await mkdtemp(join(tmpdir(), "blockout-library-test-"));
  directories.push(root);
  return { root, library: new ProjectLibrary(root) };
}

it("重启后能读回同一份项目，并拒绝过期写入", async () => {
  const { root, library } = await libraryInTempDir();
  const project = createDemoProject();
  const first = await library.save(project, null);
  // 一个项目一个目录、一份 JSON
  const stored = JSON.parse(await readFile(join(root, first.key, "project.blockout.json"), "utf8"));
  expect(stored.projectId).toBe(project.projectId);
  expect(stored.concept).toBeTruthy();
  expect((await new ProjectLibrary(root).read(first.key)).project).toEqual(project);
  expect((await library.list()).items).toHaveLength(1);

  // 两个写入都拿着同一个 revision：先到的成功，后到的必须被拒
  const writes = await Promise.allSettled([library.save({ ...project, name: "先到" }, first.revision), library.save(project, first.revision)]);
  expect(writes.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
  await expect(library.read("../../outside")).rejects.toThrow("项目路径无效");
});

it("磁盘文件被外部改写后，读过就知道，并且拿旧 revision 写会被拦下", async () => {
  const { root, library } = await libraryInTempDir();
  const project = createDemoProject();
  const first = await library.save(project, null);
  const path = join(root, first.key, "project.blockout.json");

  const stored = JSON.parse(await readFile(path, "utf8"));
  stored.name = "Git 改过的项目名";
  await writeFile(path, JSON.stringify(stored), "utf8");

  const modified = await library.read(first.key);
  expect(modified.revision).not.toBe(first.revision);
  await expect(library.save(project, first.revision)).rejects.toThrow("磁盘文件已被");
  // 用读到的 revision 就能写进去
  await expect(library.save(project, modified.revision)).resolves.toMatchObject({ key: first.key });
});
