# GitGlass

GitHub on your face. GitGlass is a GitHub client for the Even Realities G2 smart
glasses: your contributions, pull requests, issues and notifications on the HUD,
driven from the temple touchpad or the R1 ring. The phone app handles sign-in
and settings.

<p align="center">
  <img src="docs/demo.gif" alt="GitGlass walkthrough on the Even Hub simulator" width="600">
</p>

## Screens

| | |
|---|---|
| ![Overview](docs/screenshots/01-overview.png) | ![Pull requests](docs/screenshots/02-pull-requests.png) |
| **Overview.** Contributions in the last year next to your contribution heatmap, plus repos, stars and followers. | **Pull requests.** How many of your PRs were merged, with a merged / open / closed bar. |
| ![Modules](docs/screenshots/03-modules.png) | ![My PRs](docs/screenshots/05-my-prs-merged.png) |
| **Modules.** Every module as a node on a git graph, with live counts. | **My PRs.** Each pull request shows its state: open, merged (check) or closed (X). |
| ![PR detail](docs/screenshots/06-pr-detail.png) | ![Diff](docs/screenshots/07-diff.png) |
| **Pull request.** The whole thread: overview, conversation, reviews, files, commits. | **Diffs.** Tap a PR to read the patch of its first changed file. |
| ![Feed](docs/screenshots/08-feed.png) | ![Feed item](docs/screenshots/09-feed-comment.png) |
| **Feed.** Stars, forks, pushes, releases, issues and PRs around you. | **Feed items** open what they are about. A comment opens its issue, comment first. |
| ![Actions](docs/screenshots/11-actions.png) | ![Workflow run](docs/screenshots/12-action-run.png) |
| **Actions.** Running and queued workflows first, then recent runs, each with its result. | **Workflow runs** list every job and step as it runs. |
| ![Trending](docs/screenshots/10-trending.png) | ![My profile](docs/screenshots/13-profile.png) |
| **Trending.** This week's most-starred new repositories. | **My profile.** Bio, numbers, top repositories, languages, organizations and recent activity. |

The phone side holds the token, module toggles and the same modules on a bigger screen:

<p align="center">
  <img src="docs/screenshots/phone-dashboard.png" alt="Phone dashboard" width="260">
  <img src="docs/screenshots/phone-my-prs.png" alt="My PRs on the phone" width="260">
  <img src="docs/screenshots/phone-actions.png" alt="Actions on the phone" width="260">
</p>

Screenshots are from the Even Hub simulator on sample data (`VITE_HUD_DEMO=1`).

## Modules

- **My PRs**: pull requests you opened, with the full thread
- **PRs on my repos**: open pull requests other people sent you
- **Issues**: open issues on your repositories
- **Notifications**: your unread GitHub inbox
- **Feed**: stars, forks, follows, pushes and releases around you, each opening the issue, PR, comment, release or commits it is about
- **Trending**: new repositories that picked up the most stars this week
- **My repos**: your repositories with stars, PRs, issues, languages and recent commits
- **Actions**: workflows running now, then recent runs, down to each job and step
- **My profile**: bio, numbers, top repositories, languages, organizations and recent activity

Turn modules on or off from the phone. The dashboard graph follows, and every module is in the hold menu.

## Controls

| Gesture | Dashboard | Lists | Details |
|---|---|---|---|
| Swipe | next / previous page, then module | move the cursor | next / previous page |
| Tap | open the selected module | open the item | open the diff (PRs) |
| Double tap | exit | back | back |
| Tap and hold | module menu | module menu | module menu |

## How the HUD is drawn

The G2 firmware can only draw text and plain rectangle borders, in one font at
one size. GitGlass draws everything else itself:

1. Each screen is drawn on a 576 x 288 canvas in the glass's 16 grey levels.
   Text on it uses JetBrains Mono Bold, and every pixel is snapped to one of
   those 16 levels so antialiased edges come out as real grey steps.
2. The canvas is cut into four 288 x 144 tiles, the largest image containers
   the glasses accept, and sent as PNGs. A tile is only resent when its pixels
   changed.
3. Text that changes on every swipe (list rows, the counter, the hint line) stays
   in firmware text containers on top of the tiles, so moving the cursor is
   instant.

The page is created once at launch. After that every screen change is a tile
send or an in-place text update, with no page rebuilds and no flicker.

## Build

```bash
npm install
npm run dev                         # phone page on http://localhost:5173
npm run sim                         # Even Hub simulator, automation on :9898
VITE_HUD_DEMO=1 npm run dev         # sample data, no token needed
```

The sample-data client only loads in dev builds and never ships.

Production build:

```bash
npm run build                       # output in dist/
```

## Layout

```
src/
  main.ts              wires the phone app, the store and the glasses
  even.ts              Even Hub bridge: the fixed page, input events, write queue
  glasses/
    app.ts             screens, navigation and data for the glasses
    navigation.ts      screen stack
    hud/
      canvas.ts        16-level pixel canvas, tiles, PNG encoding
      pages.ts         dashboard, graph and Box layouts
      display.ts       paints a view, resends only changed tiles
      art.ts           GitHub mark and section icons
      text.ts          fits firmware text with @evenrealities/pretext
  phone/               the phone companion views
  github/              REST and GraphQL client and services
  state/store.ts       state shared by phone and glasses, kept in Even storage
  dev/demo-client.ts   sample data for the simulator (dev only)
```

## Credits

- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), SIL Open Font
  License 1.1 (`src/glasses/hud/fonts/OFL.txt`). An ASCII subset is bundled.
- The GitHub mark path comes from [Simple Icons](https://simpleicons.org) (CC0).
  GitHub and the Octocat are trademarks of GitHub, Inc. GitGlass is not affiliated
  with GitHub or Even Realities.
- Built with the [Even Hub SDK](https://hub.evenrealities.com/docs).

<div align="center">

## ❤️ Support

 ### if you enjoy the project and want to support future development:

[![Star on GitHub](https://img.shields.io/github/stars/ARCANGEL0/GitGlass?style=social)](https://github.com/ARCANGEL0/GitGlass)
[![Follow on GitHub](https://img.shields.io/github/followers/ARCANGEL0?style=social)](https://github.com/ARCANGEL0)
<br>

<a href='https://ko-fi.com/J3J7WTYV7' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi3.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
<br>
<strong>Hack the world. Byte by Byte.</strong> ⛛ <br>
𝝺𝗿𝗰𝗮𝗻𝗴𝗲𝗹𝗼 @ 2026


</div>
