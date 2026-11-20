// Glasses side of GitHub G2.
//
// Root is a three-page dashboard drawn as HUD art: contributions with their
// heatmap, your pull requests as a state bar, and the modules as a git graph
// with counts. Tap a module to open its list in the Box, tap an item to read
// it, double tap to go back. Hold opens the module menu.

import type { GitHubRuntime } from '../even'
import { GitHubClient } from '../github/client'
import { ActivityService } from '../github/activity'
import { NavStack, type ListItem, type Screen } from './navigation'
import { Hud, type HudView } from './hud/display'
import type { IconName } from './hud/art'
import { BODY_LINES, HINT_LINES, TEXT_BOXES, type BoxScroll } from './hud/pages'
import { SEP, alignRight, lines, oneLine, row, truncate, wrap } from './hud/text'
import type { AppState, ModuleId } from '../types'
import type { AppConfig } from '../config'

interface ModuleInfo {
  id: ModuleId
  label: string
  title: string
  icon: IconName
}

/** Modules in the order the dashboard tree lists them. */
export const MODULES: readonly ModuleInfo[] = [
  { id: 'contribution', label: 'My PRs', title: 'MY PULL REQUESTS', icon: 'pull' },
  { id: 'pullRequests', label: 'PRs on my repos', title: 'PRS ON MY REPOS', icon: 'pull' },
  { id: 'issues', label: 'Issues', title: 'ISSUES', icon: 'issue' },
  { id: 'notifications', label: 'Notifications', title: 'INBOX', icon: 'bell' },
  { id: 'feed', label: 'Feed', title: 'FEED', icon: 'pulse' },
  { id: 'explore', label: 'Trending', title: 'TRENDING', icon: 'star' },
  { id: 'myRepositories', label: 'My repos', title: 'MY REPOS', icon: 'repo' },
  { id: 'collabPrs', label: 'Collab PRs', title: 'COLLAB PRS', icon: 'people' },
  { id: 'actions', label: 'Actions', title: 'ACTIONS', icon: 'play' },
  { id: 'profile', label: 'Profile', title: 'PROFILE', icon: 'person' },
]

/** Hold-menu entries: the dashboard, then every module. Max 10 on the glass. */
export const DASHBOARD_MENU_ID = 100
export const GLASSES_MENU = [
  { id: DASHBOARD_MENU_ID, label: 'Dashboard' },
  ...MODULES.slice(0, 9).map((m, i) => ({ id: DASHBOARD_MENU_ID + 1 + i, label: m.label })),
]

const DASHBOARD_PAGES = 3
const TREE_PAGE = 2
const STALE_MS = 2 * 60_000
const BODY_PX = TEXT_BOXES.body.width - 4
const HINT_PX = TEXT_BOXES.hint.width - 4
const COUNT_PX = TEXT_BOXES.count.width - 6

interface DashboardStats {
  contributions: number | null
  weeks: number[][]
  repos: number
  stars: number
  followers: number
  prTotal: number
  prOpen: number
  prMerged: number
  prClosed: number
  counts: Partial<Record<ModuleId, number>>
  loadedAt: number
}

interface ContributionCalendar {
  totalContributions: number
  weeks: Array<{ contributionDays: Array<{ contributionCount: number }> }>
}

const formatCount = (n: number | null | undefined) => (n == null ? '-' : n.toLocaleString('en-US'))

function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (seconds < 45) return 'now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

function moduleInfo(id: string): ModuleInfo {
  return MODULES.find(m => m.id === id) ?? { id: id as ModuleId, label: id, title: id.toUpperCase(), icon: 'github' }
}

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
  private hud: Hud
  private stack = new NavStack()
  private state: AppState
  private itemsCache = new Map<string, any[]>()
  private activity: ActivityService
  private feedEvents = new Map<string, any>()
  private feedPage = 1
  private feedHasMore = false
  private feedLoading: Promise<void> | null = null
  private stats: DashboardStats | null = null
  private statsLoading: Promise<void> | null = null
  private wrapped = new WeakMap<Screen, string[]>()

  constructor(runtime: GitHubRuntime, state: AppState, _config: AppConfig, client: GitHubClient) {
    this.runtime = runtime
    this.client = client
    this.hud = new Hud(runtime)
    this.activity = new ActivityService(client)
    this.state = state
    this.stack.replace({ kind: 'dashboard', module: 'dashboard', title: 'GITHUB', page: 0, selectedIndex: 0 })
  }

  setState(state: AppState): void {
    const tokenChanged = state.token !== this.state.token
    this.state = state
    this.client.setToken(state.token)
    if (tokenChanged) {
      this.stats = null
      this.itemsCache.clear()
      this.stack.replace({ kind: 'dashboard', module: 'dashboard', title: 'GITHUB', page: 0, selectedIndex: 0 })
    }
    if (state.token && state.userLogin && !this.stats) void this.loadDashboard()
    void this.paint()
  }

  exitRequested(): void {
    void this.runtime.exitApp()
  }

  refresh(): void {
    void this.paint()
  }

  start(): void {
    void this.paint()
  }

  private get enabledModules(): ModuleInfo[] {
    const enabled = MODULES.filter(m => this.state.modules[m.id])
    return enabled.length ? enabled : [...MODULES]
  }

  private repoPath(repo: string): string {
    return repo.split('/').map(part => encodeURIComponent(part)).join('/')
  }

  private paint(): Promise<void> {
    return this.hud.show(this.view())
  }

  // ---------- dashboard data ----------

  private async countIssues(query: string): Promise<number> {
    const q = encodeURIComponent(query)
    const result = await this.client.get<{ total_count?: number }>(`/search/issues?q=${q}&per_page=1`, false)
    return result.total_count ?? 0
  }

  private loadDashboard(): Promise<void> {
    if (this.statsLoading) return this.statsLoading
    const login = this.state.userLogin
    if (!login) return Promise.resolve()
    this.statsLoading = (async () => {
      const safe = <T>(work: Promise<T>, fallback: T) => work.catch(() => fallback)
      const [user, repos, contributions, prTotal, prOpen, prMerged, onMine, issues, unread] = await Promise.all([
        safe(this.client.get<any>('/user', false), null),
        safe(this.client.collect<any>('/user/repos?affiliation=owner', { perPage: 100, maxPages: 3 }), [] as any[]),
        safe(
          this.client
            .graphql<{ viewer: { contributionsCollection: { contributionCalendar: ContributionCalendar } } }>(
              'query { viewer { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { contributionCount } } } } } }',
            )
            .then(d => d.viewer.contributionsCollection.contributionCalendar),
          null,
        ),
        safe(this.countIssues(`is:pr author:${login}`), 0),
        safe(this.countIssues(`is:pr is:open author:${login}`), 0),
        safe(this.countIssues(`is:pr is:merged author:${login}`), 0),
        safe(this.countIssues(`is:pr is:open archived:false user:${login} -author:${login}`), 0),
        safe(this.countIssues(`is:issue is:open archived:false user:${login}`), 0),
        safe(this.client.get<any[]>('/notifications?per_page=50', false), [] as any[]),
      ])
      this.stats = {
        contributions: contributions?.totalContributions ?? null,
        weeks: (contributions?.weeks ?? []).map(w => w.contributionDays.map(day => day.contributionCount)),
        repos: (user?.public_repos ?? 0) + (user?.total_private_repos ?? 0) || repos.length,
        stars: repos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0),
        followers: user?.followers ?? 0,
        prTotal,
        prOpen,
        prMerged,
        prClosed: Math.max(0, prTotal - prOpen - prMerged),
        counts: {
          contribution: prOpen,
          pullRequests: onMine,
          issues,
          notifications: unread.length,
          myRepositories: repos.length,
        },
        loadedAt: Date.now(),
      }
    })().finally(() => { this.statsLoading = null })
    return this.statsLoading.then(() => {
      if (this.stack.current?.kind === 'dashboard') void this.paint()
    })
  }

  // ---------- views ----------

  private view(): HudView {
    if (!this.state.token) return this.welcomeView()
    const screen = this.stack.current!
    switch (screen.kind) {
      case 'dashboard': return this.dashboardView(screen)
      case 'itemList': return this.listView(screen)
      case 'detail':
      case 'diff': return this.detailView(screen)
    }
  }

  private box(icon: IconName, title: string, body: string[], hint: string[], scroll?: BoxScroll, count = ''): HudView {
    return {
      kind: 'box',
      icon,
      title,
      count: count ? alignRight(count, COUNT_PX) : ' ',
      body: lines(body, BODY_LINES),
      hint: lines(hint.map(h => truncate(h, HINT_PX)), HINT_LINES),
      scroll,
    }
  }

  private welcomeView(): HudView {
    return this.box('github', 'GITHUB', [
      'Not connected.',
      '',
      'Open GitHub G2 on your phone',
      'and paste a token to connect.',
    ], ['offline', '2x exit'])
  }

  private dashboardView(screen: Screen): HudView {
    const s = this.stats
    const login = this.state.userLogin ? `@${this.state.userLogin}` : ''
    const updated = s ? `Updated ${ago(s.loadedAt)}` : 'Loading...'
    const index = screen.page ?? 0
    const page = { index, count: DASHBOARD_PAGES }

    if (index === 0) {
      const hasContributions = s?.contributions != null
      return {
        kind: 'overview',
        data: {
          title: 'GITHUB',
          page,
          label: hasContributions ? 'CONTRIBUTIONS' : 'REPOSITORIES',
          value: formatCount(hasContributions ? s!.contributions : s?.repos),
          sublabel: hasContributions ? 'in the last year' : 'owned by you',
          weeks: s?.weeks ?? [],
          stats: [
            { label: 'Repos', value: formatCount(s?.repos), icon: 'repo' },
            { label: 'Stars', value: formatCount(s?.stars), icon: 'star' },
            { label: 'Followers', value: formatCount(s?.followers), icon: 'people' },
          ],
          footer: { left: updated, right: login },
        },
      }
    }

    if (index === 1) {
      const percent = s && s.prTotal ? (s.prMerged / s.prTotal) * 100 : 0
      return {
        kind: 'stateBar',
        data: {
          title: 'PULL REQUESTS',
          page,
          headline: s ? `${percent.toFixed(1)}%` : '-',
          caption: 'of your pull requests merged',
          aside: { label: 'Authored', value: formatCount(s?.prTotal), icon: 'pull' },
          segments: [
            { label: 'Merged', value: formatCount(s?.prMerged), count: s?.prMerged ?? 0, fill: 'solid' },
            { label: 'Open', value: formatCount(s?.prOpen), count: s?.prOpen ?? 0, fill: 'hatch' },
            { label: 'Closed', value: formatCount(s?.prClosed), count: s?.prClosed ?? 0, fill: 'outline' },
          ],
          footer: { left: updated, right: login },
        },
      }
    }

    const modules = this.enabledModules
    const selected = Math.min(screen.selectedIndex ?? 0, modules.length - 1)
    return {
      kind: 'graph',
      data: {
        title: 'MODULES',
        page,
        selected,
        rows: modules.map(m => {
          const count = s?.counts[m.id]
          return { label: m.label, icon: m.icon, value: count == null ? '' : formatCount(count) }
        }),
        footer: { left: 'swipe · tap open', right: `${selected + 1} of ${modules.length}` },
      },
    }
  }

  private listView(screen: Screen): HudView {
    const info = moduleInfo(screen.module)
    const items = screen.items
    if (!items) return this.box(info.icon, info.title, ['Loading...'], ['fetching from GitHub', '2x back'])
    if (!items.length) {
      return this.box(info.icon, info.title, ['Nothing here yet.'], [`${info.label} is empty`, '2x back'])
    }
    const cursor = Math.min(screen.selectedIndex ?? 0, items.length - 1)
    const start = Math.floor(cursor / BODY_LINES) * BODY_LINES
    const rows = items.slice(start, start + BODY_LINES).map((item, i) => {
      const label = item.secondary ? `${item.primary}${SEP}${item.secondary}` : item.primary
      return row(label, start + i === cursor, BODY_PX)
    })
    const meta = oneLine(items[cursor]?.details?.[0] ?? '') || info.label
    return this.box(info.icon, info.title, rows, [meta, 'swipe choose  ·  tap open  ·  2x back'], {
      offset: start,
      total: items.length,
      visible: BODY_LINES,
    }, `${cursor + 1}/${items.length}`)
  }

  private detailRows(screen: Screen): string[] {
    const cached = this.wrapped.get(screen)
    if (cached) return cached
    const sections = screen.sections ?? []
    const out: string[] = []
    sections.forEach((section, i) => {
      if (sections.length > 1) {
        if (i > 0) out.push('')
        out.push(`[ ${section.label.toUpperCase()} ]`)
      }
      for (const line of section.lines) {
        const wrappedLine = wrap(line, BODY_PX)
        out.push(...(wrappedLine.length ? wrappedLine : ['']))
      }
    })
    if (!out.length) out.push('Nothing to show.')
    this.wrapped.set(screen, out)
    return out
  }

  private detailView(screen: Screen): HudView {
    const info = moduleInfo(screen.module)
    const rows = this.detailRows(screen)
    const pages = Math.max(1, Math.ceil(rows.length / BODY_LINES))
    const page = Math.min(screen.detailPage ?? 0, pages - 1)
    const body = rows.slice(page * BODY_LINES, (page + 1) * BODY_LINES)
    const where = info.label
    const hasDiff = screen.kind === 'detail' && ((screen.payload as any)?.files?.length ?? 0) > 0
    const controls = [pages > 1 ? 'swipe page' : '', hasDiff ? 'tap diff' : '', '2x back'].filter(Boolean).join('  ·  ')
    return this.box(screen.kind === 'diff' ? 'commit' : info.icon, screen.title, body, [where, controls], {
      offset: page * BODY_LINES,
      total: rows.length,
      visible: BODY_LINES,
    }, pages > 1 ? `${page + 1}/${pages}` : '')
  }

  // ---------- input ----------

  bind(): void {
    this.runtime.onSwipe(dir => void this.handleSwipe(dir === 'down' ? 1 : -1).catch(() => {}))
    this.runtime.onTap(() => void this.handleTap().catch(() => {}))
    this.runtime.onDoubleTap(() => void this.back())
    this.runtime.onMenuSelect(id => void this.handleMenu(id).catch(() => {}))
    this.runtime.onForeground(() => void this.paint())
  }

  private async back(): Promise<void> {
    if (this.stack.isRoot() || !this.state.token) {
      await this.runtime.exitApp()
      return
    }
    this.stack.pop()
    const now = this.stack.current
    if (now?.kind === 'dashboard' && (!this.stats || Date.now() - this.stats.loadedAt > STALE_MS)) void this.loadDashboard()
    await this.paint()
  }

  private async handleMenu(id: number): Promise<void> {
    if (!this.state.token) return
    const root = this.stack.root!
    if (id === DASHBOARD_MENU_ID) {
      this.stack.replace(root)
      root.page = 0
      await this.paint()
      return
    }
    const module = MODULES[id - DASHBOARD_MENU_ID - 1]
    if (!module) return
    const index = this.enabledModules.findIndex(m => m.id === module.id)
    root.page = TREE_PAGE
    if (index >= 0) root.selectedIndex = index
    await this.enterModule(module.id, true)
  }

  private async handleSwipe(delta: number): Promise<void> {
    const screen = this.stack.current
    if (!screen || !this.state.token) return

    if (screen.kind === 'dashboard') {
      const page = screen.page ?? 0
      if (page < TREE_PAGE) {
        const next = Math.max(0, Math.min(TREE_PAGE, page + delta))
        if (next === page) return
        screen.page = next
        screen.selectedIndex = 0
      } else {
        const count = this.enabledModules.length
        const current = screen.selectedIndex ?? 0
        if (delta < 0 && current === 0) {
          screen.page = TREE_PAGE - 1
        } else {
          const next = Math.max(0, Math.min(count - 1, current + delta))
          if (next === current) return
          screen.selectedIndex = next
        }
      }
      await this.paint()
      return
    }

    if (screen.kind === 'itemList') {
      const items = screen.items ?? []
      if (!items.length) return
      const current = screen.selectedIndex ?? 0
      if (screen.module === 'feed' && delta > 0 && current >= items.length - 1) {
        if (!this.feedHasMore) return
        await this.loadNextFeedPage(screen, false)
      }
      const next = Math.max(0, Math.min(items.length - 1, current + delta))
      if (next === current) return
      screen.selectedIndex = next
      if (screen.module === 'feed' && next >= items.length - 4 && this.feedHasMore) {
        void this.loadNextFeedPage(screen).catch(() => {})
      }
      await this.paint()
      return
    }

    const pages = Math.max(1, Math.ceil(this.detailRows(screen).length / BODY_LINES))
    const page = screen.detailPage ?? 0
    const next = Math.max(0, Math.min(pages - 1, page + delta))
    if (next === page) return
    screen.detailPage = next
    await this.paint()
  }

  private async handleTap(): Promise<void> {
    const screen = this.stack.current
    if (!screen || !this.state.token) return

    if (screen.kind === 'dashboard') {
      if ((screen.page ?? 0) < TREE_PAGE) {
        screen.page = TREE_PAGE
        await this.paint()
        return
      }
      const module = this.enabledModules[screen.selectedIndex ?? 0]
      if (module) await this.enterModule(module.id)
      return
    }

    if (screen.kind === 'itemList') {
      const item = screen.items?.[screen.selectedIndex ?? 0]
      if (item && item.id !== 'error') await this.openItem(screen.module, item.id)
      return
    }

    // Detail: open the pull request's first changed file as a diff.
    const files = (screen.payload as any)?.files as any[] | undefined
    if (screen.kind === 'detail' && files?.length) {
      const file = files[0]
      this.stack.push({
        kind: 'diff',
        module: screen.module,
        title: file.filename ?? 'Diff',
        sections: [{ label: file.filename ?? 'Diff', lines: String(file.patch ?? 'No patch available').split('\n') }],
        detailPage: 0,
      })
      await this.paint()
    }
  }

  private async enterModule(module: ModuleId, fromMenu = false): Promise<void> {
    const screen: Screen = {
      kind: 'itemList',
      module,
      title: moduleInfo(module).title,
      selectedIndex: 0,
    }
    if (fromMenu) this.stack.resetTo(screen)
    else this.stack.push(screen)
    void this.paint()

    this.itemsCache.delete(module)
    const items = await this.fetchItems(module)
    this.itemsCache.set(module, items)
    screen.items = items as ListItem[]
    if (this.stack.current === screen) await this.paint()
  }

  // Fetch list items for the selected module.

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
            scope: 'My Repos',
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
            scope: 'Open PRs',
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

  // Load details for the selected item.

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

}
