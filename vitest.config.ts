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
      "@coverflex": resolve(__dirname, "src/coverflex/index.ts"),
      "@email": resolve(__dirname, "src/email/index.ts"),
      // Specific aliases must precede the matching prefix alias.
      "@rss/common": resolve(__dirname, "src/rss/common.ts"),
      "@rss/healthcheck": resolve(__dirname, "src/rss/healthcheck.ts"),
      "@rss/mangaDex": resolve(__dirname, "src/rss/mangaDex.ts"),
      "@rss/types": resolve(__dirname, "src/rss/types.ts"),
      // Keep this prefix alias after all specific RSS aliases.
      "@rss": resolve(__dirname, "src/rss/index.ts"),
      "@types": resolve(__dirname, "src/types.ts"),
      "@x": resolve(__dirname, "src/x/index.ts"),
    },
  },
});
