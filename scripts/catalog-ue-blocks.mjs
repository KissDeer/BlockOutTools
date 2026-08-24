import { readFile } from "node:fs/promises";

import { catalogBlockoutAssets } from "../src/integrations/ue/ue-service.js";

const projectConfig = JSON.parse(
  await readFile(new URL("../config/ue-project.json", import.meta.url), "utf8"),
);

try {
  console.log(JSON.stringify(await catalogBlockoutAssets(projectConfig), null, 2));
} catch (error) {
  console.error(`Unable to catalog UE blockout assets: ${error.message}`);
  process.exitCode = 1;
}
