# Releasing Skillpack

Skillpack is published to npm as a single package `skillpack-tui`. Users install it via `npx skillpack-tui` or `npm i -g skillpack-tui`.

## Build Architecture

```
packages/core (source)  ──┐
                          ├─ tsup bundle ──▶ dist/skillpack.js (single-file ESM)
packages/tui  (source)  ──┘
```

- `@skillpack/core` source is inlined into the bundle — it is not published separately
- npm dependencies (`yaml`) remain external as runtime dependencies
- No sourcemaps in production; no minification (add `minify: true` in `tsup.config.ts` if needed)

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
pnpm install            # ensure dependencies are up to date
pnpm test               # run all tests
```

### 2. Build and verify output

```bash
pnpm build              # triggers tsup bundling

# verify output
ls -lh packages/tui/dist/skillpack.js   # confirm single-file output
node packages/tui/dist/skillpack.js     # local smoke test (requires TTY)
```

### 3. Preview package contents

```bash
cd packages/tui
npm pack --dry-run      # preview files that will be published
```

Expected output should contain `dist/skillpack.js`, `package.json`, and `README.md`.

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

The `prepublishOnly` script automatically runs `tsup` before publishing.

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
pnpm test && pnpm build
cd packages/tui
npm version patch
npm publish
git push && git push --tags
```
