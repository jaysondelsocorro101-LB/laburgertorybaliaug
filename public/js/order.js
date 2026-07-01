/* Dedicated order status page — order.js */

const ORDER_ID = new URLSearchParams(location.search).get('id');
let refreshTimer = null;
let lastStatus = null;
let countdown = 10;

async function init() {
  if (!ORDER_ID) {
    document.getElementById('order-body').innerHTML = `
      <div class="not-found">
        <div style="font-size:3rem;margin-bottom:16px;">🔍</div>
        <h2 style="margin-bottom:8px;">No order ID</h2>
        <p style="color:var(--text2);margin-bottom:24px;">Use the link from your order confirmation.</p>
        <a href="/" class="btn btn-primary">Back to Menu</a>
      </div>`;
    return;
  }

  document.title = `Order #${ORDER_ID.slice(0,8).toUpperCase()} — LaBurgertory`;
  await loadOrder();
  startAutoRefresh();
}

async function loadOrder() {
  try {
    const order = await api('GET', `/api/orders/${encodeURIComponent(ORDER_ID)}`);
    renderOrder(order);

    // Play chime if status changed
    if (lastStatus && lastStatus !== order.status) playStatusChime();
    lastStatus = order.status;

    // Stop refreshing on terminal states
    if (['completed', 'cancelled'].includes(order.status)) {
      stopAutoRefresh();
    }
  } catch (err) {
    if (err.message === 'Order not found') {
      document.getElementById('order-body').innerHTML = `
        <div class="not-found">
          <div style="font-size:3rem;margin-bottom:16px;">❓</div>
          <h2 style="margin-bottom:8px;">Order not found</h2>
          <p style="color:var(--text2);margin-bottom:24px;">Check your order number and try again.</p>
          <a href="/" class="btn btn-primary">Back to Menu</a>
        </div>`;
      stopAutoRefresh();
    }
  }
}

function renderOrder(order) {
  const steps = ['received', 'preparing', 'ready', 'completed'];
  const currentIdx = steps.indexOf(order.status);
  const isCancelled = order.status === 'cancelled';
  const isTerminal = ['completed', 'cancelled'].includes(order.status);

  const stepIcons  = { received: '📬', preparing: '🍳', ready: '✅', completed: '🎉' };
  const stepLabels = { received: 'Order Received', preparing: 'Preparing', ready: 'Ready for Pickup!', completed: 'Completed' };

  const stepsHtml = isCancelled
    ? `<div class="cancelled-banner">
        <div style="font-size:2rem;margin-bottom:8px;">✕</div>
        <div style="font-weight:700;color:var(--danger);font-size:1.1rem;">Order Cancelled</div>
        <div style="font-size:0.85rem;color:var(--text2);margin-top:6px;">
          ${order.payment_method === 'gcash' ? 'GCash payment was not verified within 15 minutes.' : 'This order was cancelled.'}
        </div>
       </div>`
    : `<div class="status-steps" style="margin:24px 0;">
        ${steps.map((s, i) => {
          const done   = i < currentIdx;
          const active = i === currentIdx;
          return `<div class="status-step ${done?'done':''} ${active?'active':''}">
            <div class="step-dot">${done ? '✓' : (active ? stepIcons[s] : i+1)}</div>
            <div class="step-label">${stepLabels[s]}</div>
          </div>`;
        }).join('')}
      </div>`;

  // GCash pending alert
  const gcashAlert = (order.payment_method === 'gcash' && order.payment_status === 'pending_verification' && !isCancelled)
    ? `<div class="gcash-alert">
        <div style="font-weight:700;color:var(--warning);margin-bottom:4px;">⏳ GCash Payment Pending Verification</div>
        <div style="font-size:0.8rem;color:var(--text2);">
          Our staff will verify your payment shortly. Reference:
          <strong style="color:var(--text)">${esc(order.gcash_reference || '—')}</strong>
        </div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:6px;">
          Note: Unverified orders are automatically cancelled after 15 minutes.
        </div>
       </div>`
    : '';

  const gcashVerified = (order.payment_method === 'gcash' && order.payment_status === 'verified')
    ? `<div style="background:var(--success-light);border:1px solid var(--success);border-radius:var(--radius);padding:12px 16px;margin-top:16px;font-size:0.875rem;">
        ✅ <strong>GCash Payment Verified</strong>
       </div>` : '';

  // Order items
  const itemsHtml = order.items?.length
    ? order.items.map(i => `
        <div class="detail-row">
          <span class="detail-label">${i.quantity}× ${esc(i.product_name)}</span>
          <span class="detail-val">${formatPHP(i.subtotal)}</span>
        </div>`).join('')
    : '';

  const displayNum = order.order_number ? `LB-${String(order.order_number).padStart(4,'0')}` : ORDER_ID.slice(0,8).toUpperCase();

  document.getElementById('order-body').innerHTML = `
    <div class="order-num-hero">
      <div class="label">Order Number</div>
      <div class="num">${displayNum}</div>
    </div>

    ${stepsHtml}
    ${gcashAlert}
    ${gcashVerified}

    <div class="detail-block">
      <div class="detail-row">
        <span class="detail-label">Customer</span>
        <span class="detail-val">${esc(order.customer_name)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Type</span>
        <span class="detail-val">${order.order_type === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Payment</span>
        <span class="detail-val">${order.payment_method === 'gcash' ? '📱 GCash' : '💵 Cash'}</span>
      </div>
      ${order.notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-val">${esc(order.notes)}</span></div>` : ''}
      ${itemsHtml}
      <div class="detail-row" style="border-top:2px solid var(--border);margin-top:4px;padding-top:10px;">
        <span class="detail-label" style="font-weight:700;">Total</span>
        <span class="detail-val" style="color:var(--accent);font-size:1.1rem;">${formatPHP(order.total_amount)}</span>
      </div>
    </div>

    <div class="share-row">
      <button class="btn btn-secondary w-full" onclick="copyLink()">📋 Copy Order Link</button>
      <a href="/" class="btn btn-ghost" style="white-space:nowrap;">+ New Order</a>
    </div>

    ${!isTerminal
      ? `<div class="refresh-hint" id="refresh-hint">Auto-refreshing in <span id="countdown">${countdown}</span>s</div>`
      : `<div class="refresh-hint">Order ${order.status === 'completed' ? 'completed ✓' : 'cancelled'} — no further updates.</div>`
    }
  `;

  document.title = `${displayNum} · ${stepLabels[order.status] || order.status} — LaBurgertory`;
}

function copyLink() {
  navigator.clipboard.writeText(location.href)
    .then(() => Toast.success('Order link copied!'))
    .catch(() => {
      // Fallback: select text
      const tmp = document.createElement('input');
      tmp.value = location.href;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      Toast.success('Order link copied!');
    });
}

function startAutoRefresh() {
  countdown = 10;
  refreshTimer = setInterval(async () => {
    countdown--;
    const el = document.getElementById('countdown');
    if (el) el.textContent = countdown;
    if (countdown <= 0) {
      countdown = 10;
      await loadOrder();
    }
  }, 1000);
}

function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

function playStatusChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t); osc.stop(t + 0.3);
    });
  } catch {}
}

init();
