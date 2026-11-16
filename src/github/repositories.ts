/* GitHub repository service. */

import type { GitHubRepository } from '../types'
import { GitHubClient } from './client'

export class RepositoriesService {
  constructor(private client: GitHubClient) {}

  /** List repositories accessible to the authenticated user. Bounded to a few
   *  pages so a single glasses gesture never triggers unbounded requests. */
  list(opts: { perPage?: number; maxPages?: number } = {}) {
    return this.client.collect<GitHubRepository>('/user/repos', {
      perPage: opts.perPage ?? 30,
      maxPages: opts.maxPages ?? 3,
    })
  }

  get(repo: string) {
    return this.client.get<GitHubRepository>(`/repos/${encodeURIComponent(repo)}`)
  }
}
