export interface FeedEntry {
  repo: string
  type: string
  actor: string
  avatar?: string | null
  description: string
  updatedAt: string
}

export interface ProfileUser {
  login: string
  name?: string | null
  avatar?: string | null
  bio?: string | null
  company?: string | null
  location?: string | null
  public_repos: number
  followers: number
  following: number
}

export interface RepoItem {
  fullName: string
  name: string
  description?: string | null
  language?: string | null
  stars: number
  forks: number
  issues: number
  pullRequests: number
  updatedAt: string
  isPrivate: boolean
}

export interface PullRequestItem {
  repo: string
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  author: string
  reviewStatus: 'none' | 'approved' | 'changes-requested' | 'commented'
  updatedAt: string
}

export interface NotificationItem {
  repository: string
  subject: string
  type: string
  reason: string
  unread: boolean
  updatedAt: string
}

export interface IssueItem {
  repo: string
  number: number
  title: string
  state: 'open' | 'closed'
  author: string
  labels: Array<{ name: string }>
  assignee?: string | null
  updatedAt: string
}

export interface CollabPrItem {
  repo: string
  number: number
  title: string
  author: string
  createdAt: string
  updatedAt: string
  reviewStatus: 'none' | 'approved' | 'changes-requested' | 'commented'
  mergeable: boolean | null
  draft: boolean
  requestedReviewers: string[]
}

export interface RepoOverview {
  name: string
  owner: string
  description?: string | null
  language?: string | null
  stars: number
  forks: number
  issues: number
  updatedAt: string
}

export interface SearchResultItem {
  type: 'repository' | 'issue' | 'pull_request' | 'user' | 'code'
  name: string
  fullName?: string
  owner?: string
  description?: string | null
  url: string
}

export interface WorkflowRunItem {
  name: string
  repository: string
  branch: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null
  event: string
  createdAt: string
}
