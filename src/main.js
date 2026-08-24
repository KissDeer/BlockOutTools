import { APP_CONFIG } from "./runtime/app-config.js";
import { mountUeBridge } from "./integrations/ue/bridge-panel.js";
import { loadVendorApp } from "./runtime/load-vendor-app.js";
import { renderBootError } from "./runtime/render-boot-error.js";

async function bootstrap() {
  try {
    await loadVendorApp(APP_CONFIG);
    mountUeBridge();
  } catch (error) {
    console.error("LayoutTools failed to start.", error);
    renderBootError(APP_CONFIG.rootId, error);
  }
}

void bootstrap();
