// Glasses side of GitHub G2.
//
// Root is a three-page dashboard drawn as HUD art: contributions with their
// heatmap, your pull requests as a state bar, and the modules as a git graph
// with counts. Tap a module to open its list in the Box, tap an item to read
// it, double tap to go back. Hold opens the module menu.

import type { GitHubRuntime } from '../even'
import { GitHubClient } from '../github/client'
import { ActivityService } from '../github/activity'
import { SearchService } from '../github/search'
import { ActionsService, isActiveRun, type WorkflowJob, type WorkflowRun } from '../github/actions'
import { NavStack, type ListItem, type Screen } from './navigation'
import { Hud, type HudView } from './hud/display'
import type { IconName } from './hud/art'
import { BODY_LINES, HINT_LINES, TEXT_BOXES } from './hud/pages'
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
  { id: 'actions', label: 'Actions', title: 'ACTIONS', icon: 'play' },
  { id: 'profile', label: 'My profile', title: 'PROFILE', icon: 'person' },
]

/** Hold-menu entries: the dashboard, then every module. Max 10 on the glass. */
export const DASHBOARD_MENU_ID = 100
export const GLASSES_MENU = [
  { id: DASHBOARD_MENU_ID, label: 'Dashboard' },
  ...MODULES.map((m, i) => ({ id: DASHBOARD_MENU_ID + 1 + i, label: m.label })),
]

const SPLASH_TEXT = 'GitGlass.\nGitHub on the move.'
const SPLASH_TYPE_MS = 45
const SPLASH_HOLD_MS = 700
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

function runIcon(run: Pick<WorkflowRun, 'status' | 'conclusion'>): IconName {
  if (isActiveRun(run)) return 'play'
  if (run.conclusion === 'success') return 'check'
  if (run.conclusion === 'skipped' || run.conclusion === 'neutral') return 'commit'
  return 'cross'
}

function runState(run: Pick<WorkflowRun, 'status' | 'conclusion'>): string {
  if (run.status === 'in_progress') return 'running'
  if (isActiveRun(run)) return run.status
  return (run.conclusion ?? 'done').replace('_', ' ')
}

function stepMark(step: { status: string; conclusion: string | null }): string {
  if (step.status !== 'completed') return step.status === 'in_progress' ? '▶' : '○'
  if (step.conclusion === 'success') return '●'
  if (step.conclusion === 'skipped') return '-'
  return 'x'
}

function duration(from: number, to: number): string {
  const seconds = Math.max(0, Math.round((to - from) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function prIcon(item: any): IconName {
  if (item.pull_request?.merged_at || item.merged_at) return 'check'
  return item.state === 'closed' ? 'cross' : 'pull'
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
  private itemsCache = new Map<string, ListItem[]>()
  private prefetching = new Set<string>()
  private activity: ActivityService
  private search: SearchService
  private actions: ActionsService
  private feedEvents = new Map<string, any>()
  private feedPage = 1
  private feedHasMore = false
  private feedLoading: Promise<void> | null = null
  private booting = true
  private stats: DashboardStats | null = null
  private statsLoading: Promise<void> | null = null
  private wrapped = new WeakMap<Screen, string[]>()

  constructor(runtime: GitHubRuntime, state: AppState, _config: AppConfig, client: GitHubClient) {
    this.runtime = runtime
    this.client = client
    this.hud = new Hud(runtime)
    this.activity = new ActivityService(client)
    this.search = new SearchService(client)
    this.actions = new ActionsService(client)
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
    void this.boot()
  }

  private async boot(): Promise<void> {
    const text = SPLASH_TEXT
    const frames = 5
    let shownFrame = -1
    for (let typed = 1; typed <= text.length; typed++) {
      const frame = Math.min(frames, Math.ceil((typed / text.length) * frames))
      const view: HudView = { kind: 'splash', progress: frame / frames, text: text.slice(0, typed) + (typed < text.length ? '_' : '') }
      if (frame !== shownFrame) {
        shownFrame = frame
        await this.hud.show(view)
      } else {
        void this.hud.show(view)
        await new Promise(resolve => setTimeout(resolve, SPLASH_TYPE_MS))
      }
    }
    await this.hud.show({ kind: 'splash', progress: 1, text })
    await new Promise(resolve => setTimeout(resolve, SPLASH_HOLD_MS))
    this.booting = false
    await this.paint()
  }

  private get enabledModules(): ModuleInfo[] {
    const enabled = MODULES.filter(m => this.state.modules[m.id])
    return enabled.length ? enabled : [...MODULES]
  }

  private repoPath(repo: string): string {
    return repo.split('/').map(part => encodeURIComponent(part)).join('/')
  }

  private paint(): Promise<void> {
    if (this.booting) return Promise.resolve()
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

  private box(icon: IconName, title: string, body: string[], hint: string[], count = '', rowIcons: Array<IconName | null> = []): HudView {
    return {
      kind: 'box',
      icon,
      title,
      count: count ? alignRight(count, COUNT_PX) : ' ',
      body: lines(body, BODY_LINES),
      hint: lines(hint.map(h => truncate(h, HINT_PX)), HINT_LINES),
      rowIcons,
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
    const page = items.slice(start, start + BODY_LINES)
    const withIcons = page.some(item => item.icon)
    const rows = page.map((item, i) => {
      const label = item.secondary ? `${item.primary}${SEP}${item.secondary}` : item.primary
      return row(label, start + i === cursor, BODY_PX, withIcons)
    })
    const meta = oneLine(items[cursor]?.details?.[0] ?? '') || info.label
    const icons = page.map(item => item.icon ?? null)
    return this.box(info.icon, info.title, rows, [meta, 'swipe choose  ·  tap open  ·  2x back'], `${cursor + 1}/${items.length}`, icons)
  }

  private detailRows(screen: Screen): string[] {
    const cached = this.wrapped.get(screen)
    if (cached) return cached
    const sections = screen.sections ?? []
    const out: string[] = []
    sections.forEach(section => {
      const body = section.lines.flatMap(line => {
        const wrappedLine = wrap(line, BODY_PX)
        return wrappedLine.length ? wrappedLine : ['']
      })
      const block = sections.length > 1 ? [`[ ${section.label.toUpperCase()} ]`, ...body] : body
      const used = out.length % BODY_LINES
      if (used > 0) {
        const room = BODY_LINES - used
        if (room >= block.length + 1) out.push('')
        else while (out.length % BODY_LINES) out.push('')
      }
      out.push(...block)
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
    return this.box(screen.kind === 'diff' ? 'commit' : (screen.icon ?? info.icon), screen.title, body, [where, controls], pages > 1 ? `${page + 1}/${pages}` : '')
  }

  // ---------- input ----------

  bind(): void {
    this.runtime.onSwipe(dir => { if (!this.booting) void this.handleSwipe(dir === 'down' ? 1 : -1).catch(() => {}) })
    this.runtime.onTap(() => { if (!this.booting) void this.handleTap().catch(() => {}) })
    this.runtime.onDoubleTap(() => { if (!this.booting) void this.back() })
    this.runtime.onMenuSelect(id => { if (!this.booting) void this.handleMenu(id).catch(() => {}) })
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
        if (next === TREE_PAGE) this.prefetch(this.enabledModules[0].id)
      } else {
        const count = this.enabledModules.length
        const current = screen.selectedIndex ?? 0
        if (delta < 0 && current === 0) {
          screen.page = TREE_PAGE - 1
        } else {
          const next = Math.max(0, Math.min(count - 1, current + delta))
          if (next === current) return
          screen.selectedIndex = next
          this.prefetch(this.enabledModules[next].id)
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
      if (item && item.id !== 'error') await this.openItem(screen.module, item)
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
    if (module === 'profile') {
      if (fromMenu) while (!this.stack.isRoot()) this.stack.pop()
      await this.openItem('profile', { id: 'profile', primary: `@${this.state.userLogin ?? ''}`, icon: 'person' })
      return
    }
    const cached = this.itemsCache.get(module)
    if (cached) screen.items = cached
    if (fromMenu) this.stack.resetTo(screen)
    else this.stack.push(screen)
    void this.paint()

    const items = await this.fetchItems(module, true)
    this.itemsCache.set(module, items)
    const selected = screen.items?.[screen.selectedIndex ?? 0]?.id
    screen.items = items
    const keep = items.findIndex(item => item.id === selected)
    screen.selectedIndex = keep >= 0 ? keep : Math.min(screen.selectedIndex ?? 0, Math.max(0, items.length - 1))
    if (this.stack.current === screen) await this.paint()
  }

  private prefetch(module: ModuleId): void {
    if (this.itemsCache.has(module) || this.prefetching.has(module)) return
    this.prefetching.add(module)
    void this.fetchItems(module, true)
      .then(items => { if (!this.itemsCache.has(module)) this.itemsCache.set(module, items) })
      .finally(() => this.prefetching.delete(module))
  }

  // Fetch list items for the selected module.

  private async fetchItems(module: string, fresh = false): Promise<ListItem[]> {
    const cached = this.itemsCache.get(module)
    if (cached && !fresh) return cached

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
            icon: prIcon(p),
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
            secondary: `${p.repository_url?.split('/repos/')[1] ?? 'unknown'}#${p.number}`,
            icon: prIcon(p),
            details: [`by ${p.user?.login ?? this.state.userLogin ?? ''} · Updated ${relativeTime(p.updated_at ?? '')}`],
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
          const repos = await this.search.trending()
          return repos.map(r => ({
            id: r.full_name ?? r.name,
            primary: r.full_name ?? r.name,
            secondary: [r.language, `${formatCount(r.stargazers_count)} stars`].filter(Boolean).join(SEP),
            icon: 'star',
            details: [oneLine(r.description) || `created ${relativeTime(r.created_at ?? '')}`],
          }))
        }
        case 'actions': {
          const repos = await this.client.collect<any>('/user/repos?affiliation=owner&sort=pushed&direction=desc', { perPage: 8, maxPages: 1 })
          const runs = await this.actions.recent(repos.slice(0, 8).map(r => r.full_name), 8)
          const running = runs.filter(isActiveRun).length
          if (this.stats) this.stats.counts.actions = running
          return runs.slice(0, 40).map(run => ({
            id: `${run.repo}#${run.id}`,
            primary: run.display_title || run.name,
            secondary: `${run.repo.split('/')[1]}${SEP}${run.head_branch}`,
            icon: runIcon(run),
            details: [`${runState(run)}${SEP}${relativeTime(run.run_started_at ?? run.created_at)}${SEP}${run.name}`],
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

  private mapFeedItems(events: any[]): ListItem[] {
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

  private async openItem(module: string, item: ListItem): Promise<void> {
    const itemId = item.id
    const number = itemId.includes('#') ? itemId.split('#').pop() : ''
    const placeholder: Screen = {
      kind: 'detail',
      module,
      title: number && !item.primary.startsWith('#') ? `#${number} ${item.primary}` : item.primary,
      icon: item.icon,
      loading: true,
      sections: [{ label: '', lines: ['Loading...'] }],
      detailPage: 0,
    }
    this.stack.push(placeholder)
    void this.paint()
    const depth = this.stack.depth
    await this.loadItem(module, itemId)
    const opened = this.stack.depth > depth ? this.stack.pop() : null
    if (this.stack.current !== placeholder) return
    this.stack.pop()
    if (opened) this.stack.push(opened)
    await this.paint()
  }

  private async loadItem(module: string, itemId: string): Promise<void> {
    try {
      switch (module) {
        case 'myRepositories':
          await this.openRepo(itemId)
          break
        case 'pullRequests':
        case 'contribution':
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
        case 'actions':
          await this.openRun(itemId)
          break
        case 'profile':
          await this.openProfile()
          break
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
  }

  private async openRun(itemId: string): Promise<void> {
    const cut = itemId.lastIndexOf('#')
    const repo = itemId.slice(0, cut)
    const id = Number(itemId.slice(cut + 1))
    const [run, jobs] = await Promise.all([
      this.actions.run(repo, id).catch(() => null),
      this.actions.jobs(repo, id).catch(() => [] as WorkflowJob[]),
    ])
    if (!run) return
    const started = run.run_started_at ?? run.created_at
    const ended = isActiveRun(run) ? Date.now() : Date.parse(run.updated_at ?? started)
    const sections = [
      {
        label: 'Run',
        lines: [
          `${run.name} #${run.run_number ?? ''}`.trim(),
          `${repo}${SEP}${run.head_branch}`,
          `${runState(run)}${SEP}${duration(Date.parse(started), ended)}`,
          `${run.event} by ${run.actor?.login ?? 'someone'}${SEP}${relativeTime(started)}`,
        ],
      },
    ]
    for (const job of jobs) {
      const steps = (job.steps ?? []).map(step => `${stepMark(step)} ${step.name}`)
      sections.push({ label: `${stepMark(job)} ${job.name}`, lines: steps.length ? steps : [job.status] })
    }
    this.stack.push({
      kind: 'detail',
      module: 'actions',
      title: run.display_title || run.name,
      icon: runIcon(run),
      sections,
      sectionIndex: 0,
    })
  }

  private async openProfile(): Promise<void> {
    const login = this.state.userLogin ?? ''
    const none = [] as any[]
    const [user, repos, orgs, events] = await Promise.all([
      this.client.get<any>('/user').catch(() => null),
      this.client.collect<any>('/user/repos?affiliation=owner', { perPage: 100, maxPages: 3 }).catch(() => none),
      this.client.get<any[]>('/user/orgs').catch(() => none),
      this.client.get<any[]>(`/users/${encodeURIComponent(login)}/events?per_page=12`, false).catch(() => none),
    ])
    if (!user) return

    const stars = repos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0)
    const forks = repos.reduce((sum, r) => sum + (r.forks_count ?? 0), 0)
    const joined = user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''
    const about = [
      user.name ? `${user.name}  @${user.login}` : `@${user.login}`,
      user.bio ?? '',
      [user.company, user.location].filter(Boolean).join(SEP),
      user.blog ? String(user.blog) : '',
      joined ? `Joined ${joined}` : '',
    ].filter(Boolean)
    const numbers = [
      `${formatCount(user.followers)} followers${SEP}${formatCount(user.following)} following`,
      `${formatCount(repos.length || user.public_repos)} repos${SEP}${formatCount(stars)} stars${SEP}${formatCount(forks)} forks`,
      `${formatCount(user.public_gists ?? 0)} gists${user.hireable ? `${SEP}open to work` : ''}`,
    ]
    if (this.stats?.contributions != null) numbers.unshift(`${formatCount(this.stats.contributions)} contributions in the last year`)

    const sections = [
      { label: 'About', lines: about },
      { label: 'Numbers', lines: numbers },
    ]
    const top = [...repos].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0)).slice(0, 6)
    if (top.length) {
      sections.push({ label: 'Top repositories', lines: top.map(r => `${r.name}${SEP}${formatCount(r.stargazers_count)} stars${r.language ? `${SEP}${r.language}` : ''}`) })
    }
    const languages = new Map<string, number>()
    for (const r of repos) if (r.language) languages.set(r.language, (languages.get(r.language) ?? 0) + 1)
    const ranked = [...languages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    if (ranked.length) {
      const total = ranked.reduce((sum, [, n]) => sum + n, 0)
      sections.push({ label: 'Languages', lines: ranked.map(([name, n]) => `${name}${SEP}${Math.round((n / total) * 100)}%`) })
    }
    if (orgs.length) sections.push({ label: 'Organizations', lines: [orgs.map(o => o.login).join(', ')] })
    if (events.length) {
      sections.push({
        label: 'Recent activity',
        lines: events.slice(0, 8).map(e => `${feedEventLabel(e.type ?? '')}${SEP}${e.repo?.name ?? ''}${SEP}${relativeTime(e.created_at ?? '')}`),
      })
    }

    this.stack.push({
      kind: 'detail',
      module: 'profile',
      title: `@${user.login}`,
      icon: 'person',
      sections,
      sectionIndex: 0,
    })
  }

  private async openRepo(fullName: string): Promise<void> {
    const path = this.repoPath(fullName)
    const prQuery = encodeURIComponent(`repo:${fullName} is:pr state:open archived:false`)
    const issueQuery = encodeURIComponent(`repo:${fullName} is:issue state:open archived:false`)
    const none = [] as any[]
    const [repo, prSearch, issueSearch, releases, contributors, languages, commits, issues, prs] = await Promise.all([
      this.client.get<any>(`/repos/${path}`).catch(() => null),
      this.client.get<{ total_count?: number }>(`/search/issues?q=${prQuery}&per_page=1&page=1`, false).catch(() => ({ total_count: 0 })),
      this.client.get<{ total_count?: number }>(`/search/issues?q=${issueQuery}&per_page=1&page=1`, false).catch(() => ({ total_count: 0 })),
      this.client.collect<any>(`/repos/${path}/releases`, { perPage: 100, maxPages: 1 }).catch(() => none),
      this.client.collect<any>(`/repos/${path}/contributors`, { perPage: 100, maxPages: 1 }).catch(() => none),
      this.client.get<Record<string, number>>(`/repos/${path}/languages`).catch(() => ({} as Record<string, number>)),
      this.client.collect<any>(`/repos/${path}/commits`, { perPage: 10, maxPages: 1 }).catch(() => none),
      this.client.collect<any>(`/repos/${path}/issues`, { perPage: 10, maxPages: 1 }).catch(() => none),
      this.client.collect<any>(`/repos/${path}/pulls`, { perPage: 10, maxPages: 1 }).catch(() => none),
    ])
    if (!repo) return
    const overviewLines = [
      `${repo.full_name} [${repo.private ? 'private' : 'public'}]`,
      `PR: ${prSearch.total_count ?? 0} · STARS: ${repo.stargazers_count} · ISSUES: ${issueSearch.total_count ?? 0} · FORKS: ${repo.forks_count}`,
      `(${repo.subscribers_count ?? repo.watchers_count ?? 0}) Watching · (${releases.length}) Releases · (${contributors.length}) Contributors`,
      repo.description ?? '',
      `Language: ${repo.language ?? '-'}`,
      `Branch: ${repo.default_branch}`,
      `Updated: ${repo.updated_at?.slice(0, 10)}`,
    ].filter(Boolean)
    const latest = commits[0]
    if (latest) {
      overviewLines.push(`Last commit: @${latest.author?.login ?? latest.commit?.author?.name ?? 'unknown'} [${latest.commit?.message?.split('\n')[0] ?? ''}] ${latest.sha?.slice(0, 7)} · ${relativeTime(latest.commit?.author?.date ?? latest.commit?.committer?.date ?? '')}`)
    }
    const sections = [{ label: 'Overview', lines: overviewLines }]
    if (commits.length) {
      sections.push({ label: 'Commits', lines: commits.map(c => `${c.sha?.slice(0, 7)} ${c.commit?.message?.split('\n')[0] ?? ''}`) })
    }
    const languageTotal = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0)
    if (languageTotal > 0) {
      sections.push({
        label: 'Languages',
        lines: Object.entries(languages)
          .sort((a, b) => b[1] - a[1])
          .map(([name, bytes]) => `${name}: ${(bytes / languageTotal * 100).toFixed(1)}%`),
      })
    }
    const openIssues = issues.filter(i => !i.pull_request)
    if (openIssues.length) sections.push({ label: 'Issues', lines: openIssues.map(i => `#${i.number} ${i.title}`) })
    if (prs.length) sections.push({ label: 'PRs', lines: prs.map(p => `#${p.number} ${p.title}`) })

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
    const repo = event.repo?.name ?? ''
    const payload = event.payload ?? {}
    const pr = payload.pull_request
    const issue = payload.issue
    const comment = payload.comment

    if (repo && (pr || issue?.pull_request)) {
      const number = pr?.number ?? payload.number ?? issue?.number
      await this.openPr('feed', `${repo}#${number}`)
      this.putFirst(comment ? this.commentSection(comment, event.type === 'PullRequestReviewCommentEvent') : null)
      return
    }
    if (repo && issue) {
      await this.openIssue(`${repo}#${issue.number}`, 'feed')
      this.putFirst(comment ? this.commentSection(comment, false) : null)
      return
    }
    if (payload.release) {
      const release = payload.release
      this.stack.push({
        kind: 'detail',
        module: 'feed',
        title: release.name || release.tag_name || 'Release',
        icon: 'star',
        sections: [
          {
            label: 'Release',
            lines: [
              `${repo}${SEP}${release.tag_name ?? ''}`,
              `By ${release.author?.login ?? event.actor?.login ?? ''}${SEP}${relativeTime(release.published_at ?? event.created_at ?? '')}`,
              release.body ?? '',
            ].filter(Boolean),
          },
        ],
        sectionIndex: 0,
      })
      return
    }
    if (payload.commits?.length) {
      const branch = String(payload.ref ?? '').replace('refs/heads/', '')
      this.stack.push({
        kind: 'detail',
        module: 'feed',
        title: `${payload.size ?? payload.commits.length} commits to ${branch || repo}`,
        icon: 'commit',
        sections: [
          { label: 'Push', lines: [`${repo}${SEP}${branch}`, `By ${event.actor?.login ?? ''}${SEP}${relativeTime(event.created_at ?? '')}`] },
          { label: 'Commits', lines: payload.commits.map((c: any) => `${String(c.sha ?? '').slice(0, 7)} ${String(c.message ?? '').split('\n')[0]}`) },
        ],
        sectionIndex: 0,
      })
      return
    }
    const target = payload.forkee?.full_name && event.type === 'ForkEvent' ? payload.forkee.full_name : repo
    if (target) {
      await this.openRepo(target)
      return
    }
    this.stack.push({
      kind: 'detail',
      module: 'feed',
      title: feedEventPrimary(event),
      sections: [{ label: 'Activity', lines: [relativeTime(event.created_at ?? '')] }],
      sectionIndex: 0,
    })
  }

  private commentSection(comment: any, review: boolean): { label: string; lines: string[] } {
    const where = review && comment.path ? `${comment.path}${comment.line ? `:${comment.line}` : ''}` : ''
    return {
      label: review ? 'Review comment' : 'Comment',
      lines: [
        `${comment.user?.login ?? 'someone'}${SEP}${relativeTime(comment.created_at ?? '')}`,
        where,
        String(comment.body ?? ''),
      ].filter(Boolean),
    }
  }

  private putFirst(section: { label: string; lines: string[] } | null): void {
    const screen = this.stack.current
    if (!section || !screen?.sections) return
    screen.sections.unshift(section)
    this.wrapped.delete(screen)
  }

  private async openPr(module: string, itemId: string): Promise<void> {
    const [repo, numStr] = itemId.split('#')
    const num = parseInt(numStr, 10)
    const base = `/repos/${this.repoPath(repo)}/pulls/${num}`
    const none = [] as any[]
    const [pr, conversation, comments, reviews, files, commits] = await Promise.all([
      this.client.get<any>(base).catch(() => null),
      this.client.collect<any>(`/repos/${this.repoPath(repo)}/issues/${num}/comments`, { perPage: 20, maxPages: 1 }).catch(() => none),
      this.client.collect<any>(`${base}/comments`, { perPage: 10, maxPages: 1 }).catch(() => none),
      this.client.collect<any>(`${base}/reviews`, { perPage: 10, maxPages: 1 }).catch(() => none),
      this.client.collect<any>(`${base}/files`, { perPage: 20, maxPages: 2 }).catch(() => none),
      this.client.collect<any>(`${base}/commits`, { perPage: 10, maxPages: 1 }).catch(() => none),
    ])
    if (!pr) return

    const status = pr.merged_at ? 'merged' : pr.state
    const sections = [
      {
        label: 'Overview',
        lines: [
          `#${pr.number} ${pr.title}`,
          `By ${pr.user?.login} · ${status}${pr.draft ? ' · draft' : ''}`,
          `${pr.head?.ref} → ${pr.base?.ref}`,
          `+${pr.additions ?? 0} -${pr.deletions ?? 0} · ${pr.changed_files ?? 0} files`,
          pr.body ?? '',
        ].filter(Boolean),
      },
    ]
    if (conversation.length) sections.push({ label: 'Conversation', lines: conversation.map(c => `${c.user?.login}: ${String(c.body ?? '')}`) })
    if (comments.length) sections.push({ label: 'Review comments', lines: comments.map(c => `${c.user?.login}${c.path ? ` on ${c.path}` : ''}: ${String(c.body ?? '')}`) })
    if (reviews.length) sections.push({ label: 'Reviews', lines: reviews.map(r => `${r.user?.login}: ${r.state}`) })
    if (files.length) sections.push({ label: 'Files', lines: files.map(f => `${f.status ?? ''} ${f.filename} (+${f.additions} -${f.deletions})`) })
    if (commits.length) sections.push({ label: 'Commits', lines: commits.map(c => `${c.sha?.slice(0, 7)} ${c.commit?.message?.split('\n')[0] ?? ''}`) })

    this.stack.push({
      kind: 'detail',
      module,
      title: `#${pr.number} ${pr.title}`,
      icon: prIcon(pr),
      sections,
      sectionIndex: 0,
      payload: { repo, number: num, files },
    })
  }

  private async openIssue(itemId: string, module = 'issues'): Promise<void> {
    const [repo, numStr] = itemId.split('#')
    const num = parseInt(numStr, 10)
    const base = `/repos/${this.repoPath(repo)}/issues/${num}`
    const [issue, comments] = await Promise.all([
      this.client.get<any>(base).catch(() => null),
      this.client.collect<any>(`${base}/comments`, { perPage: 10, maxPages: 1 }).catch(() => [] as any[]),
    ])
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
    if (comments.length) sections.push({ label: 'Comments', lines: comments.map(c => `${c.user?.login}: ${String(c.body ?? '')}`) })

    this.stack.push({
      kind: 'detail',
      module,
      title: `#${issue.number} ${issue.title}`,
      icon: issue.state === 'closed' ? 'check' : 'issue',
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
      let added: ListItem[] = []
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
