# Flash 3.0

A liquid-glass finance dashboard — a research desk with company news, a market
heat-map treemap, an animated clock that merges in and out of a button, and a
**Liquid Glass Pro** theme rendered with a custom WebGL shader (refraction,
chromatic dispersion, fresnel, cursor glare, and metaball merging).

Built with [Bun](https://bun.com) + React (no Vite/Webpack — Bun serves and
bundles the frontend directly).

## Prerequisites

- **[Bun](https://bun.com) v1.3+** — the only thing you need installed.
  ```bash
  curl -fsSL https://bun.sh/install | bash   # macOS / Linux
  # Windows: powershell -c "irm bun.sh/install.ps1 | iex"
  ```

## Setup

```bash
git clone https://github.com/chiragjalade/Flash-3.0.git
cd Flash-3.0
bun install
```

## Run

```bash
bun run dev
```

Then open **http://localhost:4173**. The dev server has hot-reload (HMR) — edits
to `.tsx`/`.css` update live.

## Optional: real company news (News section)

The Research Desk's **News** cards show headlines about the companies in the
treemap. This uses [GNews](https://gnews.io) (free tier: 100 requests/day),
proxied through the Bun server so the key stays server-side.

1. Get a free key at **https://gnews.io/**.
2. Create a `.env` file in the project root:
   ```
   GNEWS_API_KEY=your_key_here
   ```
3. Restart the dev server (`bun run dev`).

Without a key, the News section falls back to per-company placeholder cards, and
everything else works fully. `.env` is gitignored — your key never gets
committed.

## Themes

Switch themes from the sidebar. **Liquid Glass Pro** (`liquid-glass`) is the
default and the star of the show:

- WebGL glass surfaces with refraction, dispersion, fresnel rims, and a
  cursor-following glare.
- The clock widget merges/demerges from a small button (drag it near the button
  to dock it).
- On load, a one-time glare sweeps across the prompt and research desk.

The tuning panel (bottom-right in the Pro theme) exposes every shader parameter
live.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server + hot reload at :4173 |
| `bun run start` | Run the server without HMR |
| `bun run build` | Bundle to `dist/` (minified) |
| `bun run typecheck` | `tsc --noEmit` |

## Tech

Bun.serve (HTTP + the `/api/company-news` proxy), React 19, a hand-written
WebGL2 shader for the Pro glass (`src/components/GlassLayer.tsx`), and plain CSS
per component. News comes from GNews (with a keyless Spaceflight fallback for the
Spotlight section).
