import { defineConfig } from "vite";

/** Builds src/theme/runtime.ts into dist/storefront.js: the script published storefronts load. */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: "src/theme/runtime.ts", formats: ["iife"], name: "YanceyStorefrontRuntime", fileName: () => "storefront.js" },
  },
});
