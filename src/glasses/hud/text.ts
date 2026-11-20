// Fitting text to the firmware font. pretext measures with the same glyph
// advances the glasses use, so a truncated row never wraps on the glass.

import { getTextWidth, pxTruncate } from '@evenrealities/pretext'

export const SEP = '  ·  '
const CURSOR = '> '

/** Collapse whitespace and Markdown links into one plain line. */
export function oneLine(value: unknown): string {
  return (typeof value === 'string' ? value : '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(value: string, maxPx: number): string {
  return pxTruncate(oneLine(value), maxPx)
}

/** Word-wrap to lines no wider than maxPx; overlong words are hard-split. */
export function wrap(value: string, maxPx: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of oneLine(value).split(' ').filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (getTextWidth(next) <= maxPx) { line = next; continue }
    if (line) out.push(line)
    line = ''
    let rest = word
    while (getTextWidth(rest) > maxPx) {
      let n = rest.length - 1
      while (n > 1 && getTextWidth(rest.slice(0, n)) > maxPx) n--
      out.push(rest.slice(0, n))
      rest = rest.slice(n)
    }
    line = rest
  }
  if (line) out.push(line)
  return out
}

/** Spaces as wide as the cursor, so unselected rows line up with the selected one. */
const INDENT = (() => {
  let pad = ''
  while (getTextWidth(pad) < getTextWidth(CURSOR)) pad += ' '
  return pad
})()

/** One list row: cursor or indent, then the label cut to fit. */
export const CURSOR_PX = getTextWidth(CURSOR)

const ICON_GAP = (() => {
  let pad = ''
  while (getTextWidth(pad) < 22) pad += ' '
  return pad
})()

export function row(label: string, selected: boolean, maxPx: number, withIcon = false): string {
  const prefix = (selected ? CURSOR : INDENT) + (withIcon ? ICON_GAP : '')
  return prefix + truncate(label, maxPx - getTextWidth(prefix) - 4)
}

/** Join lines for a text container; never empty, since '' does not clear it. */
export function lines(values: string[], count: number): string {
  return values.slice(0, count).join('\n') || ' '
}

/** Pad with spaces so the text ends near the right edge of a box maxPx wide. */
export function alignRight(value: string, maxPx: number): string {
  let out = truncate(value, maxPx)
  while (getTextWidth(' ' + out) <= maxPx) out = ' ' + out
  return out
}
