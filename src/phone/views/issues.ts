import { createElement } from '../../dom'
import { formatDate } from './shared'

export interface IssueItem {
  repo: string
  number: number
  title: string
  state: 'open' | 'closed'
  author: string
  labels: Array<{ name: string }>
  assignee?: string | null
  updatedAt: string
}

export interface IssuesProps {
  issues: IssueItem[]
  onBack: () => void
  onIssue: (issue: IssueItem) => void
}

export function renderIssues({ issues, onBack, onIssue }: IssuesProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const rows = issues.map(i => `
    <div class="issue-row" data-index="${issues.indexOf(i)}">
      <div class="issue-header">
        <span class="issue-repo">${i.repo}</span>
        <span class="issue-number">#${i.number}</span>
      </div>
      <div class="issue-title">${i.title}</div>
      <div class="issue-meta">
        <span class="issue-author">${i.author}</span>
        <span class="issue-state">${i.state}</span>
        ${i.assignee ? `<span class="issue-assignee">@${i.assignee}</span>` : ''}
      </div>
      <div class="issue-labels">
        ${i.labels.map(l => `<span class="issue-label">${l.name}</span>`).join('')}
      </div>
      <div class="issue-time">Updated ${formatDate(i.updatedAt)}</div>
    </div>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Issues</h1>
    </div>
    <div class="card">
      ${issues.length === 0
        ? '<p class="hint">No issues.</p>'
        : `<div class="issue-list">${rows}</div>`}
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.issue-row').forEach((el, i) => {
    el.addEventListener('click', () => onIssue(issues[i]))
  })

  return container
}
