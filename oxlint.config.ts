import cloudflareConfig from "@cloudflare/oxlint-config";
import nkzwConfig from "@nkzw/oxlint-config/with-sorting";
import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
  },
  // `extends` drops preset envs, so they are declared here.
  env: {
    es2024: true,
    node: true,
    worker: true,
  },
  extends: [nkzwConfig, cloudflareConfig],
  ignorePatterns: [
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
    ".cloudflare/**",
  ],
  overrides: [
    {
      files: ["bin/**/*.ts", "src/email/**/*.ts", "src/index.ts"],
      rules: {
        "no-console": "off",
      },
    },
  ],
  rules: {
    complexity: ["error", { max: 12 }],
  },
});
