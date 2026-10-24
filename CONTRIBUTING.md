# Contributing to Pixel

Thanks for helping. Pixel is a small image utility. A good change keeps it simple, keeps the output verifiable, and keeps paid services optional.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- For bugs, open an issue with the template. A small sample image that triggers the problem is the most useful thing you can attach. Only attach images you have the right to share.
- For features, open an issue first and describe the problem you want to solve.
- Small fixes (typos, clear bugs) can go straight to a pull request.
- Security problems go through [SECURITY.md](SECURITY.md), not a public issue.

## Setup

You need Node.js 20.19 or later (22 is what CI uses) and npm.

```bash
git clone https://github.com/tszaks/pixel.git
cd pixel
npm install
npm run dev
```

You do not need a Topaz key to work on Pixel. Only set `TOPAZ_API_KEY` if you are working on Topaz upscaling, and use your own key. Topaz calls can cost money.

## Check your change

There is no automated test suite yet. CI runs lint and a full build:

```bash
npm run lint
npm run build
```

Run both before you open a pull request. For changes to the cutout, recolor or upscale code, also run the CLI on a small image and check the result (see "Minimum checks" in the [README](README.md#made-for-ai-agents)):

```bash
npm run cutout -- --input /path/to/in.png --output /tmp/out.png --strategy logo --json
```

## Code style

- **Match the surrounding code.** Same naming, same comment density, same idiom as the file you are editing. ESLint (`eslint.config.js`) is the formatter and linter.
- Keep it simple. Prefer a small function in `lib/` that both the CLI and the HTTP API can share over logic in one entry point.
- No new dependencies without discussion.

## API key safety

- Never commit a real `TOPAZ_API_KEY`, and never print it in logs, issues or pull requests.
- Never expose the key to browser code. Do not prefix it with `VITE_`.
- Keep Topaz optional. Everything else must work without a key.

## Pull request checklist

- [ ] `npm run lint` and `npm run build` pass.
- [ ] You ran the CLI on a sample image if you changed cutout, recolor or upscale code.
- [ ] The change is small and focused. Unrelated cleanups go in their own pull request.
- [ ] The code matches the surrounding style and adds no dependency.
- [ ] Docs updated if behavior, CLI options, API fields or environment variables changed.
- [ ] A line added under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.
- [ ] No secrets, no private images, no personal paths in the diff.

## Using AI agents to contribute

Fine, as long as you read and understand what you submit and the checklist above is true. [AGENTS.md](AGENTS.md) tells coding agents how this repository works.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
