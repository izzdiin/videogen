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

## Release v1.1.0 (2026-11-10)

Production-planning and content-system update, at commit `49f4741`.

- **AI Director** — automatic production planner: give it a theme and
  it returns a validated production plan (category, audience, duration,
  aspect, engine, visual style, image and voice providers, caption
  style, music mood) that fills the create form in one click.
- **Idea & title generator** — four modes on the create form: *Viral*
  (live trend research from Google Trends Indonesia RSS and Google News
  RSS, filtered by the model with the trend source cited per idea, and
  an honest error when the web sources are unreachable — no invented
  trends), *Improv AI* (free improvisation with category and seed),
  *Series* (a full series concept with sequenced episodes), and *Next
  episode* (continuation suggestions that read the series' existing
  episode titles).
- **Video series** — projects can belong to a series; the episode
  number is always assigned by the server, the script writer receives
  the series context, and series badges appear in the project list and
  wizard.
- **Project storage layout v2** — `data/projects/<id>/` with a manifest
  `project.json` (scenes split to `scenes/scene-NNN.json`), `script.json`
  provenance, `storyboard.json`, typed `assets/` (images, videos,
  audio, characters, music), `previews/`, and `exports/`. Existing
  projects migrated in place.
- **Storyboard generator & character consistency** — script generation
  also emits per-scene storyboard direction (shot type, camera,
  location, time of day, characters, transition); character sheets
  (canonical appearance + reference image) are injected into Slides
  image prompts, with a contact-sheet preview.
- **Motion keyframes & alpha layers** — per-scene camera motion as
  presets or editable keyframes (position/scale easing), plus a
  transparent object layer per scene (PNG upload or AI generation with
  green-screen cutout) animated over the background or Flow clip.
- **Professional caption system** — eight styles: classic phrase,
  karaoke, one-word, editorial, minimal, dynamic typewriter, highlight,
  and storytelling band.
- **Word timestamps from ASR** — Gemini forced alignment via 9Router:
  the known narration text is timestamped word by word, validated
  against the narration, and linearly normalized to the real VO
  duration; karaoke/dynamic/one-word captions follow the actual voice
  when ASR data exists and fall back to character-proportional
  estimates otherwise.
- **Audio Studio** — per-project audio presets (music volume, fades,
  narration gap, loudness target, ducking ratio), uploaded BGM with
  sidechain ducking under narration, per-scene SFX and volumes, and
  loudnorm mastering; the closing poll card can carry its own voice
  over.

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
