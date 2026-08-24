import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  actorSnapshotToLayoutLevel,
  buildImportPlan,
  createBlockPaletteLevel,
} from "../src/integrations/ue/bridge-converter.js";
import {
  applyImportPlan,
  catalogBlockoutAssets,
  getUnrealStatus,
  snapshotBridgeActors,
} from "../src/integrations/ue/ue-service.js";
import { injectVendorStoreBridge } from "../src/runtime/vendor-bridge.mjs";
import { LocalLevelLibrary } from "../src/server/local-level-library.js";

const HOST = process.env.LAYOUT_TOOLS_HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.LAYOUT_TOOLS_PORT ?? "4173", 10);
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
const projectConfig = JSON.parse(await readFile(resolve(ROOT, "config/ue-project.json"), "utf8"));
const blockoutMapping = JSON.parse(
  await readFile(resolve(ROOT, "config/ue-blockout-mapping.json"), "utf8"),
);
const parametricBlocks = JSON.parse(
  await readFile(resolve(ROOT, "config/ue-parametric-blocks.json"), "utf8"),
);
const localStorageConfig = JSON.parse(
  await readFile(resolve(ROOT, "config/local-storage.json"), "utf8"),
);
const localLevelLibrary = new LocalLevelLibrary({
  ...localStorageConfig,
  directory: process.env.LAYOUT_TOOLS_DATA_DIR ?? resolve(ROOT, localStorageConfig.directory),
});
await localLevelLibrary.initialize();
const bridgedVendorSource = injectVendorStoreBridge(
  await readFile(resolve(ROOT, "vendor/layout-tools-0.0.2.js"), "utf8"),
);

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
});

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const candidate = resolve(ROOT, normalize(relativePath));

  if (candidate !== ROOT && !candidate.startsWith(`${ROOT}${sep}`)) {
    return null;
  }

  return candidate;
}

async function resolveFilePath(requestUrl) {
  const candidate = resolveRequestPath(requestUrl);

  if (!candidate) {
    return null;
  }

  try {
    const fileStat = await stat(candidate);
    return fileStat.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > MAX_REQUEST_BYTES) {
      throw new Error("Request body exceeds 10 MB.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleApiRequest(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/local-levels") {
    sendJson(response, 200, await localLevelLibrary.list());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/local-levels/open") {
    sendJson(response, 200, await localLevelLibrary.load(url.searchParams.get("file")));
    return true;
  }

  if (["POST", "PUT"].includes(request.method) && url.pathname === "/api/local-levels/save") {
    const body = await readJsonBody(request);
    sendJson(response, 200, {
      file: await localLevelLibrary.save(body.fileName, body.level),
      directory: localLevelLibrary.directory,
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/ue/status") {
    sendJson(response, 200, await getUnrealStatus(projectConfig));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/ue/catalog") {
    sendJson(response, 200, await catalogBlockoutAssets(projectConfig));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/ue/mapping") {
    sendJson(response, 200, {
      project: projectConfig,
      mapping: blockoutMapping,
      parametricBlocks,
      parametricBlockCount: parametricBlocks.blocks.length,
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/ue/palette") {
    const catalog = await catalogBlockoutAssets(projectConfig);
    sendJson(response, 200, createBlockPaletteLevel(
      blockoutMapping,
      catalog,
      projectConfig,
      parametricBlocks,
    ));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/ue/export") {
    const [catalog, snapshot] = await Promise.all([
      catalogBlockoutAssets(projectConfig),
      snapshotBridgeActors(projectConfig, parametricBlocks),
    ]);
    sendJson(
      response,
      200,
      actorSnapshotToLayoutLevel(snapshot, blockoutMapping, catalog, projectConfig, parametricBlocks),
    );
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/ue/import") {
    const body = await readJsonBody(request);
    const catalog = await catalogBlockoutAssets(projectConfig);
    const plan = buildImportPlan(body.level, blockoutMapping, catalog, projectConfig, parametricBlocks);
    if (body.mode !== "apply") {
      sendJson(response, 200, plan);
      return true;
    }

    if (body.confirmProjectName !== projectConfig.projectName) {
      sendJson(response, 400, {
        error: `Apply requires confirmProjectName=${projectConfig.projectName}.`,
      });
      return true;
    }
    const status = await getUnrealStatus(projectConfig);
    if (!status.projectMatches || !status.projectPathMatches) {
      sendJson(response, 409, {
        error: `Connected editor is ${status.editor.project_file}, expected ${projectConfig.uprojectPath}.`,
      });
      return true;
    }

    const applyResult = await applyImportPlan(plan, projectConfig, {
      replaceExisting: body.replaceExisting === true,
    });
    sendJson(response, applyResult.errors.length === 0 ? 200 : 207, {
      plan,
      applyResult,
    });
    return true;
  }

  return false;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    try {
      const handled = await handleApiRequest(request, response, url);
      if (!handled) {
        sendJson(response, 404, { error: "API endpoint not found." });
      }
    } catch (error) {
      const status = error.statusCode
        ?? (error instanceof SyntaxError || error instanceof TypeError ? 400 : 503);
      sendJson(response, status, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/vendor/layout-tools-0.0.2-bridged.js") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Length": Buffer.byteLength(bridgedVendorSource),
    });
    response.end(bridgedVendorSource);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method Not Allowed");
    return;
  }

  const filePath = await resolveFilePath(request.url ?? "/");

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(PORT, HOST, () => {
  console.log(`LayoutTools Local: http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
