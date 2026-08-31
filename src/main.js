import { APP_CONFIG } from "./runtime/app-config.js";
import { mountLocalLevelLibrary } from "./integrations/local/library-panel.js";
import { mountExportDimensionLabels } from "./integrations/layout/export-dimension-labels.js";
import { mountBlockoutRulesPanel } from "./integrations/layout/blockout-rules-panel.js";
import { mountEditorWorkflowPanel } from "./integrations/layout/editor-workflow-panel.js";
import { mountStructureModulePanel } from "./integrations/layout/structure-module-panel.js";
import { mountUeBridge } from "./integrations/ue/bridge-panel.js";
import { loadVendorApp } from "./runtime/load-vendor-app.js";
import { renderBootError } from "./runtime/render-boot-error.js";

async function bootstrap() {
  try {
    await loadVendorApp(APP_CONFIG);
    await mountLocalLevelLibrary();
    mountExportDimensionLabels();
    mountBlockoutRulesPanel();
    mountEditorWorkflowPanel();
    mountStructureModulePanel();
    mountUeBridge();
  } catch (error) {
    console.error("LayoutTools failed to start.", error);
    renderBootError(APP_CONFIG.rootId, error);
  }
}

void bootstrap();
