const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { createClient } = require('@libsql/client');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup: Turso cloud if URL is set, otherwise local file
const db = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:database/linkhub.db' }
);

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
app.use(express.static(path.join(__dirname, 'public')));

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

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Convert uploaded file buffer to base64 data URI
function fileToBase64(file) {
  if (!file) return null;
  const base64 = file.buffer.toString('base64');
  return `data:${file.mimetype};base64,${base64}`;
}

// --- API Routes ---

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check auth
app.get('/api/auth', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// --- Category API ---

app.get('/api/categories', async (req, res) => {
  const result = await db.execute('SELECT * FROM categories ORDER BY sort_order ASC, id ASC');
  res.json(result.rows);
});

app.post('/api/categories', requireAuth, async (req, res) => {
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

app.put('/api/categories/reorder', requireAuth, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Order must be an array' });

  for (let i = 0; i < order.length; i++) {
    await db.execute({ sql: 'UPDATE categories SET sort_order = ? WHERE id = ?', args: [i + 1, order[i]] });
  }
  res.json({ success: true });
});

app.put('/api/categories/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Category not found' });

  await db.execute({ sql: 'UPDATE categories SET name = ? WHERE id = ?', args: [name || existing.rows[0].name, id] });
  const category = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
  res.json(category.rows[0]);
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const existing = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Category not found' });

  await db.execute({ sql: 'UPDATE menus SET category_id = NULL WHERE category_id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] });
  res.json({ success: true });
});

// --- Menu API ---

app.get('/api/menus', async (req, res) => {
  const result = await db.execute(`
    SELECT menus.*, categories.name as category_name
    FROM menus
    LEFT JOIN categories ON menus.category_id = categories.id
    ORDER BY categories.sort_order ASC, menus.sort_order ASC, menus.id ASC
  `);
  res.json(result.rows);
});

app.post('/api/menus', requireAuth, upload.single('image'), async (req, res) => {
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

app.put('/api/menus/reorder', requireAuth, async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Order must be an array' });

  for (let i = 0; i < order.length; i++) {
    await db.execute({ sql: 'UPDATE menus SET sort_order = ? WHERE id = ?', args: [i + 1, order[i]] });
  }
  res.json({ success: true });
});

app.put('/api/menus/:id', requireAuth, upload.single('image'), async (req, res) => {
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

app.delete('/api/menus/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const existing = await db.execute({ sql: 'SELECT * FROM menus WHERE id = ?', args: [id] });
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Menu not found' });

  await db.execute({ sql: 'DELETE FROM menus WHERE id = ?', args: [id] });
  res.json({ success: true });
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server after DB init
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
