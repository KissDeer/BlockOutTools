import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  injectVendorStoreBridge,
  VENDOR_STORE_ANCHOR,
} from "../src/runtime/vendor-bridge.mjs";

test("injects the editor store at the single known vendor anchor", async () => {
  const source = await readFile(new URL("../vendor/layout-tools-0.0.2.js", import.meta.url), "utf8");
  assert.equal(source.split(VENDOR_STORE_ANCHOR).length - 1, 1);

  const bridged = injectVendorStoreBridge(source);
  assert.match(bridged, /window\.__LAYOUT_TOOLS_STORE__=He/);
  assert.equal(bridged.length > source.length, true);
});

test("fails clearly when a vendor update removes the compatibility anchor", () => {
  assert.throws(
    () => injectVendorStoreBridge("updated vendor"),
    /must occur exactly once/,
  );
});
