/* Phone feed view — GitHub activity for the authenticated user.

Shows recent activity across repositories: commits, pull requests, issues,
releases. Each entry lists the repository, activity type, author, and a short
description.
*/

import { createElement } from '../../dom'

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

  const rows = entries.map(e => `
    <div class="feed-entry" data-index="${entries.indexOf(e)}">
      <div class="feed-meta">
        <span class="feed-repo">${e.repo}</span>
        <span class="feed-type">${e.type}</span>
      </div>
      <div class="feed-actor">${e.actor}</div>
      <div class="feed-desc">${e.description}</div>
      <div class="feed-time">${e.updatedAt}</div>
    </div>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">← Back</button>
      <h1>Feed</h1>
    </div>
    <div class="card">
      ${entries.length === 0
        ? '<p class="hint">No recent activity.</p>'
        : `<div class="feed-list">${rows}</div>`}
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.feed-entry').forEach((el, i) => {
    el.addEventListener('click', () => onEntry(entries[i]))
  })

  return container
}
