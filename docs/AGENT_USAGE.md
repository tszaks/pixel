# Pixel Agent Usage

Set `PIXEL_URL` to your own deployment of Pixel (see the README).

Pixel is both a web app and a programmatic image cutout tool.

## Local CLI

Use this path when an agent has access to the local filesystem.

```bash
npm run cutout -- \
  --input /Users/you/Downloads/logo.png \
  --output /Users/you/Downloads/logo-transparent.png \
  --strategy logo \
  --upscale 4 \
  --to '#0066ff' \
  --json
```

Strategies:

- `auto`: choose a strategy from image analysis.
- `logo`: remove only the connected background color from the canvas. This preserves enclosed white artwork, such as the white parts of a two-color logo.
- `smooth`: remove a smooth or gradient background estimated from the image edges.
- `ai`: run the local neural matte model for photos and natural subjects.

Useful options:

- `--format png|webp`
- `--tolerance 18`
- `--feather 0`
- `--model small|medium`
- `--to '#0066ff'` to recolor the dominant visible foreground after background removal.
- `--from '#00b82e'` to target a specific source color. If omitted, the dominant saturated visible color is used.
- `--upscale 2|3|4` to run world-class Topaz upscaling after cutout. Requires `TOPAZ_API_KEY`.
- `--upscale-provider topaz|sharp`. Use `topaz` for final assets, `sharp` only for local previews.
- `--upscale-model transparent|high-fidelity|low-resolution|art|text`. `transparent` maps to Topaz `Transparency Upscale`.
- `--upscale-width 2048` / `--upscale-height 2048` to target exact dimensions while preserving aspect ratio if only one side is set.
- `--json`

Topaz model defaults:

- Transparent PNGs: `Transparency Upscale` via `https://api.topazlabs.com/image/v1/tool/async`, built for preserving alpha edges in logos/icons/overlays.
- Photos or non-alpha assets: `Upscale High Fidelity V3` via `https://api.topazlabs.com/image/v1/enhance/async`.
- `sharp` is not considered final-quality upscaling. It is only a deterministic resize fallback.

## HTTP API

```bash
curl -X POST "$PIXEL_URL/api/remove-background" \
  -H "Content-Type: application/json" \
  -d '{
    "imageBase64": "'"$(base64 -i /Users/you/Downloads/logo.png)"'",
    "strategy": "logo",
    "format": "png",
    "upscale": 4,
    "to": "#0066ff"
  }' \
  --output /Users/you/Downloads/logo-transparent.png
```

Request fields:

- `imageBase64`: raw base64 or a data URL.
- `imageUrl`: remote image URL, used when `imageBase64` is not provided.
- `strategy`: `auto`, `logo`, `smooth`, or `ai`.
- `format`: `png` or `webp`.
- `tolerance`: background color tolerance for deterministic strategies.
- `softness`: transition width for `smooth`.
- `feather`: alpha blur for `logo`, default `0`.
- `model`: `small` or `medium` for `ai`.
- `to`: replacement color, for example `#0066ff`.
- `from`: optional source color. Defaults to the dominant saturated foreground color.
- `colorTolerance`: tolerance for recoloring.
- `colorSoftness`: edge softness for recoloring.
- `upscale`: number, boolean, or object. Example object: `{ "scale": 4, "provider": "topaz", "model": "transparent" }`.
- `upscaleProvider`: `topaz` or `sharp`.
- `upscaleModel`: `transparent`, `high-fidelity`, `low-resolution`, `art`, or `text`.
- `upscaleWidth` / `upscaleHeight`: target output dimensions.
- `topazWaitMs`: max synchronous wait for hosted API responses. Defaults to `55000`.

Response:

- Body is the image bytes.
- `Content-Type` is `image/png` or `image/webp`.
- `X-Background-Lift-Strategy` reports the strategy actually used.
- `X-Background-Lift-Analysis` contains URL-encoded JSON image analysis.
- `X-Background-Lift-Upscale` contains URL-encoded JSON upscaling metadata when requested.

## Example: flat logo

For `/Users/you/Downloads/logo.png` (a flat logo on a white canvas), use `strategy: "logo"`.

Expected result:

- Outside canvas background alpha is `0`.
- Logo body alpha is `255`.
- Enclosed white shapes inside the logo keep alpha `255`.
- Exterior antialias pixels are converted away from white halo artifacts.
