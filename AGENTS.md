# AGENTS.md

## Cursor Cloud specific instructions

This is a **Cloudflare Worker** project using Hono, deployed to `run.gmcabrita.com`. It's a personal automation API that scrapes websites into RSS feeds, converts ICS calendars to Google Calendar URLs, proxies Portuguese train data, and sends email notifications.

### Running services

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start Wrangler local dev server on `http://localhost:8787` |
| `pnpm test -- --run` | Run full Vitest suite (128 tests, uses `@cloudflare/vitest-pool-workers`) |
| `pnpm typecheck` | Type-check with `tsgo --noEmit` |
| `pnpm build` | Dry-run deploy to `dist/` |

### Gotchas

- **Wrangler interactive prompt**: `wrangler dev` may prompt "Would you like to install Cloudflare skills?" on first run. Answer `n` (or press Enter) to proceed. In non-interactive environments, set `WRANGLER_CI=1` environment variable to suppress all prompts.
- **`.dev.vars` required**: Copy `.dev.vars.example` to `.dev.vars` before running `pnpm dev`. The dev server reads secrets from this file. Dummy values are fine for local development (emails won't send unless `ENVIRONMENT=production`).
- **No auth needed for RSS/ICS endpoints**: RSS scraper endpoints (`/rss.*`) and the ICS endpoint (`POST /ics2gcal`) work without authentication. The root `/` and healthcheck endpoints require basic auth (credentials from `.dev.vars`).
- **Tests are self-contained**: The test suite uses HTML fixture files and the Cloudflare Workers vitest pool; no external services or real credentials are needed.
- **Scheduled triggers**: Test cron handlers locally via `curl http://localhost:8787/cdn-cgi/handler/scheduled`.
- **Compatibility date warning**: Tests may log `[mf:warn]` about compatibility date mismatch — this is harmless and expected.
