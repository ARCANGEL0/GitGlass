/* Phone application shell.

Renders the phone-side UI into the DOM, driven by the shared StateStore and
GitHub API client. The glasses runtime is wired separately in main.ts; both
surfaces share the same state.

Views: landing, connect, dashboard, modules, settings, plus one screen per
GitHub module (feed, pull requests, notifications, issues, collab PRs,
explore, my repositories, code search, actions, profile).
*/

import { StateStore } from '../state/store'
import { GitHubClient } from '../github/client'
import { GitHubAuth } from '../github/auth'
import { UsersService } from '../github/users'
import { RepositoriesService } from '../github/repositories'
import { PullRequestsService } from '../github/pulls'
import { IssuesService } from '../github/issues'
import { NotificationsService } from '../github/notifications'
import { SearchService } from '../github/search'
import { ActionsService } from '../github/actions'
import { renderLanding } from './views/landing'
import { renderConnect } from './views/connect'
import { renderDashboard } from './views/dashboard'
import { renderModules } from './views/modules'
import { renderSettings } from './views/settings'
import { renderFeed } from './views/feed'
import { renderProfile } from './views/profile'
import { renderMyRepositories } from './views/my-repositories'
import { renderPullRequests } from './views/pull-requests'
import { renderNotifications } from './views/notifications'
import { renderIssues } from './views/issues'
import { renderCollabPrs } from './views/collab-prs'
import { renderExplore } from './views/explore'
import { renderCodeSearch } from './views/code-search'
import { renderActions } from './views/actions'

type View =
  | 'landing'
  | 'connect'
  | 'dashboard'
  | 'modules'
  | 'settings'
  | 'feed'
  | 'profile'
  | 'myRepositories'
  | 'pullRequests'
  | 'notifications'
  | 'issues'
  | 'collabPrs'
  | 'explore'
  | 'codeSearch'
  | 'actions'

type FeedEntry = { repo: string; type: string; actor: string; description: string; updatedAt: string }
type ProfileUser = { login: string; name?: string | null; avatar?: string | null; public_repos: number; followers: number; following: number }
type RepoItem = { fullName: string; name: string; description?: string | null; language?: string | null; stars: number; forks: number; issues: number; updatedAt: string; isPrivate: boolean }
type PullRequestItem = { repo: string; number: number; title: string; state: 'open' | 'closed' | 'merged'; draft: boolean; author: string; reviewStatus: 'none' | 'approved' | 'changes-requested' | 'commented'; updatedAt: string }
type NotificationItem = { repository: string; subject: string; type: string; reason: string; unread: boolean; updatedAt: string }
type IssueItem = { repo: string; number: number; title: string; state: 'open' | 'closed'; author: string; labels: Array<{ name: string }>; assignee?: string | null; updatedAt: string }
type CollabPrItem = { repo: string; number: number; title: string; author: string; createdAt: string; updatedAt: string; reviewStatus: 'none' | 'approved' | 'changes-requested' | 'commented'; mergeable: boolean | null; draft: boolean; requestedReviewers: string[] }
type RepoOverview = { name: string; owner: string; description?: string | null; language?: string | null; stars: number; forks: number; issues: number; updatedAt: string }
type SearchResultItem = { type: 'repository' | 'issue' | 'pull_request' | 'user' | 'code'; name: string; fullName?: string; owner?: string; description?: string | null; url: string }
type WorkflowRunItem = { name: string; repository: string; branch: string; status: 'queued' | 'in_progress' | 'completed'; conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null; event: string; createdAt: string }

export class PhoneApp {
  private store: StateStore
  private auth: GitHubAuth
  private users: UsersService
  private repos: RepositoriesService
  private pulls: PullRequestsService
  private issues: IssuesService
  private notifications: NotificationsService
  private search: SearchService
  private actions: ActionsService
  private view: View = 'landing'
  private root: HTMLElement

  constructor(root: HTMLElement, store: StateStore, client: GitHubClient) {
    this.root = root
    this.store = store
    this.auth = new GitHubAuth(client)
    this.users = new UsersService(client)
    this.repos = new RepositoriesService(client)
    this.pulls = new PullRequestsService(client)
    this.issues = new IssuesService(client)
    this.notifications = new NotificationsService(client)
    this.search = new SearchService(client)
    this.actions = new ActionsService(client)
    this.view = 'landing'
    this.root = root
    this.connectError = null
    this.pendingToken = null
  }

  private connectError: string | null = null
  private pendingToken: string | null = null
  private debugMode: boolean = false

  async start(): Promise<void> {
    await this.store.load()
    this.store.subscribe(() => void this.render())
    await this.render()
  }

  private get state() {
    return this.store.get()
  }

  private navigate(view: View): void {
    this.view = view
    void this.render()
  }

  private async render(): Promise<void> {
    const state = this.state
    this.root.innerHTML = ''

    switch (this.view) {
      case 'landing':
        this.root.appendChild(
          renderLanding({ onConnect: () => this.navigate('connect') }),
        )
        break
      case 'connect':
        this.root.appendChild(
          renderConnect({
            onSubmit: token => {
              void this.handleConnect(token)
            },
            onBack: () => this.navigate('landing'),
            token: this.pendingToken ?? state.token ?? undefined,
            error: this.connectError,
            debug: this.debugMode,
            onDebug: () => {
              this.debugMode = !this.debugMode
              void this.render()
            },
          }),
        )
        break
      case 'dashboard': {
        if (!state.token || !state.userLogin) {
          this.navigate('landing')
          return
        }
        const user = await this.fetchProfile()
        this.root.appendChild(
          renderDashboard({
            user: {
              login: state.userLogin,
              name: user?.name,
              avatar: user?.avatar,
              public_repos: user?.public_repos ?? 0,
            },
            onOpenModule: module => this.navigate(module as View),
            onModules: () => this.navigate('modules'),
            onSettings: () => this.navigate('settings'),
            onDisconnect: () => this.handleDisconnect(),
          }),
        )
        break
      }
      case 'modules':
        this.root.appendChild(
          renderModules({
            prefs: state.modules,
            onChange: prefs => this.store.set({ modules: prefs }),
            onBack: () => this.navigate('dashboard'),
          }),
        )
        break
      case 'settings':
        this.root.appendChild(
          renderSettings({
            display: state.display,
            onChange: display => this.store.set({ display }),
            onBack: () => this.navigate('dashboard'),
          }),
        )
        break
      case 'feed': {
        const entries = await this.fetchFeed()
        this.root.appendChild(
          renderFeed({
            entries,
            onBack: () => this.navigate('dashboard'),
            onEntry: () => {},
          }),
        )
        break
      }
      case 'profile': {
        const user = await this.fetchProfile()
        this.root.appendChild(
          renderProfile({
            user: {
              login: state.userLogin ?? '',
              name: user?.name,
              avatar: user?.avatar,
              public_repos: user?.public_repos ?? 0,
              followers: user?.followers ?? 0,
              following: user?.following ?? 0,
            },
            onBack: () => this.navigate('dashboard'),
          }),
        )
        break
      }
      case 'myRepositories': {
        const repos = await this.fetchMyRepos()
        this.root.appendChild(
          renderMyRepositories({
            repos,
            onBack: () => this.navigate('dashboard'),
            onRepo: () => {},
          }),
        )
        break
      }
      case 'pullRequests': {
        const prs = await this.fetchPullRequests()
        this.root.appendChild(
          renderPullRequests({
            prs,
            onBack: () => this.navigate('dashboard'),
            onPr: () => {},
          }),
        )
        break
      }
      case 'notifications': {
        const notifications = await this.fetchNotifications()
        this.root.appendChild(
          renderNotifications({
            notifications,
            onBack: () => this.navigate('dashboard'),
            onNotification: () => {},
          }),
        )
        break
      }
      case 'issues': {
        const issues = await this.fetchIssues()
        this.root.appendChild(
          renderIssues({
            issues,
            onBack: () => this.navigate('dashboard'),
            onIssue: () => {},
          }),
        )
        break
      }
      case 'collabPrs': {
        const prs = await this.fetchCollabPrs()
        this.root.appendChild(
          renderCollabPrs({
            prs,
            onBack: () => this.navigate('dashboard'),
            onPr: () => {},
          }),
        )
        break
      }
      case 'explore': {
        const repos = await this.fetchExplore()
        this.root.appendChild(
          renderExplore({
            repos,
            onBack: () => this.navigate('dashboard'),
            onRepo: () => {},
          }),
        )
        break
      }
      case 'codeSearch': {
        const results = await this.fetchCodeSearch()
        this.root.appendChild(
          renderCodeSearch({
            results,
            query: 'typescript',
            onBack: () => this.navigate('dashboard'),
            onResult: () => {},
          }),
        )
        break
      }
      case 'actions': {
        const runs = await this.fetchActions()
        this.root.appendChild(
          renderActions({
            runs,
            onBack: () => this.navigate('dashboard'),
          }),
        )
        break
      }
    }
  }

  private async handleConnect(token: string): Promise<void> {
    this.pendingToken = token
    this.connectError = null
    void this.render()

    try {
      const result = await this.auth.validate(token)
      if (!result.ok || !result.user) {
        this.connectError = result.error ?? 'Authentication failed'
        void this.render()
        return
      }
      this.store.set({
        token,
        userLogin: result.user.login,
        syncedAt: Date.now(),
      })
      this.connectError = null
      this.pendingToken = null
      this.navigate('dashboard')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network request failed'
      this.connectError = `Connect failed: ${msg}`
      void this.render()
    }
  }

  private handleDisconnect(): void {
    this.auth.logout()
    this.store.reset()
    this.navigate('landing')
  }

  // ── Feed ─────────────────────────────────────────────────────────────

  private async fetchFeed(): Promise<FeedEntry[]> {
    const events = await this.repos.list().catch(() => [] as any[])
    return events.slice(0, 10).map(e => ({
      repo: e.full_name,
      type: 'Pushed',
      actor: e.owner.login,
      description: 'Recent activity',
      updatedAt: e.updated_at,
    }))
  }

  // ── Profile ──────────────────────────────────────────────────────────

  private async fetchProfile(): Promise<ProfileUser | null> {
    const user = await this.users.getProfile().catch(() => null)
    if (!user) return null
    return {
      login: user.login,
      name: user.name,
      avatar: user.avatar_url,
      public_repos: user.public_repos,
      followers: 0,
      following: 0,
    }
  }

  // ── My Repositories ──────────────────────────────────────────────────

  private async fetchMyRepos(): Promise<RepoItem[]> {
    const repos = await this.repos.list().catch(() => [] as any[])
    return repos.map(r => ({
      fullName: r.full_name,
      name: r.name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      issues: r.open_issues_count,
      updatedAt: r.updated_at,
      isPrivate: r.private,
    }))
  }

  // ── Pull Requests ────────────────────────────────────────────────────

  private async fetchPullRequests(): Promise<PullRequestItem[]> {
    const prs = await this.pulls.createdByMe().catch(() => [] as any[])
    return prs.map(p => ({
      repo: p.head.repo?.full_name ?? p.head.ref,
      number: p.number,
      title: p.title,
      state: p.state as 'open' | 'closed' | 'merged',
      draft: p.draft,
      author: p.user.login,
      reviewStatus: 'none' as const,
      updatedAt: p.updated_at,
    }))
  }

  // ── Notifications ────────────────────────────────────────────────────

  private async fetchNotifications(): Promise<NotificationItem[]> {
    const notifs = await this.notifications.list().catch(() => [] as any[])
    return notifs.map(n => ({
      repository: n.repository.full_name,
      subject: n.subject.title,
      type: n.type,
      reason: n.reason,
      unread: n.unread,
      updatedAt: n.updated_at,
    }))
  }

  // ── Issues ───────────────────────────────────────────────────────────

  private async fetchIssues(): Promise<IssueItem[]> {
    const issues = await this.issues.list().catch(() => [] as any[])
    return issues.map(i => ({
      repo: i.repository_url.split('/repos/')[1] ?? 'unknown',
      number: i.number,
      title: i.title,
      state: i.state as 'open' | 'closed',
      author: i.user.login,
      labels: i.labels.map((l: any) => ({ name: l.name })),
      assignee: i.assignee?.login ?? null,
      updatedAt: i.updated_at,
    }))
  }

  // ── Collab PRs ───────────────────────────────────────────────────────

  private async fetchCollabPrs(): Promise<CollabPrItem[]> {
    const prs = await this.pulls.createdByMe().catch(() => [] as any[])
    return prs.map(p => ({
      repo: p.head.repo?.full_name ?? p.head.ref,
      number: p.number,
      title: p.title,
      author: p.user.login,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      reviewStatus: 'none' as const,
      mergeable: null,
      draft: p.draft,
      requestedReviewers: [],
    }))
  }

  // ── Explore ──────────────────────────────────────────────────────────

  private async fetchExplore(): Promise<RepoOverview[]> {
    const repos = await this.repos.list().catch(() => [] as any[])
    return repos.map(r => ({
      name: r.name,
      owner: r.owner.login,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      issues: r.open_issues_count,
      updatedAt: r.updated_at,
    }))
  }

  // ── Code Search ──────────────────────────────────────────────────────

  private async fetchCodeSearch(): Promise<SearchResultItem[]> {
    const results = await this.search.repositories('typescript').catch(() => [] as any[])
    return results.map(r => ({
      type: 'repository' as const,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      description: r.description,
      url: r.html_url,
    }))
  }

  // ── Actions ──────────────────────────────────────────────────────────

  private async fetchActions(): Promise<WorkflowRunItem[]> {
    const repos = await this.repos.list().catch(() => [] as any[])
    const runs: WorkflowRunItem[] = []
    for (const repo of repos.slice(0, 3)) {
      try {
        const repoRuns = await this.actions.listForRepo(repo.full_name).catch(() => [] as any[])
        runs.push(...repoRuns.map((r: any) => ({
          name: r.name,
          repository: r.head_repository.full_name,
          branch: r.head_branch,
          status: r.status as 'queued' | 'in_progress' | 'completed',
          conclusion: r.conclusion as any,
          event: r.event,
          createdAt: r.created_at,
        })))
      } catch {
        // Skip repos we can't read
      }
    }
    return runs
  }
}
