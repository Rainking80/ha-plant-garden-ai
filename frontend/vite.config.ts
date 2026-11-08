import { defineConfig } from "vitest/config";

// Builds one ES module that Home Assistant loads as the panel's module_url.
// The output lives inside the integration so that HACS ships it unchanged.
export default defineConfig(({ mode }) => ({
  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "plant-garden-panel.js",
    },
    outDir: "../custom_components/plant_garden/frontend",
    emptyOutDir: true,
    target: "es2022",
    minify: mode !== "development",
    sourcemap: mode === "development" ? "inline" : false,
    reportCompressedSize: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
}));
