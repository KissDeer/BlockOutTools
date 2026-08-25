import assert from "node:assert/strict";
import test from "node:test";

import { formatExportDimension } from "../src/integrations/layout/export-dimension-labels.js";

test("formats edge dimensions with the configured export multiplier", () => {
  const level = { exportScale: { unitsPerPixel: 50, unit: "uu" } };
  assert.equal(formatExportDimension("380", level), "19000");
  assert.equal(formatExportDimension("R215", level), "R10750");
  assert.equal(formatExportDimension("room 380", level), null);
});

test("uses one-to-one centimeters when export scale is absent or invalid", () => {
  assert.equal(formatExportDimension("180", {}), "180");
  assert.equal(formatExportDimension("180", { exportScale: { unitsPerPixel: 0, unit: "uu" } }), "180");
});
