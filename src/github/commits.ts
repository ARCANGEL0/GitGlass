/* GitHub commit service. */

import { GitHubClient } from './client'

export interface CommitSummary {
  sha: string
  message: string
  author: { name: string | null; date: string | null }
  html_url: string
}

export class CommitsService {
  constructor(private client: GitHubClient) {}

  list(repo: string, opts: { perPage?: number; maxPages?: number; sha?: string } = {}) {
    const qs = [
      `per_page=${opts.perPage ?? 30}`,
      'page=1',
      opts.sha ? `sha=${encodeURIComponent(opts.sha)}` : '',
    ]
      .filter(Boolean)
      .join('&')
    return this.client.collect<CommitSummary>(`/repos/${encodeURIComponent(repo)}/commits?${qs}`, {
      perPage: opts.perPage ?? 30,
      maxPages: opts.maxPages ?? 3,
    })
  }
}
