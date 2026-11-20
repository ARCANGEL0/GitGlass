import { createElement } from '../../dom'
import { formatDate, prStatusIcon } from './shared'

export interface ContributionItem {
  repo: string
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  author: string
  updatedAt: string
  htmlUrl?: string
}

export interface ContributionProps {
  items: ContributionItem[]
  onBack: () => void
  onItem: (item: ContributionItem) => void
}

export function renderContribution({ items, onBack, onItem }: ContributionProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })
  const rows = items.map((item, index) => `
    <button class="pr-row" type="button" data-index="${index}">
      <span class="pr-header"><span class="pr-repo">${item.repo}</span><span class="pr-number">#${item.number}</span></span>
      <span class="pr-title">${prStatusIcon(item.state)}${item.title}</span>
      <span class="pr-meta"><span class="pr-author">${item.author}</span><span class="pr-state">${item.state}</span></span>
      <span class="pr-time">Updated ${formatDate(item.updatedAt)}</span>
    </button>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Contribution</h1>
    </div>
    <div class="card">
      ${items.length === 0
        ? '<p class="hint">No pull requests.</p>'
        : `<div class="pr-list">${rows}</div>`}
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)
  container.querySelectorAll('.pr-row').forEach((element, index) => {
    element.addEventListener('click', () => onItem(items[index]))
  })
  return container
}
