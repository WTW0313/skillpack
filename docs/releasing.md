# Releasing Skillpack

Skillpack is published to npm as a single package `skillpack-tui`. Users install it via `npx skillpack-tui` or `npm i -g skillpack-tui`.

## Build Architecture

```
packages/core (source) ── Vite+ Pack ──▶ packages/core/dist/index.js + index.d.ts
          │
          └────────────── inlined by Vite+ Pack ──▶ packages/tui/dist/skillpack.js
packages/tui (source) ────────────────────────────▶ (single-file ESM CLI)
```

- `@skillpack/core` source is inlined into the bundle — it is not published separately
- Package runtime dependencies remain external; Core's `acorn` implementation is bundled into the CLI
- Production artifacts are unminified and contain no sourcemaps
- `pnpm build:ci` verifies the exact Core and CLI artifact shape, executable CLI shebang, ESM syntax, and package dry-run contents

## Prerequisites

1. Make sure you have an npm account and are logged in:

```bash
npm login
npm whoami  # verify login status
```

2. Verify the `skillpack-tui` package name is available (before first publish):

```bash
npm view skillpack-tui
```

## Release Steps

### 1. Verify code status

```bash
git status              # ensure clean working tree
pnpm install --frozen-lockfile
pnpm check:ci
pnpm test:ci
```

### 2. Build and verify output

```bash
pnpm build:ci           # builds and verifies both packages

# verify output
ls -lh packages/tui/dist/skillpack.js   # confirm single-file output
node packages/tui/dist/skillpack.js     # local smoke test (requires TTY)
```

### 3. Preview package contents

```bash
pnpm --dir packages/tui pack --dry-run --json
```

Expected output contains only `dist/skillpack.js`, `LICENSE`, `package.json`, and `README.md`.

### 4. Bump version

```bash
cd packages/tui
npm version patch       # 0.1.0 → 0.1.1 (bug fix)
# or
npm version minor       # 0.1.0 → 0.2.0 (new feature)
# or
npm version major       # 0.1.0 → 1.0.0 (breaking change)
```

`npm version` automatically updates `package.json` and creates a git commit + tag.

### 5. Publish to npm

```bash
cd packages/tui
npm publish
```

The `prepublishOnly` script automatically runs the same check, test, build, and artifact-verification flow used by CI before publishing.

### 6. Push tag to GitHub

```bash
git push && git push --tags
```

### 7. Verify the release

```bash
npm view skillpack-tui                  # confirm version is live
npx skillpack-tui                       # run directly from npm to verify
```

## Versioning

Follows [Semantic Versioning](https://semver.org/):

| Change type | Bump | Example |
|-------------|------|---------|
| Bug fixes, minor tweaks | `patch` | 0.1.0 → 0.1.1 |
| New features, backward-compatible | `minor` | 0.1.0 → 0.2.0 |
| Breaking changes | `major` | 0.1.0 → 1.0.0 |

## Rollback

If a problematic version was published:

```bash
npm unpublish skillpack-tui@<version>   # allowed within 72 hours
# or
npm deprecate skillpack-tui@<version> "reason"  # mark as deprecated (preferred)
```

## Quick Reference

Full release from the project root:

```bash
pnpm check:ci
pnpm test:ci
pnpm build:ci
cd packages/tui
npm version patch
npm publish
git push && git push --tags
```
