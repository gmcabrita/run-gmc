import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// Worker settings and bindings live in cloudflare.config.ts. `cf build` and
// `cf dev` run Vite with this config.
export default defineConfig({
  build: {
    // Sentry and `cf deploy` read source maps from the build output.
    minify: true,
    sourcemap: true,
  },
  plugins: [cloudflare()],
  resolve: {
    // Resolve the `@email`, `@rss`, and other path aliases from tsconfig.json.
    tsconfigPaths: true,
  },
});
