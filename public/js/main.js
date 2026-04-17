document.addEventListener('DOMContentLoaded', () => {
  const mainContent = document.getElementById('main-content');
  const emptyState = document.getElementById('empty-state');

  // Show Microsoft user info if logged in
  async function checkMsAuth() {
    try {
      const res = await fetch('/api/ms-auth');
      const data = await res.json();
      if (data.isAuthenticated && data.user) {
        const userInfo = document.getElementById('user-info');
        const userName = document.getElementById('user-name');
        if (userInfo && userName) {
          userName.textContent = data.user.name || data.user.email;
          userInfo.style.display = 'flex';
        }
      }
    } catch (e) { /* not authenticated */ }
  }
  checkMsAuth();

  async function loadMenus() {
    try {
      const [menusRes, catsRes] = await Promise.all([
        fetch('/api/menus'),
        fetch('/api/categories')
      ]);
      const menus = await menusRes.json();
      const categories = await catsRes.json();

      if (menus.length === 0) {
        emptyState.style.display = 'block';
        return;
      }

      emptyState.style.display = 'none';

      // Group menus by category
      const grouped = {};
      const uncategorized = [];

      menus.forEach(menu => {
        if (menu.category_id) {
          if (!grouped[menu.category_id]) grouped[menu.category_id] = [];
          grouped[menu.category_id].push(menu);
        } else {
          uncategorized.push(menu);
        }
      });

      let html = '';

      // Render each category group (in category sort order)
      categories.forEach(cat => {
        const items = grouped[cat.id];
        if (!items || items.length === 0) return;
        html += renderCategorySection(cat.name, items);
      });

      // Render uncategorized menus
      if (uncategorized.length > 0) {
        const label = categories.length > 0 ? 'อื่นๆ' : '';
        html += renderCategorySection(label, uncategorized);
      }

      // Insert before empty-state
      const existing = mainContent.querySelectorAll('.category-section');
      existing.forEach(el => el.remove());
      emptyState.insertAdjacentHTML('beforebegin', html);
    } catch (err) {
      console.error('Failed to load menus:', err);
    }
  }

  function renderCategorySection(title, items) {
    return `
      <section class="category-section">
        ${title ? `<h2 class="category-title">${escapeHtml(title)}</h2>` : ''}
        <div class="menu-grid">
          ${items.map(menu => `
            <a class="menu-item" href="${escapeHtml(menu.url)}" target="_blank" rel="noopener noreferrer">
              <div class="menu-item-image">
                ${EmojiPicker.renderIcon(menu.icon_type, menu.icon_value, 48)}
              </div>
              <div class="menu-item-name">${escapeHtml(menu.name)}</div>
            </a>
          `).join('')}
        </div>
      </section>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  loadMenus();
});
