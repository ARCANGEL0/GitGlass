/* Phone collab PRs view — PRs from collaborators on repos owned by the user.

Prioritizes collaborative development. Shows repo, number, title, author,
created/updated dates, review status, mergeability, requested reviewers.
*/

import { createElement } from '../../dom'

export interface CollabPrItem {
  repo: string
  number: number
  title: string
  author: string
  createdAt: string
  updatedAt: string
  reviewStatus: 'none' | 'approved' | 'changes-requested' | 'commented'
  mergeable: boolean | null
  draft: boolean
  requestedReviewers: string[]
}

export interface CollabPrsProps {
  prs: CollabPrItem[]
  onBack: () => void
  onPr: (pr: CollabPrItem) => void
}

export function renderCollabPrs({ prs, onBack, onPr }: CollabPrsProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const rows = prs.map(p => `
    <div class="collab-pr-row" data-index="${prs.indexOf(p)}">
      <div class="collab-pr-header">
        <span class="collab-pr-repo">${p.repo}</span>
        <span class="collab-pr-number">#${p.number}</span>
      </div>
      <div class="collab-pr-title">${p.title}</div>
      <div class="collab-pr-meta">
        <span class="collab-pr-author">${p.author}</span>
        <span class="collab-pr-review">${p.reviewStatus}</span>
        ${p.draft ? '<span class="collab-pr-draft">draft</span>' : ''}
        ${p.requestedReviewers.length > 0
          ? `<span class="collab-pr-reviewers">review: ${p.requestedReviewers.join(', ')}</span>`
          : ''}
      </div>
      <div class="collab-pr-time">created ${p.createdAt} · updated ${p.updatedAt}</div>
    </div>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">← Back</button>
      <h1>Collab PRs</h1>
    </div>
    <div class="card">
      ${prs.length === 0
        ? '<p class="hint">No collaboration PRs.</p>'
        : `<div class="collab-pr-list">${rows}</div>`}
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.collab-pr-row').forEach((el, i) => {
    el.addEventListener('click', () => onPr(prs[i]))
  })

  return container
}
