// server.js — API + site da Hawks Box, conectado ao Postgres do Railway
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- conexão com o Postgres ---
// O Railway injeta DATABASE_URL automaticamente quando você referencia o banco.
const url = process.env.DATABASE_URL || '';
if (!url) console.warn('ATENÇÃO: DATABASE_URL não definida. Configure a variável no Railway.');
// Conexão interna (railway.internal) não usa SSL; pública (proxy) usa.
const ssl = /railway\.internal|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
const pool = new Pool({ connectionString: url, ssl });

// cria a tabela na primeira execução
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS championships (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log('Banco pronto.');
}

// --- API ---
// lista todos os campeonatos
app.get('/api/championships', async (_req, res) => {
  try {
    const r = await pool.query('SELECT data FROM championships ORDER BY updated_at DESC');
    res.json(r.rows.map(row => row.data));
  } catch (e) { console.error(e); res.status(500).json({ error: 'falha ao listar' }); }
});

// cria ou atualiza um campeonato (objeto inteiro)
app.put('/api/championships/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    if (!data || data.id !== id) return res.status(400).json({ error: 'id inválido' });
    await pool.query(
      `INSERT INTO championships (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()`,
      [id, data]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'falha ao salvar' }); }
});

// remove um campeonato
app.delete('/api/championships/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM championships WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'falha ao excluir' }); }
});

// qualquer outra rota devolve o site
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log('Hawks Box rodando na porta ' + PORT)))
  .catch(e => { console.error('Erro ao iniciar:', e); app.listen(PORT, () => console.log('Subiu sem banco na porta ' + PORT)); });
