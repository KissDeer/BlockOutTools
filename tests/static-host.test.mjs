import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const TEST_PORT = 4174;
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
  const server = spawn(process.execPath, ["scripts/serve.mjs"], {
    env: { ...process.env, LAYOUT_TOOLS_PORT: String(TEST_PORT) },
    stdio: "ignore",
  });

  context.after(() => server.kill("SIGTERM"));
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
});
