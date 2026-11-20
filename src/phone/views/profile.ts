import { createElement } from '../../dom'

export interface ProfileProps {
  user: {
    login: string
    name?: string | null
    avatar?: string | null
    bio?: string | null
    company?: string | null
    location?: string | null
    public_repos: number
    followers: number
    following: number
  }
  onBack: () => void
}

export function renderProfile({ user, onBack }: ProfileProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>My profile</h1>
    </div>

    <div class="profile-card">
      <img class="avatar" src="${user.avatar ?? ''}" alt="" />
      <div class="profile-info">
        <div class="name">${user.name ?? user.login}</div>
        <div class="login">@${user.login}</div>
        ${user.bio ? `<div class="bio">${user.bio}</div>` : ''}
        ${user.company ? `<div class="company">${user.company}</div>` : ''}
        ${user.location ? `<div class="location">${user.location}</div>` : ''}
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${user.public_repos}</div>
        <div class="stat-label">Repositories</div>
      </div>
      <div class="stat">
        <div class="stat-value">${user.followers}</div>
        <div class="stat-label">Followers</div>
      </div>
      <div class="stat">
        <div class="stat-value">${user.following}</div>
        <div class="stat-label">Following</div>
      </div>
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  return container
}
