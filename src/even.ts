/* Even bridge wrapper for the G2 glasses.

Connects to the Even companion app, renders SDK containers (no DOM on the
glasses), serializes BLE writes so they don't crash the connection, and
routes gestures to handlers.

Exactly one container captures input (the right column). Everything else
is display-only.
*/

import {
  CreateStartUpPageContainer,
  EventSourceType,
  LAUNCH_SOURCE_APP_MENU,
  LAUNCH_SOURCE_GLASSES_MENU,
  ListContainerProperty,
  ListItemContainerProperty,
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

// G2 canvas: 576 x 288 px, monochrome green, 16 shades.
export const CANVAS_W = 576
export const CANVAS_H = 288

export const LEFT_ID = 1
export const LEFT_NAME = 'left'
export const RIGHT_ID = 2
export const RIGHT_NAME = 'right'

export type SwipeDirection = 'up' | 'down'
export type InputSource = 'glasses' | 'ring' | 'unknown'

export interface DeviceStatus {
  batteryLevel?: number
  isCharging?: boolean
  isWearing?: boolean
}

export type LaunchSourceKind = 'app-menu' | 'glasses-menu' | 'unknown'

export interface GitHubRuntime {
  render: (left: string, right: string) => Promise<void>
  renderScreen: (text: string) => Promise<void>
  onTap: (handler: (source: InputSource) => void) => void
  onSwipe: (handler: (dir: SwipeDirection, source: InputSource) => void) => void
  onDoubleTap: (handler: (source: InputSource) => void) => void
  onForeground: (handler: () => void) => void
  onDeviceStatus: (handler: (status: DeviceStatus) => void) => void
  onLaunchSource: (handler: (kind: LaunchSourceKind) => void) => void
  onMenuSelect: (handler: (itemID: number) => void) => void
  openMenu: (items: { id: number; label: string }[]) => Promise<void>
  exitApp: () => Promise<void>
  getUserInfo: () => Promise<{ name?: string; avatar?: string; country?: string }>
  getStorage: (key: string) => Promise<string>
  setStorage: (key: string, value: string) => Promise<boolean>
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for the Even bridge')), timeoutMs)
    promise.then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) },
    )
  })
}

function classifySource(src: number | undefined): InputSource {
  if (src === EventSourceType.TOUCH_EVENT_FROM_RING) return 'ring'
  if (src === EventSourceType.TOUCH_EVENT_FROM_GLASSES_L || src === EventSourceType.TOUCH_EVENT_FROM_GLASSES_R) {
    return 'glasses'
  }
  return 'unknown'
}

interface RuntimeArgs {
  config: AppConfig
  initialLeft: string
  initialRight: string
  menu?: readonly { id: number; label: string }[]
}

export async function connectGitHubRuntime(args: RuntimeArgs): Promise<GitHubRuntime | null> {
  const { config, initialLeft, initialRight, menu = [] } = args
  const BRIDGE_TIMEOUT_MS = config.timeoutMs
  let bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>>
  try {
    bridge = await withTimeout(waitForEvenAppBridge(), BRIDGE_TIMEOUT_MS)
  } catch {
    return null
  }

  // The menu rides along on every create / rebuild: an omitted menuObject on
  // rebuild clears the custom menu. Validate entries with the SDK predicates
  // so a malformed menu can't reject the whole page.
  const seen = new Set<number>()
  const menuItems = menu
    .filter(m => isValidMenuItemID(m.id) && isMenuNameWithinLimit(m.label) && !seen.has(m.id))
    .slice(0, 10)
    .map(m => new MenuItemProperty({ itemName: m.label, itemID: m.id }))
  seen.clear()
  const menuObject = menuItems.length > 0 ? new MenuContainerProperty({ menuItems }) : undefined

  // Exactly one container must set isEventCapture: 1 — the right column.
  const leftText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: config.leftWidth,
    height: CANVAS_H,
    borderWidth: 0,
    borderColor: config.borderColor,
    textColor: config.normalText,
    paddingLength: config.paddingLength,
    containerID: LEFT_ID,
    containerName: LEFT_NAME,
    content: initialLeft,
    isEventCapture: 0,
  })
  const rightText = new TextContainerProperty({
    xPosition: CANVAS_W - config.rightWidth,
    yPosition: 0,
    width: config.rightWidth,
    height: CANVAS_H,
    borderWidth: config.borderWidth,
    borderColor: config.borderColor,
    borderRadius: 4,
    textColor: config.normalText,
    paddingLength: config.paddingLength,
    containerID: RIGHT_ID,
    containerName: RIGHT_NAME,
    content: initialRight,
    isEventCapture: 1,
  })

  const created = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [leftText, rightText],
      menuObject,
    }),
  )
  if (created !== 0) {
    // Dual-container failed. Fall back to a single full-screen container.
    const combined = `${initialLeft}\n\n----------------\n\n${initialRight}`
    const single = new TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: CANVAS_W,
      height: CANVAS_H,
      borderWidth: 0,
      borderColor: config.borderColor,
      textColor: config.normalText,
      paddingLength: config.paddingLength,
      containerID: RIGHT_ID,
      containerName: RIGHT_NAME,
      content: combined,
      isEventCapture: 1,
    })
    const fallback = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [single], menuObject }),
    )
    if (fallback !== 0) return null
  }

  let lastLeftSent = initialLeft
  let lastRightSent = initialRight

  let busy = Promise.resolve()
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    // Serialize BLE writes — concurrent writes crash the connection.
    const next = busy.then(work, work)
    busy = next.then(() => undefined, () => undefined)
    return next
  }

  async function writeLeft(text: string): Promise<void> {
    if (text === lastLeftSent) return
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: LEFT_ID,
        containerName: LEFT_NAME,
        contentOffset: 0,
        contentLength: Math.max(lastLeftSent.length, text.length),
        content: text,
        textColor: config.normalText,
      }),
    )
    lastLeftSent = text
  }

  async function writeRight(text: string): Promise<void> {
    if (text === lastRightSent) return
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: RIGHT_ID,
        containerName: RIGHT_NAME,
        contentOffset: 0,
        contentLength: Math.max(lastRightSent.length, text.length),
        content: text,
        textColor: config.normalText,
      }),
    )
    lastRightSent = text
  }

  let tapHandler: ((source: InputSource) => void) | null = null
  let swipeHandler: ((dir: SwipeDirection, source: InputSource) => void) | null = null
  let doubleTapHandler: ((source: InputSource) => void) | null = null
  let foregroundHandler: (() => void) | null = null
  let deviceStatusHandler: ((status: DeviceStatus) => void) | null = null
  let launchSourceHandler: ((kind: LaunchSourceKind) => void) | null = null
  let menuHandler: ((itemID: number) => void) | null = null

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
    if (event.menuItemClickEvent) {
      const id = event.menuItemClickEvent.itemID
      if (typeof id === 'number') menuHandler?.(id)
      return
    }
    if (event.textEvent) {
      const t = event.textEvent.eventType ?? 0
      if (t === OsEventTypeList.SCROLL_TOP_EVENT) swipeHandler?.('up', 'unknown')
      else if (t === OsEventTypeList.SCROLL_BOTTOM_EVENT) swipeHandler?.('down', 'unknown')
      return
    }
    if (event.sysEvent) {
      const t = event.sysEvent.eventType ?? 0
      const src = classifySource(event.sysEvent.eventSource)
      if (t === 0) {
        tapHandler?.(src)
        return
      }
      if (t === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        doubleTapHandler?.(src)
        return
      }
      if (t === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
        foregroundHandler?.()
        return
      }
    }
  })

  async function openMenu(items: { id: number; label: string }[]): Promise<void> {
    const HEADER_H = 64
    const headerText = new TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: CANVAS_W,
      height: HEADER_H,
      borderWidth: 0,
      borderColor: config.borderColor,
      textColor: config.normalText,
      paddingLength: config.paddingLength,
      containerID: 20,
      containerName: 'menu_hdr',
      content: 'Menu',
      isEventCapture: 0,
    })
    const labels = items.map(i => i.label)
    const listContainer = new ListContainerProperty({
      xPosition: 0,
      yPosition: HEADER_H,
      width: CANVAS_W,
      height: CANVAS_H - HEADER_H,
      borderWidth: config.borderWidth,
      borderColor: config.borderColor,
      borderRadius: 4,
      paddingLength: config.paddingLength,
      containerID: 21,
      containerName: 'menu_list',
      isEventCapture: 1,
      itemContainer: new ListItemContainerProperty({
        itemCount: labels.length,
        itemWidth: 0,
        isItemSelectBorderEn: 1,
        itemName: labels,
      }),
    })
    return enqueue(async () => {
      await bridge.rebuildPageContainer(
        new RebuildPageContainer({ containerTotalNum: 2, textObject: [headerText], listObject: [listContainer], menuObject }),
      )
      return new Promise<void>(resolve => {
        const unsubscribe = bridge.onEvenHubEvent(event => {
          if (event.listEvent) {
            unsubscribe()
            bridge.rebuildPageContainer(
              new RebuildPageContainer({ containerTotalNum: 2, textObject: [leftText, rightText], menuObject }),
            ).then(() => resolve())
            return
          }
          if (event.sysEvent) {
            const t = event.sysEvent.eventType ?? 0
            if (t === OsEventTypeList.DOUBLE_CLICK_EVENT) {
              unsubscribe()
              bridge.rebuildPageContainer(
                new RebuildPageContainer({ containerTotalNum: 2, textObject: [leftText, rightText], menuObject }),
              ).then(() => resolve())
              return
            }
          }
        })
      })
    })
  }

  return {
    render(left, right) {
      return enqueue(async () => {
        await writeLeft(left)
        await writeRight(right)
      })
    },
    renderScreen(text) {
      return enqueue(() => writeRight(text))
    },
    onTap(handler) {
      tapHandler = handler
    },
    onSwipe(handler) {
      swipeHandler = handler
    },
    onDoubleTap(handler) {
      doubleTapHandler = handler
    },
    onForeground(handler) {
      foregroundHandler = handler
    },
    onDeviceStatus(handler) {
      deviceStatusHandler = handler
    },
    onLaunchSource(handler) {
      launchSourceHandler = handler
    },
    onMenuSelect(handler) {
      menuHandler = handler
    },
    openMenu,
    async exitApp() {
      await bridge.shutDownPageContainer(1)
    },
    async getUserInfo() {
      try {
        const u = await bridge.getUserInfo()
        return { name: u.name, avatar: u.avatar, country: u.country }
      } catch {
        return {}
      }
    },
    async getStorage(key) {
      try {
        return await bridge.getLocalStorage(key)
      } catch {
        return ''
      }
    },
    async setStorage(key, value) {
      try {
        return await bridge.setLocalStorage(key, value)
      } catch {
        return false
      }
    },
  }
}
