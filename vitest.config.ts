import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

function rawTextPlugin(): Plugin {
  return {
    name: "raw-text",
    transform(_code, id) {
      if (id.endsWith(".html") || id.endsWith(".xml")) {
        const content = readFileSync(id, "utf-8");
        return {
          code: `export default ${JSON.stringify(content)};`,
          map: null,
        };
      }
    },
  };
}

export default defineWorkersConfig({
  plugins: [rawTextPlugin()],
  resolve: {
    alias: {
      "@email": resolve(__dirname, "src/email/index.ts"),
      "@coverflex": resolve(__dirname, "src/coverflex/index.ts"),
      "@xToRss": resolve(__dirname, "src/xToRss/index.ts"),
      "@fetchToRss": resolve(__dirname, "src/fetchToRss/index.ts"),
      "@rss/common": resolve(__dirname, "src/rss/common.ts"),
      "@rss/types": resolve(__dirname, "src/rss/types.ts"),
      "@rss": resolve(__dirname, "src/rss/index.ts"),
      "@types": resolve(__dirname, "src/types.ts"),
    },
  },
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
