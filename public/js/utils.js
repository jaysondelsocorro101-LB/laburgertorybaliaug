/* Shared utilities — loaded on every page */

// Toast notifications
const Toast = (() => {
  let container;
  function getContainer() {
    if (!container) {
      container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
      }
    }
    return container;
  }
  function show(message, type = 'info', duration = 3500) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    getContainer().appendChild(el);
    setTimeout(() => {
      el.style.animation = 'slideOut 0.25s ease forwards';
      setTimeout(() => el.remove(), 250);
    }, duration);
  }
  return { show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error'), info: (m) => show(m, 'info') };
})();

// API helper
async function api(method, path, body, opts = {}) {
  const options = {
    method,
    headers: {},
    credentials: 'same-origin',
  };
  if (body && !(body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    options.body = body;
  }
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Format currency
function formatPHP(amount) {
  return '₱' + Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Format datetime
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Time ago
function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return formatDate(dateStr);
}

// Status badge HTML
function statusBadge(status) {
  const labels = {
    received: 'Received',
    preparing: 'Preparing',
    ready: 'Ready',
    completed: 'Completed',
    cancelled: 'Cancelled',
    unpaid: 'Unpaid',
    pending_verification: 'Pending Verification',
    verified: 'Verified',
    cash: 'Cash',
    gcash: 'GCash',
  };
  const icons = { received: '📬', preparing: '🍳', ready: '✅', completed: '✓', cancelled: '✕' };
  return `<span class="badge badge-${status}">${icons[status] || ''} ${labels[status] || status}</span>`;
}

// Escape HTML
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Offline detection
function initOfflineBanner() {
  const banner = document.getElementById('offline-banner') || (() => {
    const el = document.createElement('div');
    el.id = 'offline-banner';
    el.textContent = '⚠ You are offline — orders will sync when connection is restored';
    document.body.prepend(el);
    return el;
  })();

  const update = () => banner.classList.toggle('show', !navigator.onLine);
  window.addEventListener('online', () => { update(); Toast.success('Back online — syncing...'); });
  window.addEventListener('offline', () => { update(); Toast.info('Offline mode — orders queued locally'); });
  update();
}

// Auth guard for staff pages
async function requireLogin(redirectTo = '/login.html') {
  try {
    const data = await api('GET', '/api/auth/me');
    if (!data.user) { window.location.href = redirectTo; return null; }
    return data.user;
  } catch {
    window.location.href = redirectTo;
    return null;
  }
}

// Logout
async function logout() {
  await api('POST', '/api/auth/logout').catch(() => {});
  window.location.href = '/login.html';
}

// Render user chip in topnav
function renderUserChip(user) {
  const el = document.getElementById('user-chip');
  if (!el || !user) return;
  el.innerHTML = `${esc(user.name)} — <span class="role-${user.role}">${user.role}</span>`;
}

// Modal helpers
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
}

// Click outside modal to close
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) closeAllModals();
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

initOfflineBanner();
