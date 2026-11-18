import nkzwConfig from "@nkzw/oxlint-config/with-sorting";
import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
  },
  extends: [nkzwConfig],
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
