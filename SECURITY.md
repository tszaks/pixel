# Security policy

## Supported versions

Pixel has no tagged releases. Only the latest commit on `main` gets security fixes.

| Version | Supported |
|---|---|
| `main` (latest) | Yes |
| Older commits | No |

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. If that is not available to you, email tyler@szakacsmedia.com.

Please include:

- What you found and what an attacker could do with it.
- Steps to reproduce, or a sample request or image that triggers it.
- How you run Pixel (web app, CLI, or your own deployment) and the commit you tested.

You can expect a first reply within a few days. Pixel is maintained by a small team, so a fix may take longer, but you will get updates. Once a fix is released we will credit you in the changelog unless you prefer to stay anonymous.

## What counts

Pixel processes images you give it and can call a paid third-party API. These areas matter most:

- **API key exposure.** Anything that leaks `TOPAZ_API_KEY` to a browser, a log, a response or a build output.
- **The HTTP endpoint.** `api/remove-background.js` has no authentication and sends `Access-Control-Allow-Origin: *`. The `imageUrl` field makes the server fetch any URL it is given. If you deploy it publicly, anyone who finds it can spend your Topaz credits and make your server request internal addresses. Put your own authentication and network limits in front of it. Reports about hardening this are welcome.
- Crashes or resource exhaustion from crafted images (the endpoint accepts bodies up to 16 MB, and Sharp is called with the input pixel limit turned off).
- Path handling in the CLI, which writes to whatever `--output` path you give it.

Pixel does not send images anywhere unless you use Topaz upscaling (uploads to `api.topazlabs.com`) or the `imageUrl` field. See the FAQ in the [README](README.md#faq).
