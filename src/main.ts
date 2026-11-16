import { connectGitHubRuntime } from './even'

// Welcome frame shown after the bridge connects and before GitHub auth.
// Left column holds the clock/context; right column holds the welcome card.
// Exactly one input-capturing container: the right column (isEventCapture: 1).
const welcomeLeft = `GITHUB G2
00:00`
const welcomeRight = `╭──────────────────────────────╮
│                              │
│        [ GITHUB ]            │
│                              │
│   Not connected yet          │
│   Open the phone app to      │
│   link your GitHub account   │
│                              │
╰──────────────────────────────╯`

async function main(): Promise<void> {
  const runtime = await connectGitHubRuntime(welcomeLeft, welcomeRight)
  if (!runtime) {
    // Running outside the Even runtime. Nothing to render on glasses.
    return
  }

  await runtime.render(welcomeLeft, welcomeRight)

  // Handle double-tap on the root page: show the system exit dialog.
  // Do not clean up before the call — the user can cancel.
  runtime.onDoubleTap(() => {
    void runtime.exitApp()
  })

  // Forward launch source: nothing module-specific to do yet before auth.
  runtime.onLaunchSource(() => {
    // no-op for now
  })

  // Foreground (checkpoint): re-paint the welcome screen so the user always
  // sees a valid screen instead of a blank page after the phone backgrounds.
  runtime.onForeground(() => {
    void runtime.render(welcomeLeft, welcomeRight)
  })
}

void main()
