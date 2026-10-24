# Pixel

Image cutouts, recoloring and upscaling. A React + Vite web app, a Node CLI and a Vercel-style HTTP function share the engines in `lib/`. Node ESM (`.mjs`), TypeScript only in `src/`.

This file is for AI agents that work **on** Pixel's code. If you are an agent that **uses** Pixel to process images, read [docs/AGENT_USAGE.md](docs/AGENT_USAGE.md) and the "Made for AI agents" section of the [README](README.md) instead.

## Build, check, run
- Install: `npm install` (use `npm ci` for a clean install).
- Lint: `npm run lint`. Build: `npm run build` (runs `tsc -b` then `vite build`). CI runs both. There is no test suite.
- Dev server: `npm run dev`.
- CLI: `npm run cutout -- --input in.png --output /tmp/out.png --strategy logo --json`. Make a small test image with Sharp and use `/tmp` for outputs. Do not commit images.
- Never run Topaz upscaling in tests or demos unless asked. It needs `TOPAZ_API_KEY` and costs money. Use `--upscale-provider sharp` to test the upscale path.

## Code map
- `src/App.tsx`, `src/main.tsx`: browser UI. Uses `@imgly/background-removal` in the browser.
- `api/remove-background.js`: HTTP endpoint (JSON in, image bytes out). No `aiHandler`, so the `ai` strategy errors here by design.
- `scripts/remove-background.mjs`: CLI. Passes an `aiHandler` that uses `@imgly/background-removal-node`.
- `lib/background-engine.mjs`: strategies (`auto`, `logo`, `smooth`, `ai`) and image analysis.
- `lib/color-tools.mjs`: recoloring.
- `lib/upscale-engine.mjs`: Sharp resize and Topaz client (create job, poll, download).
- `vercel.json`: cross-origin isolation headers and function limits.
- Agent docs: `docs/AGENT_USAGE.md`. Plan only: `docs/TRAINING_AND_EVAL.md`.

## Conventions
- Match the surrounding code: naming, comment density, idiom. ESLint is the formatter.
- Keep CLI and HTTP behavior in step. A new option usually needs a change in both entry points, in `docs/AGENT_USAGE.md` and in the README tables.
- Keep Topaz optional. Everything except Topaz upscaling must work with no key and no network.
- Never read or print `TOPAZ_API_KEY`. Never expose it to browser code or prefix it with `VITE_`.
- Output must be a real alpha channel. Verify alpha and dimensions after changing any engine code.
- No new dependencies without discussion. No personal paths, customer names or private images in docs or fixtures.
- Update the README, `docs/` and `CHANGELOG.md` when behavior, options or environment variables change.

## Known issues
- `upscaleWithTopaz` in `lib/upscale-engine.mjs` declares `const process = await createTopazProcess(...)`, which shadows Node's `process` and makes the earlier `process.env.TOPAZ_API_KEY` read throw. Rename the local variable to fix it.
- The HTTP endpoint has no auth, allows any origin and fetches any `imageUrl`. See [SECURITY.md](SECURITY.md).
