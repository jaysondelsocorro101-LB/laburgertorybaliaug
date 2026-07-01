/* Public ordering — app.js */

// Category emoji fallbacks per category name
const CAT_EMOJI = {
  'Burgers': '🍔', 'Hungarian Sausage': '🌭', 'Fries': '🍟',
  'Nachos': '🧀', 'Tacos': '🌮', 'Quesadilla': '🫓',
  'Burrito': '🌯', 'Chicken Wings': '🍗', 'Drinks': '🥤', 'Others': '✨',
};

let menu = [];
let cart = [];      // [{ product_id, name, price, quantity, notes }]
let gcashSettings = {};
let lastOrderId   = null;
let lastOrderNum  = null;

// ── Init ────────────────────────────────────────────────────
async function init() {
  await Promise.all([loadMenu(), loadGcashSettings()]);
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'SYNC_QUEUE') syncQueue();
  });
}

async function loadMenu() {
  try {
    menu = await api('GET', '/api/menu');
    renderCatTabs();
    renderMenuSections();
  } catch {
    document.getElementById('menu-sections').innerHTML =
      '<div class="empty-state"><div class="icon">⚠️</div><p>Failed to load menu. Please refresh.</p></div>';
  }
}

async function loadGcashSettings() {
  try { gcashSettings = await api('GET', '/api/settings/gcash'); }
  catch { gcashSettings = {}; }
}

// ── Menu rendering ───────────────────────────────────────────
function renderCatTabs() {
  const tabs = document.getElementById('cat-tabs');
  tabs.innerHTML = menu.filter(c => c.products.length).map(c =>
    `<button class="cat-tab" onclick="scrollToCategory(${c.id})" data-cat="${c.id}">${esc(c.name)}</button>`
  ).join('');

  // IntersectionObserver scroll-spy (accurate cross-browser)
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const catId = entry.target.dataset.cat;
        document.querySelectorAll('.cat-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.cat === catId)
        );
        // Scroll active tab into view
        document.querySelector(`.cat-tab[data-cat="${catId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });

  // Observe after sections render
  setTimeout(() => {
    document.querySelectorAll('.section-anchor').forEach(s => observer.observe(s));
  }, 100);
}

function scrollToCategory(id) {
  document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth' });
}

function renderMenuSections() {
  const container = document.getElementById('menu-sections');
  const cats = menu.filter(c => c.products.length);
  if (!cats.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">🍔</div><p>No menu items yet.</p></div>';
    return;
  }
  container.innerHTML = cats.map(cat => `
    <div class="section-anchor" id="cat-${cat.id}" data-cat="${cat.id}">
      <div class="cat-section-title">${esc(cat.name)}</div>
      <div class="product-grid">${cat.products.map(p => productCard(p, cat.name)).join('')}</div>
    </div>
  `).join('');
}

function productCard(p, catName) {
  const emoji = CAT_EMOJI[catName] || '🍽️';
  const img = p.image_url
    ? `<img class="product-img" src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" />`
    : `<div class="product-img-placeholder">${emoji}</div>`;

  return `
    <div class="product-card">
      ${img}
      <div class="product-body">
        <div class="product-name">${esc(p.name)}</div>
        <div class="product-desc">${esc(p.description || '')}</div>
        <div class="product-footer">
          <div class="product-price">${formatPHP(p.price)}</div>
          <div class="add-area" data-add-area="${p.id}" data-name="${esc(p.name)}" data-price="${p.price}">
            ${cartAddControl(p.id, p.name, p.price)}
          </div>
        </div>
      </div>
    </div>`;
}

function cartAddControl(pid, name, price) {
  const item = cart.find(i => i.product_id === pid);
  if (item) {
    return `<div class="qty-control">
      <button class="qty-btn" onclick="updateQty(${pid},-1)">−</button>
      <span class="qty-num">${item.quantity}</span>
      <button class="qty-btn" onclick="updateQty(${pid},1)">+</button>
    </div>`;
  }
  return `<button class="add-btn" onclick="addToCart(${pid},'${name.replace(/'/g,"\\'")}',${price})">+</button>`;
}

// ── Cart ─────────────────────────────────────────────────────
function addToCart(product_id, name, price) {
  const existing = cart.find(i => i.product_id === product_id);
  if (existing) existing.quantity++;
  else cart.push({ product_id, name, price, quantity: 1, notes: '' });
  updateCartUI();
  Toast.success(`${name} added`);
}

function removeFromCart(product_id) {
  cart = cart.filter(i => i.product_id !== product_id);
  updateCartUI();
}

function updateQty(product_id, delta) {
  const item = cart.find(i => i.product_id === product_id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) removeFromCart(product_id);
  else updateCartUI();
}

function cartTotal()  { return cart.reduce((s, i) => s + i.price * i.quantity, 0); }
function cartCount()  { return cart.reduce((s, i) => s + i.quantity, 0); }

function updateCartUI() {
  const count = cartCount();
  document.getElementById('cart-count').textContent = count;
  document.getElementById('cart-total').textContent = formatPHP(cartTotal());

  // Checkout button: disabled when cart empty
  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.disabled = count === 0;
    checkoutBtn.style.opacity = count === 0 ? '0.4' : '';
    checkoutBtn.style.cursor  = count === 0 ? 'not-allowed' : '';
  }

  // Update product card add/stepper controls
  document.querySelectorAll('[data-add-area]').forEach(area => {
    const pid   = parseInt(area.dataset.addArea);
    const name  = area.dataset.name;
    const price = parseFloat(area.dataset.price);
    area.innerHTML = cartAddControl(pid, name, price);
  });

  // Cart drawer items
  const itemsEl = document.getElementById('cart-items');
  if (!itemsEl) return;
  if (cart.length === 0) {
    itemsEl.innerHTML = '<div class="empty-state"><div class="icon">🛒</div><p>Your cart is empty</p></div>';
    return;
  }
  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-name">${esc(item.name)}</div>
      <div class="qty-control">
        <button class="qty-btn" onclick="updateQty(${item.product_id},-1)">−</button>
        <span class="qty-num">${item.quantity}</span>
        <button class="qty-btn" onclick="updateQty(${item.product_id},1)">+</button>
      </div>
      <div class="cart-item-price">${formatPHP(item.price * item.quantity)}</div>
    </div>`).join('');
}

function openCart()  {
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-drawer').classList.add('open');
}
function closeCart() {
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-drawer').classList.remove('open');
}
function resetCart() { cart = []; updateCartUI(); }

// ── Checkout ─────────────────────────────────────────────────
function startCheckout() {
  if (cart.length === 0) return;
  closeCart();
  renderCheckoutForm();
  openModal('checkout-modal');
}

function renderCheckoutForm() {
  document.getElementById('checkout-modal-title').textContent = 'Your Details';
  document.getElementById('checkout-modal-body').innerHTML = `
    <div class="checkout-form">
      <div class="form-group">
        <label class="form-label">Your Name <span style="color:var(--danger)">*</span></label>
        <input type="text" class="form-input" id="co-name" placeholder="Juan Dela Cruz" autocomplete="name" />
        <span class="form-error" id="err-name" style="display:none"></span>
      </div>
      <div class="form-group">
        <label class="form-label">Contact Number <span style="color:var(--danger)">*</span></label>
        <input type="tel" class="form-input" id="co-contact" placeholder="09XX XXX XXXX" autocomplete="tel" maxlength="11" />
        <span class="form-error" id="err-contact" style="display:none"></span>
      </div>
      <div class="form-group">
        <label class="form-label">Order Type</label>
        <select class="form-input" id="co-type" onchange="toggleDelivery()">
          <option value="pickup">🏪 Pickup</option>
          <option value="delivery">🚚 Delivery</option>
        </select>
      </div>
      <div class="form-group" id="delivery-addr-group" style="display:none">
        <label class="form-label">Delivery Address <span style="color:var(--danger)">*</span></label>
        <input type="text" class="form-input" id="co-address" placeholder="Full delivery address" />
        <span class="form-error" id="err-address" style="display:none"></span>
      </div>
      <div class="form-group">
        <label class="form-label">Order Notes</label>
        <textarea class="form-input" id="co-notes" placeholder="Any special requests…"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Payment Method</label>
        <select class="form-input" id="co-payment">
          <option value="cash">💵 Cash on Pickup</option>
          <option value="gcash">📱 GCash</option>
        </select>
      </div>

      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
        <div style="font-size:0.75rem;color:var(--text2);margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Order Summary</div>
        ${cart.map(i => `
          <div style="display:flex;justify-content:space-between;font-size:0.875rem;padding:3px 0;">
            <span>${i.quantity}× ${esc(i.name)}</span>
            <span>${formatPHP(i.price * i.quantity)}</span>
          </div>`).join('')}
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1rem;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
          <span>Total</span><span style="color:var(--accent)">${formatPHP(cartTotal())}</span>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal('checkout-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitOrGoToGcash()">Continue →</button>
    </div>`;
}

function toggleDelivery() {
  const show = document.getElementById('co-type').value === 'delivery';
  document.getElementById('delivery-addr-group').style.display = show ? '' : 'none';
}

function setFieldError(id, msg) {
  const el = document.getElementById(id);
  const input = document.getElementById(id.replace('err-', 'co-'));
  if (!el || !input) return;
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
  input.style.borderColor = msg ? 'var(--danger)' : '';
}

function validatePHPhone(val) {
  return /^09\d{9}$/.test(val.replace(/\s|-/g, ''));
}

async function submitOrGoToGcash() {
  const name    = document.getElementById('co-name').value.trim();
  const contact = document.getElementById('co-contact').value.trim();
  const type    = document.getElementById('co-type').value;
  const address = document.getElementById('co-address')?.value.trim() || '';
  const notes   = document.getElementById('co-notes').value.trim();
  const payment = document.getElementById('co-payment').value;

  // Field-level validation
  let valid = true;
  setFieldError('err-name', '');
  setFieldError('err-contact', '');
  setFieldError('err-address', '');

  if (!name) { setFieldError('err-name', 'Please enter your name'); valid = false; }
  if (!contact) { setFieldError('err-contact', 'Please enter your contact number'); valid = false; }
  else if (!validatePHPhone(contact)) { setFieldError('err-contact', 'Enter a valid PH number (09XX XXX XXXX)'); valid = false; }
  if (type === 'delivery' && !address) { setFieldError('err-address', 'Delivery address is required'); valid = false; }

  if (!valid) return;

  if (payment === 'gcash') {
    window._checkoutData = { name, contact, order_type: type, notes, delivery_address: address, payment_method: payment };
    renderGcashStep();
  } else {
    await placeOrder({ name, contact, order_type: type, notes, delivery_address: address, payment_method: payment, gcash_reference: '' });
  }
}

function renderGcashStep() {
  document.getElementById('checkout-modal-title').textContent = 'Pay via GCash';
  const qrUrl = gcashSettings.gcash_qr_image_url;
  const qrImg = qrUrl
    ? `<img src="${esc(qrUrl)}" alt="GCash QR" style="max-width:180px;margin:0 auto 12px;border-radius:8px;" />`
    : '<div style="color:var(--text3);margin-bottom:12px;font-size:0.85rem;">QR code not configured — contact staff</div>';

  document.getElementById('checkout-modal-body').innerHTML = `
    <div class="checkout-form">
      <div class="payment-qr">
        ${qrImg}
        <div style="font-size:0.8rem;color:var(--text2);margin-bottom:4px;">Send payment to</div>
        <div class="gcash-num">${esc(gcashSettings.gcash_name || 'LaBurgertory')}</div>
        <div style="font-size:1rem;color:var(--text);margin-top:4px;">${esc(gcashSettings.gcash_number || '')}</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--accent);margin-top:12px;">${formatPHP(cartTotal())}</div>
      </div>
      <div class="form-group">
        <label class="form-label">GCash Reference Number <span style="color:var(--danger)">*</span></label>
        <input type="text" class="form-input" id="co-gcash-ref" placeholder="e.g. 123456789012" maxlength="15"
               oninput="this.value=this.value.replace(/\D/g,'')" />
        <span class="form-hint">12–13 digit number from your GCash receipt</span>
        <span class="form-error" id="err-gcash-ref" style="display:none"></span>
      </div>
      <div class="form-group">
        <label class="form-label">Payment Screenshot <span style="color:var(--text3);font-weight:400;">(optional)</span></label>
        <input type="file" class="form-input" id="co-gcash-proof" accept="image/*" />
      </div>
      <div style="background:var(--warning-light);border:1px solid var(--warning);border-radius:var(--radius);padding:12px;font-size:0.8rem;color:var(--text2);">
        ⏳ Orders not verified within <strong>15 minutes</strong> are automatically cancelled.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="renderCheckoutForm()">← Back</button>
      <button class="btn btn-primary" onclick="submitGcashOrder()">Place Order</button>
    </div>`;
}

async function submitGcashOrder() {
  const ref = document.getElementById('co-gcash-ref').value.trim();
  if (!ref || ref.length < 10) {
    setFieldError('err-gcash-ref', 'Enter a valid GCash reference number (10–13 digits)');
    return;
  }
  setFieldError('err-gcash-ref', '');
  const data = { ...window._checkoutData, gcash_reference: ref };
  const proofFile = document.getElementById('co-gcash-proof').files[0];
  await placeOrder(data, proofFile);
}

async function placeOrder(data, proofFile = null) {
  const orderId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  const orderPayload = {
    id: orderId,
    customer_name: data.name,
    customer_contact: data.contact,
    order_type: data.order_type,
    notes: data.notes,
    delivery_address: data.delivery_address,
    payment_method: data.payment_method,
    gcash_reference: data.gcash_reference || '',
    items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity, notes: i.notes })),
  };

  const submitBtn = document.querySelector('.modal-footer .btn-primary');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Placing order…'; }

  try {
    let result;
    if (!navigator.onLine) {
      await queueOrder(orderPayload);
      result = { orderId, orderNumber: null, total: cartTotal(), offline: true };
    } else {
      result = await api('POST', '/api/orders', orderPayload);
      if (proofFile && result.orderId) {
        const fd = new FormData();
        fd.append('proof', proofFile);
        fd.append('gcash_reference', data.gcash_reference || '');
        await fetch(`/api/orders/${result.orderId}/payment-proof`, { method: 'POST', body: fd, credentials: 'same-origin' }).catch(() => {});
      }
    }

    lastOrderId  = result.orderId || orderId;
    lastOrderNum = result.orderNumber;
    closeModal('checkout-modal');

    // Redirect to dedicated order status page
    window.location.href = `/order.html?id=${encodeURIComponent(lastOrderId)}`;
  } catch (err) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Place Order'; }
    Toast.error(err.message || 'Failed to place order');
  }
}

// ── Track order (from nav) ────────────────────────────────────
function showTrackModal() {
  document.getElementById('track-result').innerHTML = '';
  document.getElementById('track-input').value = '';
  openModal('track-modal');
}

async function trackOrder() {
  const id = document.getElementById('track-input').value.trim();
  if (!id) { Toast.error('Enter an order ID'); return; }
  const resultEl = document.getElementById('track-result');
  resultEl.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
  try {
    await api('GET', `/api/orders/${encodeURIComponent(id)}`);
    // Order exists — redirect to full status page
    window.location.href = `/order.html?id=${encodeURIComponent(id)}`;
  } catch {
    resultEl.innerHTML = '<div class="form-error" style="padding:12px;">Order not found. Check your order number.</div>';
  }
}

init();
