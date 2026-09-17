import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { projectLibraryPlugin } from "./server/project-library";

export default defineConfig({
  plugins: [react(), projectLibraryPlugin()],
  server: {
    port: 4174,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
