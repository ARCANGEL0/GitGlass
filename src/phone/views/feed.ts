/* Phone feed view — GitHub activity for the authenticated user.

Shows recent activity across repositories: commits, pull requests, issues,
releases. Each entry lists the repository, activity type, author, and a short
description.
*/

import { createElement } from '../../dom'
import { escapeHtml, formatDate } from './shared'

export interface FeedEntry {
  repo: string
  type: string
  actor: string
  description: string
  updatedAt: string
}

export interface FeedProps {
  entries: FeedEntry[]
  onBack: () => void
  onEntry: (entry: FeedEntry) => void
}

export function renderFeed({ entries, onBack, onEntry }: FeedProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const rows = entries.map((e, index) => `
    <button class="feed-entry" type="button" data-index="${index}">
      <span class="activity-mark" aria-hidden="true"></span>
      <span class="feed-content">
        <span class="feed-meta">
          <span class="feed-repo">${escapeHtml(e.repo)}</span>
          <span class="feed-type">${escapeHtml(e.type)}</span>
        </span>
        <span class="feed-desc">${escapeHtml(e.description)}</span>
        <span class="feed-time">${escapeHtml(formatDate(e.updatedAt))}</span>
      </span>
      <span class="row-chevron" aria-hidden="true"></span>
    </button>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Feed</h1>
    </div>
    <p class="page-intro">Recent activity from people and repositories you follow.</p>
    <section class="list-panel" aria-label="Recent activity">
      <div class="list-panel-header">
        <span>Recent activity</span>
        <span class="list-count">${entries.length} ${entries.length === 1 ? 'event' : 'events'}</span>
      </div>
      ${entries.length === 0
        ? '<div class="empty-state"><strong>No recent activity</strong><span>New stars, follows, pushes, and pull requests will appear here.</span></div>'
        : `<div class="feed-list">${rows}</div>`}
    </section>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.feed-entry').forEach((el, i) => {
    el.addEventListener('click', () => onEntry(entries[i]))
  })

  return container
}
