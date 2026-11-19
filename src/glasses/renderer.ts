import type { AppConfig } from '../config'

function makeRenderer(config: AppConfig) {
  const { brightText, dimText, normalText } = config

  function line(text: string, _color = normalText): string {
    return text
  }

  function wrap(text: string, maxChars: number): string[] {
    if (!text) return ['']
    const output: string[] = []
    let remaining = text
    while (remaining.length > maxChars) {
      let split = remaining.lastIndexOf(' ', maxChars)
      if (split < Math.floor(maxChars / 2)) split = maxChars
      output.push(remaining.slice(0, split).trimEnd())
      remaining = remaining.slice(split).trimStart()
    }
    output.push(remaining)
    return output
  }

  function listScreen(
    title: string,
    items: Array<{ primary: string; secondary?: string; details?: string[] }>,
    selectedIndex: number,
  ): { left: string; right: string } {
    const selected = Math.max(0, Math.min(selectedIndex, Math.max(0, items.length - 1)))
    const itemLines = (item: { primary: string; secondary?: string; details?: string[] }, index: number): string[] => {
      const marker = index === selected ? '> ' : '  '
      const primary = wrap(item.primary, 52)
      const lines = [line(marker + primary[0], index === selected ? brightText : normalText)]
      lines.push(...primary.slice(1).map(value => line('  ' + value, normalText)))
      if (item.secondary) lines.push(...wrap(item.secondary, 54).map(value => line('   ' + value, dimText)))
      if (index === selected && item.details) {
        for (const detail of item.details) lines.push(...wrap(detail, 54).map(value => line('   ' + value, normalText)))
      }
      return lines
    }
    const body: string[] = []
    if (items.length === 0) {
      body.push(line('(none)', dimText))
    } else {
      const rendered = items.map((item, index) => itemLines(item, index))
      const maxBodyLines = 8
      let start = selected
      let end = selected + 1
      let used = rendered[selected]?.length ?? 0
      let tryPrevious = selected > 0
      while (true) {
        const previousCost = tryPrevious && start > 0 ? rendered[start - 1].length : Infinity
        const nextCost = end < rendered.length ? rendered[end].length : Infinity
        if (previousCost === Infinity && nextCost === Infinity) break
        if (tryPrevious && previousCost + used + 1 <= maxBodyLines) {
          start -= 1
          used += previousCost + 1
        } else if (nextCost + used + 1 <= maxBodyLines) {
          end += 1
          used += nextCost + 1
        } else if (previousCost + used + 1 <= maxBodyLines) {
          start -= 1
          used += previousCost + 1
        } else {
          break
        }
        tryPrevious = !tryPrevious
      }
      for (let index = start; index < end; index += 1) {
        if (index > start) body.push('')
        body.push(...rendered[index])
      }
    }
    return {
      left: '',
      right: `${line(title, brightText)}\n\n${body.join('\n')}`,
    }
  }

  function detailScreen(
    title: string,
    fields: Array<{ label: string; value: string }>,
  ): { left: string; right: string } {
    const lines: string[] = []
    for (const field of fields) {
      lines.push(...wrap(field.label, 54).map(value => line(value, dimText)))
      lines.push(...wrap('  ' + field.value, 54).map(value => line(value, normalText)))
      lines.push('')
    }
    return {
      left: '',
      right: `${line(title, brightText)}\n\n${lines.join('\n')}`,
    }
  }

  function errorScreen(message: string): { left: string; right: string } {
    return {
      left: '',
      right: `${line(config.errorTitle, brightText)}\n\n${wrap(message, 54).map(value => line(value, normalText)).join('\n')}`,
    }
  }

  function loadingScreen(title?: string): { left: string; right: string } {
    return {
      left: '',
      right: `${line(title ?? config.loadingTitle, brightText)}\n\n${line('…', normalText)}`,
    }
  }

  function welcomeScreen(): { left: string; right: string } {
    const lines = [
      line(config.welcomeTitle, brightText),
      '',
      line('NOT CONNECTED', dimText),
      '',
      line(config.welcomeBody[0], normalText),
      line(config.welcomeBody[1], normalText),
      line(config.welcomeBody[2], normalText),
    ]
    return {
      left: '',
      right: lines.join('\n'),
    }
  }

  function repoListScreen(
    repos: Array<{ full_name: string; description?: string | null; language?: string | null; stargazers_count: number; forks_count: number; updated_at: string }>,
    selectedIndex: number,
  ): { left: string; right: string } {
    const items = repos.map(r => ({
      primary: r.full_name,
      secondary: `${r.language ?? ''} STARS: ${r.stargazers_count} · FORKS: ${r.forks_count}`,
    }))
    return listScreen('My Repositories', items, selectedIndex)
  }

  function prListScreen(
    prs: Array<{ number: number; title: string; state: string; updated_at: string }>,
    selectedIndex: number,
  ): { left: string; right: string } {
    const items = prs.map(p => ({
      primary: `#${p.number} ${p.title}`,
      secondary: `${p.state} · ${p.updated_at.slice(0, 10)}`,
    }))
    return listScreen('Pull Requests', items, selectedIndex)
  }

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

  function issueListScreen(
    issues: Array<{ number: number; title: string; state: string; updated_at: string }>,
    selectedIndex: number,
  ): { left: string; right: string } {
    const items = issues.map(i => ({
      primary: `#${i.number} ${i.title}`,
      secondary: `${i.state} · ${i.updated_at.slice(0, 10)}`,
    }))
    return listScreen('Issues', items, selectedIndex)
  }

  function menuEntries(): Array<{ module: string; label: string }> {
    return [
      { module: 'feed', label: 'Feed' },
      { module: 'pullRequests', label: 'Pull Requests' },
      { module: 'notifications', label: 'Notifications' },
      { module: 'issues', label: 'Issues' },
      { module: 'collabPrs', label: 'Collab PRs' },
      { module: 'explore', label: 'Explore' },
      { module: 'myRepositories', label: 'My Repos' },
      { module: 'contribution', label: 'Contribution' },
      { module: 'codeSearch', label: 'Code Search' },
      { module: 'actions', label: 'Actions' },
      { module: 'profile', label: 'Profile' },
    ]
  }

  return {
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
