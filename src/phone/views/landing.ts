import { createElement } from '../../dom'

export interface LandingProps {
  onConnect: () => void
}

export function renderLanding({ onConnect }: LandingProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  container.innerHTML = `
    <div class="landing">
      <div class="brand">
        <div class="icon">[ GITHUB ]</div>
        <div class="name">GitHub G2</div>
      </div>
      <p class="tagline">Your GitHub. Beyond the screen.</p>
      <p class="description">
        Browse repositories, review pull requests, and stay connected to
        your development workflow directly from your Even G2.
      </p>

      <div class="card how-it-works">
        <h3>How it works</h3>
        <ul>
          <li>Link your GitHub account with a Personal Access Token.</li>
          <li>Configure which modules appear on your glasses.</li>
          <li>Browse repos, PRs, issues, and notifications — no phone needed.</li>
        </ul>
      </div>

      <div class="card security">
        <h3>Security</h3>
        <ul>
          <li>Your token never leaves your phone.</li>
          <li>Only read-only GitHub scopes are requested.</li>
          <li>Disconnect at any time to revoke access.</li>
        </ul>
      </div>

      <button class="btn btn-primary btn-large" id="connect-btn">
        Connect GitHub
      </button>
      <p class="footnote">
        Requires an Even Realities G2 paired to this phone via Even Hub.
      </p>
    </div>
  `

  const btn = container.querySelector('#connect-btn')!
  btn.addEventListener('click', onConnect)

  return container
}
