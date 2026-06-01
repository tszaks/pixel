# Pixel

Pixel is an agent-ready image utility for clean cutouts, transparent PNGs, logo recoloring, and optional AI upscaling.

It is built for two audiences:

- Humans who want a small web app and CLI for background removal.
- Agents that need a predictable local or HTTP contract for producing verified image assets.

## What Pixel Does

- Removes photo backgrounds in the browser with a neural matte model.
- Removes flat logo and icon backgrounds without deleting enclosed artwork.
- Removes smooth or gradient backgrounds with a deterministic edge-profile strategy.
- Recolors the dominant foreground color while preserving alpha and protected details.
- Exports transparent PNG or WebP.
- Optionally upscales finished assets through Topaz for final-quality output.
- Falls back to Sharp resize only when you explicitly choose a preview-grade local resize.

## Billing And API Key Safety

Pixel does not include a paid API key.

If you enable Topaz upscaling, you must use your own `TOPAZ_API_KEY`. Topaz usage can create charges on your account. Do not commit the key, paste it into prompts, expose it in browser code, or ship it in public deployments.

Safe setup:

```bash
cp .env.example .env.local
# edit .env.local and add your own TOPAZ_API_KEY only if you want Topaz upscaling
```

For hosted deployments, set `TOPAZ_API_KEY` as a private server-side environment variable in your hosting provider. Never prefix it with `VITE_`, because that would expose it to the browser.

## Quick Start

```bash
npm install
npm run dev
```

Build and check:

```bash
npm run lint
npm run build
```

## CLI Usage

Run commands from the repo root.

Basic transparent PNG:

```bash
npm run cutout -- \
  --input /absolute/input.png \
  --output /absolute/output.png \
  --strategy logo \
  --json
```

Recolor after cutout:

```bash
npm run cutout -- \
  --input /absolute/input.png \
  --output /absolute/output.png \
  --strategy logo \
  --to '#0066ff' \
  --json
```

World-class transparent PNG upscale after cutout:

```bash
TOPAZ_API_KEY="$TOPAZ_API_KEY" npm run cutout -- \
  --input /absolute/input.png \
  --output /absolute/output.png \
  --strategy logo \
  --upscale 4 \
  --upscale-model transparent \
  --json
```

Preview-grade local resize:

```bash
npm run cutout -- \
  --input /absolute/input.png \
  --output /absolute/output.png \
  --strategy logo \
  --upscale 2 \
  --upscale-provider sharp \
  --json
```

## Strategies

| Strategy | Use For | Notes |
| --- | --- | --- |
| `auto` | Let Pixel choose | Uses image analysis. |
| `logo` | Logos, icons, flat art | Removes edge-connected background and preserves enclosed same-color details. |
| `smooth` | Simple gradients or smooth backgrounds | Estimates a horizontal background profile from image edges. |
| `ai` | Natural photos | Local CLI only. Uses `@imgly/background-removal-node`. |

## Upscaling

Topaz is the final-quality path.

| Input | Default Model | Endpoint |
| --- | --- | --- |
| Transparent PNG, logos, icons, overlays | `Transparency Upscale` | `https://api.topazlabs.com/image/v1/tool/async` |
| Photos and non-alpha images | `Upscale High Fidelity V3` | `https://api.topazlabs.com/image/v1/enhance/async` |

Useful options:

- `--upscale 2|3|4`
- `--upscale-provider topaz|sharp`
- `--upscale-model transparent|high-fidelity|low-resolution|art|text`
- `--upscale-width 2048`
- `--upscale-height 2048`
- `--topaz-timeout-ms 600000`

`sharp` upscaling is intentionally labeled as preview-grade. It is deterministic and cheap, but it is not a substitute for AI super-resolution.

## HTTP API

`POST /api/remove-background`

```json
{
  "imageBase64": "BASE64_IMAGE_BYTES",
  "strategy": "logo",
  "format": "png",
  "upscale": 4,
  "upscaleModel": "transparent",
  "to": "#0066ff"
}
```

Alternative remote input:

```json
{
  "imageUrl": "https://example.com/image.png",
  "strategy": "smooth",
  "format": "png"
}
```

Response:

- Body is image bytes.
- `Content-Type` is `image/png` or `image/webp`.
- `X-Background-Lift-Strategy` reports the strategy used.
- `X-Background-Lift-Analysis` contains URL-encoded JSON image analysis.
- `X-Background-Lift-Upscale` contains URL-encoded JSON upscaling metadata when requested.

The hosted API waits synchronously for Topaz jobs by default. Use the local CLI for large assets or long Topaz jobs unless your serverless timeout is high enough.

## Agent Contract

Agents should follow this order:

1. Identify the source image and desired output path.
2. Decide cutout behavior before processing.
3. Use `logo` for flat logos/icons unless the image is clearly photographic.
4. Preserve enclosed cutouts when the user says to keep interior white/black/details.
5. Remove enclosed cutouts only when explicitly requested.
6. Create a real transparent PNG for final output. Checkerboard previews are not final assets.
7. Use Topaz for final upscaling. Do not call Sharp resize "world class."
8. Verify alpha and dimensions before reporting success.

Minimum verification:

- Corner or edge background alpha is `0`.
- Foreground alpha is nonzero, usually `255`.
- Preserved interior details stay opaque.
- Removed interior details become transparent.
- Recolored foreground pixels match the target color.
- Upscaled output dimensions match the requested scale or target size.

Machine-readable CLI output uses `--json` and includes:

- `input`
- `output`
- `strategy`
- `requestedStrategy`
- `format`
- `elapsedMs`
- `analysis`
- `color`, when recoloring was used
- `upscale`, when upscaling was used

## Environment Variables

```bash
TOPAZ_API_KEY=
TOPAZ_WAIT_MS=55000
```

`TOPAZ_API_KEY` is optional. Pixel works without it for background removal, logo matting, recoloring, and Sharp preview resizing. Topaz-backed upscaling requires it.

## Development Notes

Important files:

- `src/App.tsx`: browser UI.
- `api/remove-background.js`: Vercel-compatible HTTP endpoint.
- `scripts/remove-background.mjs`: local CLI.
- `lib/background-engine.mjs`: deterministic background removal strategies.
- `lib/color-tools.mjs`: recoloring.
- `lib/upscale-engine.mjs`: Sharp and Topaz upscaling.
- `docs/AGENT_USAGE.md`: compact agent-facing usage contract.

## Data Rules

Use images you own, user-provided images, or images with a license that allows your use case. Do not build training or eval sets from random web images without license review.

## License

MIT
