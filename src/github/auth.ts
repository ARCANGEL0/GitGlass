/* GitHub authentication for the G2 app.

Phone-side only: the user enters a Personal Access Token, the client validates
it against GitHub, and the token is stored in the shared state store (native
bridge storage on the phone, in-memory fallback in preview). Tokens are never
logged or committed.
*/

import type { GitHubUser, GitHubRepository } from '../types'
import { GitHubClient, GitHubApiError } from './client'

export interface AuthResult {
  ok: boolean
  user?: GitHubUser
  repos?: GitHubRepository[]
  error?: string
  rateLimited?: boolean
}

export class GitHubAuth {
  constructor(private client: GitHubClient) {}

  /** Validate the token and load the profile + accessible repositories.
   *  Returns a structured result; callers decide how to render errors. */
  async validate(token: string): Promise<AuthResult> {
    this.client.setToken(token)

    try {
      const [user, repos] = await Promise.all([
        this.client.get<GitHubUser>('/user'),
        this.client.collect<GitHubRepository>('/user/repos', {
          perPage: 30,
          maxPages: 3,
        }),
      ])
      return { ok: true, user, repos }
    } catch (err) {
      if (err instanceof GitHubApiError) {
        return {
          ok: false,
          error: err.message,
          rateLimited: err.rateLimited,
        }
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Authentication failed',
      }
    }
  }

  logout(): void {
    this.client.clearToken()
  }
}
