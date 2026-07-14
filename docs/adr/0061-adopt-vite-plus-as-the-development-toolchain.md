---
status: accepted
---

# Adopt Vite+ as the development toolchain

Skillpack will keep pnpm as its dependency and workspace manager while adopting an exact-pinned Vite+ version for shared formatting, type-aware linting and checks, package-scoped tests, and package builds. Every layer will be tried, but test and build migration are conditional on preserving existing behavior, the package-root `@skillpack/core` contract, and the single-file Node.js TUI artifact; a layer that fails parity keeps its current Vitest, `tsc`, or `tsup` implementation without a Vite+-specific workaround. CI will use explicit `:ci` package-script entry points, while the root Vite+ configuration owns shared checks and package configurations own test and build behavior.

All parity gates passed. Core packaging now emits only its supported root `index.js` and `index.d.ts` contract, while TUI packaging inlines Core into one unminified executable ESM file with a Node.js shebang and no source map. Tests use `vite-plus/test` and remain package-scoped and non-watching. Artifact shape and package contents are executable CI checks, and the standalone Vitest and tsup dependencies and configuration have been removed.
