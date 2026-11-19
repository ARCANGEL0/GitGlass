import type { GitHubUser } from '../types'
import { GitHubClient } from './client'

export class UsersService {
  constructor(private client: GitHubClient) {}

  getProfile() {
    return this.client.get<GitHubUser>('/user')
  }
}
