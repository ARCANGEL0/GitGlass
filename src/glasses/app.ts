/* Glasses application — the primary GitHub interface on Even G2.

Full interactive navigation on the HUD:
  swipe up/down  — browse items / scroll sections
  single tap     — enter selected item / section
  double tap     — go back (or exit from root)
  long press     — contextual menu to switch module

All modules render real GitHub data through the SDK containers.
*/

import { GitHubRuntime } from '../even'
import { GitHubClient } from '../github/client'
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
  { id: 'codeSearch', label: 'Code Search' },
  { id: 'actions', label: 'Actions' },
  { id: 'profile', label: 'Profile' },
]

export class GlassesApp {
  private runtime: GitHubRuntime
  private client: GitHubClient
  private stack = new NavStack()
  private state: AppState
  private render: ReturnType<typeof makeRenderer>
  private itemsCache = new Map<string, any[]>()

  constructor(runtime: GitHubRuntime, state: AppState, config: AppConfig, client: GitHubClient) {
    this.runtime = runtime
    this.client = client
    this.state = state
    this.render = makeRenderer(config)
    // Start on module list
    this.stack.replace({ kind: 'moduleList', module: 'feed', title: 'GitHub' })
  }

  setState(state: AppState): void {
    this.state = state
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

  private async paint(): Promise<void> {
    const screen = this.stack.current
    if (!screen) return
    const right = await this.renderScreen(screen)
    await this.runtime.render(
      this.render.contextLeft(new Date(), this.state.token ? 'connected' : 'disconnected'),
      right,
    )
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
    const idx = screen.sectionIndex ?? 0
    if (sections.length === 0) return this.render.errorScreen('No details').right
    const section = sections[Math.min(idx, sections.length - 1)]
    const header = `${screen.title}\n${idx + 1}/${sections.length} · ${section.label}`
    const body = section.lines.join('\n')
    return `${this.render.listScreen('', [], 0).right.split('\n').slice(0, 1).join('\n')}\n\n${header}\n\n${body}`
  }

  private renderDiff(screen: Screen): string {
    return this.renderDetail(screen)
  }

  // ── Data fetching per module ─────────────────────────────────────────

  private async fetchItems(module: string): Promise<Array<{ id: string; primary: string; secondary?: string }>> {
    const cached = this.itemsCache.get(module)
    if (cached) return cached as any

    try {
      switch (module) {
        case 'myRepositories': {
          const repos = await this.client.collect<any>('/user/repos', { perPage: 20, maxPages: 3 })
          return repos.map(r => ({
            id: r.full_name,
            primary: r.full_name,
            secondary: `${r.language ?? ''} ★${r.stargazers_count} 🍴${r.forks_count} 🐛${r.open_issues_count}`,
          }))
        }
        case 'pullRequests': {
          const prs = await this.client.collect<any>('/pulls', { perPage: 20, maxPages: 3 })
          return prs.map(p => ({
            id: `${p.head?.repo?.full_name ?? 'unknown'}#${p.number}`,
            primary: `#${p.number} ${p.title}`,
            secondary: `${p.state}${p.draft ? ' · draft' : ''} · ${p.user?.login ?? ''}`,
          }))
        }
        case 'collabPrs': {
          const repos = await this.client.collect<any>('/user/repos', { perPage: 10, maxPages: 2 })
          const prs: any[] = []
          for (const repo of repos.slice(0, 5)) {
            try {
              const r = await this.client.collect<any>(`/repos/${repo.full_name}/pulls?state=open`, { perPage: 10, maxPages: 1 })
              prs.push(...r.map(p => ({ ...p, repo: repo.full_name })))
            } catch { /* skip */ }
          }
          return prs.map(p => ({
            id: `${p.repo}#${p.number}`,
            primary: `#${p.number} ${p.title}`,
            secondary: `${p.repo} · ${p.user?.login ?? ''}`,
          }))
        }
        case 'issues': {
          const issues = await this.client.collect<any>('/issues', { perPage: 20, maxPages: 3 })
          return issues.map(i => ({
            id: `${i.repository_url?.split('/repos/')[1] ?? 'unknown'}#${i.number}`,
            primary: `#${i.number} ${i.title}`,
            secondary: `${i.state} · ${i.user?.login ?? ''}`,
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
          const events = await this.client.collect<any>('/users/' + (this.state.userLogin ?? '') + '/received_events', { perPage: 20, maxPages: 2 })
          return events.map((e: any) => ({
            id: e.id,
            primary: `${e.actor?.login ?? ''} ${e.type ?? ''}`,
            secondary: e.repo?.name ?? '',
          }))
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
            } catch { /* skip */ }
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

  // ── Detail rendering per module ──────────────────────────────────────

  private async openItem(module: string, itemId: string): Promise<void> {
    try {
      switch (module) {
        case 'myRepositories':
          await this.openRepo(itemId)
          break
        case 'pullRequests':
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
          this.stack.push({
            kind: 'detail',
            module,
            title: 'Event',
            sections: [{ label: 'Event', lines: [itemId] }],
            sectionIndex: 0,
          })
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
    const repo = await this.client.get<any>(`/repos/${encodeURIComponent(fullName)}`).catch(() => null)
    if (!repo) return
    const sections = [
      {
        label: 'Overview',
        lines: [
          repo.full_name,
          repo.description ?? '',
          `Language: ${repo.language ?? '-'}`,
          `★ ${repo.stargazers_count}  🍴 ${repo.forks_count}  🐛 ${repo.open_issues_count}`,
          `Branch: ${repo.default_branch}`,
          `Updated: ${repo.updated_at?.slice(0, 10)}`,
        ].filter(Boolean),
      },
    ]
    // Fetch commits
    try {
      const commits = await this.client.collect<any>(`/repos/${encodeURIComponent(fullName)}/commits`, { perPage: 10, maxPages: 1 })
      sections.push({
        label: 'Commits',
        lines: commits.map(c => `${c.sha?.slice(0, 7)} ${c.commit?.message?.split('\n')[0] ?? ''}`),
      })
    } catch { /* skip */ }
    // Fetch issues
    try {
      const issues = await this.client.collect<any>(`/repos/${encodeURIComponent(fullName)}/issues`, { perPage: 10, maxPages: 1 })
      sections.push({
        label: 'Issues',
        lines: issues.map(i => `#${i.number} ${i.title}`),
      })
    } catch { /* skip */ }
    // Fetch PRs
    try {
      const prs = await this.client.collect<any>(`/repos/${encodeURIComponent(fullName)}/pulls`, { perPage: 10, maxPages: 1 })
      sections.push({
        label: 'PRs',
        lines: prs.map(p => `#${p.number} ${p.title}`),
      })
    } catch { /* skip */ }

    this.stack.push({
      kind: 'detail',
      module: 'myRepositories',
      title: repo.full_name,
      sections,
      sectionIndex: 0,
      payload: { repo: fullName },
    })
  }

  private async openPr(module: string, itemId: string): Promise<void> {
    const [repo, numStr] = itemId.split('#')
    const num = parseInt(numStr, 10)
    const pr = await this.client.get<any>(`/repos/${encodeURIComponent(repo)}/pulls/${num}`).catch(() => null)
    if (!pr) return

    const sections = [
      {
        label: 'Overview',
        lines: [
          `#${pr.number} ${pr.title}`,
          `By ${pr.user?.login} · ${pr.state}${pr.draft ? ' · draft' : ''}`,
          `${pr.head?.ref} → ${pr.base?.ref}`,
          `+${pr.additions ?? 0} -${pr.deletions ?? 0} · ${pr.changed_files ?? 0} files`,
          pr.body?.slice(0, 200) ?? '',
        ].filter(Boolean),
      },
    ]
    // Conversation / comments
    try {
      const comments = await this.client.collect<any>(`/repos/${encodeURIComponent(repo)}/pulls/${num}/comments`, { perPage: 10, maxPages: 1 })
      if (comments.length) {
        sections.push({
          label: 'Comments',
          lines: comments.map(c => `${c.user?.login}: ${String(c.body ?? '').slice(0, 100)}`),
        })
      }
    } catch { /* skip */ }
    // Reviews
    try {
      const reviews = await this.client.collect<any>(`/repos/${encodeURIComponent(repo)}/pulls/${num}/reviews`, { perPage: 10, maxPages: 1 })
      if (reviews.length) {
        sections.push({
          label: 'Reviews',
          lines: reviews.map(r => `${r.user?.login}: ${r.state}`),
        })
      }
    } catch { /* skip */ }
    // Changed files
    let files: any[] = []
    try {
      files = await this.client.collect<any>(`/repos/${encodeURIComponent(repo)}/pulls/${num}/files`, { perPage: 20, maxPages: 2 })
      if (files.length) {
        sections.push({
          label: 'Files',
          lines: files.map(f => `${f.status ?? ''} ${f.filename} (+${f.additions} -${f.deletions})`),
        })
      }
    } catch { /* skip */ }
    // Commits
    try {
      const commits = await this.client.collect<any>(`/repos/${encodeURIComponent(repo)}/pulls/${num}/commits`, { perPage: 10, maxPages: 1 })
      if (commits.length) {
        sections.push({
          label: 'Commits',
          lines: commits.map(c => `${c.sha?.slice(0, 7)} ${c.commit?.message?.split('\n')[0] ?? ''}`),
        })
      }
    } catch { /* skip */ }

    this.stack.push({
      kind: 'detail',
      module,
      title: `#${pr.number} ${pr.title}`.slice(0, 40),
      sections,
      sectionIndex: 0,
      payload: { repo, number: num, files },
    })
  }

  private async openIssue(itemId: string): Promise<void> {
    const [repo, numStr] = itemId.split('#')
    const num = parseInt(numStr, 10)
    const issue = await this.client.get<any>(`/repos/${encodeURIComponent(repo)}/issues/${num}`).catch(() => null)
    if (!issue) return
    const sections = [
      {
        label: 'Issue',
        lines: [
          `#${issue.number} ${issue.title}`,
          `By ${issue.user?.login} · ${issue.state}`,
          issue.body?.slice(0, 200) ?? '',
        ].filter(Boolean),
      },
    ]
    try {
      const comments = await this.client.collect<any>(`/repos/${encodeURIComponent(repo)}/issues/${num}/comments`, { perPage: 10, maxPages: 1 })
      if (comments.length) {
        sections.push({
          label: 'Comments',
          lines: comments.map(c => `${c.user?.login}: ${String(c.body ?? '').slice(0, 100)}`),
        })
      }
    } catch { /* skip */ }

    this.stack.push({
      kind: 'detail',
      module: 'issues',
      title: `#${issue.number} ${issue.title}`.slice(0, 40),
      sections,
      sectionIndex: 0,
    })
  }

  // ── Gesture handling ─────────────────────────────────────────────────

  bind(): void {
    const runtime = this.runtime

    runtime.onSwipe(dir => {
      void this.handleSwipe(dir)
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
        this.stack.replace({ kind: 'moduleList', module, title: 'GitHub' })
        void this.enterModule(module)
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
      screen.selectedIndex = ((screen.selectedIndex ?? 0) + delta + items.length) % items.length
      await this.paint()
    } else if (screen.kind === 'detail') {
      const sections = screen.sections ?? []
      if (sections.length === 0) return
      screen.sectionIndex = ((screen.sectionIndex ?? 0) + delta + sections.length) % sections.length
      await this.paint()
    }
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

  private async enterModule(module: ModuleId): Promise<void> {
    const items = await this.fetchItems(module)
    this.itemsCache.set(module, items as any)
    this.stack.push({
      kind: 'itemList',
      module,
      title: MODULES.find(m => m.id === module)?.label ?? module,
      items,
      selectedIndex: 0,
    })
    await this.paint()
  }

  start(): void {
    void this.paint()
  }
}
