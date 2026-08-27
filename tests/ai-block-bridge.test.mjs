import assert from "node:assert/strict";
import test from "node:test";

import {
  augmentAiRequestBody,
  CATALOG_MARKER,
  createAiCatalogInstruction,
  installAiBlockBridge,
} from "../src/integrations/layout/ai-block-bridge.js";

const instruction = createAiCatalogInstruction([
  { source: "original", id: "original-rectangle", kind: "shape", shapeType: "rect" },
  { source: "original", id: "module-port", kind: "shape", shapeType: "rect", moduleOnly: true },
  {
    source: "ue",
    blockType: "box",
    form: "长方体",
    shapeType: "rect",
    blueprintClassPath: "/BlockoutToolsPlugin/Blueprints/Blockout_Box.Blockout_Box_C",
    parameters: [{ key: "BoxSize", type: "vector3", default: [100, 100, 100] }],
    commonParameters: [],
  },
]);

test("adds the shared block catalog to Chat Completions only once", () => {
  const body = { messages: [{ role: "system", content: "Generate a level." }] };
  const once = augmentAiRequestBody(body, instruction);
  const twice = augmentAiRequestBody(once, instruction);

  assert.match(once.messages[0].content, new RegExp(CATALOG_MARKER));
  assert.equal(twice.messages[0].content.match(new RegExp(CATALOG_MARKER, "g")).length, 1);
  assert.equal(body.messages[0].content, "Generate a level.");
  assert.match(once.messages[0].content, /structureGraph/);
  assert.match(once.messages[0].content, /ownsSourceLayer/);
  assert.match(once.messages[0].content, /shape\.modulePort/);
  assert.match(once.messages[0].content, /不得为方便连接而自行新增/);
  assert.match(once.messages[0].content, /one-way-elevator/);
});

test("supports Anthropic, Responses and Gemini request formats", () => {
  assert.match(augmentAiRequestBody({ system: "Layout" }, instruction).system, new RegExp(CATALOG_MARKER));
  assert.match(
    augmentAiRequestBody({ instructions: "Layout", input: "A room" }, instruction).instructions,
    new RegExp(CATALOG_MARKER),
  );
  assert.equal(
    augmentAiRequestBody({ contents: [{ role: "user", parts: [{ text: "A room" }] }] }, instruction)
      .systemInstruction.parts[0].text,
    instruction,
  );
});

test("intercepts a provider request without copying credentials into the prompt", async () => {
  let captured;
  globalThis.window = {
    fetch: async (input, init) => {
      captured = { input, init };
      return new Response("{}");
    },
  };

  try {
    installAiBlockBridge([
      {
        source: "ue",
        blockType: "box",
        form: "长方体",
        shapeType: "rect",
        blueprintClassPath: "/BlockoutToolsPlugin/Blueprints/Blockout_Box.Blockout_Box_C",
        parameters: [{ key: "BoxSize", type: "vector3", default: [100, 100, 100] }],
        commonParameters: [],
      },
    ]);
    await window.fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "A room" }] }),
    });

    const sentBody = JSON.parse(captured.init.body);
    assert.match(sentBody.messages[0].content, new RegExp(CATALOG_MARKER));
    assert.match(sentBody.messages[0].content, /Blockout_Box_C/);
    assert.doesNotMatch(sentBody.messages[0].content, /"assetId"\s*:/);
    assert.equal(JSON.stringify(sentBody).includes("test-secret"), false);
    assert.equal(captured.init.headers.Authorization, "Bearer test-secret");
  } finally {
    delete globalThis.window;
  }
});
