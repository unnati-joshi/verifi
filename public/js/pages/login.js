import { api, getMe } from '../api.js';
import { $, setLoading, showFieldErrors, mountThemeToggle } from '../ui.js';

const params = new URLSearchParams(location.search);
// Only allow same-site relative redirects after login.
const rawNext = params.get('next') || '/dashboard.html';
const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard.html';

let mode = params.get('mode') === 'register' ? 'register' : 'login';

const form = $('#auth-form');
const alertBox = $('#auth-alert');

mountThemeToggle($('#theme-btn'));

function showAlert(msg) {
  alertBox.textContent = msg;
  alertBox.classList.toggle('hidden', !msg);
}

function applyMode() {
  const reg = mode === 'register';
  document.title = `${reg ? 'Create account' : 'Sign in'} · verifi`;
  $('#auth-title').textContent = reg ? 'Create your account' : 'Sign in';
  $('#auth-sub').textContent = reg ? 'Save reports and keep a watchlist across devices.' : 'Pick up where you left off.';
  $('#name-field').classList.toggle('hidden', !reg);
  $('#pw-hint').classList.toggle('hidden', !reg);
  $('#password').autocomplete = reg ? 'new-password' : 'current-password';
  $('#submit-btn').textContent = reg ? 'Create account' : 'Sign in';
  $('#switch-text').textContent = reg ? 'Already have an account?' : 'No account yet?';
  $('#switch-link').textContent = reg ? 'Sign in' : 'Create one';
  showFieldErrors(form, {});
  showAlert('');
}

$('#switch-link').addEventListener('click', (e) => {
  e.preventDefault();
  mode = mode === 'login' ? 'register' : 'login';
  const url = new URL(location.href);
  if (mode === 'register') url.searchParams.set('mode', 'register');
  else url.searchParams.delete('mode');
  history.replaceState(null, '', url);
  applyMode();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showAlert('');
  const body = {
    email: form.email.value.trim(),
    password: form.password.value,
    ...(mode === 'register' ? { name: form.name.value.trim() } : {}),
  };
  const btn = $('#submit-btn');
  setLoading(btn, true);
  try {
    await api(`/auth/${mode}`, { method: 'POST', body });
    location.href = next;
  } catch (err) {
    setLoading(btn, false);
    showFieldErrors(form, err.details);
    if (!err.details) showAlert(err.message);
  }
});

applyMode();
if (params.get('error')) showAlert(params.get('error'));

api('/auth/config')
  .then(({ googleEnabled }) => $('#google-block').classList.toggle('hidden', !googleEnabled))
  .catch(() => $('#google-block').classList.add('hidden'));

// Already signed in? Skip the form.
getMe().then((user) => user && location.replace(next));
