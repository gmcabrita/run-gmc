import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

function rawTextPlugin(): Plugin {
  return {
    name: "raw-text",
    transform(_code, id) {
      if (id.endsWith(".html") || id.endsWith(".xml")) {
        const content = readFileSync(id, "utf8");
        return {
          code: `export default ${JSON.stringify(content)};`,
          map: null,
        };
      }
    },
  };
}

export default defineConfig({
  plugins: [
    rawTextPlugin(),
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  resolve: {
    alias: {
      "@coverflex": resolve(import.meta.dirname, "src/coverflex/index.ts"),
      "@email": resolve(import.meta.dirname, "src/email/index.ts"),
      // Specific aliases must precede the matching prefix alias.
      "@rss/common": resolve(import.meta.dirname, "src/rss/common.ts"),
      "@rss/healthcheck": resolve(import.meta.dirname, "src/rss/healthcheck.ts"),
      "@rss/mangaDex": resolve(import.meta.dirname, "src/rss/mangaDex.ts"),
      "@rss/types": resolve(import.meta.dirname, "src/rss/types.ts"),
      // Keep this prefix alias after all specific RSS aliases.
      "@rss": resolve(import.meta.dirname, "src/rss/index.ts"),
      "@types": resolve(import.meta.dirname, "src/types.ts"),
      "@x": resolve(import.meta.dirname, "src/x/index.ts"),
    },
  },
});
