import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { projectLibraryPlugin } from "./server/project-library";
import { conceptBridgePlugin } from "./server/concept-bridge";

export default defineConfig({
  plugins: [react(), projectLibraryPlugin(), conceptBridgePlugin()],
  server: {
    port: 4174,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
