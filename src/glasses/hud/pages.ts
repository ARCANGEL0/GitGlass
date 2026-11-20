// Screen layouts for the HUD, drawn onto the full 576 x 288 canvas.
//
// The look borrows from GitHub itself: the header rule is a branch that forks
// and merges back, with one commit dot per page; the overview carries a
// contribution heatmap; pull requests get a stacked state bar like the
// language bar; the module list is drawn as a git log graph with counter pills;
// list and detail screens sit in a rounded Box with an icon header.
//
// Dashboard pages are drawn whole, text included, so they keep the HUD font.
// The Box leaves its text to firmware text containers so cursor moves are instant.

import { BRIGHT, DIM, MID, Pixels, SCREEN_W } from './canvas'
import { GITHUB_MARK, ICONS, type IconName } from './art'

const RIGHT = SCREEN_W - 4
const TITLE_PX = 22
const LABEL_PX = 18
const FOOTER_RULE_Y = 246
const FOOTER_Y = 256

export interface Stat {
  label: string
  value: string
  icon?: IconName
}

export interface Footer {
  left: string
  right?: string
}

export interface PageMark {
  index: number
  count: number
}

function icon(p: Pixels, name: IconName, x: number, y: number, value = BRIGHT): number {
  if (name === 'github') {
    p.svg(GITHUB_MARK, 24, x, y, 16, value, 1.4)
    return 16
  }
  const rows = ICONS[name]
  p.bitmap(rows, x, y, value)
  return Math.max(...rows.map(r => r.length))
}

/** Title, then a rule that branches off and merges back. Pages sit on the branch. */
function header(p: Pixels, title: string, mark: PageMark): void {
  p.svg(GITHUB_MARK, 24, 12, 13, 20, BRIGHT, 1.5)
  p.text(p.fit(title, TITLE_PX, 330), 42, 12, TITLE_PX)

  const main = 46
  const branch = 30
  p.line(4, main, RIGHT, main, BRIGHT, 2)
  p.path([[388, main], [404, branch], [528, branch], [544, main]], MID, 2)
  for (let i = 0; i < mark.count; i++) {
    const cx = 466 - ((mark.count - 1) * 22) / 2 + i * 22
    if (i === mark.index) p.circle(cx, branch, 6, BRIGHT, true)
    else {
      p.circle(cx, branch, 4, 0, true)
      p.circle(cx, branch, 4, MID, false, 2)
    }
  }
  p.circle(388, main, 3, BRIGHT, true)
  p.circle(544, main, 3, BRIGHT, true)
}

function footer(p: Pixels, f: Footer): void {
  p.line(4, FOOTER_RULE_Y, RIGHT, FOOTER_RULE_Y, MID, 1)
  p.text(p.fit(f.left, LABEL_PX, f.right ? 340 : 540), 12, FOOTER_Y, LABEL_PX, 12)
  if (f.right) p.text(p.fit(f.right, LABEL_PX, 200), RIGHT - 8, FOOTER_Y, LABEL_PX, 12, 'right')
}

/** A stat with its icon: small label on top, value underneath. */
function stat(p: Pixels, s: Stat, x: number, y: number, maxWidth: number, valuePx = 28): void {
  let labelX = x
  if (s.icon) labelX += icon(p, s.icon, x, y + 2, 12) + 8
  p.text(s.label, labelX, y, LABEL_PX, 12)
  p.text(p.fit(s.value, valuePx, maxWidth), x, y + 24, valuePx)
}

// ---------- overview: headline + contribution heatmap ----------

export interface OverviewData {
  title: string
  page: PageMark
  label: string
  value: string
  sublabel: string
  /** Contribution counts, oldest week first, seven days per week. */
  weeks: number[][]
  stats: [Stat, Stat, Stat]
  footer: Footer
}

const CELL = 9
const GAP = 2

function heatmap(p: Pixels, weeks: number[][], right: number, top: number): void {
  const counts = weeks.flat().filter(n => n > 0).sort((a, b) => a - b)
  const quartile = (q: number) => counts[Math.floor((counts.length - 1) * q)] ?? 0
  const steps = [quartile(0.25), quartile(0.5), quartile(0.75)]
  const left = right - weeks.length * (CELL + GAP) + GAP
  weeks.forEach((week, wx) => {
    week.forEach((count, dy) => {
      const x = left + wx * (CELL + GAP)
      const y = top + dy * (CELL + GAP)
      if (count <= 0) {
        p.path([[x, y], [x + CELL - 1, y], [x + CELL - 1, y + CELL - 1], [x, y + CELL - 1], [x, y]], 3)
        return
      }
      const level = count <= steps[0] ? 6 : count <= steps[1] ? 9 : count <= steps[2] ? 12 : BRIGHT
      p.rect(x, y, CELL, CELL, level)
    })
  })
}

export function drawOverview(p: Pixels, d: OverviewData): void {
  header(p, d.title, d.page)

  p.text(d.label, 12, 62, LABEL_PX, 12)
  p.text(p.fit(d.value, 50, 250), 10, 84, 50)
  p.text(d.sublabel, 12, 140, LABEL_PX, 12)

  const weeks = d.weeks.slice(-26)
  if (weeks.length) heatmap(p, weeks, RIGHT - 8, 64)

  p.line(4, 170, RIGHT, 170, MID, 1)
  const columns = [12, 200, 388]
  d.stats.forEach((s, i) => {
    if (i > 0) p.line(columns[i] - 14, 180, columns[i] - 14, 232, DIM, 1)
    stat(p, s, columns[i], 180, 170)
  })

  footer(p, d.footer)
}

// ---------- pull requests: share merged + stacked state bar ----------

export interface StateBarData {
  title: string
  page: PageMark
  headline: string
  caption: string
  aside: Stat
  /** Segments left to right; widths are shares of their sum. */
  segments: Array<Stat & { count: number; fill: 'solid' | 'hatch' | 'outline' }>
  footer: Footer
}

function segment(p: Pixels, x: number, y: number, w: number, h: number, fill: 'solid' | 'hatch' | 'outline'): void {
  if (w <= 0) return
  if (fill === 'solid') {
    p.rect(x, y, w, h, BRIGHT)
    return
  }
  p.path([[x, y], [x + w - 1, y], [x + w - 1, y + h - 1], [x, y + h - 1], [x, y]], fill === 'hatch' ? 11 : MID)
  if (fill === 'hatch') {
    for (let i = 3; i < w + h; i += 4) p.line(x + Math.max(0, i - h + 1), y + Math.min(h - 1, i), x + Math.min(w - 1, i), y + Math.max(0, i - w + 1), 9)
  }
}

export function drawStateBar(p: Pixels, d: StateBarData): void {
  header(p, d.title, d.page)

  p.text(p.fit(d.headline, 50, 300), 10, 62, 50)
  p.text(d.caption, 12, 118, LABEL_PX, 12)
  stat(p, d.aside, 360, 66, 200, 32)

  const barX = 12
  const barW = RIGHT - 8 - barX
  const barY = 148
  const total = d.segments.reduce((sum, s) => sum + s.count, 0)
  let x = barX
  d.segments.forEach((s, i) => {
    const last = i === d.segments.length - 1
    const w = total ? (last ? barX + barW - x : Math.round((s.count / total) * barW)) : 0
    segment(p, x, barY, w - (last ? 0 : 3), 14, s.fill)
    x += w
  })
  if (!total) segment(p, barX, barY, barW, 14, 'outline')

  const columns = [12, 200, 388]
  d.segments.forEach((s, i) => {
    segment(p, columns[i], 184, 12, 12, s.fill)
    p.text(s.label, columns[i] + 20, 180, LABEL_PX, 12)
    p.text(p.fit(s.value, 28, 160), columns[i], 204, 28)
  })

  footer(p, d.footer)
}

// ---------- modules: git log graph ----------

export interface GraphRow {
  label: string
  value: string
  icon: IconName
}

export interface GraphData {
  title: string
  page: PageMark
  rows: GraphRow[]
  selected: number
  footer: Footer
}

const GRAPH_TOP = 56
const GRAPH_ROW_H = 46
const GRAPH_ROWS = 4
const LANE_X = 30

/** Rounded counter pill, right edge at `right`, like GitHub's Counter. */
function pill(p: Pixels, value: string, right: number, cy: number, filled: boolean): void {
  const w = Math.max(30, Math.ceil(p.textWidth(value, 20)) + 20)
  const x = right - w
  const h = 26
  const ctx = p.ctx
  const v = (filled ? BRIGHT : 11) * 17
  ctx.beginPath()
  ctx.roundRect(x + 1, cy - h / 2 + 0.5, w - 2, h, h / 2)
  if (filled) {
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.fill()
  } else {
    ctx.strokeStyle = `rgb(${v},${v},${v})`
    ctx.lineWidth = 2
    ctx.stroke()
  }
  p.text(value, x + w / 2, cy - 11, 20, filled ? 0 : 12, 'center')
}

export function drawGraph(p: Pixels, d: GraphData): void {
  header(p, d.title, d.page)

  const start = Math.max(0, Math.min(d.selected - 1, d.rows.length - GRAPH_ROWS))
  const shown = d.rows.slice(start, start + GRAPH_ROWS)
  const centre = (i: number) => GRAPH_TOP + i * GRAPH_ROW_H + 22

  // The lane runs through every node, and past the edge when more rows scroll.
  const laneTop = start > 0 ? 52 : centre(0)
  const laneBottom = start + GRAPH_ROWS < d.rows.length ? FOOTER_RULE_Y - 4 : centre(shown.length - 1)
  p.line(LANE_X, laneTop, LANE_X, laneBottom, MID, 2)

  shown.forEach((row, i) => {
    const active = start + i === d.selected
    const c = centre(i)
    if (i > 0) {
      for (let x = 56; x < RIGHT - 4; x += 6) p.rect(x, c - GRAPH_ROW_H / 2, 3, 1, DIM)
    }
    if (active) {
      p.circle(LANE_X, c, 10, BRIGHT, false, 2)
      p.circle(LANE_X, c, 5, BRIGHT, true)
    } else {
      p.circle(LANE_X, c, 6, 0, true)
      p.circle(LANE_X, c, 6, MID, false, 2)
    }

    const tone = active ? BRIGHT : 11
    const iconWidth = icon(p, row.icon, 56, c - 6, tone)
    const pillRoom = row.value ? Math.max(30, p.textWidth(row.value, 20) + 20) + 16 : 0
    p.text(p.fit(row.label, 20, RIGHT - 70 - iconWidth - pillRoom), 56 + iconWidth + 12, c - 11, 20, tone)
    if (row.value) pill(p, row.value, RIGHT - 8, c, false)
  })

  footer(p, d.footer)
}

// ---------- Box: the frame list and detail screens sit in ----------
//
// Same language as the dashboard header: icon and title on the left (drawn,
// since they only change with the screen), a counter on the right (firmware
// text, since it changes on every swipe), and a rule that runs low and steps up. A bracket holds the
// content on the left, and a rule closes it above the hint line.

export const BOX = { x0: 4, y0: 3, x1: RIGHT, y1: 222 }
export const BOX_RULE_Y = 44
const STEP_X = 372
const STEP_Y = 36

/** Firmware text containers layered over the Box. Empty on dashboard pages. */
export type TextSlot = 'count' | 'body' | 'hint'

export interface TextBox {
  id: number
  name: string
  x: number
  y: number
  width: number
  height: number
  color: number
}

/** Firmware font line height. */
export const LINE_H = 27
export const BODY_LINES = 6
export const HINT_LINES = 2

export const TEXT_BOXES: Record<TextSlot, TextBox> = {
  count: { id: 9, name: 'count', x: 420, y: 2, width: 146, height: LINE_H + 4, color: 4 },
  body: { id: 7, name: 'body', x: 26, y: BOX_RULE_Y + 10, width: 522, height: LINE_H * BODY_LINES + 4, color: 4 },
  hint: { id: 8, name: 'hint', x: 14, y: BOX.y1 + 6, width: 552, height: LINE_H * HINT_LINES + 2, color: 2 },
}

export function drawBox(p: Pixels, name: IconName, title: string, rowIcons: Array<IconName | null> = [], iconX = 40): void {
  const { x0, x1, y1 } = BOX

  // Header icon, left of the title text container.
  if (name === 'github') p.svg(GITHUB_MARK, 24, 12, 9, 20, BRIGHT, 1.5)
  else {
    const rows = ICONS[name]
    p.bitmap(rows, 14, 20 - Math.ceil(rows.length / 2), BRIGHT)
  }
  p.text(p.fit(title, TITLE_PX, SCREEN_W / 2 - 46), 40, 9, TITLE_PX)

  // Rule: low under the title, stepping up under the counter. A commit sits on the step.
  p.path([[x0, BOX_RULE_Y], [STEP_X, BOX_RULE_Y], [STEP_X + 8, STEP_Y], [x1, STEP_Y]], BRIGHT, 2)
  p.circle(STEP_X + 4, STEP_Y + 4, 3, BRIGHT, true)

  // Bracket that holds the content.
  const top = BOX_RULE_Y + 12
  const bottom = y1 - 10
  p.path([[18, top], [10, top], [10, bottom], [18, bottom]], BRIGHT, 2)

  rowIcons.slice(0, BODY_LINES).forEach((rowIcon, i) => {
    if (!rowIcon) return
    const rows = ICONS[rowIcon as Exclude<IconName, 'github'>]
    if (!rows) return
    const centre = TEXT_BOXES.body.y + i * LINE_H + 15
    p.bitmap(rows, iconX, centre - Math.ceil(rows.length / 2), BRIGHT)
  })

  // Closing rule above the hint lines.
  p.line(x0, y1, x1, y1, MID, 1)
}
