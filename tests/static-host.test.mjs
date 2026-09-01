import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const TEST_PORT = Number(process.env.LAYOUT_TOOLS_TEST_PORT ?? 4274);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function waitUntilReady(process) {
  const timeoutAt = Date.now() + 5_000;

  while (Date.now() < timeoutAt) {
    if (process.exitCode !== null) {
      throw new Error(`Static server exited with code ${process.exitCode}.`);
    }

    try {
      const response = await fetch(BASE_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // The server may still be binding its port.
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Static server did not become ready in time.");
}

test("serves the local host and vendor application", async (context) => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "layout-tools-host-"));
  const server = spawn(process.execPath, ["scripts/serve.mjs"], {
    env: {
      ...process.env,
      LAYOUT_TOOLS_DATA_DIR: dataDirectory,
      LAYOUT_TOOLS_PORT: String(TEST_PORT),
    },
    stdio: "ignore",
  });

  context.after(async () => {
    if (server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  });
  await waitUntilReady(server);

  const indexResponse = await fetch(BASE_URL);
  assert.equal(indexResponse.status, 200);
  assert.match(await indexResponse.text(), /src\/main\.js/);

  const vendorResponse = await fetch(`${BASE_URL}/vendor/layout-tools-0.0.2.js`);
  assert.equal(vendorResponse.status, 200);
  assert.match(vendorResponse.headers.get("content-type"), /^text\/javascript/);
  assert.ok((await vendorResponse.arrayBuffer()).byteLength > 3_000_000);

  const bridgedVendorResponse = await fetch(`${BASE_URL}/vendor/layout-tools-0.0.2-bridged.js`);
  assert.equal(bridgedVendorResponse.status, 200);
  const bridgedVendor = await bridgedVendorResponse.text();
  assert.match(bridgedVendor, /window\.__LAYOUT_TOOLS_STORE__=He/);

  const traversalResponse = await fetch(`${BASE_URL}/..%2Fpackage.json`);
  assert.equal(traversalResponse.status, 404);

  const mappingResponse = await fetch(`${BASE_URL}/api/ue/mapping`);
  assert.equal(mappingResponse.status, 200);
  const mappingPayload = await mappingResponse.json();
  assert.equal(mappingPayload.project.projectName, "MYMY");
  assert.equal(mappingPayload.parametricBlockCount, 15);
  assert.equal(mappingPayload.parametricBlocks.pluginVersion, "1.52");

  const iconResponse = await fetch(`${BASE_URL}/assets/blockout-icons/Blockout_Box_64.png`);
  assert.equal(iconResponse.status, 200);
  assert.match(iconResponse.headers.get("content-type"), /^image\/png/);

  const level = {
    name: "HTTP 本地关卡",
    shapes: [{ id: "floor", type: "rect" }],
    entities: [],
    layers: [{ id: "base", name: "Base" }],
  };
  const saveResponse = await fetch(`${BASE_URL}/api/local-levels/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: "接口测试", level }),
  });
  assert.equal(saveResponse.status, 200);
  assert.equal((await saveResponse.json()).file.name, "接口测试.json");

  const libraryResponse = await fetch(`${BASE_URL}/api/local-levels`);
  assert.equal(libraryResponse.status, 200);
  const library = await libraryResponse.json();
  assert.equal(library.directory, dataDirectory);
  assert.equal(library.autosaveDelayMs, 800);
  assert.equal(library.restoreFile, "接口测试.json");
  assert.deepEqual(library.files.map((file) => file.name), ["接口测试.json"]);

  const openResponse = await fetch(
    `${BASE_URL}/api/local-levels/open?file=${encodeURIComponent("接口测试.json")}`,
  );
  assert.equal(openResponse.status, 200);
  assert.deepEqual((await openResponse.json()).level, level);

  const unsafeResponse = await fetch(
    `${BASE_URL}/api/local-levels/open?file=${encodeURIComponent("../package.json")}`,
  );
  assert.equal(unsafeResponse.status, 400);
});
