/* Native storage preserves state across app restarts. Browser localStorage is
 * the preview fallback. The phone and glasses subscribe to this store. */

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

  /** Attach native storage after the Even bridge is ready. */
  async attachBridge(
    getItem: (key: string) => Promise<string>,
    setItem: (key: string, value: string) => Promise<boolean>,
  ): Promise<boolean> {
    this.bridge = { getItem, setItem }
    this.persisted = false
    const revision = this.stateRevision
    const loaded = await this.load(revision)

    // Preserve updates made while native storage is loading.
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

  setConfig(config: AppConfig): void {
    this.config = config
    void this.persist()
    this.notify()
  }

  /** Apply a state update, persist it, and notify subscribers. */
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
        // Continue notifying subscribers if one throws.
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
          // Fall back to browser storage if the native write fails.
        }
      }

      try {
        this.storage?.setItem(FALLBACK_KEY, value)
      } catch {
        // Ignore localStorage write failures, including private-mode errors.
      }
    }

    this.persistQueue = this.persistQueue.then(write, write)
    return this.persistQueue
  }

  /** Load persisted state. Returns true when the saved state is valid. */
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

  /** True after state has been read from or written to native storage. */
  isPersisted(): boolean {
    return this.persisted
  }
}
