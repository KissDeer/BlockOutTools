import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { recognitionCandidateSchema } from "../src/domain/concept-candidate";

/**
 * 阶段一的本地桥：让 DSH 里的 agent 能读到输入材料（图片落盘，可直接看图），
 * 并把识别候选写回来给网页确认。只做暂存，不写项目文件。
 */

const MAX_BODY = 64 * 1024 * 1024;

interface InputsBundle {
  digest: string;
  revision: number;
  receivedAt: string;
  items: Record<string, unknown>[];
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("请求体超过 64MB 限制");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export function conceptBridgePlugin(): Plugin {
  const root = resolve(process.env.BLOCKOUT_V2_CONCEPT_DIR || "../data/concept");
  let inputs: InputsBundle | null = null;
  let received: { candidate: unknown; receivedAt: string } | null = null;

  /** 输入同步：图片写到磁盘，agent 可以直接看图；base64 不回传，避免响应过大 */
  async function saveInputs(body: Record<string, unknown>) {
    const directory = join(root, "inputs");
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    const items: Record<string, unknown>[] = [];
    for (const raw of (body.items as Record<string, unknown>[]) ?? []) {
      const item = { ...raw };
      const imageData = item.imageData;
      if (typeof imageData === "string") {
        const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(imageData);
        if (match) {
          const file = join(directory, `${String(item.id)}.${match[1] === "jpeg" ? "jpg" : match[1]}`);
          await writeFile(file, Buffer.from(match[2], "base64"));
          item.file = file;
        }
      }
      delete item.imageData;
      items.push(item);
    }
    inputs = {
      digest: String(body.digest ?? ""),
      revision: Number(body.revision ?? 0),
      receivedAt: new Date().toISOString(),
      items,
    };
    return { root: directory, count: items.length, digest: inputs.digest };
  }

  const middleware = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (!request.url?.startsWith("/api/concept")) return next();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    try {
      const origin = request.headers.origin;
      if (origin && new URL(origin).host !== request.headers.host) throw Object.assign(new Error("请求来源无效"), { statusCode: 403 });
      const path = request.url.split("?")[0];
      let result: unknown;

      if (request.method === "POST" && path === "/api/concept/inputs") {
        result = await saveInputs(await readBody(request));
      } else if (request.method === "GET" && path === "/api/concept/inputs") {
        result = inputs ?? { digest: "", revision: 0, receivedAt: "", items: [] };
      } else if (request.method === "POST" && path === "/api/concept/candidate") {
        const body = await readBody(request);
        const parsed = recognitionCandidateSchema.safeParse(body);
        if (!parsed.success) {
          response.statusCode = 422;
          response.end(JSON.stringify({ error: "候选格式不合法", issues: parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".")}: ${issue.message}`) }));
          return;
        }
        received = { candidate: parsed.data, receivedAt: new Date().toISOString() };
        result = { ok: true, nodes: parsed.data.nodes.length, links: parsed.data.links.length };
      } else if (request.method === "GET" && path === "/api/concept/candidate") {
        result = received ?? { candidate: null, receivedAt: "" };
      } else if (request.method === "DELETE" && path === "/api/concept/candidate") {
        received = null;
        result = { ok: true };
      } else {
        throw Object.assign(new Error("接口不存在"), { statusCode: 404 });
      }

      if (!response.writableEnded) response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = (error as { statusCode?: number }).statusCode ?? 400;
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "概念桥接失败" }));
    }
  };

  return {
    name: "blockout-concept-bridge",
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
