// Paints HUD views onto the glasses.
//
// A view is drawn to one full-screen canvas and cut into the four tiles. Only
// tiles whose pixels changed are sent, so moving the selection on a module graph
// resends one or two tiles, and a box with the same icon sends none.
// Calls that arrive while a paint is running collapse into one more paint.

import type { GitHubRuntime } from '../../even'
import type { IconName } from './art'
import { Pixels, TILES, loadHudFont, tileKey, tilePng } from './canvas'
import { CURSOR_PX } from './text'
import {
  drawBox,
  drawGraph,
  drawOverview,
  drawStateBar,
  type GraphData,
  type OverviewData,
  type StateBarData,
  TEXT_BOXES,
  type TextSlot,
} from './pages'

export interface BoxView {
  kind: 'box'
  icon: IconName
  title: string
  count: string
  body: string
  hint: string
  rowIcons?: Array<IconName | null>
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
    case 'box': drawBox(p, view.icon, view.title, view.rowIcons, TEXT_BOXES.body.x + Math.round(CURSOR_PX) + 1); break
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

    await Promise.all(SLOTS.map(slot => this.runtime.setText(slot, texts[slot])))

    const changed = TILES
      .map(tile => ({ tile, key: tileKey(pixels, tile) }))
      .filter(({ tile, key }) => this.sent.get(tile.id) !== key)
    const encoded = await Promise.all(changed.map(({ tile }) => tilePng(pixels, tile)))
    for (let i = 0; i < changed.length; i++) {
      if (this.next) return
      await this.runtime.sendTile(changed[i].tile, encoded[i])
      this.sent.set(changed[i].tile.id, changed[i].key)
    }

    if (changed.length) {
      await Promise.all(SLOTS.filter(slot => texts[slot].trim()).map(slot => this.runtime.setText(slot, texts[slot], true)))
    }
  }
}
