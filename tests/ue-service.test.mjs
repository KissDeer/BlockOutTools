import assert from "node:assert/strict";
import test from "node:test";

import { buildApplyImportPython } from "../src/integrations/ue/ue-service.js";

const projectConfig = {
  actorTag: "BlockOutToolsBridge",
};

test("generated UE import script relies on property notifications and cleans failed actors", () => {
  const code = buildApplyImportPython({ actorFolder: "BlockOutToolsBridge", actors: [] }, projectConfig);

  assert.match(code, /actor\.set_editor_property\(property_name, value\)/);
  assert.doesNotMatch(code, /rerun_construction_scripts/);
  assert.match(code, /if actor:\s+try:\s+unreal\.EditorLevelLibrary\.destroy_actor\(actor\)/s);
});
