# GitHub G2

A GitHub client for the Even Realities G2 smart glasses, built on the Even Hub SDK.

## Product

Two surfaces share one state:

- **Phone companion** (DOM): GitHub authentication, connected dashboard, module toggles, settings.
- **Even G2 glasses** (SDK containers): repository browsing, pull requests, notifications, issues, code review, explore, my repositories, code search, actions, profile.

The user navigates the glasses without taking their phone out of their pocket.

## Constraints honored (G2 hardware)

- 576 × 288 px, monochrome green, 4-bit greyscale, 16 shades
- Max 12 containers per page (8 text/list, 4 image)
- Exactly one input-capturing container per page
- Text limits: 1000 chars startup/rebuild, 2000 chars per `textContainerUpgrade`
- No DOM/CSS on the glasses; absolute-positioned containers only
- BLE writes serialized (one in flight); image sends awaited one at a time

## Repository layout

```
src/
  main.ts            # Dual entry: phone DOM + glasses runtime
  even.ts            # Even bridge wrapper (BLE write queue, gestures, menu)
  types.ts           # Shared types: GitHub resources, app state, navigation
  state/store.ts     # Pub/sub state persisted via Even bridge storage
  github/            # Read-only REST API client + per-resource services
    client.ts        # fetch wrapper: rate limits, pagination, cache, retries
    auth.ts          # PAT validation against GitHub
    users, repositories, pulls, issues, notifications, search,
    commits, actions, reviews
  glasses/           # Glasses interface
    renderer.ts      # G2-compliant left/right column text renderer
    navigation.ts    # Navigation stack + module list
    app.ts           # Glasses app shell + gesture wiring
  phone/             # Phone companion UI
    app.ts           # Phone shell (landing → connect → dashboard → modules → settings)
    views/           # landing, connect, dashboard, modules, settings
    style.css        # GitHub-inspired dark phone styles
  dom.ts             # Tiny DOM helper
```

## Development

```bash
npm install
npm run dev          # Vite dev server on :5173
npm run build        # tsc + vite build → dist/
npm run qr           # QR code for sideloading to real glasses
npm run sim          # Even Hub simulator on :9898
npm run pack         # evenhub pack → github-g2.ehpk
```

## Packaging

`app.json` declares `com.arcxlo.githubg2`, edition `202601`, SDK `0.0.16`,
`network` (api.github.com) and `g2-microphone` permissions.

```bash
evenhub pack app.json dist -o github-g2.ehpk --sdk-ver 0.0.16
```

## Git identity

Commits use `arcxlo <henry@arcangelo.net>` (local config only). No co-author
or AI attribution trailers.

## Status

Milestones reached:

- SDK integration: bridge init, startup page, text rendering, gestures, menu
- Phone app: landing, connect, dashboard, modules, settings
- Shared state: auth token, module prefs, display prefs persisted across surfaces

Remaining modules (feed, PRs, notifications, issues, collab PRs, explore, my repositories, code search, actions, profile) render placeholder text and are wired into the navigation stack for incremental implementation.
