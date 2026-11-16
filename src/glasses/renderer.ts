/* Glasses screen renderer.

Each module renders to a { left, right } pair:
  left  — fixed clock/context column (stays visible in all modes)
  right — the active screen content

All text targets the G2 canvas (576 x 288, monochrome green, LVGL font).
Rendering respects the G2 constraints:
  - right column is 336 px wide, so lines are kept short (~50 chars)
  - textColor 0..4 for brightness hierarchy
  - borders and selection markers ("> ") instead of color meaning
  - pagination across multiple screens

Render helpers produce compact, single-purpose strings. The glasses runtime
in even.ts handles sending them via textContainerUpgrade.
*/

import type { AppConfig } from '../config'

function makeRenderer(config: AppConfig) {
  const { brightText, dimText, normalText } = config

  function line(text: string, color = normalText): string {
    // `§` is a cheap, glyph-safe brightness tag the runtime strips before send.
    // It keeps brightness markup out of the measured line length.
    return `§${color}${text}`
  }

  /** Truncate a string to fit a pixel-ish budget (approx 7px per char). */
  function fit(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars - 1) + '…'
  }

  /** Build a left context column: clock + connection status + counts line. */
  function contextLeft(now: Date, status: 'connected' | 'disconnected'): string {
    const h = now.getHours()
    const m = now.getMinutes().toString().padStart(2, '0')
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    const dot = status === 'connected' ? '●' : '○'
    return `${line(`GITHUB  ${h12}:${m} ${period}`, brightText)}\n${line(dot + '  ' + status.toUpperCase(), dimText)}`
  }

  /** Render a scrollable list of items with a "> " selection marker on the index. */
  function listScreen(
    title: string,
    items: Array<{ primary: string; secondary?: string }>,
    selectedIndex: number,
  ): { left: string; right: string } {
    const rows: string[] = []
    const start = Math.max(0, selectedIndex - 3)
    const end = Math.min(items.length, start + 6)
    const windowStart = end - start < 6 && start > 0 ? Math.max(0, end - 6) : start
    const windowEnd = Math.min(items.length, windowStart + 6)

    for (let i = windowStart; i < windowEnd; i += 1) {
      const item = items[i]
      const marker = i === selectedIndex ? '> ' : '  '
      const primary = fit(item.primary, 46)
      rows.push(`${line(marker + primary, i === selectedIndex ? brightText : normalText)}`)
      if (item.secondary) {
        rows.push(line('   ' + fit(item.secondary, 44), dimText))
      }
    }

    const countLine = items.length === 0
      ? line('(none)', dimText)
      : line(`${windowStart + 1}-${windowEnd} of ${items.length}`, dimText)

    const body = rows.length === 0 ? [countLine] : [...rows, '', countLine]
    return {
      left: contextLeft(new Date(), 'connected'),
      right: `${line(title, brightText)}\n\n${body.join('\n')}`,
    }
  }

  /** Render a detail screen with labelled fields. */
  function detailScreen(
    title: string,
    fields: Array<{ label: string; value: string }>,
  ): { left: string; right: string } {
    const lines: string[] = []
    for (const field of fields) {
      const label = fit(field.label, 28)
      const value = fit(field.value, 44)
      lines.push(line(label, dimText))
      lines.push(line('  ' + value, normalText))
      lines.push('')
    }
    return {
      left: contextLeft(new Date(), 'connected'),
      right: `${line(title, brightText)}\n\n${lines.join('\n')}`,
    }
  }

  /** Render an error screen. */
  function errorScreen(message: string): { left: string; right: string } {
    return {
      left: contextLeft(new Date(), 'disconnected'),
      right: `${line(config.errorTitle, brightText)}\n\n${line(fit(message, 48), normalText)}`,
    }
  }

  /** Render a loading screen. */
  function loadingScreen(title?: string): { left: string; right: string } {
    return {
      left: contextLeft(new Date(), 'connected'),
      right: `${line(title ?? config.loadingTitle, brightText)}\n\n${line('…', normalText)}`,
    }
  }

  /** Render the welcome frame before auth. */
  function welcomeScreen(): { left: string; right: string } {
    const boxTop = '╭──────────────────────────────╮'
    const boxBot = '╰──────────────────────────────╯'
    const empty = '│                              │'
    const lines = [
      boxTop,
      empty,
      line(`│   ${config.welcomeTitle.padEnd(22)}   │`, brightText),
      empty,
      line(`│   ${config.welcomeBody[0].padEnd(22)}   │`, normalText),
      line(`│   ${config.welcomeBody[1].padEnd(22)}   │`, normalText),
      line(`│   ${config.welcomeBody[2].padEnd(22)}   │`, normalText),
      empty,
      boxBot,
    ]
    return {
      left: contextLeft(new Date(), 'disconnected'),
      right: lines.join('\n'),
    }
  }

  /** Render a repo list screen for the glasses. */
  function repoListScreen(
    repos: Array<{ full_name: string; description?: string | null; language?: string | null; stargazers_count: number; forks_count: number; updated_at: string }>,
    selectedIndex: number,
  ): { left: string; right: string } {
    const items = repos.map(r => ({
      primary: r.full_name,
      secondary: `${r.language ?? ''} ⭐${r.stargazers_count} 🍴${r.forks_count}`,
    }))
    return listScreen('My Repositories', items, selectedIndex)
  }

  /** Render a PR list screen for the glasses. */
  function prListScreen(
    prs: Array<{ number: number; title: string; state: string; updated_at: string }>,
    selectedIndex: number,
  ): { left: string; right: string } {
    const items = prs.map(p => ({
      primary: `#${p.number} ${fit(p.title, 40)}`,
      secondary: `${p.state} · ${p.updated_at.slice(0, 10)}`,
    }))
    return listScreen('Pull Requests', items, selectedIndex)
  }

  /** Render a notification list screen for the glasses. */
  function notificationListScreen(
    notifs: Array<{ repository: string; subject: string; unread: boolean; updated_at: string }>,
    selectedIndex: number,
  ): { left: string; right: string } {
    const items = notifs.map(n => ({
      primary: n.unread ? `● ${n.subject}` : `○ ${n.subject}`,
      secondary: `${n.repository} · ${n.updated_at.slice(0, 10)}`,
    }))
    return listScreen('Notifications', items, selectedIndex)
  }

  /** Render an issue list screen for the glasses. */
  function issueListScreen(
    issues: Array<{ number: number; title: string; state: string; updated_at: string }>,
    selectedIndex: number,
  ): { left: string; right: string } {
    const items = issues.map(i => ({
      primary: `#${i.number} ${fit(i.title, 40)}`,
      secondary: `${i.state} · ${i.updated_at.slice(0, 10)}`,
    }))
    return listScreen('Issues', items, selectedIndex)
  }

  /** Menu entries: module id and label, in navigation order. */
  function menuEntries(): Array<{ module: string; label: string }> {
    return [
      { module: 'feed', label: 'Feed' },
      { module: 'pullRequests', label: 'Pull Requests' },
      { module: 'notifications', label: 'Notifications' },
      { module: 'issues', label: 'Issues' },
      { module: 'collabPrs', label: 'Collab PRs' },
      { module: 'explore', label: 'Explore' },
      { module: 'myRepositories', label: 'My Repos' },
      { module: 'codeSearch', label: 'Code Search' },
      { module: 'actions', label: 'Actions' },
      { module: 'profile', label: 'Profile' },
    ]
  }

  return {
    contextLeft,
    listScreen,
    detailScreen,
    errorScreen,
    loadingScreen,
    welcomeScreen,
    repoListScreen,
    prListScreen,
    notificationListScreen,
    issueListScreen,
    menuEntries,
  }
}

export { makeRenderer }
