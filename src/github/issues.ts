/* GitHub issue service. */

import type { GitHubIssue } from '../types'
import { GitHubClient } from './client'

export class IssuesService {
  constructor(private client: GitHubClient) {}

  list(opts: { perPage?: number; maxPages?: number; filter?: string } = {}) {
    const path = opts.filter
      ? `/issues?filter=${opts.filter}&per_page=${opts.perPage ?? 30}&page=1`
      : `/issues?per_page=${opts.perPage ?? 30}&page=1`
    return this.client.collect<GitHubIssue>(path, {
      perPage: opts.perPage ?? 30,
      maxPages: opts.maxPages ?? 3,
    })
  }

  listForRepo(repo: string, opts: { perPage?: number; maxPages?: number } = {}) {
    return this.client.collect<GitHubIssue>(
      `/repos/${encodeURIComponent(repo)}/issues`,
      { perPage: opts.perPage ?? 30, maxPages: opts.maxPages ?? 3 },
    )
  }

  get(repo: string, number: number) {
    return this.client.get<GitHubIssue>(
      `/repos/${encodeURIComponent(repo)}/issues/${number}`,
    )
  }
}
