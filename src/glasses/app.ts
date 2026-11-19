import { GitHubRuntime } from '../even'
import { GitHubClient } from '../github/client'
import { ActivityService } from '../github/activity'
import { NavStack, type Screen } from './navigation'
import { makeRenderer } from './renderer'
import type { AppState, ModuleId } from '../types'
import type { AppConfig } from '../config'

const MODULES: Array<{ id: ModuleId; label: string }> = [
  { id: 'feed', label: 'Feed' },
  { id: 'pullRequests', label: 'Pull Requests' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'issues', label: 'Issues' },
  { id: 'collabPrs', label: 'Collab PRs' },
  { id: 'explore', label: 'Explore' },
  { id: 'myRepositories', label: 'My Repos' },
  { id: 'contribution', label: 'Contribution' },
  { id: 'codeSearch', label: 'Code Search' },
  { id: 'actions', label: 'Actions' },
  { id: 'profile', label: 'Profile' },
]

function feedEventLabel(type: string): string {
  const labels: Record<string, string> = {
    ForkEvent: 'Forked',
    IssuesEvent: 'Issue update',
    IssueCommentEvent: 'Issue comment',
    PullRequestEvent: 'Pull request',
    PullRequestReviewEvent: 'PR review',
    PullRequestReviewCommentEvent: 'Review comment',
    PushEvent: 'Push',
    ReleaseEvent: 'Release',
    StarEvent: 'Starred',
    WatchEvent: 'Starred',
    CreateEvent: 'Created',
    DeleteEvent: 'Deleted',
    FollowEvent: 'Followed',
  }
  return labels[type] ?? type.replace(/Event$/, '')
}

function relativeTime(iso: string): string {
  const age = Math.max(0, Date.now() - Date.parse(iso))
  const minutes = Math.floor(age / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  const weeks = Math.floor(days / 7)
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`
}

function pullRequestState(item: any): string {
  if (item.pull_request?.merged_at) return 'MERGED'
  return String(item.state ?? 'open').toUpperCase()
}

function feedEventPrimary(event: any): string {
  const actor = event.actor?.display_login ?? event.actor?.login ?? 'Someone'
  const action = event.payload?.action
  switch (event.type) {
    case 'WatchEvent':
    case 'StarEvent':
      return `${actor} ${event.isOwnedRepository ? 'starred your repository' : 'starred a repository'}`
    case 'ForkEvent':
      return `${actor} ${event.isOwnedRepository ? 'forked your repository' : 'forked a repository'}`
    case 'ReleaseEvent':
      return `${actor} released`
    case 'PullRequestEvent':
      return `${actor} ${action ?? 'updated'} a pull request`
    case 'IssuesEvent':
      return `${actor} ${action ?? 'updated'} an issue`
    case 'IssueCommentEvent':
      return `${actor} commented on an issue`
    case 'PushEvent': {
      const count = event.payload?.size ?? event.payload?.commits?.length
      return `${actor} pushed ${count ? `${count} ${count === 1 ? 'commit' : 'commits'}` : 'commits'}`
    }
    default:
      return `${actor} ${feedEventLabel(event.type ?? '').toLowerCase()}`
  }
}

function feedEventSummary(event: any): string {
  const payload = event.payload ?? {}
  if (payload.release) return payload.release.name ?? payload.release.tag_name ?? ''
  if (payload.pull_request) return `#${payload.number ?? payload.pull_request.number} ${payload.pull_request.title ?? ''}`.trim()
  if (payload.issue) return `#${payload.issue.number ?? ''} ${payload.issue.title ?? ''}`.trim()
  if (payload.forkee?.full_name) return payload.forkee.full_name
  if (payload.commits?.length) {
    const count = payload.size ?? payload.commits.length
    return `${count} ${count === 1 ? 'commit' : 'commits'} · ${payload.commits[0].message?.split('\n')[0] ?? ''}`.trim()
  }
  return ''
}

export class GlassesApp {
  private runtime: GitHubRuntime
  private client: GitHubClient
  private stack = new NavStack()
  private state: AppState
  private render: ReturnType<typeof makeRenderer>
  private itemsCache = new Map<string, any[]>()
  private activity: ActivityService
  private feedEvents = new Map<string, any>()
  private feedPage = 1
  private feedHasMore = false
  private feedLoading: Promise<void> | null = null

  constructor(runtime: GitHubRuntime, state: AppState, config: AppConfig, client: GitHubClient) {
    this.runtime = runtime
    this.client = client
    this.activity = new ActivityService(client)
    this.state = state
    this.render = makeRenderer(config)
    this.stack.replace({ kind: 'moduleList', module: 'feed', title: 'GitHub' })
  }

  setState(state: AppState): void {
    this.state = state
    this.client.setToken(state.token)
    if (state.token && !state.userLogin) return
    if (state.token && this.stack.current?.kind === 'moduleList') {
      void this.enterModule(this.enabledModules[0] ?? 'feed', true)
      return
    }
    void this.paint()
  }

  exitRequested(): void {
    void this.runtime.exitApp()
  }

  refresh(): void {
    void this.paint()
  }

  private get enabledModules(): ModuleId[] {
    return MODULES.filter(m => this.state.modules[m.id]).map(m => m.id)
  }

  private repoPath(repo: string): string {
    return repo.split('/').map(part => encodeURIComponent(part)).join('/')
  }

  private async paint(): Promise<void> {
    const screen = this.stack.current
    if (!screen) return
    const right = await this.renderScreen(screen)
    await this.runtime.render('', right)
  }

  private async renderScreen(screen: Screen): Promise<string> {
    if (!this.state.token) return this.render.welcomeScreen().right

    switch (screen.kind) {
      case 'moduleList':
        return this.renderModuleList()
      case 'itemList':
        return this.renderItemList(screen)
      case 'detail':
        return this.renderDetail(screen)
      case 'diff':
        return this.renderDiff(screen)
      default:
        return this.render.errorScreen('Unknown screen').right
    }
  }

  // ── Screens ──────────────────────────────────────────────────────────

  private renderModuleList(): string {
    const enabled = this.enabledModules
    const items = enabled.map(id => {
      const m = MODULES.find(x => x.id === id)!
      return { id, primary: m.label, secondary: this.countLabel(id) }
    })
    const selected = Math.max(0, enabled.indexOf(this.stack.current?.module as ModuleId ?? enabled[0]))
    return this.render.listScreen('GitHub', items, selected).right
  }

  private countLabel(_id: string): string {
    return ''
  }

  private renderItemList(screen: Screen): string {
    const items = screen.items ?? []
    const idx = screen.selectedIndex ?? 0
    return this.render.listScreen(screen.title, items, idx).right
  }

  private renderDetail(screen: Screen): string {
    const sections = screen.sections ?? []
    if (sections.length === 0) return this.render.errorScreen('No details').right
    const title = this.wrapDetailLines([screen.title]).join('\n')
    const lines = this.wrapDetailLines(sections.flatMap(entry => [entry.label, ...entry.lines, '']))
    const offset = Math.min(screen.detailOffset ?? 0, Math.max(0, lines.length - 7))
    const body = lines.slice(offset, offset + 7)
    return `${title}\n\n${body.join('\n')}`
  }

  private wrapDetailLines(lines: string[]): string[] {
    return lines.flatMap(line => {
      if (!line) return ['']
      const chunks: string[] = []
      let start = 0
      while (start < line.length) {
        const limit = Math.min(start + 54, line.length)
        let end = limit
        if (limit < line.length) {
          const breakAt = line.lastIndexOf(' ', limit)
          if (breakAt > start + 8) end = breakAt
        }
        chunks.push(line.slice(start, end).trimEnd())
        start = line[end] === ' ' ? end + 1 : end
      }
      return chunks
    })
  }

  private renderDiff(screen: Screen): string {
    return this.renderDetail(screen)
  }

  // ── Data fetching per module ─────────────────────────────────────────

  private async fetchItems(module: string): Promise<Array<{ id: string; primary: string; secondary?: string; details?: string[] }>> {
    const cached = this.itemsCache.get(module)
    if (cached) return cached as any

    try {
      switch (module) {
        case 'myRepositories': {
          const repos = await this.client.collect<any>('/user/repos?affiliation=owner&sort=updated&direction=desc', { perPage: 100, maxPages: 3 })
          const query = encodeURIComponent(`is:pr state:open archived:false user:${this.state.userLogin ?? ''}`)
          const issueQuery = encodeURIComponent(`is:issue state:open archived:false user:${this.state.userLogin ?? ''}`)
          const [pullSearch, issueSearch] = await Promise.all([
            this.client.get<{ items?: any[] }>(`/search/issues?q=${query}&per_page=100&page=1`, false).catch(() => ({ items: [] })),
            this.client.get<{ items?: any[] }>(`/search/issues?q=${issueQuery}&per_page=100&page=1`, false).catch(() => ({ items: [] })),
          ])
          const prCounts = new Map<string, number>()
          for (const pr of pullSearch.items ?? []) {
            const repo = pr.repository_url?.split('/repos/')[1]
            if (repo) prCounts.set(repo, (prCounts.get(repo) ?? 0) + 1)
          }
          const issueCounts = new Map<string, number>()
          for (const issue of issueSearch.items ?? []) {
            const repo = issue.repository_url?.split('/repos/')[1]
            if (repo) issueCounts.set(repo, (issueCounts.get(repo) ?? 0) + 1)
          }
          return repos.map(r => ({
            id: r.full_name,
            primary: `${r.full_name} [${r.private ? 'private' : 'public'}]`,
            secondary: `PR: ${prCounts.get(r.full_name) ?? 0} · STARS: ${r.stargazers_count} · ISSUES: ${issueCounts.get(r.full_name) ?? 0} · FORKS: ${r.forks_count}`,
            details: [`UPDATED ${relativeTime(r.updated_at)}`],
          }))
        }
        case 'pullRequests': {
          const query = encodeURIComponent(`is:pr -author:${this.state.userLogin ?? ''} state:open archived:false sort:updated-desc user:${this.state.userLogin ?? ''}`)
          const result = await this.client.get<{ items?: any[] }>(
            `/search/issues?q=${query}&sort=updated&order=desc&per_page=20&page=1`,
            false,
          )
          const prs = result.items ?? []
          return prs.map(p => ({
            id: `${p.repository_url?.split('/repos/')[1] ?? 'unknown'}#${p.number}`,
            primary: p.title,
            secondary: `${p.repository_url?.split('/repos/')[1] ?? 'unknown'}#${p.number}`,
            details: [`${p.user?.login ?? 'someone'} opened · Updated ${relativeTime(p.updated_at ?? '')}`],
          }))
        }
        case 'contribution': {
          const query = encodeURIComponent(`is:pr archived:false author:${this.state.userLogin ?? ''} sort:updated-desc`)
          const result = await this.client.get<{ items?: any[] }>(
            `/search/issues?q=${query}&per_page=20&page=1`,
            false,
          )
          return (result.items ?? []).map(p => ({
            id: `${p.repository_url?.split('/repos/')[1] ?? 'unknown'}#${p.number}`,
            primary: p.title,
            secondary: `${p.repository_url?.split('/repos/')[1] ?? 'unknown'}#${p.number} [${pullRequestState(p)}]`,
            details: [`by ${p.user?.login ?? this.state.userLogin ?? ''} · Updated ${relativeTime(p.updated_at ?? '')}`],
          }))
        }
        case 'collabPrs': {
          const repos = await this.client.collect<any>('/user/repos', { perPage: 10, maxPages: 2 })
          const prs: any[] = []
          for (const repo of repos.slice(0, 5)) {
            try {
              const r = await this.client.collect<any>(`/repos/${repo.full_name}/pulls?state=open`, { perPage: 10, maxPages: 1 })
              prs.push(...r.map(p => ({ ...p, repo: repo.full_name })))
            } catch {}
          }
          return prs.map(p => ({
            id: `${p.repo}#${p.number}`,
            primary: `#${p.number} ${p.title}`,
            secondary: `${p.repo} · ${p.user?.login ?? ''}`,
          }))
        }
        case 'issues': {
          const query = encodeURIComponent(`is:issue state:open archived:false user:${this.state.userLogin ?? ''} sort:updated-desc`)
          const result = await this.client.get<{ items?: any[] }>(
            `/search/issues?q=${query}&per_page=20&page=1`,
            false,
          )
          const issues = result.items ?? []
          return issues.filter(i => !i.pull_request).map(i => ({
            id: `${i.repository?.full_name ?? i.repository_url?.split('/repos/')[1] ?? 'unknown'}#${i.number}`,
            primary: i.title,
            secondary: `${i.repository?.full_name ?? i.repository_url?.split('/repos/')[1] ?? 'unknown'}#${i.number}`,
            details: [`${i.user?.login ?? 'someone'} opened · Updated ${relativeTime(i.updated_at ?? '')}`],
          }))
        }
        case 'notifications': {
          const notifs = await this.client.collect<any>('/notifications', { perPage: 20, maxPages: 3 })
          return notifs.map(n => ({
            id: n.id,
            primary: n.unread ? `● ${n.subject?.title ?? ''}` : `○ ${n.subject?.title ?? ''}`,
            secondary: `${n.repository?.full_name ?? ''} · ${n.reason ?? ''}`,
          }))
        }
        case 'feed': {
          const page = await this.activity.forFeedPage(this.state.userLogin ?? '', 1)
          this.feedPage = 1
          this.feedHasMore = page.hasMore
          this.feedEvents.clear()
          return this.mapFeedItems(page.events)
        }
        case 'explore': {
          const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const repos = await this.client.collect<any>(`/search/repositories?q=created:>${since}&sort=stars&order=desc`, { perPage: 20, maxPages: 2 })
          return repos.map(r => ({
            id: r.full_name,
            primary: r.full_name,
            secondary: `${r.language ?? ''} ★${r.stargazers_count}`,
          }))
        }
        case 'actions': {
          const repos = await this.client.collect<any>('/user/repos', { perPage: 5, maxPages: 1 })
          const runs: any[] = []
          for (const repo of repos.slice(0, 3)) {
            try {
              const r = await this.client.collect<any>(`/repos/${repo.full_name}/actions/runs`, { perPage: 10, maxPages: 1 })
              runs.push(...r.map(x => ({ ...x, repo: repo.full_name })))
            } catch {}
          }
          return runs.map(r => ({
            id: String(r.id),
            primary: r.name ?? 'Workflow',
            secondary: `${r.repo} · ${r.status}${r.conclusion ? ' · ' + r.conclusion : ''}`,
          }))
        }
        case 'profile': {
          return [{ id: 'profile', primary: '@' + (this.state.userLogin ?? ''), secondary: 'Tap to view' }]
        }
        default:
          return []
      }
    } catch {
      return [{ id: 'error', primary: 'Failed to load', secondary: 'Check token / network' }]
    }
  }

  private mapFeedItems(events: any[]): Array<{ id: string; primary: string; secondary?: string; details?: string[] }> {
    return events.map(event => {
      const id = String(event.id ?? `${event.type}:${event.repo?.name}:${event.created_at}`)
      this.feedEvents.set(id, event)
      const summary = feedEventSummary(event)
      return {
        id,
        primary: feedEventPrimary(event),
        secondary: [event.repo?.name ?? 'GitHub', relativeTime(event.created_at ?? '')].filter(Boolean).join(' · '),
        details: summary ? [summary] : undefined,
      }
    })
  }

  // ── Detail rendering per module ──────────────────────────────────────

  private async openItem(module: string, itemId: string): Promise<void> {
    try {
      switch (module) {
        case 'myRepositories':
          await this.openRepo(itemId)
          break
        case 'pullRequests':
        case 'contribution':
        case 'collabPrs':
          await this.openPr(module, itemId)
          break
        case 'issues':
          await this.openIssue(itemId)
          break
        case 'explore':
          await this.openRepo(itemId)
          break
        case 'notifications': {
          const n = await this.client.get<any>(`/notifications/threads/${itemId}`).catch(() => null)
          if (n) {
            this.stack.push({
              kind: 'detail',
              module,
              title: n.subject?.title ?? 'Notification',
              sections: [{ label: 'Details', lines: [`Repo: ${n.repository?.full_name ?? ''}`, `Type: ${n.subject?.type ?? ''}`, `Reason: ${n.reason ?? ''}`, `Updated: ${n.updated_at ?? ''}`] }],
              sectionIndex: 0,
            })
          }
          break
        }
        case 'actions': {
          this.stack.push({
            kind: 'detail',
            module,
            title: itemId,
            sections: [{ label: 'Run', lines: ['Loading run details...'] }],
            sectionIndex: 0,
          })
          break
        }
        case 'profile': {
          const user = await this.client.get<any>('/user').catch(() => null)
          if (user) {
            this.stack.push({
              kind: 'detail',
              module: 'profile',
              title: '@' + user.login,
              sections: [{
                label: 'Profile',
                lines: [
                  user.name ?? user.login,
                  user.bio ?? '',
                  `${user.public_repos} repos`,
                  `${user.followers} followers`,
                  `${user.following} following`,
                ].filter(Boolean),
              }],
              sectionIndex: 0,
            })
          }
          break
        }
        case 'feed': {
          const event = this.feedEvents.get(itemId)
          if (event) await this.openFeedEvent(event)
          break
        }
        default:
          break
      }
    } catch (err) {
      this.stack.push({
        kind: 'detail',
        module,
        title: 'Error',
        sections: [{ label: 'Error', lines: [err instanceof Error ? err.message : 'Unknown error'] }],
        sectionIndex: 0,
      })
    }
    await this.paint()
  }

  private async openRepo(fullName: string): Promise<void> {
    const repo = await this.client.get<any>(`/repos/${this.repoPath(fullName)}`).catch(() => null)
    if (!repo) return
    const prQuery = encodeURIComponent(`repo:${fullName} is:pr state:open archived:false`)
    const issueQuery = encodeURIComponent(`repo:${fullName} is:issue state:open archived:false`)
    const [prSearch, issueSearch, releases, contributors, languages] = await Promise.all([
      this.client.get<{ total_count?: number }>(`/search/issues?q=${prQuery}&per_page=1&page=1`, false).catch(() => ({ total_count: 0 })),
      this.client.get<{ total_count?: number }>(`/search/issues?q=${issueQuery}&per_page=1&page=1`, false).catch(() => ({ total_count: 0 })),
      this.client.collect<any>(`/repos/${this.repoPath(fullName)}/releases`, { perPage: 100, maxPages: 1 }).catch(() => [] as any[]),
      this.client.collect<any>(`/repos/${this.repoPath(fullName)}/contributors`, { perPage: 100, maxPages: 1 }).catch(() => [] as any[]),
      this.client.get<Record<string, number>>(`/repos/${this.repoPath(fullName)}/languages`).catch(() => ({})),
    ])
    const overviewLines = [
      `${repo.full_name} [${repo.private ? 'private' : 'public'}]`,
      `PR: ${prSearch.total_count ?? 0} · STARS: ${repo.stargazers_count} · ISSUES: ${issueSearch.total_count ?? 0} · FORKS: ${repo.forks_count}`,
      `(${repo.subscribers_count ?? repo.watchers_count ?? 0}) Watching · (${releases.length}) Releases · (${contributors.length}) Contributors`,
      repo.description ?? '',
      `Language: ${repo.language ?? '-'}`,
      `Branch: ${repo.default_branch}`,
      `Updated: ${repo.updated_at?.slice(0, 10)}`,
    ].filter(Boolean)
    const sections = [
      {
        label: 'Overview',
        lines: overviewLines,
      },
    ]
    try {
      const commits = await this.client.collect<any>(`/repos/${this.repoPath(fullName)}/commits`, { perPage: 10, maxPages: 1 })
      const latest = commits[0]
      if (latest) {
        overviewLines.push(`Last commit: @${latest.author?.login ?? latest.commit?.author?.name ?? 'unknown'} [${latest.commit?.message?.split('\n')[0] ?? ''}] ${latest.sha?.slice(0, 7)} · ${relativeTime(latest.commit?.author?.date ?? latest.commit?.committer?.date ?? '')}`)
      }
      sections.push({
        label: 'Commits',
        lines: commits.map(c => `${c.sha?.slice(0, 7)} ${c.commit?.message?.split('\n')[0] ?? ''}`),
      })
    } catch {}
    const languageTotal = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0)
    if (languageTotal > 0) {
      sections.push({
        label: 'Languages',
        lines: Object.entries(languages)
          .sort((a, b) => b[1] - a[1])
          .map(([name, bytes]) => `${name}: ${(bytes / languageTotal * 100).toFixed(1)}%`),
      })
    }
    try {
      const issues = await this.client.collect<any>(`/repos/${this.repoPath(fullName)}/issues`, { perPage: 10, maxPages: 1 })
      sections.push({
        label: 'Issues',
        lines: issues.filter(i => !i.pull_request).map(i => `#${i.number} ${i.title}`),
      })
    } catch {}
    try {
      const prs = await this.client.collect<any>(`/repos/${this.repoPath(fullName)}/pulls`, { perPage: 10, maxPages: 1 })
      sections.push({
        label: 'PRs',
        lines: prs.map(p => `#${p.number} ${p.title}`),
      })
    } catch {}

    this.stack.push({
      kind: 'detail',
      module: 'myRepositories',
      title: repo.full_name,
      sections,
      sectionIndex: 0,
      payload: { repo: fullName },
    })
  }

  private async openFeedEvent(event: any): Promise<void> {
    const repo = event.repo?.name ?? 'GitHub'
    const actor = event.actor?.display_login ?? event.actor?.login ?? 'Someone'
    const title = feedEventPrimary(event)
    const lines = [
      repo,
      relativeTime(event.created_at ?? ''),
    ]
    if (event.repositoryDescription) lines.push(event.repositoryDescription)
    const payload = event.payload ?? {}
    if (payload.release) {
      lines.push(payload.release.name ?? payload.release.tag_name ?? '')
      if (payload.release.body) lines.push(payload.release.body)
    } else if (payload.pull_request) {
      lines.push(payload.pull_request.title ?? '')
      if (payload.pull_request.body) lines.push(payload.pull_request.body)
    } else if (payload.issue) {
      lines.push(payload.issue.title ?? '')
      if (payload.issue.body) lines.push(payload.issue.body)
    } else if (payload.commits?.length) {
      lines.push(...payload.commits.map((commit: any) => commit.message ?? '').filter(Boolean))
    } else if (payload.forkee?.full_name) {
      lines.push(payload.forkee.full_name)
    }
    this.stack.push({
      kind: 'detail',
      module: 'feed',
      title,
      sections: [{ label: 'Activity', lines: lines.filter(Boolean) }],
      sectionIndex: 0,
      payload: { actor, repo, event },
    })
  }

  private async openPr(module: string, itemId: string): Promise<void> {
    const [repo, numStr] = itemId.split('#')
    const num = parseInt(numStr, 10)
    const pr = await this.client.get<any>(`/repos/${this.repoPath(repo)}/pulls/${num}`).catch(() => null)
    if (!pr) return

    const sections = [
      {
        label: 'Overview',
        lines: [
          `#${pr.number} ${pr.title}`,
          `By ${pr.user?.login} · ${pr.state}${pr.draft ? ' · draft' : ''}`,
          `${pr.head?.ref} → ${pr.base?.ref}`,
          `+${pr.additions ?? 0} -${pr.deletions ?? 0} · ${pr.changed_files ?? 0} files`,
          pr.body ?? '',
        ].filter(Boolean),
      },
    ]
    try {
      const comments = await this.client.collect<any>(`/repos/${this.repoPath(repo)}/pulls/${num}/comments`, { perPage: 10, maxPages: 1 })
      if (comments.length) {
        sections.push({
          label: 'Comments',
          lines: comments.map(c => `${c.user?.login}: ${String(c.body ?? '')}`),
        })
      }
    } catch {}
    try {
      const reviews = await this.client.collect<any>(`/repos/${this.repoPath(repo)}/pulls/${num}/reviews`, { perPage: 10, maxPages: 1 })
      if (reviews.length) {
        sections.push({
          label: 'Reviews',
          lines: reviews.map(r => `${r.user?.login}: ${r.state}`),
        })
      }
    } catch {}
    let files: any[] = []
    try {
      files = await this.client.collect<any>(`/repos/${this.repoPath(repo)}/pulls/${num}/files`, { perPage: 20, maxPages: 2 })
      if (files.length) {
        sections.push({
          label: 'Files',
          lines: files.map(f => `${f.status ?? ''} ${f.filename} (+${f.additions} -${f.deletions})`),
        })
      }
    } catch {}
    try {
      const commits = await this.client.collect<any>(`/repos/${this.repoPath(repo)}/pulls/${num}/commits`, { perPage: 10, maxPages: 1 })
      if (commits.length) {
        sections.push({
          label: 'Commits',
          lines: commits.map(c => `${c.sha?.slice(0, 7)} ${c.commit?.message?.split('\n')[0] ?? ''}`),
        })
      }
    } catch {}

    this.stack.push({
      kind: 'detail',
      module,
      title: `#${pr.number} ${pr.title}`,
      sections,
      sectionIndex: 0,
      payload: { repo, number: num, files },
    })
  }

  private async openIssue(itemId: string): Promise<void> {
    const [repo, numStr] = itemId.split('#')
    const num = parseInt(numStr, 10)
    const issue = await this.client.get<any>(`/repos/${this.repoPath(repo)}/issues/${num}`).catch(() => null)
    if (!issue) return
    const sections = [
      {
        label: 'Issue',
        lines: [
          `#${issue.number} ${issue.title}`,
          `By ${issue.user?.login} · ${issue.state}`,
          issue.body ?? '',
        ].filter(Boolean),
      },
    ]
    try {
      const comments = await this.client.collect<any>(`/repos/${this.repoPath(repo)}/issues/${num}/comments`, { perPage: 10, maxPages: 1 })
      if (comments.length) {
        sections.push({
          label: 'Comments',
          lines: comments.map(c => `${c.user?.login}: ${String(c.body ?? '')}`),
        })
      }
    } catch {}

    this.stack.push({
      kind: 'detail',
      module: 'issues',
      title: `#${issue.number} ${issue.title}`,
      sections,
      sectionIndex: 0,
    })
  }

  // ── Gesture handling ─────────────────────────────────────────────────

  bind(): void {
    const runtime = this.runtime

    runtime.onSwipe(dir => {
      void this.handleSwipe(dir).catch(() => {})
    })

    runtime.onTap(() => {
      void this.handleTap()
    })

    runtime.onDoubleTap(() => {
      if (this.stack.isRoot()) {
        void runtime.exitApp()
      } else {
        this.stack.pop()
        void this.paint()
      }
    })

    runtime.onMenuSelect(selectedIndex => {
      const enabled = this.enabledModules
      const module = enabled[selectedIndex - 1]
      if (module) {
        void this.enterModule(module, true)
      }
    })

    runtime.onForeground(() => {
      void this.paint()
    })
  }

  private async handleSwipe(dir: 'up' | 'down'): Promise<void> {
    const screen = this.stack.current
    if (!screen) return
    const delta = dir === 'down' ? 1 : -1

    if (screen.kind === 'moduleList') {
      const enabled = this.enabledModules
      let idx = enabled.indexOf(screen.module as ModuleId)
      idx = (idx + delta + enabled.length) % enabled.length
      screen.module = enabled[idx]
      await this.paint()
    } else if (screen.kind === 'itemList') {
      const items = screen.items ?? []
      if (items.length === 0) return
      const current = screen.selectedIndex ?? 0
      if (screen.module === 'feed') {
        if (delta < 0) {
          screen.selectedIndex = Math.max(0, current - 1)
        } else if (current < items.length - 1) {
          screen.selectedIndex = current + 1
          if (screen.selectedIndex >= items.length - 4 && this.feedHasMore) {
            void this.loadNextFeedPage(screen).catch(() => {})
          }
        } else if (this.feedHasMore) {
          await this.loadNextFeedPage(screen, false)
          if (items.length > current + 1) screen.selectedIndex = current + 1
        }
      } else {
        screen.selectedIndex = (current + delta + items.length) % items.length
      }
      await this.paint()
    } else if (screen.kind === 'detail') {
      const sections = screen.sections ?? []
      if (sections.length === 0) return
      const lineCount = this.wrapDetailLines(sections.flatMap(entry => [entry.label, ...entry.lines, ''])).length
      const maxOffset = Math.max(0, lineCount - 7)
      const offset = screen.detailOffset ?? 0
      if (delta > 0 && offset < maxOffset) {
        screen.detailOffset = Math.min(maxOffset, offset + 6)
      } else if (delta < 0 && offset > 0) {
        screen.detailOffset = Math.max(0, offset - 6)
      } else {
        return
      }
      await this.paint()
    }
  }

  private async loadNextFeedPage(screen: Screen, repaint = true): Promise<void> {
    if (!this.feedHasMore || screen.module !== 'feed' || !screen.items) return
    if (this.feedLoading) {
      await this.feedLoading
      if (repaint && this.stack.current === screen) await this.paint()
      return
    }

    const task = (async () => {
      const items = screen.items!
      const known = new Set(items.map(item => item.id))
      const oldestLoadedEvent = this.feedEvents.get(items.at(-1)?.id ?? '')?.created_at ?? ''
      let added: Array<{ id: string; primary: string; secondary?: string; details?: string[] }> = []
      while (this.feedHasMore && added.length === 0) {
        const pageNumber = this.feedPage + 1
        const page = await this.activity.forFeedPage(this.state.userLogin ?? '', pageNumber)
        this.feedPage = pageNumber
        this.feedHasMore = page.hasMore
        const olderEvents = page.events.filter(event => !oldestLoadedEvent || String(event.created_at ?? '') <= oldestLoadedEvent)
        added = this.mapFeedItems(olderEvents).filter(item => !known.has(item.id))
      }
      items.push(...added)
      this.itemsCache.set('feed', items)
    })()
    this.feedLoading = task
    try {
      await task
    } finally {
      if (this.feedLoading === task) this.feedLoading = null
    }
    if (repaint && this.stack.current === screen) await this.paint()
  }

  private async handleTap(): Promise<void> {
    const screen = this.stack.current
    if (!screen) return

    if (screen.kind === 'moduleList') {
      await this.enterModule(screen.module as ModuleId)
    } else if (screen.kind === 'itemList') {
      const items = screen.items ?? []
      const item = items[screen.selectedIndex ?? 0]
      if (item) {
        await this.openItem(screen.module, item.id)
      }
    } else if (screen.kind === 'detail') {
      // Tap on detail: if it's a PR with files, go to diff viewer for first file
      const payload = screen.payload as any
      if (payload?.files?.length > 0) {
        const file = payload.files[0]
        this.stack.push({
          kind: 'diff',
          module: screen.module,
          title: file.filename ?? 'Diff',
          sections: [{
            label: file.filename ?? 'Diff',
            lines: (file.patch ?? 'No patch available').split('\n'),
          }],
          sectionIndex: 0,
          payload,
        })
        await this.paint()
      }
    }
  }

  private async enterModule(module: ModuleId, replace = false): Promise<void> {
    const items = await this.fetchItems(module)
    this.itemsCache.set(module, items as any)
    const screen = {
      kind: 'itemList',
      module,
      title: MODULES.find(m => m.id === module)?.label ?? module,
      items,
      selectedIndex: 0,
    } as const
    if (replace) this.stack.replace(screen)
    else this.stack.push(screen)
    await this.paint()
  }

  start(): void {
    void this.paint()
  }
}
