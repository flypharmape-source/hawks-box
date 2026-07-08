// server.js — API + site da Hawks Box, com login e Postgres (Railway)
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- segredos / config ---
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) console.warn('Aviso: defina JWT_SECRET no Railway (senão os logins caem a cada deploy).');
// Código exigido para criar conta (protege os dados da box). Se vazio, cadastro fica aberto.
const REGISTER_CODE = process.env.REGISTER_CODE || '';

// --- Postgres ---
const url = process.env.DATABASE_URL || '';
if (!url) console.warn('ATENÇÃO: DATABASE_URL não definida. Configure a variável no Railway.');
const ssl = /railway\.internal|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
const pool = new Pool({ connectionString: url, ssl });

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT UNIQUE NOT NULL,
      pass_hash  TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS championships (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log('Banco pronto.');
}

// --- helpers de auth ---
function makeToken(u) { return jwt.sign({ uid: u.id, name: u.name, email: u.email }, JWT_SECRET, { expiresIn: '30d' }); }
function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'não autorizado' }); }
}
const uid = () => crypto.randomBytes(6).toString('hex');
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

// --- rotas de conta ---
app.post('/api/register', async (req, res) => {
  try {
    let { name, email, password, code } = req.body || {};
    name = (name || '').trim(); email = (email || '').trim().toLowerCase();
    if (REGISTER_CODE && code !== REGISTER_CODE) return res.status(403).json({ error: 'Código de acesso inválido.' });
    if (!name) return res.status(400).json({ error: 'Informe seu nome.' });
    if (!emailOk(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });
    const hash = await bcrypt.hash(password, 10);
    const id = uid();
    try {
      await pool.query('INSERT INTO users (id,name,email,pass_hash) VALUES ($1,$2,$3,$4)', [id, name, email, hash]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Este e-mail já tem conta.' });
      throw e;
    }
    const user = { id, name, email };
    res.json({ token: makeToken(user), user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Falha ao criar conta.' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = (email || '').trim().toLowerCase();
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password || '', u.pass_hash)))
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    const user = { id: u.id, name: u.name, email: u.email };
    res.json({ token: makeToken(user), user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Falha ao entrar.' }); }
});

app.get('/api/me', authRequired, (req, res) => res.json({ user: { id: req.user.uid, name: req.user.name, email: req.user.email } }));

// --- rotas de campeonatos (protegidas) ---
app.get('/api/championships', authRequired, async (_req, res) => {
  try {
    const r = await pool.query('SELECT data FROM championships ORDER BY updated_at DESC');
    res.json(r.rows.map(row => row.data));
  } catch (e) { console.error(e); res.status(500).json({ error: 'falha ao listar' }); }
});
app.put('/api/championships/:id', authRequired, async (req, res) => {
  try {
    const id = req.params.id, data = req.body;
    if (!data || data.id !== id) return res.status(400).json({ error: 'id inválido' });
    await pool.query(
      `INSERT INTO championships (id,data,updated_at) VALUES ($1,$2,now())
       ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=now()`, [id, data]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'falha ao salvar' }); }
});
app.delete('/api/championships/:id', authRequired, async (req, res) => {
  try { await pool.query('DELETE FROM championships WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'falha ao excluir' }); }
});

// site
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log('Hawks Box na porta ' + PORT)))
  .catch(e => { console.error('Erro ao iniciar:', e); app.listen(PORT, () => console.log('Subiu sem banco na porta ' + PORT)); });
