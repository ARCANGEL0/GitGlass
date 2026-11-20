import type { ModulePrefs, DisplayPrefs } from './types'

export interface AppConfig {
  appName: string
  packageId: string
  version: string

  apiBase: string
  scopes: string[]
  cacheTtlMs: number
  timeoutMs: number
  maxPagesPerRequest: number

  feedPollMs: number
  notificationsPollMs: number
  prPollMs: number
  idleThresholdMs: number

  leftWidth: number
  rightWidth: number
  borderColor: number
  borderWidth: number
  paddingLength: number
  brightText: number
  dimText: number
  normalText: number

  clockTickMs: number

  modules: ModulePrefs
  display: DisplayPrefs

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
  version: '1.3.5',
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
    explore: true,
    myRepositories: true,
    contribution: true,
    codeSearch: false,
    actions: true,
    profile: true,
  },
  display: { compact: true, showBadges: true },
  welcomeTitle: '[ GITHUB ]',
  welcomeBody: ['Please continue setup', 'in the Even phone app', 'to connect GitHub'],
  notConnected: 'Not connected',
  connectPrompt: 'Open the phone app to link your GitHub account',
  errorTitle: 'Error',
  loadingTitle: 'Loading',
  moduleLabel: id => {
    const labels: Record<string, string> = {
      feed: 'Feed',
      pullRequests: 'PRs on my repos',
      notifications: 'Notifications',
      issues: 'Issues',
      explore: 'Trending',
      myRepositories: 'My Repositories',
      contribution: 'My PRs',
      codeSearch: 'Code Search',
      actions: 'Actions',
      profile: 'My profile',
    }
    return labels[id] ?? id
  },
}

export function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}
