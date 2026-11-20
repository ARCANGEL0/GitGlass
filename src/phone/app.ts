import { StateStore } from '../state/store'
import { GitHubClient } from '../github/client'
import { ActivityService } from '../github/activity'
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
import { renderContribution } from './views/contribution'
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
  | 'contribution'
  | 'pullRequests'
  | 'notifications'
  | 'issues'
  | 'collabPrs'
  | 'explore'
  | 'codeSearch'
  | 'actions'

type FeedEntry = { repo: string; type: string; actor: string; avatar?: string | null; summary?: string; description: string; updatedAt: string; url: string }
type FeedRepo = { fullName: string; description?: string | null; language?: string | null; stars: number; forks: number }
type ProfileUser = { login: string; name?: string | null; avatar?: string | null; public_repos: number; followers: number; following: number }
type RepoItem = { fullName: string; name: string; description?: string | null; language?: string | null; stars: number; forks: number; issues: number; pullRequests: number; updatedAt: string; isPrivate: boolean }
type PullRequestItem = { repo: string; number: number; title: string; state: 'open' | 'closed' | 'merged'; draft: boolean; author: string; reviewStatus: 'none' | 'approved' | 'changes-requested' | 'commented'; updatedAt: string }
type ContributionItem = { repo: string; number: number; title: string; state: 'open' | 'closed' | 'merged'; author: string; updatedAt: string; htmlUrl?: string }
type NotificationItem = { repository: string; subject: string; type: string; reason: string; unread: boolean; updatedAt: string }
type IssueItem = { repo: string; number: number; title: string; state: 'open' | 'closed'; author: string; labels: Array<{ name: string }>; assignee?: string | null; updatedAt: string }
type CollabPrItem = { repo: string; number: number; title: string; author: string; createdAt: string; updatedAt: string; reviewStatus: 'none' | 'approved' | 'changes-requested' | 'commented'; mergeable: boolean | null; draft: boolean; requestedReviewers: string[] }
type RepoOverview = { name: string; owner: string; description?: string | null; language?: string | null; stars: number; forks: number; issues: number; updatedAt: string }
type SearchResultItem = { type: 'repository' | 'issue' | 'pull_request' | 'user' | 'code'; name: string; fullName?: string; owner?: string; description?: string | null; url: string }
type WorkflowRunItem = { name: string; repository: string; branch: string; status: 'queued' | 'in_progress' | 'completed'; conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null; event: string; createdAt: string }

function eventTypeLabel(type: string, owned = false): string {
  const labels: Record<string, string> = {
    CommitCommentEvent: 'Commented',
    CreateEvent: 'Created',
    DeleteEvent: 'Deleted',
    ForkEvent: 'Forked',
    GollumEvent: 'Edited wiki',
    IssueCommentEvent: 'Commented',
    IssuesEvent: 'Issue',
    MemberEvent: 'Member change',
    PublicEvent: 'Made public',
    PullRequestEvent: 'Pull request',
    PullRequestReviewEvent: 'Reviewed',
    PushEvent: 'Pushed',
    ReleaseEvent: 'Released',
    SponsorshipEvent: 'Sponsorship',
    StarEvent: 'Starred',
    WatchEvent: 'Starred',
  }
  if (type === 'WatchEvent' || type === 'StarEvent') return owned ? 'starred your repository' : 'starred a repository'
  if (type === 'ForkEvent') return owned ? 'forked your repository' : 'forked a repository'
  return labels[type] ?? type.replace(/Event$/, '')
}

function feedEventContent(event: any): { summary: string; description: string } {
  const payload = event.payload ?? {}
  if (payload.release) {
    return {
      summary: payload.release.name ?? payload.release.tag_name ?? '',
      description: payload.release.body ?? '',
    }
  }
  if (payload.pull_request) {
    return {
      summary: `#${payload.pull_request.number ?? payload.number} ${payload.pull_request.title ?? ''}`.trim(),
      description: payload.pull_request.body ?? '',
    }
  }
  if (payload.issue) {
    return {
      summary: `#${payload.issue.number ?? payload.number} ${payload.issue.title ?? ''}`.trim(),
      description: payload.issue.body ?? '',
    }
  }
  if (payload.forkee?.full_name) return { summary: payload.forkee.full_name, description: '' }
  if (payload.commits?.length) {
    return {
      summary: payload.commits[0].message?.split('\n')[0] ?? '',
      description: payload.commits.slice(1).map((commit: any) => commit.message ?? '').filter(Boolean).join('\n'),
    }
  }
  if (event.type === 'WatchEvent' || event.type === 'StarEvent') {
    return { summary: '', description: event.repositoryDescription ?? '' }
  }
  if (event.type === 'IssueCommentEvent') {
    return { summary: '', description: payload.comment?.body ?? '' }
  }
  return { summary: '', description: '' }
}

export class PhoneApp {
  private store: StateStore
  private client: GitHubClient
  private auth: GitHubAuth
  private users: UsersService
  private repos: RepositoriesService
  private pulls: PullRequestsService
  private issues: IssuesService
  private notifications: NotificationsService
  private search: SearchService
  private actions: ActionsService
  private activity: ActivityService
  private view: View = 'landing'
  private root: HTMLElement
  private renderVersion = 0

  constructor(root: HTMLElement, store: StateStore, client: GitHubClient) {
    this.root = root
    this.store = store
    this.client = client
    this.auth = new GitHubAuth(client)
    this.users = new UsersService(client)
    this.repos = new RepositoriesService(client)
    this.pulls = new PullRequestsService(client)
    this.issues = new IssuesService(client)
    this.notifications = new NotificationsService(client)
    this.search = new SearchService(client)
    this.actions = new ActionsService(client)
    this.activity = new ActivityService(client)
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
    this.client.setToken(this.state.token)
    if (this.state.token && this.state.userLogin) {
      this.view = 'dashboard'
    }
    this.store.subscribe(state => {
      // Restore the token before rendering starts API requests.
      this.client.setToken(state.token)
      if (state.token && state.userLogin && this.view === 'landing') {
        this.view = 'dashboard'
      }
      void this.render()
    })
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
    const renderVersion = ++this.renderVersion
    const mount = (element: HTMLElement): void => {
      if (renderVersion !== this.renderVersion) return
      this.root.innerHTML = ''
      this.root.appendChild(element)
    }
    const state = this.state

    switch (this.view) {
      case 'landing':
        mount(
          renderLanding({ onConnect: () => this.navigate('connect') }),
        )
        break
      case 'connect':
        mount(
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
        if (renderVersion !== this.renderVersion) return
        mount(
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
        mount(
          renderModules({
            prefs: state.modules,
            onChange: prefs => this.store.set({ modules: prefs }),
            onBack: () => this.navigate('dashboard'),
          }),
        )
        break
      case 'settings':
        mount(
          renderSettings({
            display: state.display,
            onChange: display => this.store.set({ display }),
            onBack: () => this.navigate('dashboard'),
          }),
        )
        break
      case 'feed': {
        const { entries, trending, popular } = await this.fetchFeed()
        if (renderVersion !== this.renderVersion) return
        mount(
          renderFeed({
            entries,
            trending,
            popular,
            onBack: () => this.navigate('dashboard'),
            onEntry: entry => window.open(entry.url, '_blank', 'noopener,noreferrer'),
          }),
        )
        break
      }
      case 'profile': {
        const user = await this.fetchProfile()
        if (renderVersion !== this.renderVersion) return
        mount(
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
        if (renderVersion !== this.renderVersion) return
        mount(
          renderMyRepositories({
            repos,
            onBack: () => this.navigate('dashboard'),
            onRepo: () => {},
          }),
        )
        break
      }
      case 'contribution': {
        const items = await this.fetchContributions()
        if (renderVersion !== this.renderVersion) return
        mount(
          renderContribution({
            items,
            onBack: () => this.navigate('dashboard'),
            onItem: item => {
              if (item.htmlUrl) window.open(item.htmlUrl, '_blank', 'noopener,noreferrer')
            },
          }),
        )
        break
      }
      case 'pullRequests': {
        const prs = await this.fetchPullRequests()
        if (renderVersion !== this.renderVersion) return
        mount(
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
        if (renderVersion !== this.renderVersion) return
        mount(
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
        if (renderVersion !== this.renderVersion) return
        mount(
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
        if (renderVersion !== this.renderVersion) return
        mount(
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
        if (renderVersion !== this.renderVersion) return
        mount(
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
        if (renderVersion !== this.renderVersion) return
        mount(
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
        if (renderVersion !== this.renderVersion) return
        mount(
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
      await this.store.set({
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

  // Fetch feed activity and repository suggestions.

  private async fetchFeed(): Promise<{ entries: FeedEntry[]; trending: FeedRepo[]; popular: FeedRepo[] }> {
    const login = this.state.userLogin
    if (!login) return { entries: [], trending: [], popular: [] }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const [events, followed] = await Promise.all([
      this.activity.forFeed(login),
      this.client.collect<any>(`/users/${encodeURIComponent(login)}/following`, { perPage: 10, maxPages: 1 }).catch(() => [] as any[]),
    ])
    const followedRepos = await Promise.all(followed.slice(0, 6).map(user => (
      this.client.collect<any>(`/users/${encodeURIComponent(user.login)}/repos?type=owner&sort=updated`, { perPage: 30, maxPages: 1 })
        .catch(() => [] as any[])
    )))
    const projects = [...new Map(followedRepos.flat()
      .filter(repo => !repo.fork)
      .map(repo => [repo.full_name, repo])).values()].slice(0, 5)
    const popular = [...projects]
      .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
      .slice(0, 5)
    const trending = projects
      .filter(repo => Date.parse(repo.pushed_at ?? '') >= Date.parse(since))
      .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
      .slice(0, 5)

    const entries = events.slice(0, 40).map(event => {
      const repo = event.repo?.name ?? 'GitHub'
      const actor = event.actor?.display_login ?? event.actor?.login ?? 'Someone'
      const owned = Boolean(event.isOwnedRepository)
      const type = eventTypeLabel(event.type, owned)
      const content = feedEventContent(event)
      return {
        repo,
        type,
        actor,
        avatar: event.actor?.avatar_url ?? null,
        ...content,
        updatedAt: event.created_at ?? '',
        url: event.payload?.pull_request?.html_url
          ?? event.payload?.issue?.html_url
          ?? event.payload?.release?.html_url
          ?? `https://github.com/${repo}`,
      }
    })

    return {
      entries,
      trending: trending.map(repo => ({
        fullName: repo.full_name ?? repo.name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count ?? 0,
        forks: repo.forks_count ?? 0,
      })),
      popular: popular.map(repo => ({
        fullName: repo.full_name ?? repo.name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count ?? 0,
        forks: repo.forks_count ?? 0,
      })),
    }
  }

  // Load the current user's profile.

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

  // Load repositories owned by the current user.

  private async fetchMyRepos(): Promise<RepoItem[]> {
    const [repos, prs] = await Promise.all([
      this.repos.list().catch(() => [] as any[]),
      this.pulls.onMyRepositories(this.state.userLogin ?? '', { perPage: 100, maxPages: 3 }).catch(() => [] as any[]),
    ])
    const issues = await this.issues.listForMyRepositories(this.state.userLogin ?? '', { perPage: 100, maxPages: 3 }).catch(() => [] as any[])
    const prCounts = new Map<string, number>()
    for (const pr of prs) {
      const repo = pr.repository_url?.split('/repos/')[1]
      if (repo) prCounts.set(repo, (prCounts.get(repo) ?? 0) + 1)
    }
    const issueCounts = new Map<string, number>()
    for (const issue of issues) {
      const repo = issue.repository?.full_name ?? issue.repository_url?.split('/repos/')[1]
      if (repo) issueCounts.set(repo, (issueCounts.get(repo) ?? 0) + 1)
    }
    return repos.map(r => ({
      fullName: r.full_name,
      name: r.name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      issues: issueCounts.get(r.full_name) ?? 0,
      pullRequests: prCounts.get(r.full_name) ?? 0,
      updatedAt: r.updated_at,
      isPrivate: r.private,
    }))
  }

  // Load pull requests from the user's repositories.

  private async fetchPullRequests(): Promise<PullRequestItem[]> {
    const prs = await this.pulls.onMyRepositories(this.state.userLogin ?? '').catch(() => [] as any[])
    return prs.map(p => ({
      repo: p.repository_url?.split('/repos/')[1] ?? 'unknown',
      number: p.number,
      title: p.title,
      state: p.pull_request?.merged_at ? 'merged' : p.state as 'open' | 'closed',
      draft: p.draft,
      author: p.user?.login ?? this.state.userLogin ?? '',
      reviewStatus: 'none' as const,
      updatedAt: p.updated_at,
    }))
  }

  // Load notifications for the current user.

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

  // Load issues from the user's repositories.

  private async fetchIssues(): Promise<IssueItem[]> {
    const issues = await this.issues.listForMyRepositories(this.state.userLogin ?? '').catch(() => [] as any[])
    return issues.filter(i => !i.pull_request).map(i => ({
      repo: i.repository?.full_name ?? i.repository_url?.split('/repos/')[1] ?? 'unknown',
      number: i.number,
      title: i.title,
      state: i.state as 'open' | 'closed',
      author: i.user?.login ?? '',
      labels: (i.labels ?? []).map((l: any) => ({ name: l.name })),
      assignee: i.assignee?.login ?? null,
      updatedAt: i.updated_at,
    }))
  }

  private async fetchContributions(): Promise<ContributionItem[]> {
    const prs = await this.pulls.createdByMe(this.state.userLogin ?? '').catch(() => [] as any[])
    return prs.map(p => ({
      repo: p.repository_url?.split('/repos/')[1] ?? 'unknown',
      number: p.number,
      title: p.title,
      state: p.pull_request?.merged_at ? 'merged' : p.state as 'open' | 'closed',
      author: p.user?.login ?? this.state.userLogin ?? '',
      updatedAt: p.updated_at ?? p.created_at ?? '',
      htmlUrl: p.html_url,
    }))
  }

  // Load open pull requests from other users on owned repositories.

  private async fetchCollabPrs(): Promise<CollabPrItem[]> {
    const repos = await this.repos.list({ perPage: 10, maxPages: 2 }).catch(() => [] as any[])
    const prs: any[] = []
    for (const repo of repos.slice(0, 5)) {
      const repoPrs = await this.pulls.listForRepo(repo.full_name, { perPage: 10, maxPages: 1 }).catch(() => [] as any[])
      prs.push(...repoPrs.map(p => ({ ...p, repo: repo.full_name })))
    }
    return prs
      .filter(p => p.user?.login?.toLowerCase() !== this.state.userLogin?.toLowerCase())
      .map(p => ({
        repo: p.repo,
        number: p.number,
        title: p.title,
        author: p.user?.login ?? '',
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        reviewStatus: 'none' as const,
        mergeable: null,
        draft: p.draft,
        requestedReviewers: [],
      }))
  }

  // Load repositories for the Explore view.

  private async fetchExplore(): Promise<RepoOverview[]> {
    const repos = await this.search.trending().catch(() => [] as any[])
    return repos.map(r => ({
      name: r.name,
      owner: r.owner?.login ?? r.full_name?.split('/')[0] ?? '',
      description: r.description,
      language: r.language,
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      issues: r.open_issues_count ?? 0,
      updatedAt: r.updated_at ?? '',
    }))
  }

  // Search repositories for the Code Search view.

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

  // Load workflow runs from the user's repositories.

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
        // Skip this repository if its request fails.
      }
    }
    return runs
  }
}
