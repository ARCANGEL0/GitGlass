/* Phone actions view — GitHub Actions workflow runs.

Shows recent workflow runs: workflow name, repository, branch, run status,
conclusion, trigger, timestamp. Read-only.
*/

import { createElement } from '../../dom'
import { formatDate } from './shared'

export interface WorkflowRunItem {
  name: string
  repository: string
  branch: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null
  event: string
  createdAt: string
}

export interface ActionsProps {
  runs: WorkflowRunItem[]
  onBack: () => void
}

export function renderActions({ runs, onBack }: ActionsProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const rows = runs.map(r => `
    <div class="action-run-row">
      <div class="action-run-name">${r.name}</div>
      <div class="action-run-repo">${r.repository}</div>
      <div class="action-run-meta">
        <span class="action-run-branch">${r.branch}</span>
        <span class="action-run-status">${r.status}</span>
        ${r.conclusion ? `<span class="action-run-conclusion">${r.conclusion}</span>` : ''}
        <span class="action-run-event">${r.event}</span>
      </div>
      <div class="action-run-time">Started ${formatDate(r.createdAt)}</div>
    </div>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Actions</h1>
    </div>
    <div class="card">
      ${runs.length === 0
        ? '<p class="hint">No workflow runs.</p>'
        : `<div class="action-run-list">${rows}</div>`}
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  return container
}
