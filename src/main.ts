import { StateStore } from './state/store'
import { GitHubClient } from './github/client'
import { PhoneApp } from './phone/app'
import { showSplash } from './phone/splash'
import { connectGitHubRuntime } from './even'
import { GLASSES_MENU, GlassesApp } from './glasses/app'
import { SPLASH_LAYOUT } from './glasses/hud/layouts'
import { makeConfig } from './config'
import { EMPTY_STATE } from './types'
import './phone/style.css'

const config = makeConfig()
const store = new StateStore({ ...EMPTY_STATE, configVersion: 1 }, config)

/** In dev with VITE_HUD_DEMO=1 the HUD runs on fixtures, so it can be checked without a token. */
const demoMode = import.meta.env.DEV && import.meta.env.VITE_HUD_DEMO === '1'

async function makeClient(): Promise<GitHubClient> {
  if (demoMode) {
    const { DemoClient } = await import('./dev/demo-client')
    return new DemoClient()
  }
  return new GitHubClient(null, config.cacheTtlMs)
}

async function main(): Promise<void> {
  showSplash()
  const client = await makeClient()
  const viteEnv = (import.meta as ImportMeta & {
    env?: { DEV?: boolean; VITE_DEMO_TOKEN?: string }
  }).env
  const demoToken = viteEnv?.DEV ? viteEnv.VITE_DEMO_TOKEN : undefined
  const root = document.querySelector('#app') as HTMLElement
  if (!root) throw new Error('App root missing')
  const phone = new PhoneApp(root, store, client)
  void phone.start()

  const runtime = await connectGitHubRuntime({ config, menu: GLASSES_MENU, layout: SPLASH_LAYOUT })
  if (!runtime) return

  const glasses = new GlassesApp(runtime, store.get(), config, client)
  store.subscribe(state => glasses.setState(state))
  await store.attachBridge(
    key => runtime.getStorage(key),
    (key, value) => runtime.setStorage(key, value),
  )

  if (demoMode) {
    const { DEMO_LOGIN, DEMO_MODULES } = await import('./dev/demo-client')
    await store.set({ token: 'demo', userLogin: DEMO_LOGIN, modules: DEMO_MODULES, syncedAt: Date.now() })
  } else if (demoToken) {
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
  glasses.start()
}

void main()
