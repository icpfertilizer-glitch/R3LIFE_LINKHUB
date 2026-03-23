const express = require('express');
const session = require('express-session');
const multer = require('multer');
const msal = require('@azure/msal-node');
const { createClient } = require('@libsql/client');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup: Turso cloud if URL is set, otherwise local file
const isTurso = !!process.env.TURSO_DATABASE_URL;
const db = createClient(
  isTurso
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:database/linkhub.db' }
);
console.log(`Database: ${isTurso ? 'Turso Cloud (' + process.env.TURSO_DATABASE_URL + ')' : 'Local SQLite'}`);

// Initialize database tables
async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      image TEXT,
      category_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      tenant_id TEXT,
      is_admin INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 0,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Add new columns if not exists (for existing databases)
  try { await db.execute('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0'); } catch(e) {}
  try { await db.execute('ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0'); } catch(e) {}
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(user_email, category_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_menu_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      menu_id INTEGER NOT NULL,
      FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
      UNIQUE(user_email, menu_id)
    )
  `);
}

// --- Microsoft Entra ID (Azure AD) Setup ---
// AZURE_ALLOWED_TENANTS: comma-separated tenant IDs (e.g. "tenant-id-1,tenant-id-2")
const AZURE_ALLOWED_TENANTS = (process.env.AZURE_ALLOWED_TENANTS || '').split(',').map(t => t.trim()).filter(Boolean);
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || '';
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';
const AZURE_REDIRECT_URI = process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/auth/callback';

const msalEnabled = !!(AZURE_ALLOWED_TENANTS.length && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET);

let msalClient = null;
if (msalEnabled) {
  msalClient = new msal.ConfidentialClientApplication({
    auth: {
      clientId: AZURE_CLIENT_ID,
      // Use "organizations" to allow any org account, then verify tenant in callback
      authority: 'https://login.microsoftonline.com/organizations',
      clientSecret: AZURE_CLIENT_SECRET,
    }
  });
}

// Multer: memory storage (no disk writes, convert to base64)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for Render (needed for secure cookies behind HTTPS proxy)
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'r3life-linkhub-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Admin credentials
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// --- Auth Middleware ---

// Microsoft login required (for viewing public page)
function requireMsLogin(req, res, next) {
  if (!msalEnabled) return next(); // skip if Azure not configured
  if (req.session && req.session.msUser) return next();
  if (req.session && req.session.isAdmin) return next(); // admin bypasses MS login
  // For API calls, return 401 instead of redirect (prevents CORS issues)
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Save the original URL to redirect back after login
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
}

// Admin login required (for managing menus)
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Convert uploaded file buffer to base64 data URI
function fileToBase64(file) {
  if (!file) return null;
  const base64 = file.buffer.toString('base64');
  return `data:${file.mimetype};base64,${base64}`;
}

// --- Microsoft Auth Routes ---

app.get('/auth/login', async (req, res) => {
  if (!msalEnabled) return res.redirect('/');
  try {
    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: ['user.read'],
      redirectUri: AZURE_REDIRECT_URI,
      prompt: 'select_account'
    });
    res.redirect(authUrl);
  } catch (err) {
    console.error('MSAL login error:', err);
    res.status(500).send('Authentication error');
  }
});

app.get('/auth/callback', async (req, res) => {
  if (!msalEnabled) return res.redirect('/');
  try {
    const tokenResponse = await msalClient.acquireTokenByCode({
      code: req.query.code,
      scopes: ['user.read'],
      redirectUri: AZURE_REDIRECT_URI
    });

    // Verify tenant is in allowed list
    const account = tokenResponse.account;
    if (!AZURE_ALLOWED_TENANTS.includes(account.tenantId)) {
      return res.status(403).send('Access denied: your organization is not allowed.');
    }

    // Check if user exists and is approved
    const existingUser = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [account.username]
    });

    if (existingUser.rows.length === 0) {
      // User not registered by admin — deny access
      return res.sendFile(path.join(__dirname, 'public', 'denied.html'));
    }

    const user = existingUser.rows[0];
    if (!user.is_approved) {
      return res.sendFile(path.join(__dirname, 'public', 'denied.html'));
    }

    // Update user info on login
    await db.execute({
      sql: 'UPDATE users SET name = ?, tenant_id = ?, last_login = CURRENT_TIMESTAMP WHERE email = ?',
      args: [account.name, account.tenantId, account.username]
    });

    req.session.msUser = {
      name: account.name,
      email: account.username,
      tenantId: account.tenantId
    };

    // If user has admin role, auto-set admin session
    if (user.is_admin) {
      req.session.isAdmin = true;
    }

    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error('MSAL callback error:', err);
    res.status(500).send('Authentication error');
  }
});

app.get('/auth/logout', (req, res) => {
  const wasMs = req.session && req.session.msUser;
  req.session.destroy(() => {
    if (wasMs && msalEnabled) {
      res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(AZURE_REDIRECT_URI.replace('/auth/callback', '/'))}`);
    } else {
      res.redirect('/');
    }
  });
});

// Health check endpoint (for uptime monitoring)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check Microsoft auth status
app.get('/api/ms-auth', (req, res) => {
  res.json({
    isAuthenticated: !!(req.session && req.session.msUser),
    user: req.session?.msUser || null,
    msalEnabled
  });
});

// --- Serve Pages ---

// Landing page or main page
app.get('/', (req, res) => {
  if (!msalEnabled) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  // If logged in with Microsoft, show main page
  if (req.session && req.session.msUser) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  // Not logged in: show welcome/landing page
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Static files that need protection (JS, CSS) - allow without login so login page looks right
app.use(express.static(path.join(__dirname, 'public')));

// --- Admin API ---

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  // Master admin login
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }

  // Check if MS user has admin role (login with email + password)
  if (username && password) {
    const user = await db.execute({ sql: 'SELECT * FROM users WHERE email = ? AND is_admin = 1', args: [username] });
    if (user.rows.length > 0 && password === ADMIN_PASS) {
      req.session.isAdmin = true;
      return res.json({ success: true });
    }
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});

app.get('/api/auth', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// --- Category API (read: MS auth, write: admin) ---

// Helper: get allowed IDs for current user
async function getUserPermissions(req) {
  // Admin sees everything
  if (req.session?.isAdmin) return { all: true };
  if (!req.session?.msUser) return { all: true }; // no MS user = no filtering

  const email = req.session.msUser.email;
  const catPerms = await db.execute({ sql: 'SELECT category_id FROM user_permissions WHERE user_email = ?', args: [email] });
  const menuPerms = await db.execute({ sql: 'SELECT menu_id FROM user_menu_permissions WHERE user_email = ?', args: [email] });

  // No permissions at all = see nothing
  if (catPerms.rows.length === 0 && menuPerms.rows.length === 0) return { all: false, categoryIds: [], menuIds: [] };

  return {
    all: false,
    categoryIds: catPerms.rows.map(r => r.category_id),
    menuIds: menuPerms.rows.map(r => r.menu_id)
  };
}

app.get('/api/categories', requireMsLogin, async (req, res) => {
  const perms = await getUserPermissions(req);
  if (perms.all) {
    const result = await db.execute('SELECT * FROM categories ORDER BY sort_order ASC, id ASC');
    return res.json(result.rows);
  }

  if (perms.categoryIds.length === 0 && perms.menuIds.length === 0) return res.json([]);

  // Get categories from direct category permissions + categories of permitted menus
  const allIds = new Set(perms.categoryIds);
  if (perms.menuIds.length > 0) {
    const mp = perms.menuIds.map(() => '?').join(',');
    const menuCats = await db.execute({ sql: `SELECT DISTINCT category_id FROM menus WHERE id IN (${mp}) AND category_id IS NOT NULL`, args: perms.menuIds });
    menuCats.rows.forEach(r => allIds.add(r.category_id));
  }

  if (allIds.size === 0) return res.json([]);
  const ids = [...allIds];
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.execute({ sql: `SELECT * FROM categories WHERE id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`, args: ids });
  res.json(result.rows);
});

app.post('/api/categories', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const maxOrder = await db.execute('SELECT MAX(sort_order) as max FROM categories');
  const sortOrder = (maxOrder.rows[0].max || 0) + 1;

  const result = await db.execute({
    sql: 'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
    args: [name, sortOrder]
  });
  const category = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [result.lastInsertRowid] });
  res.status(201).json(category.rows[0]);
});

app.put('/api/categories/reorder', requireAdmin, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Order must be an array' });

  for (let i = 0; i < order.length; i++) {
    await db.execute({ sql: 'UPDATE categories SET sort_order = ? WHERE id = ?', args: [i + 1, order[i]] });
  }
  res.json({ success: true });
});

app.put('/api/categories/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Category not found' });

  await db.execute({ sql: 'UPDATE categories SET name = ? WHERE id = ?', args: [name || existing.rows[0].name, id] });
  const category = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
  res.json(category.rows[0]);
});

app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Category not found' });

  await db.execute({ sql: 'UPDATE menus SET category_id = NULL WHERE category_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] });
  res.json({ success: true });
});

// --- Menu API (read: MS auth, write: admin) ---

app.get('/api/menus', requireMsLogin, async (req, res) => {
  const perms = await getUserPermissions(req);
  if (perms.all) {
    const result = await db.execute(`
      SELECT menus.*, categories.name as category_name
      FROM menus
      LEFT JOIN categories ON menus.category_id = categories.id
      ORDER BY categories.sort_order ASC, menus.sort_order ASC, menus.id ASC
    `);
    return res.json(result.rows);
  }

  if (perms.categoryIds.length === 0 && perms.menuIds.length === 0) return res.json([]);

  // Build WHERE clause: category_id IN (...) OR menus.id IN (...)
  const conditions = [];
  const args = [];

  if (perms.categoryIds.length > 0) {
    conditions.push(`menus.category_id IN (${perms.categoryIds.map(() => '?').join(',')})`);
    args.push(...perms.categoryIds);
  }
  if (perms.menuIds.length > 0) {
    conditions.push(`menus.id IN (${perms.menuIds.map(() => '?').join(',')})`);
    args.push(...perms.menuIds);
  }

  const result = await db.execute({
    sql: `SELECT menus.*, categories.name as category_name
          FROM menus
          LEFT JOIN categories ON menus.category_id = categories.id
          WHERE ${conditions.join(' OR ')}
          ORDER BY categories.sort_order ASC, menus.sort_order ASC, menus.id ASC`,
    args
  });
  res.json(result.rows);
});

app.post('/api/menus', requireAdmin, upload.single('image'), async (req, res) => {
  const { name, url, category_id } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });

  const image = fileToBase64(req.file);
  const catId = category_id && category_id !== '' ? parseInt(category_id) : null;
  const maxOrder = await db.execute('SELECT MAX(sort_order) as max FROM menus');
  const sortOrder = (maxOrder.rows[0].max || 0) + 1;

  const result = await db.execute({
    sql: 'INSERT INTO menus (name, url, image, category_id, sort_order) VALUES (?, ?, ?, ?, ?)',
    args: [name, url, image, catId, sortOrder]
  });

  const menu = await db.execute({ sql: 'SELECT * FROM menus WHERE id = ?', args: [result.lastInsertRowid] });
  res.status(201).json(menu.rows[0]);
});

app.put('/api/menus/reorder', requireAdmin, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Order must be an array' });

  for (let i = 0; i < order.length; i++) {
    await db.execute({ sql: 'UPDATE menus SET sort_order = ? WHERE id = ?', args: [i + 1, order[i]] });
  }
  res.json({ success: true });
});

app.put('/api/menus/:id', requireAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, url, category_id } = req.body;
  const existing = await db.execute({ sql: 'SELECT * FROM menus WHERE id = ?', args: [id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Menu not found' });

  const row = existing.rows[0];
  const image = req.file ? fileToBase64(req.file) : row.image;
  const catId = category_id !== undefined
    ? (category_id && category_id !== '' ? parseInt(category_id) : null)
    : row.category_id;

  await db.execute({
    sql: 'UPDATE menus SET name = ?, url = ?, image = ?, category_id = ? WHERE id = ?',
    args: [name || row.name, url || row.url, image, catId, id]
  });

  const menu = await db.execute({ sql: 'SELECT * FROM menus WHERE id = ?', args: [id] });
  res.json(menu.rows[0]);
});

app.delete('/api/menus/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const existing = await db.execute({ sql: 'SELECT * FROM menus WHERE id = ?', args: [id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Menu not found' });

  await db.execute({ sql: 'DELETE FROM menus WHERE id = ?', args: [id] });
  res.json({ success: true });
});

// --- User Permission API (admin only) ---

// Get all users with their permissions
app.get('/api/users', requireAdmin, async (req, res) => {
  const users = await db.execute('SELECT * FROM users ORDER BY name ASC');
  const catPerms = await db.execute('SELECT * FROM user_permissions');
  const menuPerms = await db.execute('SELECT * FROM user_menu_permissions');

  const userList = users.rows.map(u => ({
    ...u,
    categoryPermissions: catPerms.rows.filter(p => p.user_email === u.email).map(p => p.category_id),
    menuPermissions: menuPerms.rows.filter(p => p.user_email === u.email).map(p => p.menu_id)
  }));
  res.json(userList);
});

// Register new user (admin adds user by email)
app.post('/api/users', requireAdmin, async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const existing = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
  if (existing.rows.length > 0) return res.status(409).json({ error: 'User already exists' });

  await db.execute({
    sql: 'INSERT INTO users (email, name, is_approved) VALUES (?, ?, 1)',
    args: [email.toLowerCase(), name || '']
  });

  const user = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email.toLowerCase()] });
  res.status(201).json(user.rows[0]);
});

// Toggle admin role
app.put('/api/users/:email/admin', requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const { is_admin } = req.body;

  await db.execute({ sql: 'UPDATE users SET is_admin = ? WHERE email = ?', args: [is_admin ? 1 : 0, email] });
  res.json({ success: true });
});

// Toggle approved status
app.put('/api/users/:email/approve', requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const { is_approved } = req.body;

  await db.execute({ sql: 'UPDATE users SET is_approved = ? WHERE email = ?', args: [is_approved ? 1 : 0, email] });
  res.json({ success: true });
});

// Set permissions for a user (replace all)
app.put('/api/users/:email/permissions', requireAdmin, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const { category_ids, menu_ids } = req.body;

    if (!Array.isArray(category_ids) || !Array.isArray(menu_ids)) {
      return res.status(400).json({ error: 'category_ids and menu_ids must be arrays' });
    }

    // Replace category permissions
    await db.execute({ sql: 'DELETE FROM user_permissions WHERE user_email = ?', args: [email] });
    for (const catId of category_ids) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO user_permissions (user_email, category_id) VALUES (?, ?)', args: [email, catId] });
    }

    // Replace menu permissions
    await db.execute({ sql: 'DELETE FROM user_menu_permissions WHERE user_email = ?', args: [email] });
    for (const menuId of menu_ids) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO user_menu_permissions (user_email, menu_id) VALUES (?, ?)', args: [email, menuId] });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Permission update error:', err);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// Delete a user and their permissions
app.delete('/api/users/:email', requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  await db.execute({ sql: 'DELETE FROM user_permissions WHERE user_email = ?', args: [email] });
  await db.execute({ sql: 'DELETE FROM user_menu_permissions WHERE user_email = ?', args: [email] });
  await db.execute({ sql: 'DELETE FROM users WHERE email = ?', args: [email] });
  res.json({ success: true });
});

// Start server after DB init
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Microsoft Auth: ${msalEnabled ? 'ENABLED' : 'DISABLED (set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)'}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
