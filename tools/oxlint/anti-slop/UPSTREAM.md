# Anti-slop source record

## Source

- Repository: https://github.com/dmmulroy/anti-slop
- Incoming commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`.
- Source path: `skills/install-anti-slop/assets/anti-slop/`.
- Installed paths: `tools/oxlint/anti-slop/index.ts` and `effect/index.ts`.
- Previous base: `6d538555cb151d4121ed51a27db81890eacf8ae9`.
  Every previous plugin file matched that commit's bundled assets byte for byte.
- The refreshed `.agents/skills/install-anti-slop/` matches the incoming commit.
  `skills-lock.json` records its updated hash.

The complete incoming snapshot was adopted. Canonical upstream production files
in `src/` match the bundled assets. The local deviations below are the only
plugin differences from the incoming snapshot.

## Local policy and deviations

- Preserve the existing `oxlint.config.ts`: the nkzw preset, correctness errors,
  complexity limit of 12, console overrides, ignores, plugin path, and all
  existing rule severities.
- Preserve the formatter configuration.
- Keep `oxlint` and `@oxlint/plugins` at the installed version `1.80.0`.
  Tests confirmed compatibility; dependency manifests and lockfile were retained.
- Fix named class expression scope in `shared/type-alias-resolution.ts`.
  Upstream incorrectly makes the class name visible in the enclosing block.
  This can hide an outer alias or the built-in `Record` and suppress diagnostics.
  Local bindings use the class expression itself as their scope.
- Add `shared/type-alias-resolution.rule-test.ts` with 11 regression cases.
  Its suffix excludes the Node tests from the Workers Vitest suite.
- Preserve the nested `vendor/eslint-stylistic/LICENSE` and `UPSTREAM.md`.

## Rules awaiting approval

New implementations are exported but not enabled. Proposed severity: `error`.

- `anti-slop/no-array-filter-map`
- `anti-slop/no-reduce-accumulator-copy`
- `anti-slop/require-readable-spacing`
- Native companion: `oxc/no-accumulating-spread`

The Effect plugin remains unregistered. The project has no direct Effect
dependency. Its four new rules are available in the copied Effect entry point.

## Verification

- Repository lint and typecheck passed before and after the update.
- All 24 upstream test files passed against the local plugin and installed
  dependencies. This includes the spacing CLI test and repeat autofix check.
  Tests came from the exact incoming commit; temporary production file links
  selected `tools/oxlint/anti-slop/` for each test import.
- Four local regression cases failed against pristine incoming source.
  All 11 cases passed after the class scope fix. Repeat with:
  `node tools/oxlint/anti-slop/shared/type-alias-resolution.rule-test.ts`.
- Explicit plugin typecheck passed with upstream compiler options and the
  installed Node types. The application tsconfig excludes this plugin.
- `git diff --check` passed.
- Application Vitest tests were not run; application source was not changed.

Known upstream limitation: nested uses of the same generic alias, such as
`Identity<Identity<unknown>>`, can escape `no-unknown-returns`. This remains
unresolved and limits the new generic alias support.

Backup retained at `/tmp/run-gmc-anti-slop.8VuKTt/`: `plugin-backup/` and
`skill-backup/`. The previous repository commit retains the configuration and
lockfiles. Keep the local scope fix and tests when merging future updates.
