/* Glasses navigation — a screen stack for the G2 HUD.

Screens:
  moduleList  — legacy root used only before authentication. Categories are
                selected from the G2 app menu, never shown in the content frame.
  itemList    — items within a module (PRs, issues, repos, etc.). Swipe up/down
                to move the selection, tap to open the item detail.
  detail      — an item's detail with paged sections. Swipe up/down to move
                between sections, tap to enter a section (e.g. diff viewer).
  diff        — line-by-line diff browser. Swipe up/down to scroll lines.

Gestures:
  swipe up/down  — previous / next
  single tap     — enter / select
  double tap     — back (or exit from root)
  long press     — contextual menu (switch module)
*/

export type ScreenKind = 'moduleList' | 'itemList' | 'detail' | 'diff'

export interface Screen {
  kind: ScreenKind
  module: string
  title: string
  items?: Array<{ id: string; primary: string; secondary?: string; details?: string[] }>
  selectedIndex?: number
  sections?: Array<{ label: string; lines: string[] }>
  sectionIndex?: number
  detailOffset?: number
  payload?: unknown
}

export class NavStack {
  private screens: Screen[] = []

  get current(): Screen | null {
    return this.screens[this.screens.length - 1] ?? null
  }

  push(screen: Screen): void {
    this.screens.push(screen)
  }

  pop(): Screen | null {
    return this.screens.pop() ?? null
  }

  replace(screen: Screen): void {
    this.screens = [screen]
  }

  get depth(): number {
    return this.screens.length
  }

  isRoot(): boolean {
    return this.screens.length <= 1
  }
}
