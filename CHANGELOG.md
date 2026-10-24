# Changelog

All notable changes to Pixel are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Pixel has no tagged releases yet, and `package.json` is marked private at version `0.0.0`.

## [Unreleased]

### Added
- README rewritten with a feature list, a table of which features need a paid or external service, CLI options, HTTP API reference, configuration and FAQ.
- CONTRIBUTING, SECURITY, Code of Conduct, AGENTS.md, issue templates, pull request template and a CI workflow (lint and build).

### Changed
- Docs no longer reference personal file paths or private project names.

### Known issues
- Topaz upscaling fails with `Cannot access 'process' before initialization` because `lib/upscale-engine.mjs` shadows Node's `process` inside `upscaleWithTopaz`. Sharp upscaling is not affected.

## 2026-06-01

### Added
- First public commit: browser app, `cutout` CLI and `POST /api/remove-background` endpoint.
- Background removal strategies `auto`, `logo`, `smooth` and `ai`.
- Dominant-color recoloring.
- PNG and WebP export.
- Upscaling through Topaz (`TOPAZ_API_KEY`) or a local Sharp resize.
- MIT license.
