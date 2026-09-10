import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { projectSchema } from "../src/domain/project-schema";

const encode = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const keyFor = (id: string) => `project-${hash(id).slice(0, 24)}`;

export class ProjectLibrary {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly root: string) {}

  private async directory(key: string): Promise<string> {
    if (!/^project-[a-f0-9]{24}$/.test(key)) throw new Error("项目路径无效");
    const path = join(this.root, key);
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error("项目目录不能是链接"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return path;
  }

  async list() {
    await mkdir(this.root, { recursive: true });
    const items = [];
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^project-[a-f0-9]{24}$/.test(entry.name)) continue;
      try { const result = await this.read(entry.name); items.push({ key: entry.name, name: result.project.name, updatedAt: result.project.updatedAt }); }
      catch { items.push({ key: entry.name, name: `${entry.name}（文件损坏，请从 Git 恢复）`, updatedAt: "" }); }
    }
    return { root: this.root, items };
  }

  async read(key: string) {
    const directory = await this.directory(key);
    const manifestPath = join(directory, "project.blockout.json");
    if ((await lstat(manifestPath)).isSymbolicLink()) throw new Error("项目清单不能是链接");
    const raw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    if (!Array.isArray(manifest.moduleFiles)) throw new Error("模块清单无效");
    const modules = [];
    const moduleContents: string[] = [];
    for (const file of manifest.moduleFiles) {
      if (typeof file !== "string" || !/^modules\/[a-f0-9]{64}\.blockout-module\.json$/.test(file)) throw new Error("模块路径无效");
      const modulePath = join(directory, file);
      if ((await lstat(join(directory, "modules"))).isSymbolicLink() || (await lstat(modulePath)).isSymbolicLink()) throw new Error("模块文件不能是链接");
      const content = await readFile(modulePath, "utf8");
      moduleContents.push(content);
      modules.push(JSON.parse(content));
    }
    return { project: projectSchema.parse({ ...manifest, modules }), revision: hash(raw + moduleContents.join("")), key };
  }

  save(input: unknown, expectedRevision: string | null) {
    const operation = this.queue.then(async () => {
      const project = projectSchema.parse(input);
      const key = keyFor(project.projectId);
      const directory = await this.directory(key);
      let current: string | null = null;
      let exists = false;
      try { await lstat(join(directory, "project.blockout.json")); exists = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (exists) current = (await this.read(key)).revision;
      if (current !== expectedRevision) throw Object.assign(new Error("磁盘文件已被其他页面或 Git 修改。请重新打开并合并后保存。"), { statusCode: 409 });
      const modulesPath = join(directory, "modules");
      await mkdir(modulesPath, { recursive: true });
      if ((await lstat(modulesPath)).isSymbolicLink()) throw new Error("模块目录不能是链接");
      const moduleFiles: string[] = [];
      for (const module of project.modules) {
        const raw = encode(module);
        const file = `modules/${hash(raw)}.blockout-module.json`;
        // Immutable module blobs let the manifest switch atomically without partial projects.
        try { await writeFile(join(directory, file), raw, { encoding: "utf8", flag: "wx" }); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const storedPath = join(directory, file);
          if ((await lstat(storedPath)).isSymbolicLink() || await readFile(storedPath, "utf8") !== raw) throw Object.assign(new Error("模块内容文件被外部改写，请先通过 Git 恢复或合并该文件"), { statusCode: 409 });
        }
        moduleFiles.push(file);
      }
      const { modules: _modules, ...metadata } = project;
      const raw = encode({ ...metadata, moduleFiles });
      const temp = join(directory, `.save-${randomUUID()}.tmp`);
      await writeFile(temp, raw, { encoding: "utf8", flag: "wx" });
      await rename(temp, join(directory, "project.blockout.json"));
      return { key, revision: hash(raw + project.modules.map(encode).join("")), project };
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}

export function projectLibraryPlugin(): Plugin {
  const library = new ProjectLibrary(resolve(process.env.BLOCKOUT_V2_DATA_DIR || "../data/projects-v2"));
  const middleware = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (!request.url?.startsWith("/api/projects")) return next();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    try {
      const origin = request.headers.origin;
      if (origin && new URL(origin).host !== request.headers.host) throw Object.assign(new Error("请求来源无效"), { statusCode: 403 });
      const path = request.url.split("?")[0];
      let result;
      if (request.method === "GET" && path === "/api/projects") result = await library.list();
      else if (request.method === "GET" && path.startsWith("/api/projects/")) result = await library.read(path.slice(14));
      else if (request.method === "POST" && path === "/api/projects") {
        if (!request.headers["content-type"]?.startsWith("application/json")) throw new Error("需要 JSON 请求");
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 64 * 1024 * 1024) throw new Error("项目超过 64MB 限制");
          chunks.push(Buffer.from(chunk));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        result = await library.save(body.project, body.revision ?? null);
      } else throw Object.assign(new Error("接口不存在"), { statusCode: 404 });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = (error as { statusCode?: number }).statusCode ?? 400;
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "文件操作失败" }));
    }
  };
  return { name: "blockout-project-library", configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
