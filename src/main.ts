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
  const viteEnv = (import.meta as ImportMeta & {
    env?: { DEV?: boolean; VITE_DEMO_TOKEN?: string }
  }).env
  const demoToken = viteEnv?.DEV ? viteEnv.VITE_DEMO_TOKEN : undefined
  const root = document.querySelector('#app') as HTMLElement
  if (!root) throw new Error('App root missing')
  const phone = new PhoneApp(root, store, client)
  void phone.start()

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
        contribution: 'Contribution',
        codeSearch: 'Code Search',
        actions: 'Actions',
        profile: 'Profile',
      }
      menu.push({ id, label: labels[module] ?? module })
      id += 1
    }
  }

  const runtime = await connectGitHubRuntime({
    config,
    menu,
    initialLeft: '',
    initialRight: welcomeScreenRight(config),
  })

  if (!runtime) return

  const glasses = new GlassesApp(runtime, store.get(), config, client)
  store.subscribe(state => glasses.setState(state))
  await store.attachBridge(
    key => runtime.getStorage(key),
    (key, value) => runtime.setStorage(key, value),
  )

  if (demoToken) {
    client.setToken(demoToken)
    let userLogin: string | null = null
    try {
      const user = await client.get<{ login?: string }>('/user')
      userLogin = user.login ?? null
    } catch {}
    await store.set({ token: demoToken, userLogin, syncedAt: Date.now() })
  }

  const restored = store.get()
  client.setToken(restored.token)
  if (restored.token && !restored.userLogin) {
    try {
      const user = await client.get<{ login?: string }>('/user')
      if (user.login) await store.set({ userLogin: user.login })
    } catch {}
  }

  glasses.bind()

  runtime.onForeground(() => {
    glasses.refresh()
  })

  glasses.start()
}

function welcomeScreenRight(config: ReturnType<typeof makeConfig>): string {
  const lines = [
    config.welcomeTitle,
    '',
    'NOT CONNECTED',
    '',
    ...config.welcomeBody,
  ]
  return lines.join('\n')
}

void main()
