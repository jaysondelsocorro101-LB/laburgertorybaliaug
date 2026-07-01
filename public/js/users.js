/* User Management — users.js */

let currentUser = null;
let editingUserId = null;

async function init() {
  currentUser = await requireLogin('/login.html?next=/users.html');
  if (!currentUser) return;
  if (currentUser.role !== 'owner') {
    document.body.innerHTML = '<div class="empty-state" style="padding-top:80px"><div class="icon">🔒</div><p>Owner access required</p><a href="/kitchen.html" class="btn btn-ghost btn-sm" style="margin-top:16px;">← Back to Kitchen</a></div>';
    return;
  }
  renderUserChip(currentUser);
  loadUsers();
}

async function loadUsers() {
  try {
    const users = await api('GET', '/api/users');
    allUsers = users;
    renderUsers(users);
  } catch (err) {
    document.getElementById('users-list').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

function renderUsers(users) {
  const el = document.getElementById('users-list');
  if (!users.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">👤</div><p>No users yet</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Name</th><th>Username</th><th>Role</th>
          <th>Status</th><th>Created</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${users.map(u => `
            <tr style="${!u.is_active ? 'opacity:0.5' : ''}">
              <td style="font-weight:600;">${esc(u.name)}</td>
              <td style="font-family:var(--font-mono);font-size:0.85rem;">${esc(u.email_or_username)}</td>
              <td>
                <span class="badge ${u.role==='owner'?'badge-received':'badge-gcash'}">
                  ${u.role === 'owner' ? '👑 Owner' : '🧑‍🍳 Staff'}
                </span>
              </td>
              <td>
                ${u.is_active
                  ? '<span class="badge badge-verified">Active</span>'
                  : '<span class="badge badge-cancelled">Inactive</span>'}
              </td>
              <td style="font-size:0.78rem;color:var(--text3);">${formatDateOnly(u.created_at)}</td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="btn btn-ghost btn-sm" onclick="openUserModal(${u.id})">Edit</button>
                  ${u.id !== currentUser.id ? `
                    <button class="btn ${u.is_active ? 'btn-danger' : 'btn-success'} btn-sm"
                      onclick="toggleActive(${u.id}, ${u.is_active})">
                      ${u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  ` : '<span style="font-size:0.75rem;color:var(--text3);">(you)</span>'}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

let allUsers = [];

function openUserModal(userId = null) {
  editingUserId = userId;
  const user = allUsers.find(u => u.id === userId);
  document.getElementById('user-modal-title').textContent = userId ? 'Edit User' : 'Add Staff Account';
  document.getElementById('user-modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input type="text" class="form-input" id="um-name" placeholder="Juan Dela Cruz" value="${esc(user?.name||'')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Username *</label>
        <input type="text" class="form-input" id="um-username" placeholder="juan.staff"
          value="${esc(user?.email_or_username||'')}" ${userId ? 'disabled' : ''} />
      </div>
      <div class="form-group">
        <label class="form-label">${userId ? 'New Password <span style="color:var(--text3);font-weight:400;">(leave blank to keep current)</span>' : 'Password *'}</label>
        <input type="password" class="form-input" id="um-password" placeholder="••••••••" />
      </div>
      <div class="form-group">
        <label class="form-label">Role *</label>
        <select class="form-input" id="um-role">
          <option value="staff" ${user?.role==='staff'?'selected':''}>Staff</option>
          <option value="owner" ${user?.role==='owner'||!user?'selected':''}>Owner</option>
        </select>
      </div>
    </div>
    <div class="modal-footer" style="padding:16px 0 0;">
      <button class="btn btn-ghost" onclick="closeModal('user-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveUser()">Save</button>
    </div>
  `;
  openModal('user-modal');
}

async function saveUser() {
  const name = document.getElementById('um-name').value.trim();
  const username = document.getElementById('um-username').value.trim();
  const password = document.getElementById('um-password').value;
  const role = document.getElementById('um-role').value;

  if (!name) { Toast.error('Name required'); return; }
  if (!editingUserId && (!username || !password)) { Toast.error('Username and password required'); return; }

  try {
    if (editingUserId) {
      const body = { name, role };
      if (password) body.password = password;
      await api('PATCH', `/api/users/${editingUserId}`, body);
    } else {
      await api('POST', '/api/users', { name, email_or_username: username, password, role });
    }
    Toast.success('User saved');
    closeModal('user-modal');
    loadUsers();
  } catch (err) { Toast.error(err.message); }
}

async function toggleActive(userId, currentlyActive) {
  const action = currentlyActive ? 'deactivate' : 'activate';
  if (!confirm(`Are you sure you want to ${action} this account?`)) return;
  try {
    await api('PATCH', `/api/users/${userId}`, { is_active: currentlyActive ? 0 : 1 });
    Toast.success(`Account ${action}d`);
    loadUsers();
  } catch (err) { Toast.error(err.message); }
}

init();
