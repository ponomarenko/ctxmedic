# Changelog

## [0.3.0](https://github.com/ponomarenko/ctxmedic/compare/v0.2.4...v0.3.0) (2026-11-22)


### Features

* **core:** ESLint-style rule configuration ([#50](https://github.com/ponomarenko/ctxmedic/issues/50)) ([a6a564b](https://github.com/ponomarenko/ctxmedic/commit/a6a564bea599d3945a7bd13ac0420a0dfe2bcc34))

## [0.2.4](https://github.com/ponomarenko/ctxmedic/compare/v0.2.3...v0.2.4) (2026-11-22)


### Bug Fixes

* linear-time secret scan and escaped Action summary cells ([#48](https://github.com/ponomarenko/ctxmedic/issues/48)) ([ab1d16e](https://github.com/ponomarenko/ctxmedic/commit/ab1d16e136e87a7dc3ccfcc0e059b81a40260928))

## [0.2.3](https://github.com/ponomarenko/ctxmedic/compare/v0.2.2...v0.2.3) (2026-11-22)


### Continuous Integration

* pin the supply chain and add OpenSSF Scorecard ([#45](https://github.com/ponomarenko/ctxmedic/issues/45)) ([3303c5d](https://github.com/ponomarenko/ctxmedic/commit/3303c5d314c86874c12feeae12bc3c85ab979148))
* scope release token permissions and patch esbuild ([#47](https://github.com/ponomarenko/ctxmedic/issues/47)) ([48b54ab](https://github.com/ponomarenko/ctxmedic/commit/48b54ab659ff0831f621b9f90860fd80fb26798d))

## [0.2.2](https://github.com/ponomarenko/ctxmedic/compare/v0.2.1...v0.2.2) (2026-11-22)


### Build System

* Bump @anthropic-ai/sdk from 0.70.1 to 1.11.0 ([#36](https://github.com/ponomarenko/ctxmedic/issues/36)) ([fa21984](https://github.com/ponomarenko/ctxmedic/commit/fa21984dbac8aa25a1619c393dafed481461de60))

## [0.2.1](https://github.com/ponomarenko/ctxmedic/compare/v0.2.0...v0.2.1) (2026-11-22)


### Bug Fixes

* **deps:** upgrade zod to 4 ([#43](https://github.com/ponomarenko/ctxmedic/issues/43)) ([b4eefb3](https://github.com/ponomarenko/ctxmedic/commit/b4eefb3f2c635f719641d2837a459fee4b19ab8a))


### Documentation

* pin the GitHub Action to v0 in the README ([#42](https://github.com/ponomarenko/ctxmedic/issues/42)) ([088fa65](https://github.com/ponomarenko/ctxmedic/commit/088fa654e6cd49b35e3698814bbc2d14f40cfdb3))


### Continuous Integration

* fix the major tag step and allow re-publishing a release ([#40](https://github.com/ponomarenko/ctxmedic/issues/40)) ([1110feb](https://github.com/ponomarenko/ctxmedic/commit/1110febf6e69624c8512aaf8bafb32e90020c261))


### Build System

* Bump vite from 6.4.6 to 8.3.8 ([#38](https://github.com/ponomarenko/ctxmedic/issues/38)) ([06396bc](https://github.com/ponomarenko/ctxmedic/commit/06396bc19bd3ffe793d9dd11a7409806ebef04ee))
* Bump vitest from 2.1.9 to 4.1.11 ([#39](https://github.com/ponomarenko/ctxmedic/issues/39)) ([33787ae](https://github.com/ponomarenko/ctxmedic/commit/33787aeceffaaf72ac02f26a0dd6b67808d63d7c))

## [0.2.0](https://github.com/ponomarenko/ctxmedic/compare/v0.1.0...v0.2.0) (2026-11-22)


### Features

* add a GitHub Action CI gate ([#21](https://github.com/ponomarenko/ctxmedic/issues/21)) ([eef5376](https://github.com/ponomarenko/ctxmedic/commit/eef5376219c9b55587b25734de39cdae84327ab8)), closes [#12](https://github.com/ponomarenko/ctxmedic/issues/12)
* add ctxmedic restore to undo fixes from backups ([#19](https://github.com/ponomarenko/ctxmedic/issues/19)) ([34c14df](https://github.com/ponomarenko/ctxmedic/commit/34c14df7a39e029f90f602a8e9bf309523d6097c)), closes [#4](https://github.com/ponomarenko/ctxmedic/issues/4)
* measure real MCP schema sizes for FIN_UNUSED_MCP ([#22](https://github.com/ponomarenko/ctxmedic/issues/22)) ([88a2314](https://github.com/ponomarenko/ctxmedic/commit/88a23146e6096d5aa8a965f782ac1f552cfc7b3c)), closes [#5](https://github.com/ponomarenko/ctxmedic/issues/5)


### Bug Fixes

* compare history only between visits with the same scan options ([#20](https://github.com/ponomarenko/ctxmedic/issues/20)) ([7ddd1ca](https://github.com/ponomarenko/ctxmedic/commit/7ddd1cac456dc451b155eca61fdb97781f987a7c)), closes [#7](https://github.com/ponomarenko/ctxmedic/issues/7)


### Tests

* cover the CLI and the local API server ([#18](https://github.com/ponomarenko/ctxmedic/issues/18)) ([9c84692](https://github.com/ponomarenko/ctxmedic/commit/9c84692aef623fb08e55c974bd069f08e330b545)), closes [#8](https://github.com/ponomarenko/ctxmedic/issues/8)


### Continuous Integration

* Bump actions/checkout from 4 to 7 ([#26](https://github.com/ponomarenko/ctxmedic/issues/26)) ([d51c237](https://github.com/ponomarenko/ctxmedic/commit/d51c237604879ffc96c89856a46975eb8c911446))
* Bump actions/setup-node from 4 to 7 ([#27](https://github.com/ponomarenko/ctxmedic/issues/27)) ([637e3a3](https://github.com/ponomarenko/ctxmedic/commit/637e3a32b7a2875ffc642c4d7a85c00dd395a7ab))
* Bump googleapis/release-please-action from 4 to 5 ([#29](https://github.com/ponomarenko/ctxmedic/issues/29)) ([4cc3c6c](https://github.com/ponomarenko/ctxmedic/commit/4cc3c6c84a56701a8008a4c15c0e59b91ab54056))
* Bump pnpm/action-setup from 4 to 6 ([#28](https://github.com/ponomarenko/ctxmedic/issues/28)) ([ed7c47d](https://github.com/ponomarenko/ctxmedic/commit/ed7c47dd47e86d37293da8da2852fc2f8db7c663))
* fix the release pipeline and improve repo metadata ([#25](https://github.com/ponomarenko/ctxmedic/issues/25)) ([2375a5c](https://github.com/ponomarenko/ctxmedic/commit/2375a5c6c768df63af8e883a27b8670e0354befd))
* group only minor and patch Dependabot updates ([#33](https://github.com/ponomarenko/ctxmedic/issues/33)) ([184570b](https://github.com/ponomarenko/ctxmedic/commit/184570b32dd4d952631f04d3b59593d79046e683))
* run release-please from the repo root ([#30](https://github.com/ponomarenko/ctxmedic/issues/30)) ([c31d844](https://github.com/ponomarenko/ctxmedic/commit/c31d8440b627a6b47f3b217ef69dd93a69d33f2a))


### Build System

* **deps:** Bump @hono/node-server from 1.19.19 to 2.1.6 ([#23](https://github.com/ponomarenko/ctxmedic/issues/23)) ([bfb4eea](https://github.com/ponomarenko/ctxmedic/commit/bfb4eea242ede6b2fef8a5ff1fc159bf240eb0ea))

## 0.1.0 — 2026-11-22

First public version.

- `checkup`, `treat`, `savings`, `consult`, `history`, `ui` commands.
- 7 config rules and 4 FinOps detectors for Claude Code, Cursor, Windsurf, Codex CLI, OpenCode, GitHub Copilot and Cline.
- Clinical cards, Health Score, visit history. English output; message catalogs ready for more languages.
- Safe FixEngine with backups and git checks.
- Local Web UI (dashboard, diagnoses, FinOps, config graph).
