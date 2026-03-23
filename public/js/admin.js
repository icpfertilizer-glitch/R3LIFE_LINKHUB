document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('login-section');
  const adminSection = document.getElementById('admin-section');
  const logoutBtn = document.getElementById('logout-btn');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const menuForm = document.getElementById('menu-form');
  const formTitle = document.getElementById('form-title');
  const submitBtn = document.getElementById('submit-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const editId = document.getElementById('edit-id');
  const menuName = document.getElementById('menu-name');
  const menuUrl = document.getElementById('menu-url');
  const menuImage = document.getElementById('menu-image');
  const menuCategory = document.getElementById('menu-category');
  const imagePreview = document.getElementById('image-preview');
  const menuList = document.getElementById('admin-menu-list');
  const categoryNameInput = document.getElementById('category-name');
  const addCategoryBtn = document.getElementById('add-category-btn');
  const categoryList = document.getElementById('category-list');

  checkAuth();

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth');
      const data = await res.json();
      if (data.isAdmin) showAdmin();
    } catch (e) { /* not logged in */ }
  }

  function showAdmin() {
    loginSection.style.display = 'none';
    adminSection.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    loadCategories();
    loadMenus();
  }

  function showLogin() {
    loginSection.style.display = 'block';
    adminSection.style.display = 'none';
    logoutBtn.style.display = 'none';
  }

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      })
    });
    if (res.ok) {
      showAdmin();
    } else {
      loginError.textContent = 'Invalid username or password';
      loginError.style.display = 'block';
    }
  });

  // Logout
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    showLogin();
  });

  // === Category Management ===

  addCategoryBtn.addEventListener('click', async () => {
    const name = categoryNameInput.value.trim();
    if (!name) return;
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      categoryNameInput.value = '';
      loadCategories();
      loadMenus();
    }
  });

  categoryNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategoryBtn.click();
    }
  });

  async function loadCategories() {
    const res = await fetch('/api/categories');
    const categories = await res.json();

    // Update category dropdown
    const currentVal = menuCategory.value;
    menuCategory.innerHTML = '<option value="">-- ไม่มีหมวดหมู่ --</option>' +
      categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    menuCategory.value = currentVal;

    // Render category list
    categoryList.innerHTML = categories.map(cat => `
      <div class="category-item" draggable="true" data-id="${cat.id}">
        <div class="drag-handle" title="Drag to reorder">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </div>
        <span class="category-item-name">${escapeHtml(cat.name)}</span>
        <div class="category-item-actions">
          <button class="btn btn-outline btn-sm" onclick="editCategory(${cat.id}, '${escapeHtml(cat.name).replace(/'/g, "\\'")}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCategory(${cat.id})">Delete</button>
        </div>
      </div>
    `).join('');

    setupCategoryDragAndDrop();
  }

  function setupCategoryDragAndDrop() {
    const items = categoryList.querySelectorAll('.category-item');
    let draggedItem = null;

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        categoryList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        draggedItem = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (item !== draggedItem) item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (draggedItem && draggedItem !== item) {
          const allItems = [...categoryList.querySelectorAll('.category-item')];
          const fromIndex = allItems.indexOf(draggedItem);
          const toIndex = allItems.indexOf(item);
          if (fromIndex < toIndex) {
            item.after(draggedItem);
          } else {
            item.before(draggedItem);
          }
          const newOrder = [...categoryList.querySelectorAll('.category-item')]
            .map(el => parseInt(el.dataset.id));
          await fetch('/api/categories/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: newOrder })
          });
          loadMenus(); // refresh menu list to reflect new category order
        }
      });
    });
  }

  window.editCategory = async (id, currentName) => {
    const newName = prompt('แก้ไขชื่อหมวดหมู่:', currentName);
    if (!newName || newName === currentName) return;
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    if (res.ok) {
      loadCategories();
      loadMenus();
    }
  };

  window.deleteCategory = async (id) => {
    if (!confirm('ลบหมวดหมู่นี้? (เมนูในหมวดนี้จะถูกย้ายไปเป็น "ไม่มีหมวดหมู่")')) return;
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadCategories();
      loadMenus();
    }
  };

  // === Menu Management ===

  // Image preview
  menuImage.addEventListener('change', () => {
    const file = menuImage.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
      };
      reader.readAsDataURL(file);
    }
  });

  // Submit form (add or edit)
  menuForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', menuName.value);
    formData.append('url', menuUrl.value);
    formData.append('category_id', menuCategory.value);
    if (menuImage.files[0]) {
      formData.append('image', menuImage.files[0]);
    }

    const id = editId.value;
    const url = id ? `/api/menus/${id}` : '/api/menus';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, { method, body: formData });
    if (res.ok) {
      resetForm();
      loadMenus();
    }
  });

  cancelBtn.addEventListener('click', resetForm);

  function resetForm() {
    editId.value = '';
    menuName.value = '';
    menuUrl.value = '';
    menuCategory.value = '';
    menuImage.value = '';
    imagePreview.innerHTML = '';
    formTitle.textContent = 'Add New Menu';
    submitBtn.textContent = 'Add Menu';
    cancelBtn.style.display = 'none';
  }

  async function loadMenus() {
    const res = await fetch('/api/menus');
    const menus = await res.json();

    menuList.innerHTML = menus.map(menu => `
      <div class="admin-menu-item" draggable="true" data-id="${menu.id}">
        <div class="drag-handle" title="Drag to reorder">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </div>
        ${menu.image
          ? `<img class="admin-menu-thumb" src="${escapeHtml(menu.image)}" alt="">`
          : `<div class="admin-menu-thumb"></div>`
        }
        <div class="admin-menu-info">
          <div class="name">${escapeHtml(menu.name)}</div>
          <div class="url">${escapeHtml(menu.url)}</div>
          ${menu.category_name ? `<div class="category-badge">${escapeHtml(menu.category_name)}</div>` : ''}
        </div>
        <div class="admin-menu-actions">
          <button class="btn btn-outline btn-sm" onclick="editMenu(${menu.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMenu(${menu.id})">Delete</button>
        </div>
      </div>
    `).join('');

    setupDragAndDrop();
  }

  window.editMenu = async (id) => {
    const res = await fetch('/api/menus');
    const menus = await res.json();
    const menu = menus.find(m => m.id === id);
    if (!menu) return;

    editId.value = menu.id;
    menuName.value = menu.name;
    menuUrl.value = menu.url;
    menuCategory.value = menu.category_id || '';
    imagePreview.innerHTML = menu.image ? `<img src="${menu.image}" alt="Current">` : '';
    formTitle.textContent = 'Edit Menu';
    submitBtn.textContent = 'Update Menu';
    cancelBtn.style.display = 'inline-block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.deleteMenu = async (id) => {
    if (!confirm('Are you sure you want to delete this menu?')) return;
    const res = await fetch(`/api/menus/${id}`, { method: 'DELETE' });
    if (res.ok) loadMenus();
  };

  // Drag and drop reorder
  function setupDragAndDrop() {
    const items = menuList.querySelectorAll('.admin-menu-item');
    let draggedItem = null;

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        draggedItem = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (item !== draggedItem) item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (draggedItem && draggedItem !== item) {
          const allItems = [...menuList.querySelectorAll('.admin-menu-item')];
          const fromIndex = allItems.indexOf(draggedItem);
          const toIndex = allItems.indexOf(item);
          if (fromIndex < toIndex) {
            item.after(draggedItem);
          } else {
            item.before(draggedItem);
          }
          const newOrder = [...menuList.querySelectorAll('.admin-menu-item')]
            .map(el => parseInt(el.dataset.id));
          await fetch('/api/menus/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: newOrder })
          });
        }
      });
    });
  }

  // === Tab Switching ===
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');

      if (btn.dataset.tab === 'tab-users') loadUsers();
    });
  });

  // === User Management ===
  const userListEl = document.getElementById('user-list');
  const addUserBtn = document.getElementById('add-user-btn');
  const newUserEmail = document.getElementById('new-user-email');
  const newUserName = document.getElementById('new-user-name');
  let allCategoriesForPerms = [];
  let allMenusForPerms = [];

  // Add new user
  addUserBtn.addEventListener('click', async () => {
    const email = newUserEmail.value.trim();
    if (!email) return;
    const name = newUserName.value.trim();
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    });
    if (res.ok) {
      newUserEmail.value = '';
      newUserName.value = '';
      loadUsers();
    } else {
      const err = await res.json();
      alert(err.error || 'Error adding user');
    }
  });

  newUserEmail.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addUserBtn.click(); }
  });

  async function loadUsers() {
    const [usersRes, catsRes, menusRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/categories'),
      fetch('/api/menus')
    ]);
    const users = await usersRes.json();
    allCategoriesForPerms = await catsRes.json();
    allMenusForPerms = await menusRes.json();

    if (users.length === 0) {
      userListEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">ยังไม่มี user ที่ลงทะเบียน</p>';
      return;
    }

    // Group menus by category
    const menusByCategory = {};
    const uncategorizedMenus = [];
    allMenusForPerms.forEach(m => {
      if (m.category_id) {
        if (!menusByCategory[m.category_id]) menusByCategory[m.category_id] = [];
        menusByCategory[m.category_id].push(m);
      } else {
        uncategorizedMenus.push(m);
      }
    });

    const emailEsc = (email) => escapeHtml(email).replace(/'/g, "\\'");

    userListEl.innerHTML = users.map(user => {
      const totalPerms = user.categoryPermissions.length + user.menuPermissions.length;
      const isApproved = !!user.is_approved;
      const isAdmin = !!user.is_admin;

      let menusHtml = '';
      allCategoriesForPerms.forEach(cat => {
        const catMenus = menusByCategory[cat.id];
        if (!catMenus || catMenus.length === 0) return;
        menusHtml += `<div class="perm-group-label">${escapeHtml(cat.name)}</div><div class="user-perm-checkboxes">`;
        menusHtml += catMenus.map(m => {
          const checked = user.menuPermissions.includes(m.id);
          return `<label class="perm-checkbox perm-menu ${checked ? 'checked' : ''}">
            <input type="checkbox" data-type="menu" value="${m.id}" ${checked ? 'checked' : ''}
              onchange="updatePermission('${emailEsc(user.email)}')">
            ${escapeHtml(m.name)}
          </label>`;
        }).join('');
        menusHtml += `</div>`;
      });
      if (uncategorizedMenus.length > 0) {
        menusHtml += `<div class="perm-group-label">ไม่มีหมวดหมู่</div><div class="user-perm-checkboxes">`;
        menusHtml += uncategorizedMenus.map(m => {
          const checked = user.menuPermissions.includes(m.id);
          return `<label class="perm-checkbox perm-menu ${checked ? 'checked' : ''}">
            <input type="checkbox" data-type="menu" value="${m.id}" ${checked ? 'checked' : ''}
              onchange="updatePermission('${emailEsc(user.email)}')">
            ${escapeHtml(m.name)}
          </label>`;
        }).join('');
        menusHtml += `</div>`;
      }

      return `
        <div class="user-card" data-email="${escapeHtml(user.email)}">
          <div class="user-card-header">
            <div class="user-card-info">
              <div class="user-card-name">
                ${escapeHtml(user.name || 'Unknown')}
                ${isAdmin ? '<span class="admin-badge">Admin</span>' : ''}
              </div>
              <div class="user-card-email">${escapeHtml(user.email)}</div>
              <div class="user-card-login">Last login: ${user.last_login || 'ยังไม่เคย login'}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="deleteUser('${emailEsc(user.email)}')">Delete</button>
          </div>

          <div class="user-role-toggles">
            <label class="perm-checkbox ${isApproved ? 'checked' : ''}">
              <input type="checkbox" ${isApproved ? 'checked' : ''}
                onchange="toggleApproved('${emailEsc(user.email)}', this.checked)">
              Approved (อนุมัติเข้าใช้งาน)
            </label>
            <label class="perm-checkbox ${isAdmin ? 'checked' : ''}">
              <input type="checkbox" ${isAdmin ? 'checked' : ''}
                onchange="toggleAdmin('${emailEsc(user.email)}', this.checked)">
              Admin (จัดการระบบได้)
            </label>
          </div>

          <div class="user-perm-label" style="margin-top:12px;">Categories (เห็นทั้ง category + ทุก menu ใน category)</div>
          <div class="user-perm-checkboxes">
            ${allCategoriesForPerms.map(cat => {
              const checked = user.categoryPermissions.includes(cat.id);
              return `<label class="perm-checkbox ${checked ? 'checked' : ''}">
                <input type="checkbox" data-type="category" value="${cat.id}" ${checked ? 'checked' : ''}
                  onchange="updatePermission('${emailEsc(user.email)}')">
                ${escapeHtml(cat.name)}
              </label>`;
            }).join('')}
          </div>

          <div class="user-perm-label" style="margin-top:12px;">Menus (เลือกเฉพาะ menu ที่ต้องการ)</div>
          ${menusHtml}

          <div class="user-perm-status">
            ${totalPerms === 0 ? 'ยังไม่มีสิทธิ์ดู content (ไม่เห็นอะไร)' : `สิทธิ์: ${user.categoryPermissions.length} category, ${user.menuPermissions.length} menu`}
          </div>
        </div>
      `;
    }).join('');
  }

  window.toggleApproved = async (email, value) => {
    await fetch(`/api/users/${encodeURIComponent(email)}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_approved: value })
    });
    loadUsers();
  };

  window.toggleAdmin = async (email, value) => {
    await fetch(`/api/users/${encodeURIComponent(email)}/admin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: value })
    });
    loadUsers();
  };

  window.updatePermission = async (email) => {
    const card = document.querySelector(`.user-card[data-email="${email}"]`);
    if (!card) return;

    const catCheckboxes = card.querySelectorAll('input[data-type="category"]');
    const menuCheckboxes = card.querySelectorAll('input[data-type="menu"]');
    const categoryIds = [...catCheckboxes].filter(cb => cb.checked).map(cb => parseInt(cb.value));
    const menuIds = [...menuCheckboxes].filter(cb => cb.checked).map(cb => parseInt(cb.value));

    card.querySelectorAll('.perm-checkbox').forEach(label => {
      const cb = label.querySelector('input');
      label.classList.toggle('checked', cb.checked);
    });

    const statusEl = card.querySelector('.user-perm-status');
    const total = categoryIds.length + menuIds.length;
    statusEl.textContent = total === 0 ? 'ยังไม่มีสิทธิ์ดู content (ไม่เห็นอะไร)' : `สิทธิ์: ${categoryIds.length} category, ${menuIds.length} menu`;

    await fetch(`/api/users/${encodeURIComponent(email)}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_ids: categoryIds, menu_ids: menuIds })
    });
  };

  window.deleteUser = async (email) => {
    if (!confirm(`ลบผู้ใช้ ${email} และสิทธิ์ทั้งหมด?`)) return;
    const res = await fetch(`/api/users/${encodeURIComponent(email)}`, { method: 'DELETE' });
    if (res.ok) loadUsers();
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
