import api from '/js/api.js';
import { showToast, formatDate, openModal, closeModal, initModalClose } from '/js/utils.js';
import { getUser } from '/js/auth.js';

let admins = [];

const init = () => {
  const currentUser = getUser();
  if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
    window.location.replace('index.html');
    return;
  }

  initModalClose('addAdminModal');
  loadAdmins();

  const addAdminForm = document.getElementById('addAdminForm');
  if (addAdminForm) {
    addAdminForm.addEventListener('submit', handleAddAdmin);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Load and display admins
async function loadAdmins() {
  const tbody = document.getElementById('adminsTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Loading admins...</td></tr>`;

  try {
    const res = await api.getAdmins();
    admins = res.admins || res || [];
    renderAdmins();
  } catch (err) {
    console.error('Failed to load admins:', err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--accent-danger)">Failed to load admins.</td></tr>`;
  }
}

function renderAdmins() {
  const tbody = document.getElementById('adminsTableBody');
  if (!tbody) return;

  if (admins.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">No admins found.</td></tr>`;
    return;
  }

  const currentUser = getUser();
  tbody.innerHTML = admins.map(admin => {
    const isSelf = currentUser && (currentUser.id === (admin.admin_id || admin.id) || currentUser.email === admin.email);
    return `
      <tr>
        <td style="text-align: center;">
          <div style="font-weight:600;color:var(--text-heading);text-align: center;">${admin.name}</div>
        </td>
        <td style="text-align: center;">${(admin.email || '').toLowerCase()}</td>
        <td style="text-align: center;">
          <span class="badge badge-internal" style="text-transform: none;">${admin.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</span>
        </td>
        <td style="text-align: center;">${admin.created_at ? formatDate(admin.created_at) : '—'}</td>
        <td style="text-align: center;">
          <div style="display:flex;gap:8px;justify-content: center;">
            ${!isSelf ? `
            <button class="btn btn-secondary btn-sm" style="color:var(--accent-danger);border-color:var(--accent-danger);margin: 0 auto;" onclick="removeAdmin('${admin.admin_id || admin.id}')">
              Remove
            </button>
            ` : `<span style="color:var(--text-muted);font-size:var(--text-sm);margin: 0 auto;">—</span>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Handle Add Admin Form Submit
async function handleAddAdmin(e) {
  e.preventDefault();
  const btn = document.getElementById('saveAdminBtn');
  btn.classList.add('btn-loading');
  btn.textContent = '';

  const payload = {
    name: document.getElementById('adminName').value.trim(),
    email: document.getElementById('adminEmail').value.trim(),
    password: document.getElementById('adminPassword').value,
    role: document.getElementById('adminRole').value
  };

  try {
    const res = await api.addAdmin(payload);
    showToast(res.message || 'Admin added successfully', 'success');
    closeModal('addAdminModal');
    document.getElementById('addAdminForm').reset();
    loadAdmins();
  } catch (err) {
    showToast(err.message || 'Failed to add admin', 'error');
  } finally {
    btn.classList.remove('btn-loading');
    btn.textContent = 'Add Admin';
  }
}

// Make globally available for inline onclick handler
window.removeAdmin = async (adminId) => {
  if (!confirm('Are you sure you want to remove this admin? They will immediately lose access to the admin dashboard.')) {
    return;
  }

  try {
    const res = await api.removeAdmin(adminId);
    showToast(res.message || 'Admin removed successfully', 'success');
    loadAdmins();
  } catch (err) {
    showToast(err.message || 'Failed to remove admin', 'error');
  }
};

window.openModal = openModal;
