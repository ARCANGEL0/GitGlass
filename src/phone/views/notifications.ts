import { createElement } from '../../dom'
import { formatDate } from './shared'

export interface NotificationItem {
  repository: string
  subject: string
  type: string
  reason: string
  unread: boolean
  updatedAt: string
}

export interface NotificationsProps {
  notifications: NotificationItem[]
  onBack: () => void
  onNotification: (n: NotificationItem) => void
}

export function renderNotifications({ notifications, onBack, onNotification }: NotificationsProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const unreadCount = notifications.filter(n => n.unread).length

  const rows = notifications.map(n => `
    <div class="notif-row${n.unread ? ' notif-unread' : ''}" data-index="${notifications.indexOf(n)}">
      <div class="notif-repo">${n.repository}</div>
      <div class="notif-subject">${n.subject}</div>
      <div class="notif-meta">
        <span class="notif-type">${n.type}</span>
        <span class="notif-reason">${n.reason}</span>
        ${n.unread ? '<span class="notif-unread-badge">unread</span>' : ''}
      </div>
      <div class="notif-time">Updated ${formatDate(n.updatedAt)}</div>
    </div>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}</h1>
    </div>
    <div class="card">
      ${notifications.length === 0
        ? '<p class="hint">No notifications.</p>'
        : `<div class="notif-list">${rows}</div>`}
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.notif-row').forEach((el, i) => {
    el.addEventListener('click', () => onNotification(notifications[i]))
  })

  return container
}
