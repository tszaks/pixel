<h1 align="center">Pixel</h1>

<p align="center">
  Clean cutouts, transparent PNGs, logo recoloring and optional Topaz upscaling, from a web app, a CLI or an HTTP endpoint.
</p>

<p align="center">
  <a href="https://github.com/tszaks/pixel/actions/workflows/ci.yml"><img src="https://github.com/tszaks/pixel/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/tszaks/pixel" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/Node-20.19%2B-339933" alt="Node 20.19 or later">
</p>

A real run of the CLI (output trimmed):

```console
$ npm run cutout -- --input logo.png --output logo-blue.png --strategy logo --to '#0066ff' --json
{
  "input": "/Users/you/logo.png",
  "output": "/Users/you/logo-blue.png",
  "strategy": "logo",
  "requestedStrategy": "logo",
  "format": "png",
  "elapsedMs": 31,
  "color": { "from": "#00b82e", "to": "#0066ff" }
}
```

Pixel removes the background from an image and gives you a real transparent PNG or WebP. Flat logos and icons are handled by deterministic code that keeps enclosed artwork (the white inside a logo stays white). Photos go through a neural matte model. You can also recolor the main foreground color and upscale the result.

It is for two kinds of users. Humans get a small web app and a CLI. Agents get a predictable local and HTTP contract, plus JSON output they can check, so they can produce and verify image assets without guessing.

## Features

- **Photo cutouts in the browser.** A neural matte model (`@imgly/background-removal`) runs in the web app. The `ai` strategy does the same in the local CLI.
- **Flat logo and icon cutouts.** The `logo` strategy removes the edge-connected background and keeps enclosed same-color details.
- **Smooth background cutouts.** The `smooth` strategy removes simple gradients by estimating the background profile from the image edges.
- **Recoloring.** Replace the dominant foreground color (or a color you pick) while keeping alpha and protected details.
- **PNG or WebP output** with real alpha. A checkerboard preview is not a transparent file.
- **Upscaling, two ways.** Topaz (paid, needs your own API key) for final quality, or a local Sharp resize for previews.
- **Agent-ready.** `--json` output from the CLI and a single HTTP endpoint. See [docs/AGENT_USAGE.md](docs/AGENT_USAGE.md).

## What needs a paid or external service

| Feature | Needs | Cost |
| --- | --- | --- |
| `logo` and `smooth` cutouts, recoloring, PNG/WebP export | Nothing. Runs locally with Sharp. | Free |
| `ai` cutouts (web app and CLI) | The `@imgly/background-removal` packages. The web app downloads model files when you first run a cutout. | Free |
| Sharp upscaling (`--upscale-provider sharp`) | Nothing. Local resize. | Free |
| Topaz upscaling (the default provider whenever you upscale) | Your own `TOPAZ_API_KEY` and network access to `api.topazlabs.com`. | Billed by Topaz to your account |

Pixel does not ship an API key. Never commit your key, put it in browser code, or prefix it with `VITE_`. In a hosted deployment, set it as a private server-side environment variable.

## Install

You need Node.js 20.19 or later (Vite 8 requires 20.19+ or 22.12+) and npm.

```bash
git clone https://github.com/tszaks/pixel.git
cd pixel
npm install
npm run dev
```

Vite prints the local URL for the web app. To check your setup:

```bash
npm run lint
npm run build
```

Optional: add a Topaz key for upscaling.

```bash
cp .env.example .env.local
# edit .env.local and set TOPAZ_API_KEY
```

The CLI reads `TOPAZ_API_KEY` from the process environment. It does not load `.env.local` by itself, so export it in your shell or set it inline (see below).

## Usage

### CLI

Run commands from the repo root. Paths are resolved from where you run the command.

Transparent PNG:

```bash
npm run cutout -- \
  --input /absolute/input.png \
  --output /absolute/output.png \
  --strategy logo \
  --json
```

If you leave out `--output`, Pixel writes `<input name>-cutout.<format>` next to the input.

Recolor after the cutout:

```bash
npm run cutout -- \
  --input /absolute/input.png \
  --output /absolute/output.png \
  --strategy logo \
  --to '#0066ff' \
  --json
```

Topaz upscale after the cutout (paid, needs `TOPAZ_API_KEY`):

```bash
TOPAZ_API_KEY="$TOPAZ_API_KEY" npm run cutout -- \
  --input /absolute/input.png \
  --output /absolute/output.png \
  --strategy logo \
  --upscale 4 \
  --upscale-model transparent \
  --json
```

Local preview resize (free, not final quality):

```bash
npm run cutout -- \
  --input /absolute/input.png \
  --output /absolute/output.png \
  --strategy logo \
  --upscale 2 \
  --upscale-provider sharp \
  --json
```

### Strategies

| Strategy | Use for | Notes |
| --- | --- | --- |
| `auto` | Let Pixel choose | Analyzes the image and picks `logo`, `smooth` or `ai`. Photos pick `ai`, which the hosted API cannot run. |
| `logo` | Logos, icons, flat art | Removes the edge-connected background and keeps enclosed same-color details. Default tolerance `18`. |
| `smooth` | Simple gradients or smooth backgrounds | Estimates a horizontal background profile from the image edges. Default tolerance `30`, softness `24`. |
| `ai` | Natural photos | Web app and local CLI only. The CLI uses `@imgly/background-removal-node`. |

`smooth` works in the CLI but is missing from `--help` text. The default strategy is `auto`.

### CLI options

| Option | Meaning | Default |
| --- | --- | --- |
| `--input`, `-i` | Source image (required) | none |
| `--output`, `-o` | Output path | `<input>-cutout.<format>` |
| `--strategy` | `auto`, `logo`, `smooth`, `ai` | `auto` |
| `--format` | `png` or `webp` | `png` |
| `--tolerance` | Background color tolerance for `logo` and `smooth` | `18` (`logo`), `30` (`smooth`) |
| `--feather` | Alpha blur for `logo` | `0` |
| `--model` | `small` or `medium`, for `ai` | `medium` |
| `--to`, `--from` | Recolor target and optional source color | dominant saturated foreground color for `--from` |
| `--color-tolerance`, `--color-softness` | Recolor matching and edge softness | `42`, `22` |
| `--upscale` | `2`, `3` or `4` | none |
| `--upscale-provider` | `topaz` or `sharp` | `topaz` |
| `--upscale-model` | `transparent`, `high-fidelity`, `low-resolution`, `art`, `text` | `transparent` for images with alpha, `high-fidelity` otherwise |
| `--upscale-width`, `--upscale-height` | Exact target size. One side keeps the aspect ratio. | none |
| `--topaz-timeout-ms` | Max wait for a Topaz job | `600000` |
| `--json` | Print a machine-readable result | off |

The CLI also passes a few extra Topaz options through (`--sharpen`, `--denoise`, `--fix-compression`, `--face-enhancement` and similar). See `lib/upscale-engine.mjs`.

### Upscaling

| Input | Default model | Endpoint |
| --- | --- | --- |
| Transparent PNG, logos, icons, overlays | `Transparency Upscale` | `https://api.topazlabs.com/image/v1/tool/async` |
| Photos and images without alpha | `Upscale High Fidelity V3` | `https://api.topazlabs.com/image/v1/enhance/async` |

`Transparency Upscale` supports up to 4x. Sharp upscaling is deterministic and cheap, but it is a preview, not a substitute for AI super-resolution.

> **Known issue.** In the current code the Topaz path fails before it makes any request, with `Cannot access 'process' before initialization`, because `lib/upscale-engine.mjs` declares a local `process` variable that shadows Node's `process`. Sharp upscaling and everything else work. Until that is fixed, Topaz upscaling will not run even with a valid key.

### HTTP API

`POST /api/remove-background` is a Vercel-style function in `api/remove-background.js`. The body limit is 16 MB.

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

Or give a remote image instead:

```json
{
  "imageUrl": "https://example.com/image.png",
  "strategy": "smooth",
  "format": "png"
}
```

The response body is the image bytes. `Content-Type` is `image/png` or `image/webp`. Errors return HTTP 400 with a JSON `error`.

| Response header | Content |
| --- | --- |
| `X-Background-Lift-Strategy` | Strategy actually used |
| `X-Background-Lift-Analysis` | URL-encoded JSON image analysis |
| `X-Background-Lift-Upscale` | URL-encoded JSON upscale metadata, when requested |
| `X-Background-Lift-Color` | URL-encoded JSON recolor info, when recoloring |

The `X-Background-Lift-*` names are from the project's earlier name.

The hosted function waits for Topaz jobs in the same request. On Vercel the function limit is 60 seconds (`vercel.json`), so use the local CLI for large images or slow Topaz jobs. The `ai` strategy returns an error from this endpoint. Every request field is listed in [docs/AGENT_USAGE.md](docs/AGENT_USAGE.md).

## Configuration

| Variable | Needed for | Default |
| --- | --- | --- |
| `TOPAZ_API_KEY` | Topaz upscaling (CLI and HTTP API). Server side only. | unset |
| `TOPAZ_WAIT_MS` | How long the HTTP API waits for a Topaz job, in milliseconds. | `55000` |

Without `TOPAZ_API_KEY`, background removal, logo matting, recoloring and Sharp resizing all work.

## Made for AI agents

Agents should follow this order:

1. Identify the source image and the output path.
2. Decide the cutout behavior before processing.
3. Use `logo` for flat logos and icons unless the image is clearly a photo.
4. Keep enclosed cutouts (interior white, black or details) unless the user asks to remove them.
5. Write a real transparent PNG for final output.
6. Use Topaz for final upscaling. Treat Sharp as a preview.
7. Verify alpha and dimensions before reporting success.

Minimum checks: corner and edge background alpha is `0`; foreground alpha is nonzero; preserved interior details stay opaque; removed interior details are transparent; recolored pixels match the target; upscaled dimensions match the request.

`--json` output includes `input`, `output`, `strategy`, `requestedStrategy`, `format`, `elapsedMs`, `analysis`, plus `color` when recoloring and `upscale` when upscaling. The full contract is in [docs/AGENT_USAGE.md](docs/AGENT_USAGE.md).

## FAQ

**Does Pixel send my images anywhere?**
Only if you ask it to. Local strategies (`logo`, `smooth`), recoloring and Sharp resize run on your machine. Topaz upscaling uploads the image to `api.topazlabs.com`. The `imageUrl` option of the HTTP API makes the server fetch that URL. The web app downloads matte model files the first time you use it.

**Can I deploy the API publicly?**
Be careful. The function has no authentication and sends `Access-Control-Allow-Origin: *`. Anyone who finds the URL can use your `TOPAZ_API_KEY` credits, and `imageUrl` makes your server fetch any URL it is given. Put it behind your own auth before you expose it.

**Why does the browser need special headers?**
`vercel.json` sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` so the in-browser model can run.

**Can I use any images for training or evals?**
Use images you own, images users gave you, or images with a license that fits your use. See [docs/TRAINING_AND_EVAL.md](docs/TRAINING_AND_EVAL.md).

## Project map

- `src/App.tsx`: browser UI.
- `api/remove-background.js`: HTTP endpoint.
- `scripts/remove-background.mjs`: local CLI.
- `lib/background-engine.mjs`: background removal strategies.
- `lib/color-tools.mjs`: recoloring.
- `lib/upscale-engine.mjs`: Sharp and Topaz upscaling.

## Contributing

Bug reports and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Security problems go through [SECURITY.md](SECURITY.md). Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

Docs: [agent usage](docs/AGENT_USAGE.md) · [training and eval plan](docs/TRAINING_AND_EVAL.md) · [changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
