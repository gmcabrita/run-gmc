import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import cloudflareConfig from "./cloudflare.config";

// vitest-pool-workers reads only Wrangler config files. Pass the runtime
// settings and bindings from cloudflare.config.ts to Miniflare. Tests use local
// KV and email bindings. Secrets are not loaded.
function getMiniflareOptions() {
  const { compatibilityDate, compatibilityFlags, env } = cloudflareConfig.worker;
  const bindings: Record<string, string> = {};
  const kvNamespaces: Record<string, string> = {};
  const sendEmail: Array<{ name: string }> = [];
  let versionMetadata: string | undefined;
  for (const [name, binding] of Object.entries(env)) {
    switch (binding.type) {
      case "text":
        bindings[name] = binding.value;
        break;
      case "kv":
        kvNamespaces[name] = name;
        break;
      case "send-email":
        sendEmail.push({ name });
        break;
      case "version-metadata":
        versionMetadata = name;
        break;
    }
  }
  return {
    bindings,
    compatibilityDate,
    compatibilityFlags,
    email: { send_email: sendEmail },
    kvNamespaces,
    versionMetadata,
  };
}

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
      main: cloudflareConfig.worker.entrypoint,
      miniflare: getMiniflareOptions(),
      remoteBindings: false,
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
