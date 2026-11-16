/* GitHub G2 — main entry.

Two surfaces share one state store:

1. Phone companion: renders into the DOM (landing, connect, dashboard,
   modules, settings). Drives GitHub authentication and persists state.
2. Even G2 glasses: renders through the SDK containers (welcome frame,
   then modules once authenticated). Reads the same state store.

The glasses runtime and the phone app both subscribe to the store, so a
change on the phone (e.g. disabling a module) is reflected on the
glasses without a page reload.
*/

import { StateStore } from './state/store'
import { GitHubClient } from './github/client'
import { PhoneApp } from './phone/app'
import { connectGitHubRuntime } from './even'
import { GlassesApp } from './glasses/app'
import { makeConfig } from './config'
import { EMPTY_STATE } from './types'
import './phone/style.css'

const config = makeConfig()
const store = new StateStore({ ...EMPTY_STATE, configVersion: 1 }, config)
const client = new GitHubClient(null, config.cacheTtlMs)

async function main(): Promise<void> {
  // Phone app renders immediately into the DOM.
  const root = document.querySelector('#app') as HTMLElement
  if (!root) throw new Error('App root missing')
  const phone = new PhoneApp(root, store, client)
  void phone.start()

  // Build the contextual menu from enabled modules.
  const modules = store.getConfig().modules
  const menu: { id: number; label: string }[] = []
  let id = 1
  for (const [module, enabled] of Object.entries(modules)) {
    if (enabled) {
      const labels: Record<string, string> = {
        feed: 'Feed',
        pullRequests: 'Pull Requests',
        notifications: 'Notifications',
        issues: 'Issues',
        collabPrs: 'Collab PRs',
        explore: 'Explore',
        myRepositories: 'My Repos',
        codeSearch: 'Code Search',
        actions: 'Actions',
        profile: 'Profile',
      }
      menu.push({ id, label: labels[module] ?? module })
      id += 1
    }
  }

  // Glasses app starts once the Even bridge is ready.
  const runtime = await connectGitHubRuntime({
    config,
    menu,
    initialLeft: `GITHUB G2\n00:00`,
    initialRight: welcomeScreenRight(config),
  })

  if (!runtime) return

  const glasses = new GlassesApp(runtime, store.get(), config, client)
  store.subscribe(state => glasses.setState(state))
  store.attachBridge(
    key => runtime.getStorage(key),
    (key, value) => runtime.setStorage(key, value),
  )

  glasses.bind()

  runtime.onDoubleTap(() => {
    glasses.exitRequested()
  })

  runtime.onForeground(() => {
    glasses.refresh()
  })

  glasses.start()
}

function welcomeScreenRight(config: ReturnType<typeof makeConfig>): string {
  const boxTop = '╭──────────────────────────────╮'
  const boxBot = '╰──────────────────────────────╯'
  const empty = '│                              │'
  const lines = [
    boxTop,
    empty,
    `│   ${config.welcomeTitle.padEnd(22)}   │`,
    empty,
    `│   ${config.welcomeBody[0].padEnd(22)}   │`,
    `│   ${config.welcomeBody[1].padEnd(22)}   │`,
    `│   ${config.welcomeBody[2].padEnd(22)}   │`,
    empty,
    boxBot,
  ]
  return lines.join('\n')
}

void main()
