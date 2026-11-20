// Screen stack for the glasses.
//
//   dashboard  root. Three pages: overview, pull request gauge, module tree.
//   itemList   one module's items (pull requests, issues, repos...).
//   detail     one item, paged six lines at a time.
//   diff       a changed file's patch, paged the same way.
//
// Swipe moves within a screen, tap goes deeper, double tap goes back.

export type ScreenKind = 'dashboard' | 'itemList' | 'detail' | 'diff'

export interface ListItem {
  id: string
  primary: string
  secondary?: string
  details?: string[]
}

export interface Screen {
  kind: ScreenKind
  module: string
  title: string
  /** dashboard: which of the three pages is showing */
  page?: number
  /** dashboard tree and item lists: selected row */
  selectedIndex?: number
  items?: ListItem[]
  sections?: Array<{ label: string; lines: string[] }>
  sectionIndex?: number
  /** detail and diff: which page of wrapped lines */
  detailPage?: number
  payload?: unknown
}

export class NavStack {
  private screens: Screen[] = []

  get current(): Screen | null {
    return this.screens[this.screens.length - 1] ?? null
  }

  get root(): Screen | null {
    return this.screens[0] ?? null
  }

  push(screen: Screen): void {
    this.screens.push(screen)
  }

  pop(): Screen | null {
    return this.screens.length > 1 ? this.screens.pop() ?? null : null
  }

  /** Keep the root and put one screen on top of it. */
  resetTo(screen: Screen): void {
    this.screens = this.screens.slice(0, 1)
    this.screens.push(screen)
  }

  replace(screen: Screen): void {
    this.screens = [screen]
  }

  isRoot(): boolean {
    return this.screens.length <= 1
  }
}
