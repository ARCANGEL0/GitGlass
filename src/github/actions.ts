/* GitHub Actions service (read-only). */

import { GitHubClient } from './client'

export interface WorkflowRun {
  id: number
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'skipped'
    | 'timed_out'
    | 'action_required'
    | null
  head_branch: string
  repository: { full_name: string }
  event: string
  created_at: string
  html_url: string
}

export class ActionsService {
  constructor(private client: GitHubClient) {}

  listForRepo(repo: string, opts: { perPage?: number; maxPages?: number } = {}) {
    return this.client.collect<WorkflowRun>(
      `/repos/${encodeURIComponent(repo)}/actions/runs?per_page=${opts.perPage ?? 30}&page=1`,
      { perPage: opts.perPage ?? 30, maxPages: opts.maxPages ?? 3 },
    )
  }
}
