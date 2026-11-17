/* Configuration for the GitHub G2 app.

Everything the user might want to change lives here. The app reads
app.json for its identity (name, package id, version) and keeps the
rest in memory, persisted through the state store.

Nothing is hardcoded that a user would reasonably want to set
themselves: the GitHub API address, how often we poll, how long we
cache, how bright the glasses text glows, which modules are on, what
the welcome screen says.
*/

import type { ModulePrefs, DisplayPrefs } from './types'

export interface AppConfig {
  // Identity — comes from app.json, read-only at runtime
  appName: string
  packageId: string
  version: string

  // GitHub API
  apiBase: string
  scopes: string[]
  cacheTtlMs: number
  timeoutMs: number
  maxPagesPerRequest: number

  // Polling
  feedPollMs: number
  notificationsPollMs: number
  prPollMs: number
  idleThresholdMs: number

  // Glasses display
  leftWidth: number
  rightWidth: number
  borderColor: number
  borderWidth: number
  paddingLength: number
  brightText: number
  dimText: number
  normalText: number

  // Timing
  clockTickMs: number

  // User preferences (persisted)
  modules: ModulePrefs
  display: DisplayPrefs

  // Messages (user-editable copy)
  welcomeTitle: string
  welcomeBody: string[]
  notConnected: string
  connectPrompt: string
  errorTitle: string
  loadingTitle: string
  moduleLabel: (id: string) => string
}

export const DEFAULT_CONFIG: AppConfig = {
  appName: 'GitHub G2',
  packageId: 'com.arcxlo.githubg2',
  version: '1.3.1',
  apiBase: 'https://api.github.com',
  scopes: ['repo:read', 'pull_requests:read', 'issues:read', 'notifications:read', 'actions:read'],
  cacheTtlMs: 5 * 60_000,
  timeoutMs: 15_000,
  maxPagesPerRequest: 5,
  feedPollMs: 60_000,
  notificationsPollMs: 30_000,
  prPollMs: 60_000,
  idleThresholdMs: 90_000,
  leftWidth: 240,
  rightWidth: 336,
  borderColor: 5,
  borderWidth: 1,
  paddingLength: 6,
  brightText: 4,
  dimText: 2,
  normalText: 3,
  clockTickMs: 15_000,
  modules: {
    feed: true,
    pullRequests: true,
    notifications: true,
    issues: true,
    collabPrs: false,
    explore: false,
    myRepositories: true,
    codeSearch: false,
    actions: false,
    profile: false,
  },
  display: { compact: true, showBadges: true },
  welcomeTitle: '[ GITHUB ]',
  welcomeBody: ['Not connected yet', 'Open the phone app to', 'link your GitHub account'],
  notConnected: 'Not connected',
  connectPrompt: 'Open the phone app to link your GitHub account',
  errorTitle: 'Error',
  loadingTitle: 'Loading',
  moduleLabel: id => {
    const labels: Record<string, string> = {
      feed: 'Feed',
      pullRequests: 'Pull Requests',
      notifications: 'Notifications',
      issues: 'Issues',
      collabPrs: 'Collab PRs',
      explore: 'Explore',
      myRepositories: 'My Repositories',
      codeSearch: 'Code Search',
      actions: 'Actions',
      profile: 'Profile',
    }
    return labels[id] ?? id
  },
}

/** Build a config from user-supplied overrides, filling the rest with defaults. */
export function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}
