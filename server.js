// server/src/server.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// Routers de IA y Consultas (mismo directorio)
const aiRouter = require('./ai.routes');
const consultasRouter = require('./consultas.routes');

const app = express();

// ---------- CONFIG ----------
const PORT   = Number(process.env.PORT || 3001);
const HOST   = process.env.HOST || '0.0.0.0';
const ORIGIN = process.env.CLIENT_ORIGIN ?? true;

// parsea CLIENT_ORIGIN: true | "*" | "http://a" | "http://a,http://b"
function parseCorsOrigin(val) {
  if (val === true || val === 'true' || val === '*' || !val) return true;
  if (typeof val === 'string' && val.includes(',')) {
    return val.split(',').map(s => s.trim()).filter(Boolean);
  }
  return val; // una sola URL
}

app.use(express.json());

app.use(cors({
  origin: parseCorsOrigin(ORIGIN),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ---------- STATIC: /public ----------
/**
 * Estructura:
 *   <root>/
 *     public/
 *     server/
 *       src/server.js (este archivo)
 */
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// opcional: servir index en raíz
app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ---------- DB (MISMA CONEXIÓN QUE USAS) ----------
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
  // mantenemos tu configuración para no romper nada
  ssl: process.env.MYSQL_SSL === 'true',
});

// ---------- AUTH ----------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows?.[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Usuario inválido o inactivo' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role_id: user.role_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role_id: user.role_id,
      },
    });
  } catch (err) {
    console.error('Error en /api/auth/login:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ---------- MIDDLEWARE JWT (para /me y lo que quieras proteger globalmente) ----------
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// ---------- RUTAS PROPIAS ----------
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, env: { port: PORT, host: HOST }, public: PUBLIC_DIR });
});

app.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// ---------- MONTAJE DE ROUTERS /api (DESPUÉS DE JSON/CORS) ----------
app.use('/api', aiRouter);
app.use('/api', consultasRouter);

// Fallback 404 SOLO para rutas /api no existentes (después de montar routers)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- START ----------
app.listen(PORT, HOST, () => {
  console.log(`✅ API SaludIA escuchando en http://${HOST}:${PORT} (CORS origin: ${ORIGIN})`);
  console.log(`📄 Static sirviendo: ${PUBLIC_DIR}`);
  console.log(`👉 Abre: http://localhost:${PORT}/index.html`);
});
