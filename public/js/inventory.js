/* Inventory & Costing — inventory.js */

let currentUser = null;
let allProducts = [];
let allIngredients = [];
let editingProductId = null;
let editingIngredientId = null;

async function init() {
  currentUser = await requireLogin('/login.html?next=/inventory.html');
  if (!currentUser) return;
  renderUserChip(currentUser);

  const isOwner = currentUser.role === 'owner';
  if (isOwner) {
    document.getElementById('add-product-btn').style.display = '';
    document.getElementById('add-ingredient-btn').style.display = '';
    document.getElementById('nav-settings').style.display = '';
    document.getElementById('users-nav-link').style.display = '';
  }

  // Owners land on dashboard, staff on products
  if (isOwner) showSection('dashboard');
  else showSection('products');
}

// ── Navigation ────────────────────────────────────────────────
function showSection(name) {
  ['dashboard','products','ingredients','stock-log','low-stock','settings'].forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === name ? '' : 'none';
    document.getElementById(`nav-${s}`)?.classList.toggle('active', s === name);
  });
  if (name === 'dashboard')   loadDashboard();
  if (name === 'products')    loadProducts();
  if (name === 'ingredients') loadIngredients();
  if (name === 'stock-log')   loadStockLog();
  if (name === 'low-stock')   loadLowStock();
  if (name === 'settings')    loadSettings();
}

// ── Dashboard ─────────────────────────────────────────────────
async function loadDashboard() {
  const el = document.getElementById('dashboard-body');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const d = await api('GET', '/api/dashboard');
    const maxSold = d.topProducts[0]?.total_sold || 1;
    const maxRev  = Math.max(...(d.trend.map(t => t.revenue)), 1);

    // Fill in missing days in the 7-day trend
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      const found = d.trend.find(t => t.day === key);
      days.push({ day: key, revenue: found?.revenue || 0, orders: found?.orders || 0 });
    }

    el.innerHTML = `
      <div class="dash-kpi-grid">
        <div class="dash-kpi accent">
          <div class="dash-kpi-label">Today's Revenue</div>
          <div class="dash-kpi-value">${formatPHP(d.today.revenue)}</div>
          <div class="dash-kpi-sub">${d.today.order_count} order${d.today.order_count !== 1 ? 's' : ''} today</div>
        </div>
        <div class="dash-kpi">
          <div class="dash-kpi-label">Avg Order Value</div>
          <div class="dash-kpi-value">${formatPHP(d.today.avg_order_value)}</div>
          <div class="dash-kpi-sub">Today's average</div>
        </div>
        <div class="dash-kpi ${d.activeOrders > 0 ? 'warn' : ''}">
          <div class="dash-kpi-label">Active Orders</div>
          <div class="dash-kpi-value">${d.activeOrders}</div>
          <div class="dash-kpi-sub">In queue now</div>
        </div>
        <div class="dash-kpi ${d.pendingGcash > 0 ? 'danger' : ''}">
          <div class="dash-kpi-label">GCash Unverified</div>
          <div class="dash-kpi-value">${d.pendingGcash}</div>
          <div class="dash-kpi-sub">${d.lowStock > 0 ? `⚠ ${d.lowStock} low-stock item${d.lowStock > 1 ? 's' : ''}` : 'All stock OK'}</div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="dash-section-title">Top Products — Last 7 Days</div>
          ${d.topProducts.length ? d.topProducts.map((p, i) => `
            <div class="top-product-row">
              <div class="top-product-rank">#${i + 1}</div>
              <div class="top-product-name">${esc(p.name)}</div>
              <div class="top-product-bar-wrap">
                <div class="top-product-bar" style="width:${Math.round((p.total_sold/maxSold)*100)}%"></div>
              </div>
              <div class="top-product-sold">${p.total_sold} sold</div>
            </div>`).join('')
          : '<div style="color:var(--text3);font-size:0.85rem;padding:12px 0;">No orders in the last 7 days</div>'}
        </div>

        <div class="card">
          <div class="dash-section-title">7-Day Revenue Trend</div>
          ${days.map(t => `
            <div class="trend-row">
              <div class="trend-day">${new Date(t.day + 'T00:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</div>
              <div class="trend-bar-wrap">
                <div class="trend-bar" style="width:${t.revenue > 0 ? Math.max(4, Math.round((t.revenue/maxRev)*100)) : 0}%"></div>
              </div>
              <div class="trend-orders" style="color:var(--text3)">${t.orders} orders</div>
              <div class="trend-revenue" style="color:${t.revenue > 0 ? 'var(--text)' : 'var(--text3)'}">${formatPHP(t.revenue)}</div>
            </div>`).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

// ── Products ─────────────────────────────────────────────────
async function loadProducts() {
  try {
    allProducts = await api('GET', '/api/products');
    renderProducts(allProducts);
  } catch (err) {
    document.getElementById('products-list').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

function filterProducts() {
  const q = document.getElementById('product-search').value.toLowerCase();
  const filtered = q ? allProducts.filter(p => p.name.toLowerCase().includes(q) || p.category_name?.toLowerCase().includes(q)) : allProducts;
  renderProducts(filtered);
}

function renderProducts(products) {
  const el = document.getElementById('products-list');
  if (!products.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🍔</div><p>No products found</p></div>';
    return;
  }

  // Group by category
  const groups = {};
  for (const p of products) {
    if (!groups[p.category_name]) groups[p.category_name] = [];
    groups[p.category_name].push(p);
  }

  el.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div style="margin-bottom:24px;">
      <div style="font-size:0.8rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">${esc(cat)}</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Product</th><th>Price</th><th>Status</th>
            ${currentUser.role === 'owner' ? '<th>Actions</th>' : ''}
          </tr></thead>
          <tbody>
            ${items.map(p => `
              <tr draggable="true" data-id="${p.id}" data-sort="${p.sort_order||0}"
                  ondragstart="dragStart(event)"
                  ondragover="dragOver(event)"
                  ondrop="dragDrop(event)"
                  ondragend="dragEnd(event)"
                  style="cursor:grab;">
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span class="drag-handle" title="Drag to reorder">
                      <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/>
                        <circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/>
                        <circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/>
                      </svg>
                    </span>
                    ${p.image_url
                      ? `<img src="${esc(p.image_url)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0;" />`
                      : `<div style="width:44px;height:44px;border-radius:6px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">🍔</div>`}
                    <div>
                      <div style="font-weight:600;">${esc(p.name)}</div>
                      <div style="font-size:0.78rem;color:var(--text3);">${esc(p.description||'')}</div>
                    </div>
                  </div>
                </td>
                <td style="font-weight:700;color:var(--accent);">${formatPHP(p.price)}</td>
                <td>${p.is_active ? '<span class="badge badge-verified">Active</span>' : '<span class="badge badge-cancelled">Inactive</span>'}</td>
                ${currentUser.role === 'owner' ? `
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      <button class="btn btn-ghost btn-sm" onclick="openProductModal(${p.id})">Edit</button>
                      <button class="btn btn-secondary btn-sm" onclick="openRecipeModal(${p.id},'${esc(p.name)}')">Recipe</button>
                      <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id},'${esc(p.name)}')">Delete</button>
                    </div>
                  </td>
                ` : `<td><button class="btn btn-ghost btn-sm" onclick="openRecipeModal(${p.id},'${esc(p.name)}')">View Recipe</button></td>`}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

// ── Product Modal ─────────────────────────────────────────────
async function openProductModal(productId = null) {
  editingProductId = productId;
  document.getElementById('product-modal-title').textContent = productId ? 'Edit Product' : 'Add Product';

  let cats = [];
  let product = null;
  try {
    cats = await api('GET', '/api/products/categories/all');
    if (productId) product = allProducts.find(p => p.id === productId);
  } catch {}

  document.getElementById('product-modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0;">
      <div class="form-group">
        <label class="form-label">Category *</label>
        <select class="form-input" id="pm-cat">
          ${cats.map(c => `<option value="${c.id}" ${product?.category_id==c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Product Name *</label>
        <input type="text" class="form-input" id="pm-name" value="${esc(product?.name||'')}" placeholder="Classic LB Burger" />
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-input" id="pm-desc">${esc(product?.description||'')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Price (₱)</label>
        <input type="number" class="form-input" id="pm-price" value="${product?.price||0}" step="0.01" min="0" />
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-input" id="pm-active">
          <option value="1" ${product?.is_active!==0?'selected':''}>Active</option>
          <option value="0" ${product?.is_active===0?'selected':''}>Inactive</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Product Image (PNG/JPG — max 5MB)</label>
        ${product?.image_url ? `
          <div id="pm-img-current" style="margin-bottom:8px;">
            <img src="${esc(product.image_url)}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />
            <div style="font-size:0.75rem;color:var(--text3);margin-top:4px;">Current image — upload a new file to replace</div>
          </div>` : ''}
        <label id="pm-img-dropzone" style="
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:6px;border:2px dashed var(--border);border-radius:8px;padding:20px;
          cursor:pointer;transition:border-color 0.15s;color:var(--text2);font-size:0.85rem;
          " onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          <span style="font-size:1.5rem;">🖼️</span>
          <span>Click or drag an image here</span>
          <span style="font-size:0.75rem;color:var(--text3);">PNG, JPG, WEBP · Max 5 MB</span>
          <input type="file" id="pm-img" accept="image/png,image/jpeg,image/webp" style="display:none"
            onchange="previewProductImage(this)" />
        </label>
        <div id="pm-img-preview" style="display:none;margin-top:10px;text-align:center;">
          <img id="pm-img-preview-img" style="max-width:100%;max-height:180px;border-radius:8px;border:1px solid var(--border);object-fit:contain;" />
          <div style="margin-top:6px;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span id="pm-img-preview-name" style="font-size:0.8rem;color:var(--text2);"></span>
            <button class="btn btn-ghost btn-sm" onclick="clearProductImage()" style="font-size:0.75rem;">✕ Remove</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer" style="padding:16px 0 0;">
      <button class="btn btn-ghost" onclick="closeModal('product-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveProduct()">Save Product</button>
    </div>
  `;
  // Wire dropzone click to hidden input
  document.getElementById('pm-img-dropzone').addEventListener('click', () => {
    document.getElementById('pm-img').click();
  });
  openModal('product-modal');
}

function previewProductImage(input) {
  const file = input.files[0];
  if (!file) return;
  const preview = document.getElementById('pm-img-preview');
  document.getElementById('pm-img-preview-img').src = URL.createObjectURL(file);
  document.getElementById('pm-img-preview-name').textContent = `${file.name} (${(file.size/1024).toFixed(0)} KB)`;
  preview.style.display = '';
  document.getElementById('pm-img-dropzone').style.display = 'none';
}

function clearProductImage() {
  document.getElementById('pm-img').value = '';
  document.getElementById('pm-img-preview').style.display = 'none';
  document.getElementById('pm-img-dropzone').style.display = '';
}

async function saveProduct() {
  const name = document.getElementById('pm-name').value.trim();
  if (!name) { Toast.error('Product name required'); return; }

  const imgFile = document.getElementById('pm-img')?.files[0];
  const useFormData = !!imgFile;

  let body;
  if (useFormData) {
    body = new FormData();
    body.append('category_id', document.getElementById('pm-cat').value);
    body.append('name', name);
    body.append('description', document.getElementById('pm-desc').value.trim());
    body.append('price', document.getElementById('pm-price').value);
    body.append('is_active', document.getElementById('pm-active').value);
    body.append('image', imgFile);
  } else {
    body = {
      category_id: document.getElementById('pm-cat').value,
      name,
      description: document.getElementById('pm-desc').value.trim(),
      price: document.getElementById('pm-price').value,
      is_active: document.getElementById('pm-active').value,
    };
  }

  try {
    const url = editingProductId ? `/api/products/${editingProductId}` : '/api/products';
    const method = editingProductId ? 'PATCH' : 'POST';

    if (useFormData) {
      const res = await fetch(url, { method, body, credentials: 'same-origin' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Save failed'); }
    } else {
      await api(method, url, body);
    }
    Toast.success('Product saved');
    closeModal('product-modal');
    loadProducts();
  } catch (err) { Toast.error(err.message); }
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"?\n\nThis permanently removes the product and its recipe. Sales history is kept.`)) return;
  try {
    await api('DELETE', `/api/products/${id}`);
    Toast.success(`"${name}" deleted`);
    loadProducts();
  } catch (err) { Toast.error(err.message); }
}

// ── Recipe Modal ──────────────────────────────────────────────
async function openRecipeModal(productId, productName) {
  document.getElementById('recipe-modal-title').textContent = `Recipe: ${productName}`;
  document.getElementById('recipe-modal-body').innerHTML = '<div class="spinner"></div>';
  openModal('recipe-modal');
  await loadRecipe(productId);
}

async function loadRecipe(productId) {
  try {
    const [data, ingredients] = await Promise.all([
      api('GET', `/api/products/${productId}/recipe`),
      api('GET', '/api/ingredients'),
    ]);
    allIngredients = ingredients;
    renderRecipe(productId, data, ingredients);
  } catch (err) {
    document.getElementById('recipe-modal-body').innerHTML = `<p style="color:var(--danger)">${err.message}</p>`;
  }
}

function renderRecipe(productId, data, ingredients) {
  const { product, recipe, total_cost, margin } = data;
  const marginClass = margin === null ? '' : margin >= 60 ? 'good' : margin >= 40 ? 'warn' : 'bad';
  const isOwner = currentUser.role === 'owner';

  const usedIds = new Set(recipe.map(r => r.ingredient_id));
  const availableIngredients = ingredients.filter(i => !usedIds.has(i.id));

  document.getElementById('recipe-modal-body').innerHTML = `
    <div class="cost-summary">
      <div class="cost-metric">
        <div class="cost-metric-label">Selling Price</div>
        <div class="cost-metric-value">${formatPHP(product.price)}</div>
      </div>
      <div class="cost-metric">
        <div class="cost-metric-label">Ingredient Cost</div>
        <div class="cost-metric-value ${total_cost > product.price ? 'bad' : 'warn'}">${formatPHP(total_cost)}</div>
      </div>
      <div class="cost-metric">
        <div class="cost-metric-label">Margin</div>
        <div class="cost-metric-value ${marginClass}">${margin !== null ? margin.toFixed(1) + '%' : '—'}</div>
      </div>
    </div>

    <div class="table-wrap" style="margin-bottom:16px;">
      <table>
        <thead><tr><th>Ingredient</th><th>Unit</th><th>Qty Used</th><th>Cost/Unit</th><th>Line Cost</th>${isOwner?'<th></th>':''}</tr></thead>
        <tbody id="recipe-rows">
          ${recipe.length ? recipe.map(r => `
            <tr>
              <td>${esc(r.ingredient_name)}</td>
              <td style="color:var(--text3)">${esc(r.unit)}</td>
              <td style="font-family:var(--font-mono)">${r.quantity_used}</td>
              <td style="color:var(--text2)">${formatPHP(r.cost_per_unit)}</td>
              <td style="font-weight:600;color:var(--accent)">${formatPHP(r.line_cost)}</td>
              ${isOwner ? `<td><button class="btn btn-ghost btn-sm" onclick="removeRecipeLine(${productId},${r.ingredient_id})">✕</button></td>` : ''}
            </tr>
          `).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px;">No ingredients added yet</td></tr>`}
        </tbody>
      </table>
    </div>

    ${isOwner && availableIngredients.length ? `
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
        <div style="font-size:0.8rem;font-weight:700;color:var(--text2);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">Add Ingredient</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
          <div class="form-group" style="flex:1;min-width:140px;">
            <label class="form-label">Ingredient</label>
            <select class="form-input" id="recipe-ing-select">
              ${availableIngredients.map(i => `<option value="${i.id}">${esc(i.name)} (${i.unit})</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="width:100px;">
            <label class="form-label">Qty</label>
            <input type="number" class="form-input" id="recipe-qty" placeholder="1" step="0.01" min="0" />
          </div>
          <button class="btn btn-primary btn-sm" onclick="addRecipeLine(${productId})" style="margin-bottom:1px;">Add</button>
        </div>
      </div>
    ` : ''}
  `;
}

async function addRecipeLine(productId) {
  const ingredient_id = document.getElementById('recipe-ing-select').value;
  const quantity_used = document.getElementById('recipe-qty').value;
  if (!quantity_used || parseFloat(quantity_used) <= 0) { Toast.error('Enter a valid quantity'); return; }
  try {
    await api('POST', `/api/products/${productId}/recipe`, { ingredient_id, quantity_used });
    await loadRecipe(productId);
  } catch (err) { Toast.error(err.message); }
}

async function removeRecipeLine(productId, ingredientId) {
  try {
    await fetch(`/api/products/${productId}/recipe/${ingredientId}`, { method: 'DELETE', credentials: 'same-origin' });
    await loadRecipe(productId);
  } catch (err) { Toast.error(err.message); }
}

// ── Ingredients ───────────────────────────────────────────────
async function loadIngredients() {
  try {
    allIngredients = await api('GET', '/api/ingredients');
    renderIngredients(allIngredients);
  } catch (err) {
    document.getElementById('ingredients-list').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

function renderIngredients(ingredients) {
  const el = document.getElementById('ingredients-list');
  if (!ingredients.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🧂</div><p>No ingredients yet</p></div>';
    return;
  }
  const isOwner = currentUser.role === 'owner';
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Ingredient</th><th>Unit</th><th>Cost/Unit</th>
          <th>Stock</th><th>Reorder At</th><th>Status</th>
          ${isOwner ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${ingredients.map(i => {
            const low = i.current_stock <= i.reorder_point;
            return `<tr>
              <td style="font-weight:600;">${esc(i.name)}</td>
              <td style="color:var(--text3)">${esc(i.unit)}</td>
              <td>${formatPHP(i.cost_per_unit)}</td>
              <td style="font-family:var(--font-mono);font-weight:700;${low?'color:var(--danger)':''}">${i.current_stock}</td>
              <td style="color:var(--text3)">${i.reorder_point}</td>
              <td>${low ? '<span class="badge badge-low">⚠ Low</span>' : '<span class="badge badge-verified">OK</span>'}</td>
              ${isOwner ? `<td><button class="btn btn-ghost btn-sm" onclick="openIngredientModal(${i.id})">Edit</button></td>` : '<td></td>'}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function openIngredientModal(ingredientId = null) {
  editingIngredientId = ingredientId;
  const ing = ingredientId ? allIngredients.find(i => i.id === ingredientId) : null;
  document.getElementById('ingredient-modal-title').textContent = ingredientId ? 'Edit Ingredient' : 'Add Ingredient';

  document.getElementById('ingredient-modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" class="form-input" id="im-name" value="${esc(ing?.name||'')}" placeholder="Beef Patty" />
      </div>
      <div class="form-group">
        <label class="form-label">Unit *</label>
        <select class="form-input" id="im-unit">
          ${['g','ml','pc','kg','L','oz'].map(u => `<option value="${u}" ${ing?.unit===u?'selected':''}>${u}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Cost per Unit (₱)</label>
        <input type="number" class="form-input" id="im-cost" value="${ing?.cost_per_unit||0}" step="0.001" min="0" />
      </div>
      <div class="form-group">
        <label class="form-label">Current Stock</label>
        <input type="number" class="form-input" id="im-stock" value="${ing?.current_stock||0}" step="0.01" />
      </div>
      <div class="form-group">
        <label class="form-label">Reorder Point</label>
        <input type="number" class="form-input" id="im-reorder" value="${ing?.reorder_point||0}" step="0.01" />
        <span class="form-hint">Alert when stock drops to this level</span>
      </div>
    </div>
    <div class="modal-footer" style="padding:16px 0 0;">
      <button class="btn btn-ghost" onclick="closeModal('ingredient-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveIngredient()">Save</button>
    </div>
  `;
  openModal('ingredient-modal');
}

async function saveIngredient() {
  const body = {
    name: document.getElementById('im-name').value.trim(),
    unit: document.getElementById('im-unit').value,
    cost_per_unit: document.getElementById('im-cost').value,
    current_stock: document.getElementById('im-stock').value,
    reorder_point: document.getElementById('im-reorder').value,
  };
  if (!body.name) { Toast.error('Name required'); return; }
  try {
    if (editingIngredientId) {
      await api('PATCH', `/api/ingredients/${editingIngredientId}`, body);
    } else {
      await api('POST', '/api/ingredients', body);
    }
    Toast.success('Ingredient saved');
    closeModal('ingredient-modal');
    loadIngredients();
  } catch (err) { Toast.error(err.message); }
}

// ── Stock Log ─────────────────────────────────────────────────
async function loadStockLog() {
  try {
    const logs = await api('GET', '/api/ingredients/stock-log?limit=200');
    const el = document.getElementById('stock-log-list');
    if (!logs.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>No stock movements yet</p></div>';
      return;
    }
    const typeColors = { stock_in: 'var(--success)', stock_out: 'var(--danger)', waste: 'var(--warning)', adjustment: 'var(--info)' };
    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Ingredient</th><th>Type</th><th>Qty</th><th>Note</th><th>By</th></tr></thead>
          <tbody>
            ${logs.map(l => `<tr>
              <td style="font-size:0.78rem;color:var(--text3);white-space:nowrap;">${formatDate(l.created_at)}</td>
              <td style="font-weight:600;">${esc(l.ingredient_name)}</td>
              <td><span style="color:${typeColors[l.change_type]||'var(--text)'};font-weight:700;font-size:0.8rem;">${l.change_type.replace('_',' ').toUpperCase()}</span></td>
              <td style="font-family:var(--font-mono);font-weight:700;color:${['stock_in'].includes(l.change_type)?'var(--success)':'var(--danger)'};">
                ${['stock_in','adjustment'].includes(l.change_type)?'+':'-'}${l.quantity}
              </td>
              <td style="font-size:0.85rem;color:var(--text2);">${esc(l.note||'—')}</td>
              <td style="font-size:0.8rem;color:var(--text3);">${esc(l.user_name||'—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('stock-log-list').innerHTML = `<p style="color:var(--danger)">${err.message}</p>`;
  }
}

async function openStockLogModal() {
  if (!allIngredients.length) allIngredients = await api('GET', '/api/ingredients').catch(() => []);
  document.getElementById('stock-log-modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div class="form-group">
        <label class="form-label">Ingredient *</label>
        <select class="form-input" id="sl-ing">
          ${allIngredients.map(i => `<option value="${i.id}">${esc(i.name)} (${i.unit}) — stock: ${i.current_stock}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Movement Type *</label>
        <select class="form-input" id="sl-type">
          <option value="stock_in">Stock In</option>
          <option value="stock_out">Stock Out</option>
          <option value="waste">Waste</option>
          <option value="adjustment">Adjustment</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Quantity *</label>
        <input type="number" class="form-input" id="sl-qty" placeholder="0" step="0.01" min="0.01" />
      </div>
      <div class="form-group">
        <label class="form-label">Note</label>
        <input type="text" class="form-input" id="sl-note" placeholder="e.g. Delivery from supplier" />
      </div>
    </div>
    <div class="modal-footer" style="padding:16px 0 0;">
      <button class="btn btn-ghost" onclick="closeModal('stock-log-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveStockLog()">Log Movement</button>
    </div>
  `;
  openModal('stock-log-modal');
}

async function saveStockLog() {
  const body = {
    ingredient_id: document.getElementById('sl-ing').value,
    change_type: document.getElementById('sl-type').value,
    quantity: document.getElementById('sl-qty').value,
    note: document.getElementById('sl-note').value.trim(),
  };
  if (!body.quantity || parseFloat(body.quantity) <= 0) { Toast.error('Enter a valid quantity'); return; }
  try {
    await api('POST', '/api/ingredients/stock-log', body);
    Toast.success('Stock movement logged');
    closeModal('stock-log-modal');
    loadStockLog();
    loadIngredients();
  } catch (err) { Toast.error(err.message); }
}

// ── Low Stock ─────────────────────────────────────────────────
async function loadLowStock() {
  const el = document.getElementById('low-stock-list');
  el.innerHTML = '<div class="spinner"></div>';
  try {
    const items = await api('GET', '/api/ingredients/low-stock');
    if (!items.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">✅</div><p>All stock levels OK</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="low-stock-bar">
        <span style="font-size:1.2rem;">⚠️</span>
        <strong>${items.length} ingredient${items.length>1?'s':''} below reorder point</strong>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ingredient</th><th>Unit</th><th>Current Stock</th><th>Reorder Point</th><th>Shortfall</th></tr></thead>
          <tbody>
            ${items.map(i => `<tr>
              <td style="font-weight:600;">${esc(i.name)}</td>
              <td style="color:var(--text3)">${i.unit}</td>
              <td style="color:var(--danger);font-weight:700;font-family:var(--font-mono)">${i.current_stock}</td>
              <td style="color:var(--text2);font-family:var(--font-mono)">${i.reorder_point}</td>
              <td style="color:var(--warning);font-weight:700;">${(i.reorder_point - i.current_stock).toFixed(2)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) { el.innerHTML = `<p style="color:var(--danger)">${err.message}</p>`; }
}

// ── Settings ──────────────────────────────────────────────────
async function loadSettings() {
  const el = document.getElementById('settings-body');
  try {
    const settings = await api('GET', '/api/settings/all');
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;max-width:520px;">
        <div class="card">
          <h3 style="margin-bottom:16px;">GCash Payment Settings</h3>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div class="form-group">
              <label class="form-label">GCash Name</label>
              <input type="text" class="form-input" id="s-gcash-name" value="${esc(settings.gcash_name||'')}" />
            </div>
            <div class="form-group">
              <label class="form-label">GCash Number</label>
              <input type="text" class="form-input" id="s-gcash-number" value="${esc(settings.gcash_number||'')}" />
            </div>
            <div class="form-group">
              <label class="form-label">GCash QR Image</label>
              ${settings.gcash_qr_image_url ? `<img src="${esc(settings.gcash_qr_image_url)}" style="max-width:140px;border-radius:8px;margin-bottom:8px;border:1px solid var(--border);" />` : ''}
              <input type="file" class="form-input" id="s-gcash-qr" accept="image/*" />
            </div>
            <button class="btn btn-primary" onclick="saveGcashSettings()">Save GCash Settings</button>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:16px;">Shop Info</h3>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div class="form-group">
              <label class="form-label">Shop Name</label>
              <input type="text" class="form-input" id="s-shop-name" value="${esc(settings.shop_name||'')}" />
            </div>
            <div class="form-group">
              <label class="form-label">Tagline</label>
              <input type="text" class="form-input" id="s-tagline" value="${esc(settings.shop_tagline||'')}" />
            </div>
            <button class="btn btn-primary" onclick="saveShopSettings()">Save Shop Info</button>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom:16px;">Change My Password</h3>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div class="form-group">
              <label class="form-label">Current Password</label>
              <input type="password" class="form-input" id="s-pw-current" placeholder="••••••••" />
            </div>
            <div class="form-group">
              <label class="form-label">New Password</label>
              <input type="password" class="form-input" id="s-pw-new" placeholder="••••••••" />
            </div>
            <div class="form-group">
              <label class="form-label">Confirm New Password</label>
              <input type="password" class="form-input" id="s-pw-confirm" placeholder="••••••••" />
            </div>
            <button class="btn btn-primary" onclick="changeMyPassword()">Update Password</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) { el.innerHTML = `<p style="color:var(--danger)">${err.message}</p>`; }
}

async function saveGcashSettings() {
  const fd = new FormData();
  fd.append('gcash_name', document.getElementById('s-gcash-name').value.trim());
  fd.append('gcash_number', document.getElementById('s-gcash-number').value.trim());
  const qrFile = document.getElementById('s-gcash-qr').files[0];
  if (qrFile) fd.append('qr_image', qrFile);
  try {
    const res = await fetch('/api/settings/gcash', { method: 'PATCH', body: fd, credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed');
    Toast.success('GCash settings saved');
    loadSettings();
  } catch { Toast.error('Failed to save GCash settings'); }
}

async function saveShopSettings() {
  try {
    await api('PATCH', '/api/settings/update', { key: 'shop_name', value: document.getElementById('s-shop-name').value.trim() });
    await api('PATCH', '/api/settings/update', { key: 'shop_tagline', value: document.getElementById('s-tagline').value.trim() });
    Toast.success('Shop info saved');
  } catch { Toast.error('Failed to save'); }
}

// ── Drag & Drop product reorder ───────────────────────────────
let _dragSrcRow = null;

function dragStart(e) {
  _dragSrcRow = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _dragSrcRow.dataset.id);
  setTimeout(() => _dragSrcRow.style.opacity = '0.4', 0);
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const row = e.currentTarget;
  if (row === _dragSrcRow) return;
  document.querySelectorAll('tr.drag-over').forEach(r => r.classList.remove('drag-over'));
  row.classList.add('drag-over');
}

function dragDrop(e) {
  e.preventDefault();
  const target = e.currentTarget;
  if (!_dragSrcRow || target === _dragSrcRow) return;
  const tbody = target.parentNode;
  const rows  = [...tbody.querySelectorAll('tr[data-id]')];
  const srcIdx = rows.indexOf(_dragSrcRow);
  const tgtIdx = rows.indexOf(target);
  if (srcIdx < tgtIdx) tbody.insertBefore(_dragSrcRow, target.nextSibling);
  else tbody.insertBefore(_dragSrcRow, target);
  saveProductOrder(tbody);
}

function dragEnd(e) {
  if (_dragSrcRow) _dragSrcRow.style.opacity = '';
  document.querySelectorAll('tr.drag-over').forEach(r => r.classList.remove('drag-over'));
  _dragSrcRow = null;
}

async function saveProductOrder(tbody) {
  const rows = [...tbody.querySelectorAll('tr[data-id]')];
  const payload = rows.map((r, i) => ({ id: parseInt(r.dataset.id), sort_order: i }));
  try {
    await api('PATCH', '/api/products/reorder', payload);
    Toast.success('Order saved');
  } catch { Toast.error('Failed to save order'); }
}

async function changeMyPassword() {
  const current = document.getElementById('s-pw-current').value;
  const newPw   = document.getElementById('s-pw-new').value;
  const confirm = document.getElementById('s-pw-confirm').value;
  if (!current || !newPw) { Toast.error('All fields required'); return; }
  if (newPw.length < 8)   { Toast.error('New password must be at least 8 characters'); return; }
  if (newPw !== confirm)  { Toast.error('Passwords do not match'); return; }
  try {
    await api('PATCH', '/api/users/change-password', { current_password: current, new_password: newPw });
    Toast.success('Password updated — please log in again');
    document.getElementById('s-pw-current').value = '';
    document.getElementById('s-pw-new').value = '';
    document.getElementById('s-pw-confirm').value = '';
  } catch (err) { Toast.error(err.message || 'Failed to update password'); }
}

init();
