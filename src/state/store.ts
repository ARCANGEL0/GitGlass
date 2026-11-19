/* Application state store shared between the phone companion and the glasses.

State is persisted to the Even companion app's native key/value storage
(bridge.setLocalStorage / getLocalStorage), which survives WebView-kill
cycles more reliably than browser localStorage on iOS. Browser localStorage
is kept as a fallback for the dev-server preview where there is no bridge.

The store is a tiny pub/sub: subscribers are notified whenever state changes
so the phone UI and glasses renderer can re-render from a single source of
truth.
*/

import { AppState, EMPTY_STATE, DEFAULT_MODULES, DEFAULT_DISPLAY } from '../types'
import { DEFAULT_CONFIG, type AppConfig } from '../config'

const STORAGE_KEY = 'github-g2:state:v1'
const FALLBACK_KEY = 'github-g2:state:v1'
const CONFIG_VERSION = 1

type Subscriber = (state: AppState) => void

export class StateStore {
  private state: AppState
  private subscribers = new Set<Subscriber>()
  private storage: Storage | null = null
  private bridge: {
    getItem(key: string): Promise<string>
    setItem(key: string, value: string): Promise<boolean>
  } | null = null
  private persisted = false
  private stateRevision = 0
  private persistQueue: Promise<void> = Promise.resolve()
  private config: AppConfig

  constructor(initial: AppState = { ...EMPTY_STATE }, config: AppConfig = DEFAULT_CONFIG) {
    this.state = initial
    this.config = config
    this.storage =
      typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : null
  }

  /** Call once the Even bridge is available. Persistence switches to the
   *  companion-app native storage; any pending local-only changes are flushed. */
  async attachBridge(
    getItem: (key: string) => Promise<string>,
    setItem: (key: string, value: string) => Promise<boolean>,
  ): Promise<boolean> {
    this.bridge = { getItem, setItem }
    this.persisted = false
    const revision = this.stateRevision
    const loaded = await this.load(revision)

    // This also migrates a browser-preview value into native storage. If the
    // user changed state while the bridge was loading, that newer state wins.
    await this.persist()
    if (loaded) this.notify()
    return loaded
  }

  get(): AppState {
    return this.state
  }

  getConfig(): AppConfig {
    return this.config
  }

  /** Replace the whole config (e.g. after the user edits settings). */
  setConfig(config: AppConfig): void {
    this.config = config
    void this.persist()
    this.notify()
  }

  /** Partially update state, persist, and notify subscribers. */
  async set(patch: Partial<AppState>): Promise<void> {
    this.state = { ...this.state, ...patch, configVersion: CONFIG_VERSION }
    this.stateRevision += 1
    this.notify()
    await this.persist()
  }

  async reset(): Promise<void> {
    this.state = { ...EMPTY_STATE, configVersion: CONFIG_VERSION }
    this.stateRevision += 1
    this.notify()
    await this.persist()
  }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn)
    fn(this.state)
    return () => {
      this.subscribers.delete(fn)
    }
  }

  private notify(): void {
    for (const fn of this.subscribers) {
      try {
        fn(this.state)
      } catch {
        // A subscriber must not break the store.
      }
    }
  }

  private persist(): Promise<void> {
    const value = JSON.stringify(this.state)
    const write = async (): Promise<void> => {
      if (this.bridge) {
        try {
          const saved = await this.bridge.setItem(STORAGE_KEY, value)
          if (saved) {
            this.persisted = true
            return
          }
        } catch {
          // Fall through to browser storage when native storage is unavailable.
        }
      }

      try {
        this.storage?.setItem(FALLBACK_KEY, value)
      } catch {
        // Some WebViews expose localStorage but reject writes in private mode.
      }
    }

    this.persistQueue = this.persistQueue.then(write, write)
    return this.persistQueue
  }

  /** Load persisted state. Returns true if something was loaded. */
  async load(expectedRevision?: number): Promise<boolean> {
    let raw: string | null = null
    if (this.bridge) {
      try {
        raw = await this.bridge.getItem(STORAGE_KEY)
        if (raw) {
          this.persisted = true
        }
      } catch {
        raw = null
      }
    }
    if (!raw && this.storage) {
      try {
        raw = this.storage.getItem(FALLBACK_KEY)
      } catch {
        raw = null
      }
    }
    if (!raw) return false
    if (expectedRevision !== undefined && expectedRevision !== this.stateRevision) {
      return false
    }
    try {
      const parsed = JSON.parse(raw) as Partial<AppState>
      if (parsed.configVersion !== CONFIG_VERSION) {
        return false
      }
      this.state = {
        ...EMPTY_STATE,
        ...parsed,
        modules: { ...DEFAULT_MODULES, ...(parsed.modules ?? {}) },
        display: { ...DEFAULT_DISPLAY, ...(parsed.display ?? {}) },
        configVersion: CONFIG_VERSION,
      }
      return true
    } catch {
      return false
    }
  }

  /** Whether state has been persisted to native (bridge) storage at least once. */
  isPersisted(): boolean {
    return this.persisted
  }
}
