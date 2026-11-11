// Iniciar:  npm install   e depois   npm start
// No PC:      http://localhost:3000
// No celular: use o endereço "Celular" que aparece no terminal (mesmo Wi-Fi do PC)
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

/* ====== CONFIGURE AQUI (ou use variáveis de ambiente) ====== */
const PORT = +(process.env.PORT || 3000);
const DB = {
  host:     process.env.DB_HOST || 'localhost',
  port:     +(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'gerenciador_custos'
};
const INATIVIDADE_MIN = 30;   // minutos parado até pedir login de novo
/* =========================================================== */

const PUBLICO = path.join(__dirname, 'publico');  // aberto: tela de login + style.css
const APP     = path.join(__dirname, 'app');      // protegido: só depois do login
const IDLE = INATIVIDADE_MIN * 60 * 1000;

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);   // use atrás de HTTPS/túnel
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});

// Cookie de sessão SEM validade: some ao fechar o navegador. Além disso, expira por inatividade.
// O segredo muda a cada reinício, então reiniciar o servidor também derruba os logins.
app.use(session({
  name: 'gc.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1' }
}));

const pool = mysql.createPool({ ...DB, waitForConnections: true, connectionLimit: 5 });
const HASH_FALSO = bcrypt.hashSync('senha-falsa', 12);   // iguala o tempo de resposta quando o e-mail não existe

/* ---------- validação (a do servidor é a que vale) ---------- */
function validar(b, cadastro) {
  const erros = {};
  const email = String(b.email || '').trim().toLowerCase();
  const senha = String(b.senha || '');                       // senha nunca é alterada/aparada
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erros.email = 'E-mail inválido.';
  if (!cadastro) return { erros, dados: { email, senha } };

  const nome = String(b.nome || '').trim().replace(/\s+/g, ' ');
  const telefone = String(b.telefone || '').replace(/\D/g, '');
  if (nome.length < 3 || nome.length > 80 || !/^\p{L}[\p{L}'.\- ]*$/u.test(nome)) erros.nome = 'Informe seu nome completo.';
  const ddd = +telefone.slice(0, 2);
  if (![10, 11].includes(telefone.length) || ddd < 11 || (telefone.length === 11 && telefone[2] !== '9'))
    erros.telefone = 'Telefone inválido. Use DDD + número.';
  if (senha.length < 8) erros.senha = 'Use pelo menos 8 caracteres.';
  else if (Buffer.byteLength(senha) > 72) erros.senha = 'Senha longa demais (máx. 72 caracteres).';
  return { erros, dados: { nome, email, telefone, senha } };
}

/* ---------- limite de tentativas de login ---------- */
const falhas = new Map();
const bloqueado = k => { const f = falhas.get(k); return f && f.n >= 8 && Date.now() < f.ate; };
const falhou = k => { const f = falhas.get(k) || { n: 0 }; f.n++; f.ate = Date.now() + 15 * 60e3; falhas.set(k, f); };
setInterval(() => { for (const [k, f] of falhas) if (Date.now() > f.ate) falhas.delete(k); }, 60e3).unref();

/* ---------- sessão ---------- */
const regenerar = req => new Promise((ok, no) => req.session.regenerate(e => e ? no(e) : ok()));
async function abrirSessao(req, u) {
  await regenerar(req);                       // novo id a cada login (evita fixação de sessão)
  req.session.uid = u.id; req.session.nome = u.nome; req.session.email = u.email; req.session.ultimo = Date.now();
}
function exigir(req, res, next) {
  const s = req.session;
  if (s.uid && Date.now() - s.ultimo < IDLE) {
    s.ultimo = Date.now();
    res.set('Cache-Control', 'no-store');
    return next();
  }
  if (s.uid) s.destroy(() => {});
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  res.redirect('/login');
}

/* ---------- rotas públicas ---------- */
app.get('/login', (req, res) => {
  if (req.session.uid && Date.now() - req.session.ultimo < IDLE) return res.redirect('/');
  res.set('Cache-Control', 'no-store').sendFile(path.join(PUBLICO, 'login.html'));
});
app.use(express.static(PUBLICO, { index: false }));

app.post('/api/cadastro', async (req, res) => {
  const { erros, dados } = validar(req.body || {}, true);
  if (Object.keys(erros).length) return res.status(422).json({ erros });
  try {
    const hash = await bcrypt.hash(dados.senha, 12);
    const [r] = await pool.execute(
      'INSERT INTO usuarios (nome, email, telefone, senha) VALUES (?, ?, ?, ?)',
      [dados.nome, dados.email, dados.telefone, hash]);
    await abrirSessao(req, { id: r.insertId, nome: dados.nome, email: dados.email });
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ erros: { email: 'Este e-mail já tem cadastro. Use "Entrar".' } });
    console.error('Erro MySQL:', e.code, e.message);
    res.status(500).json({ erro: 'Erro ao salvar no banco.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { erros, dados } = validar(req.body || {}, false);
  if (erros.email) return res.status(422).json({ erros });
  const chave = req.ip + '|' + dados.email;
  if (bloqueado(chave)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  try {
    const [[u]] = await pool.execute('SELECT id, nome, senha FROM usuarios WHERE email = ?', [dados.email]);
    const ok = await bcrypt.compare(dados.senha, u ? u.senha : HASH_FALSO);
    if (!u || !ok) { falhou(chave); return res.status(401).json({ erro: 'E-mail ou senha incorretos.' }); }
    falhas.delete(chave);
    await abrirSessao(req, { ...u, email: dados.email });
    res.json({ nome: u.nome });
  } catch (e) {
    console.error('Erro MySQL:', e.code, e.message);
    res.status(500).json({ erro: 'Erro ao consultar o banco.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('gc.sid'); res.status(204).end(); });
});

/* ---------- tudo abaixo exige login ---------- */
app.use(exigir);
app.get('/api/me', (req, res) => res.json({ id: req.session.uid, nome: req.session.nome, email: req.session.email }));

/* ---------- lançamentos (sempre filtrados pelo usuário logado) ---------- */
function lanc(b = {}) {
  const id = String(b.id || ''), tipo = b.tipo, descricao = String(b.descricao || '').trim().slice(0, 60);
  const data = String(b.data || ''), centavos = b.centavos;
  if (!/^[A-Za-z0-9]{1,24}$/.test(id) || !['entrada', 'saida'].includes(tipo) || !descricao ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(Date.parse(data)) ||
      !Number.isInteger(centavos) || centavos < 1 || centavos > 99999999999) return null;
  const categoria = tipo === 'saida' && b.categoria ? String(b.categoria).slice(0, 30) : null;
  return { id, tipo, descricao, categoria, data, centavos };
}
const COLS = "id, tipo, descricao, categoria, DATE_FORMAT(data, '%Y-%m-%d') AS data, centavos";
const inserir = (verbo, uid, l) => pool.execute(
  verbo + ' INTO lancamentos (usuario_id, id, tipo, descricao, categoria, data, centavos) VALUES (?, ?, ?, ?, ?, ?, ?)',
  [uid, l.id, l.tipo, l.descricao, l.categoria, l.data, l.centavos]);
const falha = (res, e) => { console.error('Erro MySQL:', e.code, e.message); res.status(500).json({ erro: 'Erro no banco de dados.' }); };

app.get('/api/lancamentos', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT ' + COLS + ' FROM lancamentos WHERE usuario_id = ? ORDER BY data, id', [req.session.uid]);
    res.json(rows);
  } catch (e) { falha(res, e); }
});
app.post('/api/lancamentos', async (req, res) => {
  const l = lanc(req.body); if (!l) return res.status(422).json({ erro: 'Lançamento inválido.' });
  try { await inserir('INSERT', req.session.uid, l); res.status(201).json(l); }
  catch (e) { e.code === 'ER_DUP_ENTRY' ? res.status(409).json({ erro: 'Lançamento já existe.' }) : falha(res, e); }
});
app.post('/api/lancamentos/importar', async (req, res) => {      // migração única do localStorage antigo
  const lista = (Array.isArray(req.body) ? req.body : []).slice(0, 2000).map(lanc).filter(Boolean);
  try {
    for (const l of lista) await inserir('INSERT IGNORE', req.session.uid, l);
    const [rows] = await pool.execute('SELECT ' + COLS + ' FROM lancamentos WHERE usuario_id = ? ORDER BY data, id', [req.session.uid]);
    res.json(rows);
  } catch (e) { falha(res, e); }
});
app.put('/api/lancamentos/:id', async (req, res) => {
  const l = lanc({ ...req.body, id: req.params.id }); if (!l) return res.status(422).json({ erro: 'Lançamento inválido.' });
  try {
    const [r] = await pool.execute(
      'UPDATE lancamentos SET tipo=?, descricao=?, categoria=?, data=?, centavos=? WHERE id=? AND usuario_id=?',
      [l.tipo, l.descricao, l.categoria, l.data, l.centavos, l.id, req.session.uid]);
    r.affectedRows ? res.json(l) : res.status(404).json({ erro: 'Lançamento não encontrado.' });
  } catch (e) { falha(res, e); }
});
app.delete('/api/lancamentos/:id', async (req, res) => {
  try { await pool.execute('DELETE FROM lancamentos WHERE id = ? AND usuario_id = ?', [req.params.id, req.session.uid]); res.status(204).end(); }
  catch (e) { falha(res, e); }
});

app.use('/data', express.static(path.join(__dirname, 'data')));   // categorias.json e config.json (só com login)
app.use(express.static(APP));   // index.html, app.js, etc. (só chegam aqui com login)

/* ---------- inicialização ---------- */
const DICAS = {
  ER_ACCESS_DENIED_ERROR: 'Usuário ou senha do MySQL incorretos: edite DB.user / DB.password no topo do server.js (ou defina DB_USER / DB_PASS).',
  ER_BAD_DB_ERROR:        'O banco "' + DB.database + '" não existe: rode o schema_mysql.sql no DBeaver (Alt+X).',
  ECONNREFUSED:           'O MySQL não está ligado (ou a porta ' + DB.port + ' está errada).'
};
pool.query('SELECT 1')
  .then(() => console.log('MySQL conectado em', DB.host + ':' + DB.port, '/', DB.database))
  .then(() => pool.query(`SELECT
      (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'senha') AS senha,
      (SELECT COUNT(*) FROM information_schema.TABLES  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lancamentos') AS lanc`))
  .then(([[r]]) => {
    if (!+r.senha || !+r.lanc)
      console.error('ATENÇÃO - faltam a coluna usuarios.senha e/ou a tabela lancamentos. Rode o schema_mysql.sql no DBeaver (Alt+X).');
  })
  .catch(e => {
    console.error('ATENÇÃO - sem conexão com o MySQL:', e.code, e.message);
    if (DICAS[e.code]) console.error('  ->', DICAS[e.code]);
  });

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\nGerenciador de Custos no ar');
    // ... logs de IP ...
  });
}
module.exports = { app, validar }; // Exporta para os testes