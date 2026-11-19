import {
  CreateStartUpPageContainer,
  EventSourceType,
  LAUNCH_SOURCE_APP_MENU,
  LAUNCH_SOURCE_GLASSES_MENU,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  isMenuNameWithinLimit,
  isValidMenuItemID,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import type { AppConfig } from './config'

export const CANVAS_W = 576
export const CANVAS_H = 288

export const MAIN_ID = 1
export const MAIN_NAME = 'main'

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
  exitApp: () => Promise<void>
  getUserInfo: () => Promise<{ name?: string; avatar?: string; country?: string }>
  getStorage: (key: string) => Promise<string>
  setStorage: (key: string, value: string) => Promise<boolean>
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for the Even bridge')), timeoutMs)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
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
  let bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>>
  try {
    bridge = await withTimeout(waitForEvenAppBridge(), config.timeoutMs)
  } catch {
    return null
  }

  const seen = new Set<number>()
  const menuItems = menu
    .filter(item => isValidMenuItemID(item.id) && isMenuNameWithinLimit(item.label) && !seen.has(item.id))
    .slice(0, 10)
    .map(item => {
      seen.add(item.id)
      return new MenuItemProperty({ itemName: item.label, itemID: item.id })
    })
  const menuObject = menuItems.length > 0 ? new MenuContainerProperty({ menuItems }) : undefined

  const combine = (_left: string, right: string): string => right.slice(0, 2000)
  let content = combine(initialLeft, initialRight)
  const mainText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: CANVAS_W,
    height: CANVAS_H,
    borderWidth: config.borderWidth,
    borderColor: config.borderColor,
    borderRadius: 4,
    textColor: config.normalText,
    paddingLength: config.paddingLength,
    containerID: MAIN_ID,
    containerName: MAIN_NAME,
    content,
    isEventCapture: 1,
  })

  const created = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [mainText],
      menuObject,
    }),
  )
  if (created !== 0) return null

  let busy = Promise.resolve()
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = busy.then(work, work)
    busy = next.then(() => undefined, () => undefined)
    return next
  }

  async function write(text: string): Promise<void> {
    const next = text.slice(0, 2000)
    if (next === content) return
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: MAIN_ID,
        containerName: MAIN_NAME,
        contentOffset: 0,
        contentLength: Math.max(content.length, next.length),
        content: next,
        textColor: config.normalText,
      }),
    )
    content = next
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
      const type = event.textEvent.eventType ?? 0
      if (type === OsEventTypeList.SCROLL_TOP_EVENT) swipeHandler?.('up', 'unknown')
      else if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) swipeHandler?.('down', 'unknown')
      return
    }
    if (event.sysEvent) {
      const type = event.sysEvent.eventType ?? 0
      const source = classifySource(event.sysEvent.eventSource)
      if (type === 0) {
        tapHandler?.(source)
        return
      }
      if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        doubleTapHandler?.(source)
        return
      }
      if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) foregroundHandler?.()
    }
  })

  return {
    render(left, right) {
      return enqueue(() => write(combine(left, right)))
    },
    renderScreen(text) {
      return enqueue(() => write(text))
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
