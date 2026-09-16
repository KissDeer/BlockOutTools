import type { IncomingMessage, ServerResponse } from "node:http";
import { moduleDraftRequestSchema, moduleDraftSchema, type ModuleDraft, type ModuleDraftRequest } from "../src/domain/module-draft-contract";
import { stableJson } from "../src/domain/stable-json";

interface DraftEntry {
  request: ModuleDraftRequest;
  candidate: ModuleDraft | null;
  status: "waiting" | "ready";
}

/** Ephemeral per-request inbox. It never edits projects or pretends to invoke a model. */
export class ModuleDraftInbox {
  private entries = new Map<string, DraftEntry>();

  submitRequest(input: unknown) {
    const request = moduleDraftRequestSchema.parse(input);
    const existing = this.entries.get(request.requestId);
    if (existing && stableJson(existing.request) !== stableJson(request)) throw Object.assign(new Error("请求 ID 已被其他内容使用"), { statusCode: 409 });
    if (!existing) this.entries.set(request.requestId, { request, candidate: null, status: "waiting" });
    while (this.entries.size > 8) this.entries.delete(this.entries.keys().next().value!);
    return { requestId: request.requestId, status: this.entries.get(request.requestId)!.status };
  }

  get(requestId: string): DraftEntry {
    const entry = this.entries.get(requestId);
    if (!entry) throw Object.assign(new Error("请求不存在或已过期，请重新准备材料"), { statusCode: 404 });
    return entry;
  }

  list(projectId: string | null) {
    return [...this.entries.values()].filter(({ request }) => !projectId || request.projectId === projectId).map(({ request, status }) => ({
      requestId: request.requestId, projectId: request.projectId, moduleId: request.moduleId, moduleName: request.context.moduleName, createdAt: request.createdAt, status,
    }));
  }

  submitResult(requestId: string, input: unknown) {
    const entry = this.get(requestId);
    const candidate = moduleDraftSchema.parse(input);
    const fields = ["requestId", "projectId", "moduleId", "contextDigest", "geometryDigest"] as const;
    if (fields.some((field) => candidate[field] !== entry.request[field])) throw Object.assign(new Error("结果与请求目标或基线不一致"), { statusCode: 409 });
    if (candidate.source !== "agent") throw new Error("本地 agent 桥仅接收 source=agent 的结果");
    entry.candidate = candidate;
    entry.status = "ready";
    return { ok: true, requestId, status: entry.status };
  }
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024 * 1024) throw new Error("请求体超过 64MB 限制");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function moduleDraftMiddleware() {
  const inbox = new ModuleDraftInbox();
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/module-drafts")) return next();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    try {
      const origin = request.headers.origin;
      if (origin && new URL(origin).host !== request.headers.host) throw Object.assign(new Error("请求来源无效"), { statusCode: 403 });
      const path = url.pathname;
      let result: unknown;
      if (path === "/api/module-drafts/requests" && request.method === "POST") result = inbox.submitRequest(await readBody(request));
      else if (path === "/api/module-drafts/requests" && request.method === "GET") result = { requests: inbox.list(url.searchParams.get("projectId")) };
      else {
        const match = /^\/api\/module-drafts\/([^/]+)(\/result)?$/.exec(path);
        if (!match) throw Object.assign(new Error("接口不存在"), { statusCode: 404 });
        const requestId = decodeURIComponent(match[1]);
        if (request.method === "GET" && !match[2]) result = inbox.get(requestId);
        else if (request.method === "POST" && match[2]) result = inbox.submitResult(requestId, await readBody(request));
        else throw Object.assign(new Error("接口不存在"), { statusCode: 404 });
      }
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = (error as { statusCode?: number }).statusCode ?? 400;
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "模块草案桥接失败" }));
    }
  };
}
