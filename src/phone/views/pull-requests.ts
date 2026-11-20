import { createElement } from '../../dom'
import { formatDate, prStatusIcon } from './shared'

export interface PullRequestItem {
  repo: string
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  author: string
  reviewStatus: 'none' | 'approved' | 'changes-requested' | 'commented'
  updatedAt: string
}

export interface PullRequestsProps {
  prs: PullRequestItem[]
  onBack: () => void
  onPr: (pr: PullRequestItem) => void
}

export function renderPullRequests({ prs, onBack, onPr }: PullRequestsProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const rows = prs.map(p => `
    <div class="pr-row" data-index="${prs.indexOf(p)}">
      <div class="pr-header">
        <span class="pr-repo">${p.repo}</span>
        <span class="pr-number">#${p.number}</span>
      </div>
      <div class="pr-title">${prStatusIcon(p.state)}${p.title}</div>
      <div class="pr-meta">
        <span class="pr-author">${p.author}</span>
        <span class="pr-state">${p.state}${p.draft ? ' · draft' : ''}</span>
        <span class="pr-review">${p.reviewStatus}</span>
      </div>
      <div class="pr-time">Updated ${formatDate(p.updatedAt)}</div>
    </div>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Pull Requests</h1>
    </div>
    <div class="card">
      ${prs.length === 0
        ? '<p class="hint">No pull requests.</p>'
        : `<div class="pr-list">${rows}</div>`}
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.pr-row').forEach((el, i) => {
    el.addEventListener('click', () => onPr(prs[i]))
  })

  return container
}
