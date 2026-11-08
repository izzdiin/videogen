# Videogen — Studio Motion Graphics

Next.js app that turns a theme into a narrated vertical/square/landscape
video: script via 9Router models, images (Pollinations / Cloudflare SDXL /
Muse via muse-bridge / manual upload), voice over (edge-tts / Gemini TTS /
Muse via muse-bridge / upload / in-browser recording), and local canvas
render engines (Slides, Stickman B1/B2/B3, Dark Card, Diagram).

## Deploy (container image)

The image contains code only. These stay on the host, next to
`docker-compose.yml`, and are mounted into the container:

- `data/` — all projects (the app's only database)
- `.env` — API keys (see `.env.example`)
- `stickman-runtime/assets/` — binary runtime assets (prop/reference
  images and the Caveat/NotoSans/DejaVu fonts)
- `public/fonts/` — the Inter font files used by the canvas renderers

    docker compose pull
    docker compose up -d

App listens on port 3201.

## Moving to a new host

1. Install Docker, copy this repo's `docker-compose.yml` over.
2. Copy from the old host: `data/`, `.env`, `stickman-runtime/assets/`,
   `public/fonts/`.
3. `docker compose pull && docker compose up -d`.

## Updates

Push to `main` -> GitHub Actions builds and publishes
`ghcr.io/izzdiin/videogen:latest` -> on the host:
`docker compose pull && docker compose up -d`.

## Release v1.0.0 (2026-11-08)

First documented release, at commit `783b579`.

- Five render engines: Slides, Stickman B1/B2/B3, Dark Card, Diagram
  (20 components, Accumulation and Bedah modes), and Editorial.
- Image providers: Pollinations, Cloudflare SDXL via 9Router, Cloudflare
  Workers AI (direct), Muse via muse-bridge, Venice (direct), and manual
  upload — applied to Slides, Stickman B2/B3, and Editorial.
- Voice-over providers: edge-tts, Gemini TTS via 9Router, Muse via
  muse-bridge, ElevenLabs (including custom voice IDs), in-browser
  recording, and per-scene upload.
- Settings tab: 9Router, muse-bridge, ElevenLabs, Cloudflare Workers AI,
  and Venice endpoints and keys are editable from the UI and apply
  without a restart.
- Slides extras: Kartun Datar preset, Satu Kata caption style, closing
  poll card, and the "Andai-Andai" script template. Indonesian prose
  rules are embedded in every script-generation prompt.
