import { createElement } from '../../dom'
import { escapeHtml, formatDate } from './shared'

export interface FeedEntry {
  repo: string
  type: string
  actor: string
  avatar?: string | null
  summary?: string
  description: string
  updatedAt: string
  url: string
}

export interface FeedRepo {
  fullName: string
  description?: string | null
  language?: string | null
  stars: number
  forks: number
}

export interface FeedProps {
  entries: FeedEntry[]
  trending: FeedRepo[]
  popular: FeedRepo[]
  onBack: () => void
  onEntry: (entry: FeedEntry) => void
}

export function renderFeed({ entries, trending, popular, onBack, onEntry }: FeedProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const rows = entries.map((e, index) => `
    <button class="feed-entry" type="button" data-index="${index}">
      <span class="feed-card-top">
        ${e.avatar
          ? `<img class="feed-avatar" src="${escapeHtml(e.avatar)}" alt="" />`
          : '<span class="feed-avatar feed-avatar-fallback" aria-hidden="true"></span>'}
        <span class="feed-actor-block">
          <span class="feed-activity-line">
            <strong>@${escapeHtml(e.actor)}</strong>
            <span>${escapeHtml(e.type)}</span>
          </span>
          <span class="feed-time">${escapeHtml(formatDate(e.updatedAt))}</span>
        </span>
      </span>
      <span class="feed-repo-card">
        <span class="feed-repo">${escapeHtml(e.repo)}</span>
        ${e.summary ? `<strong class="feed-summary">${escapeHtml(e.summary)}</strong>` : ''}
        ${e.description ? `<span class="feed-desc">${escapeHtml(e.description)}</span>` : ''}
      </span>
    </button>
  `).join('')

  const trendingRows = trending.map(repo => `
    <article class="feed-trending-card">
      <strong>${escapeHtml(repo.fullName)}</strong>
      ${repo.description ? `<span>${escapeHtml(repo.description)}</span>` : ''}
      <span class="feed-trending-meta">
        ${repo.language ? `<span>${escapeHtml(repo.language)}</span>` : ''}
        <span>Stars ${repo.stars}</span>
        <span>Forks ${repo.forks}</span>
      </span>
    </article>
  `).join('')

  const popularRows = popular.map(repo => `
    <article class="feed-trending-card">
      <strong>${escapeHtml(repo.fullName)}</strong>
      ${repo.description ? `<span>${escapeHtml(repo.description)}</span>` : ''}
      <span class="feed-trending-meta">
        ${repo.language ? `<span>${escapeHtml(repo.language)}</span>` : ''}
        <span>Stars ${repo.stars}</span>
        <span>Forks ${repo.forks}</span>
      </span>
    </article>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Feed</h1>
    </div>
    <section class="feed-stream" aria-label="Recent activity">
      ${entries.length === 0
        ? '<div class="empty-state"><strong>No recent activity</strong><span>New stars, follows, pushes, and pull requests will appear here.</span></div>'
        : rows}
    </section>
    ${trending.length
      ? `<section class="feed-trending" aria-label="Trending repositories">
          <h2>Trending repositories</h2>
          <div class="feed-trending-list">${trendingRows}</div>
        </section>`
      : ''}
    ${popular.length
      ? `<section class="feed-trending" aria-label="Popular projects among people you follow">
          <h2>Popular projects among people you follow</h2>
          <div class="feed-trending-list">${popularRows}</div>
        </section>`
      : ''}
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.feed-entry').forEach((el, i) => {
    el.addEventListener('click', () => onEntry(entries[i]))
  })

  return container
}
