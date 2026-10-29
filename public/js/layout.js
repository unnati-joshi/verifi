import { getMe, logout } from './api.js';
import { $, esc, MARK, ICONS, mountThemeToggle } from './ui.js';

const LINKS = [
  ['/dashboard.html', 'Overview'],
  ['/analyze.html', 'New check'],
  ['/reports.html', 'Reports'],
  ['/watchlist.html', 'Watchlist'],
];

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

function avatarHtml(user) {
  return `<span class="avatar">${
    user.avatarUrl ? `<img src="${esc(user.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : esc(initials(user.name))
  }</span>`;
}

// Renders the shared top bar into <header id="app-header">. Works for signed-in and anonymous visitors.
export async function renderHeader() {
  const host = $('#app-header');
  if (!host) return null;
  const user = await getMe();
  const path = location.pathname.replace(/\.html$/, '');

  host.className = 'topbar';
  host.innerHTML = `
    <div class="container">
      <a class="brand" href="${user ? '/dashboard.html' : '/'}">${MARK}verifi</a>
      ${
        user
          ? `<nav class="nav" id="main-nav" aria-label="Main">${LINKS.map(
              ([href, label]) => `<a href="${href}"${path === href.replace('.html', '') ? ' class="active" aria-current="page"' : ''}>${label}</a>`,
            ).join('')}</nav>`
          : ''
      }
      <div class="head-actions">
        <button class="icon-btn" id="theme-btn" type="button"></button>
        ${
          user
            ? `<div class="user-menu">
                <button class="user-btn" id="user-btn" aria-haspopup="true" aria-expanded="false">
                  ${avatarHtml(user)}<span class="name">${esc(user.name.split(' ')[0])}</span>
                </button>
                <div class="dropdown hidden" id="user-dd">
                  <div class="who"><strong>${esc(user.name)}</strong><div class="small muted truncate">${esc(user.email)}</div></div>
                  <button id="logout-btn">Sign out</button>
                </div>
              </div>
              <button class="icon-btn menu-toggle" id="menu-toggle" aria-label="Menu">${ICONS.menu}</button>`
            : `<a class="btn btn-ghost btn-sm" href="/login.html">Sign in</a>
               <a class="btn btn-primary btn-sm" href="/login.html?mode=register">Create account</a>`
        }
      </div>
    </div>`;

  mountThemeToggle($('#theme-btn'));

  if (user) {
    const btn = $('#user-btn');
    const dd = $('#user-dd');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dd.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', String(!dd.classList.contains('hidden')));
    });
    document.addEventListener('click', () => dd.classList.add('hidden'));
    $('#logout-btn').addEventListener('click', logout);
    $('#menu-toggle').addEventListener('click', () => $('#main-nav').classList.toggle('open'));
  }
  return user;
}
