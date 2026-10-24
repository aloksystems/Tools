const root = document.documentElement;
const siteUrl = path => new URL(String(path).replace(/^\/+/, ''), document.baseURI).href;
function readTheme() {
  try { return localStorage.getItem('alok-theme'); } catch { return null; }
}
function saveTheme(theme) {
  try { localStorage.setItem('alok-theme', theme); } catch { /* Theme still works for this page view. */ }
}
const savedTheme = readTheme();
root.dataset.theme = savedTheme || 'dark';

let revealObserver = null;
function observeReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  const vh = window.innerHeight || document.documentElement.clientHeight;
  els.forEach(el => {
    if (el.classList.contains('is-inview')) return;
    const r = el.getBoundingClientRect();
    if (r.top < vh - 40 && r.bottom > 0) { el.classList.add('is-inview'); return; }
    if ('IntersectionObserver' in window) {
      if (!revealObserver) {
        revealObserver = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) { entry.target.classList.add('is-inview'); revealObserver.unobserve(entry.target); }
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      }
      revealObserver.observe(el);
    } else {
      el.classList.add('is-inview');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('[data-app-list]')) renderCards('[data-app-list]', {featured:true});
  if (document.querySelector('[data-catalogue]')) renderCards('[data-catalogue]', {catalogue:true});
  const detail = document.querySelector('[data-app-detail]');
  if (detail) renderCards('[data-app-detail]', {detail:detail.dataset.slug});
  const themeButton = document.querySelector('[data-theme-toggle]');
  themeButton?.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
  themeButton?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    saveTheme(next);
    themeButton.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} theme`);
    themeButton.setAttribute('aria-pressed', String(next === 'dark'));
  });
  const menu = document.querySelector('[data-menu-toggle]');
  const panel = document.querySelector('[data-mobile-panel]');
  menu?.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  panel?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    panel.classList.remove('open');
    menu?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('aria-label', 'Open navigation');
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel?.classList.contains('open')) {
      panel.classList.remove('open');
      menu?.setAttribute('aria-expanded', 'false');
      menu?.setAttribute('aria-label', 'Open navigation');
      menu?.focus();
    }
  });
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
  observeReveal();
});

async function getApps() {
  const response = await fetch(siteUrl('data/apps.json'));
  if (!response.ok) throw new Error('Catalogue unavailable');
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('Catalogue must be a JSON array');
  return data.filter(app => app && typeof app.name === 'string' && typeof app.slug === 'string' && /^[a-z0-9-]+$/.test(app.slug)).map(app => ({
    ...app,
    category: typeof app.category === 'string' ? app.category : 'Details pending',
    shortDescription: typeof app.shortDescription === 'string' ? app.shortDescription : 'App details are being prepared.',
    description: typeof app.description === 'string' ? app.description : 'More information will be published when verified details are available.',
    icon: siteUrl(typeof app.icon === 'string' && app.icon ? app.icon : 'assets/icons/favicon.svg'),
    iconIsPlaceholder: Boolean(app.iconIsPlaceholder),
    screenshots: Array.isArray(app.screenshots) ? app.screenshots.filter(s => s && typeof s.src === 'string' && s.src) : [],
    features: Array.isArray(app.features) ? app.features.filter(x => typeof x === 'string') : [],
    changelog: Array.isArray(app.changelog) ? app.changelog.filter(x => typeof x === 'string') : [],
    permissions: Array.isArray(app.permissions) ? app.permissions.filter(x => typeof x === 'string') : [],
    featured: Boolean(app.featured),
    downloadUrl: typeof app.downloadUrl === 'string' ? siteUrl(app.downloadUrl) : null
  }));
}
function isUsableDownloadUrl(value) {
  if (typeof value !== 'string' || !value) return false;
  // Relative path on the same site (e.g. /downloads/app.apk) — works on any host.
  if (value.startsWith('/')) return value.toLowerCase().endsWith('.apk');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && url.pathname.toLowerCase().endsWith('.apk');
  } catch { return false; }
}
function bindImageFallback(host) {
  host.querySelectorAll?.('img').forEach(image => image.addEventListener('error', () => {
    if (image.dataset.fallbackApplied) return;
    image.dataset.fallbackApplied = 'true';
    image.src = siteUrl('assets/icons/favicon.svg');
    image.alt = 'Alok Systems placeholder mark';
  }, { once: true }));
}
function card(app) {
  const featureTags = (app.features || []).slice(0, 3).map(x => `<span class="tag">${escapeHtml(x)}</span>`).join('');
  const validDownload = app.status === 'available' && isUsableDownloadUrl(app.downloadUrl);
  const download = validDownload ? `<a class="button button-primary" href="${siteUrl(`apps/${encodeURIComponent(app.slug)}.html`)}">Download<span class="sr-only"> ${escapeHtml(app.name)}</span></a>` : `<span class="status">Download unavailable</span>`;
  const iconAlt = app.iconIsPlaceholder ? `${app.name} placeholder mark` : `${app.name} app icon`;
  return `<article class="app-card"><div class="card-top"><img class="app-icon" src="${escapeAttr(app.icon)}" alt="${escapeAttr(iconAlt)}" loading="lazy"><span class="badge">${escapeHtml(app.category)}</span></div><h3>${escapeHtml(app.name)}</h3><p>${escapeHtml(app.shortDescription)}</p>${featureTags ? `<div class="tag-row">${featureTags}</div>` : ''}<div class="card-bottom"><a class="text-link" href="${siteUrl(`apps/${encodeURIComponent(app.slug)}.html`)}">View details<span class="sr-only"> ${escapeHtml(app.name)}</span> →</a>${download}</div></article>`;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(value) { return escapeHtml(value); }

async function renderCards(target, opts = {}) {
  const host = document.querySelector(target);
  if (!host) return;
  host.setAttribute('aria-busy', 'true');
  try {
    const apps = await getApps();
    if (opts.detail) {
      const app = apps.find(x => x.slug === opts.detail || x.id === opts.detail);
      if (!app) { host.innerHTML = '<div class="empty-state">We could not find that app.</div>'; host.setAttribute('aria-busy', 'false'); return; }
      document.title = `${app.name} — Alok Systems Apps`;
      document.querySelector('[data-meta-description]')?.setAttribute('content', app.shortDescription);
      const features = app.features.length ? `<ul>${app.features.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<div class="screenshot-empty">Verified feature information will appear here when available.</div>';
      const shots = app.screenshots?.length ? `<div class="app-grid">${app.screenshots.map(s => `<img src="${escapeAttr(s.src)}" alt="${escapeAttr(s.alt || app.name + ' screenshot')}" loading="lazy">`).join('')}</div>` : '<div class="screenshot-empty">Screenshots will be added when authentic app captures are available.</div>';
      const changes = app.changelog.length ? `<ul>${app.changelog.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : '<p>No release notes have been published yet.</p>';
      const available = app.status === 'available' && isUsableDownloadUrl(app.downloadUrl);
      const iconAlt = app.iconIsPlaceholder ? `${app.name} placeholder mark` : `${app.name} app icon`;
      host.innerHTML = `<div class="detail-page" data-reveal><div class="detail-hero"><img class="detail-icon" src="${escapeAttr(app.icon)}" alt="${escapeAttr(iconAlt)}"><div><span class="eyebrow">${escapeHtml(app.category || 'Android app')}</span><h1>${escapeHtml(app.name)}</h1><p>${escapeHtml(app.description)}</p><div class="meta-row"><span class="meta-pill">${app.version ? 'Version ' + escapeHtml(app.version) : 'Release details pending'}</span><span class="meta-pill">${app.status === 'available' && available ? 'Available' : 'Coming soon'}</span></div></div></div><div class="detail-layout"><div class="detail-main"><h2>About</h2><p>${escapeHtml(app.description)}</p><h2>Screenshots</h2>${shots}<h2>Features</h2>${features}<h2>Release notes</h2>${changes}<h2>Privacy & permissions</h2><p>${app.permissions.length ? 'Permissions: ' + app.permissions.map(escapeHtml).join(', ') : 'Privacy and permission details have not been published yet.'}</p></div><aside class="download-panel"><h3>${available ? 'Get ' + escapeHtml(app.name) : 'Download unavailable'}</h3><p>${available ? 'Download the Android APK from the configured public source.' : 'A public APK has not been configured for this app yet.'}</p>${available ? `<button type="button" class="button button-primary" data-download="${escapeAttr(app.downloadUrl)}">Download APK ↓</button><div class="download-progress" hidden><div class="progress-track"><div class="progress-fill"></div></div><div class="progress-label" role="status"></div></div>` : '<span class="button button-quiet" aria-disabled="true">Coming soon</span>'}<div class="data-list">${[['Version',app.version],['Released',app.releaseDate],['File size',app.fileSize],['Minimum Android',app.androidMinVersion],['Package name',app.packageName],['SHA-256',app.sha256]].map(([k,v]) => `<div class="data-row"><span>${k}</span><span>${v ? escapeHtml(v) : 'Not provided'}</span></div>`).join('')}</div></aside></div></div>`;
      bindImageFallback(host);
      observeReveal();
      host.setAttribute('aria-busy', 'false');
      return;
    }
    let shown = opts.featured ? apps.filter(a => a.featured) : apps;
    if (opts.catalogue) {
      const search = document.querySelector('[data-search]');
      const sort = document.querySelector('[data-sort]');
      const chips = document.querySelector('[data-filters]');
      const categories = ['All apps', ...new Set(apps.map(a => a.category).filter(Boolean))];
      chips.innerHTML = categories.map((c,i) => `<button class="filter-chip" type="button" data-category="${escapeAttr(c)}" aria-pressed="${i===0}">${escapeHtml(c)}</button>`).join('');
      let active = 'All apps';
      const update = () => {
        let list = apps.filter(a => (active === 'All apps' || a.category === active) && `${a.name} ${a.shortDescription} ${(a.features||[]).join(' ')}`.toLowerCase().includes(search.value.trim().toLowerCase()));
        if (sort.value === 'featured') list.sort((a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured)) || a.name.localeCompare(b.name));
        else if (sort.value === 'az') list.sort((a,b)=>a.name.localeCompare(b.name));
        else if (sort.value === 'za') list.sort((a,b)=>b.name.localeCompare(a.name));
        else if (sort.value === 'available') list.sort((a,b)=>Number(Boolean(b.status === 'available' && isUsableDownloadUrl(b.downloadUrl)))-Number(Boolean(a.status === 'available' && isUsableDownloadUrl(a.downloadUrl))) || a.name.localeCompare(b.name));
        host.innerHTML = list.length ? list.map(card).join('') : '<div class="empty-state">No apps match that search. Try another name or filter.</div>';
        bindImageFallback(host);
        document.querySelector('[data-result-count]').textContent = `${list.length} ${list.length === 1 ? 'app' : 'apps'}`;
        host.setAttribute('aria-busy', 'false');
      };
      chips.addEventListener('click', e => { const b=e.target.closest('[data-category]'); if (!b) return; active=b.dataset.category; chips.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); update(); });
      search.addEventListener('input',update); sort.addEventListener('change',update); update(); return;
    }
    host.innerHTML = shown.length ? shown.map(card).join('') : '<div class="empty-state">App information will appear here when it is ready.</div>';
    bindImageFallback(host);
    host.setAttribute('aria-busy', 'false');
  } catch { host.innerHTML = '<div class="empty-state">App information could not be loaded. Please refresh the page.</div>'; host.setAttribute('aria-busy', 'false'); }
}

async function startDownload(url, panel) {
  const track = panel.querySelector('.progress-fill');
  const label = panel.querySelector('.progress-label');
  panel.hidden = false;
  label.textContent = 'Connecting…';
  if (track) track.style.width = '0%';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const total = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { chunks.push(value); received += value.length; }
      const pct = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
      if (track) track.style.width = pct + '%';
      label.textContent = total ? `Downloading ${pct}%` : `Downloading ${(received / 1048576).toFixed(1)} MB`;
    }
    const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
    const a = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = url.split('?')[0].split('/').pop() || 'app.apk';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    label.textContent = 'Download complete ✓';
    if (track) track.style.width = '100%';
  } catch (err) {
    label.textContent = 'Download failed — check connection and try again.';
    label.classList.add('download-failed');
    if (track) track.style.width = '0%';
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-download]');
  if (!button) return;
  event.preventDefault();
  const panel = button.closest('.download-panel');
  const progress = (panel && panel.querySelector('.download-progress')) || button.nextElementSibling;
  startDownload(button.dataset.download, progress);
});

// Direct submit endpoint for the Google Form (built with FormForge).
// This is the form's "formResponse" URL. The entry IDs below must match the
// questions in that form (Name, Rating, Topic, Message).
const FEEDBACK_ENDPOINT =
  'https://docs.google.com/forms/u/0/d/e/1FAIpQLSdSucXHKXJR8C19pR5e-hNSl39QHVa5vsS-HqU5vfC1uSP_Ug/formResponse';

const FEEDBACK_FIELDS = {
  name: 'entry.2007378481',
  rating: 'entry.1249505218',
  topic: 'entry.51228101',
  message: 'entry.192173046'
};

const feedbackForm = document.querySelector('[data-feedback-form]');
if (feedbackForm) {
  const form = feedbackForm;
  const status = form.querySelector('[data-feedback-status]');
  const setStatus = (kind, text) => {
    status.textContent = text;
    if (kind) status.dataset.kind = kind;
    else delete status.dataset.kind;
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.name.value.trim();
    const rating = form.rating.value.trim();
    const topic = form.topic.value.trim();
    const message = form.message.value.trim();
    if (!name || !rating || !topic || !message) {
      setStatus('error', 'Please fill in all the required fields before sending.');
      if (!name) form.name.focus();
      else if (!rating) form.rating.focus();
      else if (!topic) form.topic.focus();
      else form.message.focus();
      return;
    }
    if (!FEEDBACK_ENDPOINT) {
      setStatus('error', 'The feedback form is not configured yet. Please email us via the contact details instead.');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Sending…';
    setStatus('', '');
    try {
      const payload = new URLSearchParams();
      payload.append(FEEDBACK_FIELDS.name, name);
      payload.append(FEEDBACK_FIELDS.rating, rating);
      payload.append(FEEDBACK_FIELDS.topic, topic);
      payload.append(FEEDBACK_FIELDS.message, message);
      await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        body: payload
      });
      setStatus('success', 'Thanks — your feedback has been sent to the Alok Systems team.');
      form.reset();
    } catch (_) {
      setStatus('error', 'Network error — could not reach the server. Please check your connection and try again.');
    } finally {
      button.disabled = false;
      button.textContent = 'Send Feedback';
    }
  });
}
