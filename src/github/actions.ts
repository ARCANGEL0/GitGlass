import { GitHubClient } from './client'

export interface WorkflowRun {
  id: number
  name: string
  display_title?: string
  run_number?: number
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending'
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
  event: string
  actor?: { login: string }
  created_at: string
  updated_at?: string
  run_started_at?: string
  html_url: string
  repo: string
}

export interface WorkflowJob {
  name: string
  status: string
  conclusion: string | null
  started_at?: string | null
  completed_at?: string | null
  steps?: Array<{ name: string; status: string; conclusion: string | null }>
}

export function isActiveRun(run: Pick<WorkflowRun, 'status'>): boolean {
  return run.status !== 'completed'
}

const repoPath = (repo: string) => repo.split('/').map(part => encodeURIComponent(part)).join('/')

export class ActionsService {
  constructor(private client: GitHubClient) {}

  /** Recent runs across these repositories, running ones first, then newest. */
  async recent(repos: string[], perRepo = 10): Promise<WorkflowRun[]> {
    const lists = await Promise.all(repos.map(repo =>
      this.client
        .get<{ workflow_runs?: Omit<WorkflowRun, 'repo'>[] }>(`/repos/${repoPath(repo)}/actions/runs?per_page=${perRepo}`, false)
        .then(result => (result.workflow_runs ?? []).map(run => ({ ...run, repo })))
        .catch(() => [] as WorkflowRun[]),
    ))
    return lists.flat().sort((a, b) => {
      const active = Number(isActiveRun(b)) - Number(isActiveRun(a))
      if (active) return active
      return String(b.updated_at ?? b.created_at).localeCompare(String(a.updated_at ?? a.created_at))
    })
  }

  run(repo: string, id: number) {
    return this.client.get<Omit<WorkflowRun, 'repo'>>(`/repos/${repoPath(repo)}/actions/runs/${id}`, false)
  }

  async jobs(repo: string, id: number): Promise<WorkflowJob[]> {
    const result = await this.client.get<{ jobs?: WorkflowJob[] }>(`/repos/${repoPath(repo)}/actions/runs/${id}/jobs`, false)
    return result.jobs ?? []
  }
}
