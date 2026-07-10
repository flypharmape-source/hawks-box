// server.js — API + site da Hawks Box (multi-box, com admin) + Postgres (Railway)
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) console.warn('Aviso: defina JWT_SECRET no Railway (senão os logins caem a cada deploy).');

const url = process.env.DATABASE_URL || '';
if (!url) console.warn('ATENÇÃO: DATABASE_URL não definida.');
const ssl = /railway\.internal|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
const pool = new Pool({ connectionString: url, ssl });

const uid = () => crypto.randomBytes(6).toString('hex');
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

async function init() {
  // tabelas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boxes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, document TEXT, document_type TEXT,
      phone TEXT, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS championships (
      id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // colunas novas (para bancos que já existiam antes desta versão)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS box_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'`);
  await pool.query(`ALTER TABLE championships ADD COLUMN IF NOT EXISTS box_id TEXT`);
  console.log('Banco pronto.');
  await seedAdmin();
}

// cria/atualiza o super-admin a partir das variáveis de ambiente
async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || '';
  if (!email || !pass) { console.warn('Defina ADMIN_EMAIL e ADMIN_PASSWORD para ter o admin global.'); return; }
  const hash = await bcrypt.hash(pass, 10);
  const r = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (r.rows[0]) {
    await pool.query("UPDATE users SET role='admin', pass_hash=$2, box_id=NULL WHERE email=$1", [email, hash]);
    console.log('Admin atualizado:', email);
  } else {
    await pool.query("INSERT INTO users (id,name,email,pass_hash,role,box_id) VALUES ($1,$2,$3,$4,'admin',NULL)",
      [uid(), process.env.ADMIN_NAME || 'Administrador', email, hash]);
    console.log('Admin criado:', email);
  }
}

function makeToken(u) { return jwt.sign({ uid: u.id, name: u.name, email: u.email, role: u.role, boxId: u.boxId || null }, JWT_SECRET, { expiresIn: '30d' }); }
function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'não autorizado' }); }
}
async function userPayload(u) {
  let boxName = null;
  if (u.box_id) { const b = await pool.query('SELECT name FROM boxes WHERE id=$1', [u.box_id]); boxName = b.rows[0]?.name || null; }
  return { id: u.id, name: u.name, email: u.email, role: u.role, boxId: u.box_id, boxName };
}

// ---- cadastro: cria a box (empresa) + usuário dono ----
app.post('/api/register', async (req, res) => {
  try {
    let { email, email2, companyName, phone, document, documentType, username, password, password2 } = req.body || {};
    email = (email || '').trim().toLowerCase();
    companyName = (companyName || '').trim();
    username = (username || '').trim();
    if (!emailOk(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (email2 !== undefined && email2.trim().toLowerCase() !== email) return res.status(400).json({ error: 'Os e-mails não conferem.' });
    if (!companyName) return res.status(400).json({ error: 'Informe o nome da empresa/box.' });
    if (!username) return res.status(400).json({ error: 'Informe o nome de usuário.' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });
    if (password2 !== undefined && password2 !== password) return res.status(400).json({ error: 'As senhas não conferem.' });

    const boxId = uid();
    await pool.query('INSERT INTO boxes (id,name,document,document_type,phone) VALUES ($1,$2,$3,$4,$5)',
      [boxId, companyName, (document || '').trim(), documentType || 'CNPJ', (phone || '').trim()]);
    const id = uid(); const hash = await bcrypt.hash(password, 10);
    try {
      await pool.query("INSERT INTO users (id,name,email,pass_hash,role,box_id) VALUES ($1,$2,$3,$4,'owner',$5)",
        [id, username, email, hash, boxId]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Este e-mail já tem conta.' });
      throw e;
    }
    const user = await userPayload({ id, name: username, email, role: 'owner', box_id: boxId });
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
    const user = await userPayload(u);
    res.json({ token: makeToken(user), user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Falha ao entrar.' }); }
});

app.get('/api/me', authRequired, async (req, res) => {
  const r = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.uid]);
  if (!r.rows[0]) return res.status(401).json({ error: 'não autorizado' });
  res.json({ user: await userPayload(r.rows[0]) });
});

// ---- campeonatos (isolados por box; admin vê tudo) ----
app.get('/api/championships', authRequired, async (req, res) => {
  try {
    const admin = req.user.role === 'admin';
    const q = admin
      ? `SELECT c.data, b.name AS box_name FROM championships c LEFT JOIN boxes b ON b.id=c.box_id ORDER BY c.updated_at DESC`
      : `SELECT c.data, b.name AS box_name FROM championships c LEFT JOIN boxes b ON b.id=c.box_id WHERE c.box_id=$1 ORDER BY c.updated_at DESC`;
    const r = admin ? await pool.query(q) : await pool.query(q, [req.user.boxId]);
    res.json(r.rows.map(row => Object.assign({}, row.data, { _boxName: row.box_name || null })));
  } catch (e) { console.error(e); res.status(500).json({ error: 'falha ao listar' }); }
});

app.put('/api/championships/:id', authRequired, async (req, res) => {
  try {
    const id = req.params.id; const data = req.body;
    if (!data || data.id !== id) return res.status(400).json({ error: 'id inválido' });
    delete data._boxName;
    const admin = req.user.role === 'admin';
    const cur = await pool.query('SELECT box_id FROM championships WHERE id=$1', [id]);
    let boxId;
    if (cur.rows[0]) {
      const existing = cur.rows[0].box_id;
      if (!admin && existing && existing !== req.user.boxId) return res.status(403).json({ error: 'sem permissão' });
      boxId = admin ? existing : req.user.boxId;
    } else {
      boxId = admin ? null : req.user.boxId;
    }
    await pool.query(
      `INSERT INTO championships (id,data,box_id,updated_at) VALUES ($1,$2,$3,now())
       ON CONFLICT (id) DO UPDATE SET data=$2, box_id=$3, updated_at=now()`, [id, data, boxId]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'falha ao salvar' }); }
});

app.delete('/api/championships/:id', authRequired, async (req, res) => {
  try {
    const cur = await pool.query('SELECT box_id FROM championships WHERE id=$1', [req.params.id]);
    if (cur.rows[0] && req.user.role !== 'admin' && cur.rows[0].box_id !== req.user.boxId)
      return res.status(403).json({ error: 'sem permissão' });
    await pool.query('DELETE FROM championships WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'falha ao excluir' }); }
});

// ---- página pública (sem login): leaderboard/baterias/wods ----
app.get('/api/public/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT data FROM championships WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'não encontrado' });
    const d = r.rows[0].data || {};
    // remove dados pessoais dos participantes e dados internos
    (d.participants || []).forEach(p => { (p.members || []).forEach(m => { delete m.email; delete m.phone; delete m.doc; delete m.bday; delete m.nat; }); });
    delete d.kits;
    res.json(d);
  } catch (e) { console.error(e); res.status(500).json({ error: 'falha' }); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log('Hawks Box na porta ' + PORT)))
  .catch(e => { console.error('Erro ao iniciar:', e); app.listen(PORT, () => console.log('Subiu sem banco na porta ' + PORT)); });
