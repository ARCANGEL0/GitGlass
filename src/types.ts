// GitHub API resource shapes (picked fields)

export interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string | null
  public_repos: number
  total_private_repos: number | null
  updated_at: string
}

export interface GitHubRepository {
  id: number
  full_name: string
  name: string
  owner: { login: string }
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  default_branch: string
  private: boolean
  updated_at: string
  html_url: string
}

export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  user: { login: string }
  head: { ref: string }
  base: { ref: string }
  body: string | null
  created_at: string
  updated_at: string
  html_url: string
}

export interface GitHubIssue {
  id: number
  number: number
  title: string
  state: 'open' | 'closed'
  user: { login: string }
  labels: Array<{ name: string; color: string }>
  assignee: { login: string } | null
  created_at: string
  updated_at: string
  html_url: string
}

export interface GitHubNotification {
  id: string
  repository: { full_name: string }
  subject: {
    title: string
    type: 'Issue' | 'PullRequest' | string
    url: string
  }
  reason: string
  type: 'repository' | string
  unread: boolean
  updated_at: string
}

export interface GitHubWorkflowRun {
  id: number
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null
  head_branch: string
  head_repository: { full_name: string }
  event: string
  created_at: string
  updated_at: string
  html_url: string
}

// Persisted application state (shared phone + glasses)

export interface ModulePrefs {
  feed: boolean
  pullRequests: boolean
  notifications: boolean
  issues: boolean
  collabPrs: boolean
  explore: boolean
  myRepositories: boolean
  contribution: boolean
  codeSearch: boolean
  actions: boolean
  profile: boolean
}

export interface DisplayPrefs {
  compact: boolean
  showBadges: boolean
}

export interface AppState {
  token: string | null
  userLogin: string | null
  modules: ModulePrefs
  display: DisplayPrefs
  lastSelectedRepo: string | null
  syncedAt: number | null
  configVersion: number | null
}

export const DEFAULT_MODULES: ModulePrefs = {
  feed: true,
  pullRequests: true,
  notifications: true,
  issues: true,
  collabPrs: false,
  explore: false,
  myRepositories: true,
  contribution: true,
  codeSearch: false,
  actions: false,
  profile: false,
}

export const DEFAULT_DISPLAY: DisplayPrefs = {
  compact: true,
  showBadges: true,
}

export const EMPTY_STATE: AppState = {
  token: null,
  userLogin: null,
  modules: { ...DEFAULT_MODULES },
  display: { ...DEFAULT_DISPLAY },
  lastSelectedRepo: null,
  syncedAt: null,
  configVersion: 1,
}

// Glasses navigation

export type ModuleId =
  | 'feed'
  | 'pullRequests'
  | 'notifications'
  | 'issues'
  | 'collabPrs'
  | 'explore'
  | 'myRepositories'
  | 'contribution'
  | 'codeSearch'
  | 'actions'
  | 'profile'

export interface NavEntry {
  module: ModuleId
  label: string
}

export const MODULE_ORDER: NavEntry[] = [
  { module: 'feed', label: 'Feed' },
  { module: 'pullRequests', label: 'Pull Requests' },
  { module: 'notifications', label: 'Notifications' },
  { module: 'issues', label: 'Issues' },
  { module: 'collabPrs', label: 'Collab PRs' },
  { module: 'explore', label: 'Explore' },
  { module: 'myRepositories', label: 'My Repositories' },
  { module: 'contribution', label: 'Contribution' },
  { module: 'codeSearch', label: 'Code Search' },
  { module: 'actions', label: 'Actions' },
  { module: 'profile', label: 'Profile' },
]

// Screen renderer result

export interface Screen {
  left: string
  right: string
}

// Glasses data shapes

export interface GlassesRepo {
  full_name: string
  description?: string | null
  language?: string | null
  stargazers_count: number
  forks_count: number
  updated_at: string
}

export interface GlassesPr {
  number: number
  title: string
  state: string
  updated_at: string
}

export interface GlassesNotification {
  repository: string
  subject: string
  unread: boolean
  updated_at: string
}

export interface GlassesIssue {
  number: number
  title: string
  state: string
  updated_at: string
}
