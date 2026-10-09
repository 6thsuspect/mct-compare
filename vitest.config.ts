import { defineConfig } from "vitest/config";
import path from "node:path";

const root = __dirname;
const alias = (name: string, pkg: string) => ({
  find: name,
  replacement: path.resolve(root, `packages/${pkg}/src/index.ts`),
});

export default defineConfig({
  resolve: {
    alias: [
      alias("@mct/shared-types", "shared-types"),
      alias("@mct/parser", "mct-parser"),
      alias("@mct/diff", "mct-diff"),
      alias("@mct/converter", "mct-converter"),
      alias("@mct/validation", "mct-validation"),
    ],
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/cli/src/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    testTimeout: 60000,
  },
});
