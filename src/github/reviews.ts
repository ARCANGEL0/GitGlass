/* GitHub pull request review / comment service. */

import { GitHubClient } from './client'

export interface ReviewComment {
  id: number
  body: string
  path: string
  line: number | null
  user: { login: string }
  created_at: string
  html_url: string
}

export interface Review {
  id: number
  state: 'approved' | 'changes_requested' | 'commented' | 'pending'
  body: string | null
  user: { login: string }
  submitted_at: string | null
  html_url: string
}

export class ReviewsService {
  constructor(private client: GitHubClient) {}

  listComments(repo: string, pullNumber: number) {
    return this.client.collect<ReviewComment>(
      `/repos/${encodeURIComponent(repo)}/pulls/${pullNumber}/comments`,
      { perPage: 30, maxPages: 3 },
    )
  }

  listReviews(repo: string, pullNumber: number) {
    return this.client.collect<Review>(
      `/repos/${encodeURIComponent(repo)}/pulls/${pullNumber}/reviews`,
      { perPage: 30, maxPages: 3 },
    )
  }
}
