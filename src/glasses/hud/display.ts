// Paints HUD views onto the glasses.
//
// A view is drawn to one full-screen canvas and cut into the four tiles. Only
// tiles whose pixels changed are sent, so moving the selection on a module graph
// resends one or two tiles, and a box with the same icon sends none.
// Calls that arrive while a paint is running collapse into one more paint.

import type { GitHubRuntime } from '../../even'
import type { IconName } from './art'
import { Pixels, TILES, loadHudFont, tileKey, tilePng } from './canvas'
import {
  drawBox,
  drawGraph,
  drawOverview,
  drawStateBar,
  type BoxScroll,
  type GraphData,
  type OverviewData,
  type StateBarData,
  type TextSlot,
} from './pages'

export interface BoxView {
  kind: 'box'
  icon: IconName
  title: string
  count: string
  body: string
  hint: string
  scroll?: BoxScroll
}

export type HudView =
  | { kind: 'overview'; data: OverviewData }
  | { kind: 'stateBar'; data: StateBarData }
  | { kind: 'graph'; data: GraphData }
  | BoxView

function draw(view: HudView): Pixels {
  const p = new Pixels()
  switch (view.kind) {
    case 'overview': drawOverview(p, view.data); break
    case 'stateBar': drawStateBar(p, view.data); break
    case 'graph': drawGraph(p, view.data); break
    case 'box': drawBox(p, view.icon, view.title, view.scroll); break
  }
  p.quantize()
  return p
}

const SLOTS: TextSlot[] = ['count', 'body', 'hint']

function textsFor(view: HudView): Record<TextSlot, string> {
  if (view.kind === 'box') return { count: view.count || ' ', body: view.body || ' ', hint: view.hint || ' ' }
  return { count: ' ', body: ' ', hint: ' ' }
}

export class Hud {
  private sent = new Map<number, string>()
  private next: HudView | null = null
  private painting: Promise<void> | null = null

  constructor(private runtime: GitHubRuntime) {}

  /** Show a view. Returns when it, or a newer view, is on the glass. */
  show(view: HudView): Promise<void> {
    this.next = view
    if (this.painting) return this.painting
    this.painting = this.drain().finally(() => { this.painting = null })
    return this.painting
  }

  /** Forget what the glass shows, so the next paint resends everything. */
  invalidate(): void {
    this.sent.clear()
  }

  private async drain(): Promise<void> {
    await loadHudFont()
    let failures = 0
    while (this.next) {
      const view = this.next
      this.next = null
      try {
        await this.flush(view)
        failures = 0
      } catch (err) {
        console.error('hud: paint failed', err)
        this.sent.clear()
        // One slow BLE hop should not leave a stale screen until the next gesture.
        if (++failures <= 3 && !this.next) {
          await new Promise(resolve => setTimeout(resolve, 400 * failures))
          this.next = view
        }
      }
    }
  }

  private async flush(view: HudView): Promise<void> {
    const pixels = draw(view)
    const texts = textsFor(view)

    // Leaving a box: clear its text first so it does not hang over the new art.
    if (view.kind !== 'box') {
      await Promise.all(SLOTS.map(slot => this.runtime.setText(slot, ' ')))
    }

    for (const tile of TILES) {
      const key = tileKey(pixels, tile)
      if (this.sent.get(tile.id) === key) continue
      // A newer view is waiting: skip the rest of this one.
      if (this.next) return
      await this.runtime.sendTile(tile, await tilePng(pixels, tile))
      this.sent.set(tile.id, key)
    }

    await Promise.all(SLOTS.map(slot => this.runtime.setText(slot, texts[slot])))
  }
}
