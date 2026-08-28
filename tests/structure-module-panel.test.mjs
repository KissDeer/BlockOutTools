import test from "node:test";
import assert from "node:assert/strict";

import { structureCanvasShortcut } from "../src/integrations/layout/structure-module-panel.js";

test("maps conventional structure canvas shortcuts", () => {
  assert.equal(structureCanvasShortcut({ key: "c", ctrlKey: true }), "copy");
  assert.equal(structureCanvasShortcut({ key: "V", metaKey: true }), "paste");
  assert.equal(structureCanvasShortcut({ key: "d", ctrlKey: true }), "duplicate");
  assert.equal(structureCanvasShortcut({ key: "Delete" }), "delete");
});

test("ignores modified, repeated, and unrelated shortcut keys", () => {
  assert.equal(structureCanvasShortcut({ key: "c", ctrlKey: true, altKey: true }), null);
  assert.equal(structureCanvasShortcut({ key: "Delete", repeat: true }), null);
  assert.equal(structureCanvasShortcut({ key: "Backspace" }), null);
  assert.equal(structureCanvasShortcut({ key: "a", ctrlKey: true }), null);
});
