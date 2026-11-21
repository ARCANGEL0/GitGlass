// Even Hub bridge for the GitHub G2 glasses.
//
// The glasses page is built from a layout (see glasses/hud/layouts.ts):
//   - a blank full-screen text container at the back captures input,
//   - image containers carry the drawn HUD,
//   - text containers sit on top, and thin bordered ones draw rules.
// Within a layout, screen changes are image sends and in-place text upgrades.
// Moving to another layout rebuilds the page.
// Writes go through one queue with a timeout, because overlapping BLE calls
// race and a bad hop can otherwise hang for half a minute.

import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  LAUNCH_SOURCE_APP_MENU,
  LAUNCH_SOURCE_GLASSES_MENU,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  isMenuNameWithinLimit,
  isValidMenuItemID,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import type { AppConfig } from './config'
import { SCREEN_H, SCREEN_W, type Tile } from './glasses/hud/canvas'
import type { TextBox, TextSlot } from './glasses/hud/pages'
import type { Layout, LineBox } from './glasses/hud/layouts'

export type SwipeDirection = 'up' | 'down'
export type InputSource = 'glasses' | 'ring' | 'unknown'
export type LaunchSourceKind = 'app-menu' | 'glasses-menu' | 'unknown'

export interface DeviceStatus {
  batteryLevel?: number
  isCharging?: boolean
  isWearing?: boolean
}

export interface MenuEntry {
  id: number
  label: string
}

export interface GitHubRuntime {
  layout: () => Layout
  showLayout: (layout: Layout, texts: Partial<Record<TextSlot, string>>) => Promise<void>
  setText: (slot: TextSlot, content: string, force?: boolean) => Promise<void>
  sendTile: (tile: Tile, png: number[]) => Promise<void>
  onTap: (handler: (source: InputSource) => void) => void
  onSwipe: (handler: (dir: SwipeDirection, source: InputSource) => void) => void
  onDoubleTap: (handler: (source: InputSource) => void) => void
  onForeground: (handler: () => void) => void
  onDeviceStatus: (handler: (status: DeviceStatus) => void) => void
  onLaunchSource: (handler: (kind: LaunchSourceKind) => void) => void
  onMenuSelect: (handler: (itemID: number) => void) => void
  exitApp: () => Promise<void>
  getUserInfo: () => Promise<{ name?: string; avatar?: string; country?: string }>
  getStorage: (key: string) => Promise<string>
  setStorage: (key: string, value: string) => Promise<boolean>
}

const CALL_TIMEOUT_MS = 5000
// One long swipe can arrive as several scroll events.
const SWIPE_GATE_MS = 350

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), timeoutMs)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}

function classifySource(src: number | undefined): InputSource {
  if (src === 2) return 'ring'
  if (src === 1 || src === 3) return 'glasses'
  return 'unknown'
}

function buildMenu(menu: readonly MenuEntry[]): MenuContainerProperty | undefined {
  const seen = new Set<number>()
  const items = menu
    .filter(item => isValidMenuItemID(item.id) && isMenuNameWithinLimit(item.label) && !seen.has(item.id))
    .slice(0, 10)
    .map(item => {
      seen.add(item.id)
      return new MenuItemProperty({ itemName: item.label, itemID: item.id })
    })
  return items.length ? new MenuContainerProperty({ menuItems: items }) : undefined
}

function textContainer(box: TextBox, content: string, z: number, capture = false): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: box.x,
    yPosition: box.y,
    width: box.width,
    height: box.height,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 0,
    containerID: box.id,
    containerName: box.name,
    content,
    isEventCapture: capture ? 1 : 0,
    zOrderIndex: z,
    textColor: box.color,
  })
}

function lineContainer(line: LineBox, z: number): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: line.x,
    yPosition: line.y,
    width: line.width,
    height: line.height,
    borderWidth: 1,
    borderColor: line.color,
    paddingLength: 0,
    containerID: line.id,
    containerName: line.name,
    content: ' ',
    isEventCapture: 0,
    zOrderIndex: z,
  })
}

const INPUT_BOX: TextBox = { id: 1, name: 'input', x: 0, y: 0, width: SCREEN_W, height: SCREEN_H, color: 4 }

function pageFor(layout: Layout, texts: Partial<Record<TextSlot, string>>) {
  const textObject = [
    textContainer(INPUT_BOX, ' ', 1, true),
    ...(Object.entries(layout.texts) as Array<[TextSlot, TextBox]>).map(([slot, box], i) => textContainer(box, texts[slot] || ' ', 20 + i)),
    ...layout.lines.map((line, i) => lineContainer(line, 30 + i)),
  ]
  const imageObject = layout.images.map((tile, i) => imageContainer(tile, 2 + i))
  return { containerTotalNum: textObject.length + imageObject.length, textObject, imageObject }
}

function imageContainer(tile: Tile, z: number): ImageContainerProperty {
  return new ImageContainerProperty({
    xPosition: tile.x,
    yPosition: tile.y,
    width: tile.width,
    height: tile.height,
    containerID: tile.id,
    containerName: tile.name,
    zOrderIndex: z,
  })
}

export async function connectGitHubRuntime(args: { config: AppConfig; layout: Layout; menu?: readonly MenuEntry[] }): Promise<GitHubRuntime | null> {
  const { config, menu = [] } = args
  let bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>>
  try {
    bridge = await withTimeout(waitForEvenAppBridge(), config.timeoutMs, 'Even bridge')
  } catch {
    return null
  }

  const menuObject = buildMenu(menu)
  let layout = args.layout
  const first = pageFor(layout, {})
  const created = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({ ...first, menuObject }))
  if (created !== 0) {
    // After a WebView reload the startup page already exists, so rebuild it instead.
    const rebuilt = await bridge.rebuildPageContainer(new RebuildPageContainer({ ...first, menuObject }))
    if (!rebuilt) return null
  }

  let chain: Promise<unknown> = Promise.resolve()
  function enqueue<T>(what: string, work: () => Promise<T>): Promise<T> {
    const next = chain.then(() => withTimeout(work(), CALL_TIMEOUT_MS, what))
    chain = next.catch(() => undefined)
    return next
  }

  let shownText: Partial<Record<TextSlot, string>> = {}

  let tapHandler: ((source: InputSource) => void) | null = null
  let swipeHandler: ((dir: SwipeDirection, source: InputSource) => void) | null = null
  let doubleTapHandler: ((source: InputSource) => void) | null = null
  let foregroundHandler: (() => void) | null = null
  let deviceStatusHandler: ((status: DeviceStatus) => void) | null = null
  let launchSourceHandler: ((kind: LaunchSourceKind) => void) | null = null
  let menuHandler: ((itemID: number) => void) | null = null
  let lastSwipe = 0

  bridge.onDeviceStatusChanged(status => {
    deviceStatusHandler?.({
      batteryLevel: status.batteryLevel,
      isCharging: status.isCharging,
      isWearing: status.isWearing,
    })
  })

  bridge.onLaunchSource(source => {
    let kind: LaunchSourceKind = 'unknown'
    if (source === LAUNCH_SOURCE_GLASSES_MENU) kind = 'glasses-menu'
    else if (source === LAUNCH_SOURCE_APP_MENU) kind = 'app-menu'
    launchSourceHandler?.(kind)
  })

  bridge.onEvenHubEvent(event => {
    if (event.audioEvent) return
    if (event.menuItemClickEvent) {
      const id = event.menuItemClickEvent.itemID
      if (typeof id === 'number') menuHandler?.(id)
      return
    }
    // A tap is CLICK_EVENT (0), which protobuf drops, so a missing type inside
    // an envelope means a tap. Taps can arrive on either envelope.
    const typeOf = (env?: { eventType?: number }) => (env ? env.eventType ?? OsEventTypeList.CLICK_EVENT : null)
    const sys = typeOf(event.sysEvent)
    const txt = typeOf(event.textEvent)
    const is = (t: number) => sys === t || txt === t
    const source = classifySource(event.sysEvent?.eventSource)

    if (is(OsEventTypeList.DOUBLE_CLICK_EVENT)) return doubleTapHandler?.(source)
    if (is(OsEventTypeList.SCROLL_TOP_EVENT) || is(OsEventTypeList.SCROLL_BOTTOM_EVENT)) {
      const now = Date.now()
      if (now - lastSwipe < SWIPE_GATE_MS) return
      lastSwipe = now
      return swipeHandler?.(is(OsEventTypeList.SCROLL_TOP_EVENT) ? 'up' : 'down', source)
    }
    if (sys === OsEventTypeList.FOREGROUND_ENTER_EVENT || sys === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
      return foregroundHandler?.()
    }
    if (sys === OsEventTypeList.LONG_PRESS_EVENT || sys === OsEventTypeList.LONG_PRESS_RELEASE_EVENT) return
    if (sys === OsEventTypeList.SYSTEM_EXIT_EVENT || sys === OsEventTypeList.ABNORMAL_EXIT_EVENT) return
    if (is(OsEventTypeList.CLICK_EVENT)) tapHandler?.(source)
  })

  return {
    layout: () => layout,
    showLayout(next, texts) {
      return enqueue(`layout ${next.key}`, async () => {
        const ok = await bridge.rebuildPageContainer(new RebuildPageContainer({ ...pageFor(next, texts), menuObject }))
        if (!ok) throw new Error(`layout ${next.key} rejected`)
        layout = next
        shownText = {}
        for (const slot of Object.keys(next.texts) as TextSlot[]) shownText[slot] = texts[slot] || ' '
      })
    },
    setText(slot, content, force = false) {
      const next = (content || ' ').slice(0, 1900)
      const box = layout.texts[slot]
      if (!box) return Promise.resolve()
      if (!force && shownText[slot] === next) return Promise.resolve()
      return enqueue(`text ${slot}`, async () => {
        await bridge.textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: box.id,
            containerName: box.name,
            contentOffset: 0,
            contentLength: 0,
            content: next,
          }),
        )
        shownText[slot] = next
      })
    },
    sendTile(tile, png) {
      return enqueue(`tile ${tile.name}`, async () => {
        const result = await bridge.updateImageRawData(
          new ImageRawDataUpdate({ containerID: tile.id, containerName: tile.name, imageData: png }),
        )
        if (String(result) !== 'success') throw new Error(`tile ${tile.name}: ${String(result)}`)
      })
    },
    onTap(handler) { tapHandler = handler },
    onSwipe(handler) { swipeHandler = handler },
    onDoubleTap(handler) { doubleTapHandler = handler },
    onForeground(handler) { foregroundHandler = handler },
    onDeviceStatus(handler) { deviceStatusHandler = handler },
    onLaunchSource(handler) { launchSourceHandler = handler },
    onMenuSelect(handler) { menuHandler = handler },
    async exitApp() {
      await bridge.shutDownPageContainer(1)
    },
    async getUserInfo() {
      try {
        const user = await bridge.getUserInfo()
        return { name: user.name, avatar: user.avatar, country: user.country }
      } catch {
        return {}
      }
    },
    async getStorage(key) {
      try {
        return await withTimeout(bridge.getLocalStorage(key), CALL_TIMEOUT_MS, 'storage read')
      } catch {
        return ''
      }
    },
    async setStorage(key, value) {
      try {
        return await withTimeout(bridge.setLocalStorage(key, value), CALL_TIMEOUT_MS, 'storage write')
      } catch {
        return false
      }
    },
  }
}
