// The page layouts the glasses switch between.
//
// The Even app turns every image into raw pixels before sending it, so a send
// costs its area, not its PNG size. Dashboard pages are art from edge to edge
// and need all four full tiles. Lists and details only need art in the header
// and the icon column, so they get a lighter page: small images there, the
// footer rule drawn by a firmware border, and text everywhere else. Switching
// layout rebuilds the page, which also blanks the old art for free.

import { TILES, type Tile } from './canvas'
import { BOX, LINE_H, TEXT_BOXES, type TextBox, type TextSlot } from './pages'

export interface LineBox {
  id: number
  name: string
  x: number
  y: number
  width: number
  height: number
  color: number
}

export interface Layout {
  key: 'full' | 'box' | 'splash'
  images: readonly Tile[]
  texts: Partial<Record<TextSlot, TextBox>>
  lines: readonly LineBox[]
}

export const FULL_LAYOUT: Layout = { key: 'full', images: TILES, texts: {}, lines: [] }

const HEADER_H = 48

export const BOX_LAYOUT: Layout = {
  key: 'box',
  images: [
    { id: 2, name: 'head-l', x: 0, y: 0, width: 288, height: HEADER_H },
    { id: 3, name: 'head-r', x: 288, y: 0, width: 288, height: HEADER_H },
    { id: 4, name: 'rows-a', x: 8, y: 54, width: 56, height: 135 },
    { id: 5, name: 'rows-b', x: 8, y: 189, width: 56, height: 27 },
  ],
  texts: TEXT_BOXES,
  lines: [{ id: 10, name: 'rule', x: BOX.x0, y: BOX.y1, width: BOX.x1 - BOX.x0, height: 2, color: 9 }],
}

export const SPLASH_LOGO: Tile = { id: 2, name: 'logo', x: 64, y: 72, width: 144, height: 144 }

export const SPLASH_LAYOUT: Layout = {
  key: 'splash',
  images: [SPLASH_LOGO],
  texts: { body: { id: 7, name: 'body', x: 236, y: 114, width: 330, height: LINE_H * 2 + 4, color: 4 } },
  lines: [],
}
