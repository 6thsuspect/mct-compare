import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const root = __dirname;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@mct/shared-types",
        replacement: path.resolve(root, "../../packages/shared-types/src/index.ts"),
      },
      {
        find: "@mct/parser",
        replacement: path.resolve(root, "../../packages/mct-parser/src/index.ts"),
      },
      {
        find: "@mct/diff",
        replacement: path.resolve(root, "../../packages/mct-diff/src/index.ts"),
      },
      {
        find: "@mct/converter",
        replacement: path.resolve(root, "../../packages/mct-converter/src/index.ts"),
      },
      {
        find: "@mct/validation",
        replacement: path.resolve(root, "../../packages/mct-validation/src/index.ts"),
      },
    ],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Allow browser-preview proxy hosts (exact host varies per sandbox).
    allowedHosts: [".e2b.app"],
  },
  worker: {
    format: "es",
  },
});
