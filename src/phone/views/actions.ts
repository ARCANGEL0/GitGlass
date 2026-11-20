import { createElement } from '../../dom'
import { escapeHtml, formatDate, runStatusIcon } from './shared'

export interface WorkflowRunItem {
  name: string
  title: string
  repository: string
  branch: string
  status: string
  conclusion: string | null
  event: string
  createdAt: string
}

export interface ActionsProps {
  runs: WorkflowRunItem[]
  onBack: () => void
}

function stateLabel(run: WorkflowRunItem): string {
  if (run.status === 'in_progress') return 'Running'
  if (run.status !== 'completed') return run.status.charAt(0).toUpperCase() + run.status.slice(1)
  const conclusion = (run.conclusion ?? 'done').replace('_', ' ')
  return conclusion.charAt(0).toUpperCase() + conclusion.slice(1)
}

function row(run: WorkflowRunItem): string {
  return `
    <div class="action-run-row">
      <div class="action-run-name">${runStatusIcon(run.status, run.conclusion)}${escapeHtml(run.title)}</div>
      <div class="action-run-repo">${escapeHtml(run.repository)} · ${escapeHtml(run.name)}</div>
      <div class="action-run-meta">
        <span class="action-run-status">${stateLabel(run)}</span>
        <span class="action-run-branch">${escapeHtml(run.branch)}</span>
        <span class="action-run-event">${escapeHtml(run.event)}</span>
      </div>
      <div class="action-run-time">Started ${formatDate(run.createdAt)}</div>
    </div>
  `
}

export function renderActions({ runs, onBack }: ActionsProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })
  const running = runs.filter(run => run.status !== 'completed')
  const finished = runs.filter(run => run.status === 'completed')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Actions</h1>
    </div>
    <div class="card">
      <h3>Running now</h3>
      ${running.length
        ? `<div class="action-run-list">${running.map(row).join('')}</div>`
        : '<p class="hint">Nothing is running right now.</p>'}
    </div>
    ${finished.length
      ? `<div class="card"><h3>Recent runs</h3><div class="action-run-list">${finished.map(row).join('')}</div></div>`
      : ''}
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  return container
}
