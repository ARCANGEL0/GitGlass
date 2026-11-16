/* GitHub pull request service. */

import type { GitHubPullRequest } from '../types'
import { GitHubClient } from './client'

export class PullRequestsService {
  constructor(private client: GitHubClient) {}

  /** List PRs created by the authenticated user. */
  createdByMe(opts: { perPage?: number; maxPages?: number } = {}) {
    return this.client.collect<GitHubPullRequest>('/pulls', {
      perPage: opts.perPage ?? 30,
      maxPages: opts.maxPages ?? 3,
    })
  }

  listForRepo(repo: string, opts: { perPage?: number; maxPages?: number } = {}) {
    return this.client.collect<GitHubPullRequest>(
      `/repos/${encodeURIComponent(repo)}/pulls`,
      { perPage: opts.perPage ?? 30, maxPages: opts.maxPages ?? 3 },
    )
  }

  get(repo: string, number: number) {
    return this.client.get<GitHubPullRequest>(
      `/repos/${encodeURIComponent(repo)}/pulls/${number}`,
    )
  }
}
