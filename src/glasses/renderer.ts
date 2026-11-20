// HUD renderer for GitHub G2 glasses.
//
// The glasses draw one text container, so every screen is rendered as
// box-drawing glyphs inside a fixed-width cell grid (~56 chars across at
// the firmware's ~9 px per glyph). The frame is bevelled: chamfered
// corners, header rule, pill scope bar, list rows with a right-edge hatch
// strip and a dim corner bracket.
import type { AppConfig } from '../config'

interface ListItem {
  id: string
  primary: string
  secondary?: string
  scope?: string
  details?: string[]
}

function makeRenderer(_config: AppConfig) {
  const W = 56            // content width between borders
  const BODY_ROWS = 7     // rows available for body content
  const HATCH: string[] = ['╵', '│']   // right-edge hatch strip alternates

  function pad(s: string): string {
    return s.length >= W ? s.slice(0, W) : s + ' '.repeat(W - s.length)
  }

  function corner(top: boolean): string {
    return top ? '╭─' : '╰─'
  }

  function border(top: boolean): string {
    return ' ' + corner(top) + '─'.repeat(W) + (top ? '─╮' : '─╯') + ' '
  }

  function divider(): string {
    return ' ├' + '─'.repeat(W) + '┤ '
  }

  function hatch(i: number): string {
    return HATCH[i % HATCH.length]
  }

  function textRow(text: string, i: number): string {
    return '│ ' + pad(text) + ' │' + hatch(i)
  }

  function blank(i: number): string {
    return textRow('', i)
  }

  function header(title: string, i: number): string {
    const suffix = ' ● │' + hatch(i)
    const gap = ' '.repeat(Math.max(0, W - title.length - suffix.length + 4))
    return '│ ' + title + gap + suffix
  }

  function pill(scope: string, i: number): string {
    const suffix = '│' + hatch(i)
    const body = '┌─ ' + scope
    const gap = ' '.repeat(Math.max(0, W - body.length - suffix.length + 4))
    return '│ ' + body + gap + suffix
  }

  function hintRow(i: number): string {
    const text = '2x exit   swipe choose   tap open'
    return '│ ' + pad(text) + ' │' + hatch(i)
  }

  function listScreen(
    title: string,
    items: ListItem[],
    selectedIndex: number,
  ): string {
    const lines: string[] = []
    lines.push(border(true))
    lines.push(header(title, 0))
    lines.push(divider())

    const scope = items[0]?.scope
    let row = 1
    if (scope) {
      lines.push(pill(scope, row))
      row++
    }

    const selected = Math.max(0, Math.min(selectedIndex, Math.max(0, items.length - 1)))

    if (items.length === 0) {
      lines.push(textRow('(none)', row))
      row++
    } else {
      // Keep the selection roughly centred, paging up when scrolling down.
      const half = Math.floor((BODY_ROWS - 1) / 2)
      let start = Math.max(0, Math.min(selected - half, items.length - BODY_ROWS))
      start = Math.max(0, start)
      const end = Math.min(items.length, start + BODY_ROWS)

      for (let i = start; i < end; i++) {
        const item = items[i]
        const isSelected = i === selected
        const marker = isSelected ? '> ' : '  '
        const primary = item.secondary
          ? item.primary + ' · ' + item.secondary
          : item.primary
        lines.push(textRow(marker + primary, row))
        row++
        if (isSelected && item.details) {
          for (const d of item.details.slice(0, 1)) {
            lines.push(textRow('   ' + d, row))
            row++
          }
        }
        if (i < end - 1 && row < 10) {
          lines.push(blank(row))
          row++
        }
      }
    }

    while (row < 10) {
      lines.push(blank(row))
      row++
    }
    lines.push(hintRow(row))
    row++
    lines.push(border(false))
    return lines.join('\n')
  }

  function detailScreen(
    title: string,
    sections: Array<{ label: string; lines: string[] }>,
    sectionIndex: number,
  ): string {
    const lines: string[] = []
    lines.push(border(true))
    lines.push(header(title, 0))
    lines.push(divider())

    const section = sections[Math.max(0, Math.min(sectionIndex ?? 0, sections.length - 1))]
    const body = [section.label, ...section.lines]
    let row = 1
    const maxRows = 7
    let shown = 0

    for (const line of body) {
      if (shown >= maxRows) break
      lines.push(textRow(line, row))
      row++
      shown++
    }

    while (row < 10) {
      lines.push(blank(row))
      row++
    }
    lines.push(hintRow(row))
    row++
    lines.push(border(false))
    return lines.join('\n')
  }

  function errorScreen(message: string): string {
    const lines: string[] = []
    lines.push(border(true))
    lines.push(header('Error', 0))
    lines.push(divider())
    lines.push(textRow(message, 1))
    lines.push(blank(2))
    lines.push(hintRow(3))
    lines.push(border(false))
    return lines.join('\n')
  }

  function welcomeScreen(): string {
    const lines: string[] = []
    lines.push(border(true))
    lines.push(header('[ GITHUB ]', 0))
    lines.push(divider())
    lines.push(textRow('NOT CONNECTED', 1))
    lines.push(blank(2))
    lines.push(textRow('Open the phone app to link', 3))
    lines.push(textRow('your GitHub account.', 4))
    lines.push(blank(5))
    lines.push(hintRow(6))
    lines.push(border(false))
    return lines.join('\n')
  }

  return {
    listScreen,
    detailScreen,
    errorScreen,
    welcomeScreen,
  }
}

export { makeRenderer, type ListItem }
