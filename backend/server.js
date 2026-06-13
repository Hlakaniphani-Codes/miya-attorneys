const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// ---- Config (edit via env vars) ----
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_SUPER_SECRET';
const TENANT_ID = process.env.TENANT_ID || 'miya-attorneys';

// ---- Middleware ----
app.use(helmet());
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// ---- SQLite ----
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  await run(`PRAGMA foreign_keys = ON;`);

  await run(`CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT,
    createdAt TEXT NOT NULL
  );`);

  await run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenantId TEXT NOT NULL,
    username TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE(tenantId, username),
    FOREIGN KEY (tenantId) REFERENCES tenants(id)
  );`);

  await run(`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    tenantId TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT,
    excerpt TEXT,
    author TEXT,
    contentHtml TEXT NOT NULL,
    publishedAt TEXT,
    status TEXT NOT NULL,
    imageUrl TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (tenantId) REFERENCES tenants(id)
  );`);

  // Ensure default tenant
  await run(
    `INSERT OR IGNORE INTO tenants(id, name, createdAt) VALUES(?, ?, ?);`,
    [TENANT_ID, 'Miya Attorneys', new Date().toISOString()]
  );

  // Provision default admin credentials (username: admin, password: miya2026)
  const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
  const defaultPassword = process.env.ADMIN_PASSWORD || 'miya2026';

  const existing = await get(
    `SELECT id FROM admins WHERE tenantId = ? AND username = ?;`,
    [TENANT_ID, defaultUsername]
  );

  if (!existing) {
    const passwordHash = await bcrypt.hash(defaultPassword, 12);
    await run(
      `INSERT INTO admins(tenantId, username, passwordHash, createdAt) VALUES(?, ?, ?, ?);`,
      [TENANT_ID, defaultUsername, passwordHash, new Date().toISOString()]
    );
    console.log(`Provisioned default admin for tenant=${TENANT_ID}: ${defaultUsername} / (env ADMIN_PASSWORD or miya2026)`);
  }
}

// ---- JWT Auth (admin only) ----
function requireAdmin(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireTenant(req, res, next) {
  // For now: tenantId must match configured tenant OR you can implement multi-tenant auth later.
  const tenantId = req.params.tenantId;
  if (tenantId !== TENANT_ID) return res.status(404).json({ error: 'Unknown tenant' });
  next();
}

// ---- Images upload ----
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase() || '.jpg';
    const id = req.body.postId || `${Date.now()}`;
    cb(null, `${id}${safeExt}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  }
});

app.use('/uploads', express.static(uploadDir));

// ---- API ----
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/auth/login', async (req, res) => {
  const { username, password, tenantId } = req.body || {};
  const effectiveTenant = tenantId || TENANT_ID;
  if (effectiveTenant !== TENANT_ID) return res.status(404).json({ error: 'Unknown tenant' });

  const adminRow = await get(
    `SELECT * FROM admins WHERE tenantId = ? AND username = ?;`,
    [TENANT_ID, username]
  );
  if (!adminRow) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password || '', adminRow.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ sub: adminRow.id, tenantId: TENANT_ID, username }, JWT_SECRET, { expiresIn: '6h' });
  res.json({ token, tenantId: TENANT_ID });
});

// Public: list posts
app.get('/api/tenants/:tenantId/posts', requireTenant, async (req, res) => {
  const { q, category, take = 6, skip = 0 } = req.query;
  const tTake = Math.max(1, Math.min(parseInt(take, 10) || 6, 30));
  const tSkip = Math.max(0, parseInt(skip, 10) || 0);
  const params = [TENANT_ID, 'published'];

  let where = `WHERE tenantId = ? AND status = ?`;
  if (category && category !== 'all') {
    where += ` AND category = ?`;
    params.push(category);
  }
  if (q) {
    where += ` AND (title LIKE ? OR excerpt LIKE ? OR contentHtml LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const rows = await all(
    `SELECT id, title, slug, category, excerpt, author, publishedAt, imageUrl, updatedAt
     FROM posts
     ${where}
     ORDER BY COALESCE(publishedAt, updatedAt) DESC
     LIMIT ? OFFSET ?;`,
    [...params, tTake, tSkip]
  );

  // also return computed “content present” flag for easier debugging in UI
  res.json({ posts: rows, total: rows.length });
});

app.get('/api/tenants/:tenantId/posts/:postId', requireTenant, async (req, res) => {
  const post = await get(
    `SELECT id, title, slug, category, excerpt, author, publishedAt, contentHtml, imageUrl, updatedAt
     FROM posts
     WHERE tenantId = ? AND id = ? AND status = 'published';`,
    [TENANT_ID, req.params.postId]
  );

  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ post });
});

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function newId() {
  return `p_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

// Admin create/update (with optional image)
app.post('/api/tenants/:tenantId/posts', requireTenant, requireAdmin, upload.single('image'), async (req, res) => {
  const postId = newId();
  const now = new Date().toISOString();

  const {
    title,
    category,
    excerpt,
    contentHtml,
    author,
    status
  } = req.body || {};

  if (!title || !contentHtml) return res.status(400).json({ error: 'title and contentHtml are required' });

  const slug = slugify(title);
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  await run(
    `INSERT INTO posts(id, tenantId, title, slug, category, excerpt, author, contentHtml, publishedAt, status, imageUrl, createdAt, updatedAt)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?);`,
    [postId, TENANT_ID, title, slug, category || null, excerpt || null, author || null, contentHtml, now, status || 'published', imageUrl, now, now]
  );

  res.json({ postId });
});

app.put('/api/tenants/:tenantId/posts/:postId', requireTenant, requireAdmin, upload.single('image'), async (req, res) => {
  const now = new Date().toISOString();

  const {
    title,
    category,
    excerpt,
    contentHtml,
    author,
    status
  } = req.body || {};

  if (!title || !contentHtml) return res.status(400).json({ error: 'title and contentHtml are required' });

  const slug = slugify(title);
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined; // undefined => keep existing

  const existing = await get(
    `SELECT imageUrl FROM posts WHERE tenantId = ? AND id = ?;`,
    [TENANT_ID, req.params.postId]
  );
  if (!existing) return res.status(404).json({ error: 'Post not found' });

  const finalImageUrl = imageUrl !== undefined ? imageUrl : existing.imageUrl;

  await run(
    `UPDATE posts SET
      title = ?,
      slug = ?,
      category = ?,
      excerpt = ?,
      author = ?,
      contentHtml = ?,
      publishedAt = ?,
      status = ?,
      imageUrl = ?,
      updatedAt = ?
     WHERE tenantId = ? AND id = ?;`,
    [title, slug, category || null, excerpt || null, author || null, contentHtml, now, status || 'published', finalImageUrl, now, TENANT_ID, req.params.postId]
  );

  res.json({ ok: true });
});

app.delete('/api/tenants/:tenantId/posts/:postId', requireTenant, requireAdmin, async (req, res) => {
  await run(`DELETE FROM posts WHERE tenantId = ? AND id = ?;`, [TENANT_ID, req.params.postId]);
  res.json({ ok: true });
});

// Optional: headlines manager (dynamic)
app.get('/api/tenants/:tenantId/headlines', requireTenant, async (req, res) => {
  const row = await get(`SELECT json FROM headlines WHERE tenantId = ?;`, [TENANT_ID]);
  res.json({ headlines: row ? JSON.parse(row.json) : {} });
});

app.put('/api/tenants/:tenantId/headlines', requireTenant, requireAdmin, async (req, res) => {
  const headlines = req.body?.headlines || {};
  await run(`INSERT OR IGNORE INTO headlines(tenantId, json) VALUES(?, ?);`, [TENANT_ID, JSON.stringify(headlines)]);
  await run(`UPDATE headlines SET json = ? WHERE tenantId = ?;`, [JSON.stringify(headlines), TENANT_ID]);
  res.json({ ok: true });
});

// Create headlines table after initDb call (kept here to avoid ordering confusion)
(async () => {
  // headlines table
  await run(`CREATE TABLE IF NOT EXISTS headlines (
    tenantId TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );`);

  await initDb();

  app.post('/api/tenants/:tenantId/headlines', (req, res) => res.status(405).send('Use PUT'));

  app.listen(PORT, () => console.log(`Backend running: http://localhost:${PORT} (tenant=${TENANT_ID})`));
})();

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message && err.message.includes('Only image')) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Server error' });
});

