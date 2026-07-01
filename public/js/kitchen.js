/* Kitchen board — kitchen.js */

let currentFilter = 'all';
let currentUser   = null;
let proofOrderId  = null;
let prevOrderCount = null;
let refreshTimer   = null;

async function init() {
  currentUser = await requireLogin('/login.html?next=/kitchen.html');
  if (!currentUser) return;
  renderUserChip(currentUser);
  await loadOrders();
  startAutoRefresh();
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'SYNC_QUEUE') syncQueue().then(() => loadOrders());
  });
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  loadOrders();
}

async function loadOrders() {
  const search = document.getElementById('search-input').value.trim();
  const date   = document.getElementById('date-filter').value;
  const params = new URLSearchParams();

  if (currentFilter !== 'all') params.set('status', currentFilter);
  if (search) params.set('search', search);
  if (date)   params.set('date', date);

  try {
    let orders = await api('GET', `/api/orders?${params}`);

    if (currentFilter === 'all') {
      orders = orders.filter(o => !['completed','cancelled'].includes(o.status));
    }

    // New order detection → audio + title alert
    if (prevOrderCount !== null && orders.length > prevOrderCount) {
      const newCount = orders.length - prevOrderCount;
      playNewOrderChime();
      flashTitle(`🔔 ${newCount} NEW ORDER${newCount > 1 ? 'S' : ''}`);
      Toast.success(`${newCount} new order${newCount > 1 ? 's' : ''} arrived!`);
      // Browser notification if granted
      sendBrowserNotification(newCount);
    }
    prevOrderCount = orders.length;

    document.getElementById('order-count').textContent =
      `${orders.length} order${orders.length !== 1 ? 's' : ''}`;
    renderOrders(orders);
    updateRefreshLabel();
  } catch (err) {
    document.getElementById('orders-grid').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

function renderOrders(orders) {
  const grid = document.getElementById('orders-grid');
  if (!orders.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">🎉</div><p>No orders here</p></div>';
    return;
  }
  grid.innerHTML = orders.map(o => orderCard(o)).join('');
}

function orderCard(o) {
  const gcashPending  = o.payment_method === 'gcash' && o.payment_status !== 'verified';
  const displayNum    = o.order_number ? `LB-${String(o.order_number).padStart(4,'0')}` : o.id.slice(0,8).toUpperCase();

  const gcashBar = gcashPending ? `
    <div class="gcash-verify-bar">
      <div>
        <div style="font-weight:700;color:var(--warning)">⚠ GCash Unverified</div>
        ${o.gcash_reference
          ? `<div class="gcash-ref">Ref: ${esc(o.gcash_reference)}</div>`
          : '<div style="font-size:0.78rem;color:var(--text3)">No reference yet</div>'}
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${o.payment_proof_url
          ? `<img src="${esc(o.payment_proof_url)}" class="proof-thumb"
               onclick="showProof('${esc(o.id)}','${esc(o.gcash_reference||'')}','${esc(o.payment_proof_url)}')" />`
          : ''}
        <button class="btn btn-warning btn-sm" onclick="verifyPayment('${esc(o.id)}')">Verify</button>
      </div>
    </div>` : '';

  // Items — now embedded from list endpoint (no extra request)
  const itemsHtml = (o.items && o.items.length)
    ? o.items.map(i => `
        <div class="order-item-row">
          <span><span class="order-item-qty">${i.quantity}×</span>${esc(i.product_name)}</span>
          <span style="color:var(--text2)">${formatPHP(i.subtotal)}</span>
        </div>
        ${i.notes ? `<div style="font-size:0.75rem;color:var(--text3);padding-left:24px;">↳ ${esc(i.notes)}</div>` : ''}`).join('')
    : '<div style="color:var(--text3);font-size:0.8rem;">No items</div>';

  return `
    <div class="order-card status-${o.status}" id="card-${o.id}">
      <div class="order-card-header">
        <div>
          <div class="order-num-display">${displayNum}</div>
          <div class="order-customer">${esc(o.customer_name)}</div>
          <div class="order-meta">
            ${o.order_type === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}
            · ${statusBadge(o.payment_method)}
            · ${statusBadge(o.payment_status)}
          </div>
          ${o.order_type === 'delivery' && o.delivery_address
            ? `<div style="font-size:0.78rem;color:var(--text2);margin-top:4px;">📍 ${esc(o.delivery_address)}</div>`
            : ''}
          ${o.notes
            ? `<div style="font-size:0.75rem;color:var(--text3);margin-top:2px;">📝 ${esc(o.notes)}</div>`
            : ''}
        </div>
        <div style="text-align:right;flex-shrink:0;">
          ${statusBadge(o.status)}
          <div class="order-time">${timeAgo(o.created_at)}</div>
          <div style="font-size:0.9rem;font-weight:800;color:var(--accent);margin-top:4px;">${formatPHP(o.total_amount)}</div>
        </div>
      </div>
      ${gcashBar}
      <div class="order-card-body">${itemsHtml}</div>
      <div class="order-card-footer">${statusButtons(o)}</div>
    </div>`;
}

function statusButtons(o) {
  const s = o.status;
  const gcashBlocked = o.payment_method === 'gcash' && o.payment_status !== 'verified';
  const btns = [];

  if (s === 'received') {
    btns.push(`<button class="btn btn-warning btn-sm" onclick="updateStatus('${o.id}','preparing')"
      ${gcashBlocked ? 'disabled title="Verify GCash first"' : ''}>🍳 Preparing</button>`);
    btns.push(`<button class="btn btn-ghost btn-sm" onclick="updateStatus('${o.id}','cancelled')">Cancel</button>`);
  }
  if (s === 'preparing') {
    btns.push(`<button class="btn btn-success btn-sm" onclick="updateStatus('${o.id}','ready')">✅ Ready</button>`);
  }
  if (s === 'ready') {
    btns.push(`<button class="btn btn-primary btn-sm" onclick="updateStatus('${o.id}','completed')">✓ Complete</button>`);
  }
  if (['completed','cancelled'].includes(s)) {
    btns.push(`<span style="font-size:0.78rem;color:var(--text3);">${s === 'completed' ? '✓ Done' : '✕ Cancelled'}</span>`);
  }
  return btns.join('');
}

async function updateStatus(orderId, status) {
  try {
    if (navigator.onLine) {
      await api('PATCH', `/api/orders/${orderId}/status`, { status });
    } else {
      await queueStatusChange(orderId, status);
      Toast.info('Status queued — will sync when online');
      return;
    }
    loadOrders();
  } catch (err) { Toast.error(err.message || 'Failed to update status'); }
}

async function verifyPayment(orderId) {
  if (!confirm('Confirm GCash payment verified?')) return;
  try {
    await api('PATCH', `/api/orders/${orderId}/verify-payment`, {});
    Toast.success('Payment verified');
    loadOrders();
  } catch (err) { Toast.error(err.message); }
}

function showProof(orderId, ref, proofUrl) {
  proofOrderId = orderId;
  document.getElementById('proof-modal-body').innerHTML = `
    <div style="text-align:center;">
      <div style="margin-bottom:12px;">
        <span style="font-size:0.8rem;color:var(--text2);">Reference:</span>
        <span style="font-family:var(--font-mono);font-weight:700;color:var(--warning);margin-left:8px;">${esc(ref||'—')}</span>
      </div>
      <img src="${esc(proofUrl)}" style="max-width:100%;border-radius:8px;border:1px solid var(--border);" />
    </div>`;
  openModal('proof-modal');
}

async function verifyFromModal() {
  if (!proofOrderId) return;
  await verifyPayment(proofOrderId);
  closeModal('proof-modal');
}

// ── Audio alert (Web Audio API — no file needed) ──────────────
function playNewOrderChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[600,0],[800,0.18],[1000,0.35]].forEach(([freq, delay]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.4);
    });
  } catch {}
}

// ── Page title flash ──────────────────────────────────────────
let _origTitle  = document.title;
let _flashTimer = null;
function flashTitle(msg) {
  if (_flashTimer) clearInterval(_flashTimer);
  let flashing = true;
  _flashTimer = setInterval(() => {
    document.title = flashing ? msg : _origTitle;
    flashing = !flashing;
  }, 1000);
  setTimeout(() => {
    clearInterval(_flashTimer);
    document.title = _origTitle;
  }, 12000);
}

// ── Browser notification ──────────────────────────────────────
async function sendBrowserNotification(count) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') {
    new Notification('LaBurgertory', {
      body: `${count} new order${count > 1 ? 's' : ''} received!`,
      icon: '/icons/icon.svg',
    });
  }
}

// ── Auto-refresh ──────────────────────────────────────────────
function startAutoRefresh() {
  refreshTimer = setInterval(() => loadOrders(), 10000);
}

function updateRefreshLabel() {
  const el = document.getElementById('refresh-label');
  if (el) el.textContent = `Last: ${new Date().toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`;
}

// Request browser notification permission on page load
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

init();
