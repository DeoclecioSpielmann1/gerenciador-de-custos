// Iniciar:  npm install   e depois   npm start
// No PC:      http://localhost:3000
// No celular: use o endereço "Celular" que aparece no terminal (mesmo Wi-Fi do PC)
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const os = require('os');
const path = require('path');

/* ====== CONFIGURE AQUI (ou use variáveis de ambiente) ====== */
const PORT = +(process.env.PORT || 3000);
const DB = {
  host: process.env.DB_HOST || 'localhost',
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'gerenciador_custos'
};
const INATIVIDADE_MIN = 30;   // minutos parado até pedir login de novo
/* =========================================================== */

const PUBLICO = path.join(__dirname, 'publico');  // aberto: tela de login + style.css
const APP = path.join(__dirname, 'app');          // protegido: só depois do login
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
const resetSolicitacoes = new Map();
const limiteReset = (ip, agora = Date.now()) => {
  const atual = resetSolicitacoes.get(ip);
  if (!atual || agora >= atual.ate) {
    resetSolicitacoes.set(ip, { n: 1, ate: agora + 15 * 60e3 });
    return false;
  }
  atual.n++;
  return atual.n > 5;
};
const configuracaoEmail = (env = process.env) => {
  const outlookOAuth2 = env.SMTP_AUTH === 'oauth2';
  const gmailOAuth2 = env.SMTP_AUTH === 'gmail-oauth2';
  const oauth2 = outlookOAuth2 || gmailOAuth2;
  const host = outlookOAuth2 ? 'smtp-mail.outlook.com' :
    gmailOAuth2 ? 'smtp.gmail.com' : env.SMTP_HOST;
  const port = oauth2 ? 587 : +(env.SMTP_PORT || 587);
  const from = env.SMTP_FROM || env.SMTP_USER;
  const baseURL = env.APP_BASE_URL;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !from || !baseURL) return null;
  if (outlookOAuth2) {
    if (!env.SMTP_USER || !env.OUTLOOK_CLIENT_ID || !env.OUTLOOK_REFRESH_TOKEN) return null;
  } else if (gmailOAuth2) {
    if (!env.SMTP_USER || !env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) return null;
  } else if ((env.SMTP_AUTH && env.SMTP_AUTH !== 'password') ||
    (!!env.SMTP_USER !== !!env.SMTP_PASS)) return null;
  let url;
  try { url = new URL(baseURL); } catch (e) { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  return {
    from,
    baseURL: url.origin,
    transporter: nodemailer.createTransport({
      host, port,
      secure: oauth2 ? false : env.SMTP_SECURE === '1' || port === 465,
      ...(oauth2 ? {
        requireTLS: true,
        auth: {
          type: 'OAuth2',
          user: env.SMTP_USER,
          ...(outlookOAuth2 ? {
            clientId: env.OUTLOOK_CLIENT_ID,
            refreshToken: env.OUTLOOK_REFRESH_TOKEN,
            accessUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
            customParams: { scope: 'https://outlook.office.com/SMTP.Send offline_access' }
          } : {
            clientId: env.GMAIL_CLIENT_ID,
            clientSecret: env.GMAIL_CLIENT_SECRET,
            refreshToken: env.GMAIL_REFRESH_TOKEN,
            accessUrl: 'https://oauth2.googleapis.com/token'
          })
        }
      } : env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {})
    })
  };
};
const escaparHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
const bloqueado = k => { const f = falhas.get(k); return !!(f && f.n >= 8 && Date.now() < f.ate); };
const falhou = k => { const f = falhas.get(k) || { n: 0 }; f.n++; f.ate = Date.now() + 15 * 60e3; falhas.set(k, f); };
setInterval(() => {
  const agora = Date.now();
  for (const [k, f] of falhas) if (agora > f.ate) falhas.delete(k);
  for (const [k, f] of resetSolicitacoes) if (agora > f.ate) resetSolicitacoes.delete(k);
}, 60e3).unref();

/* ---------- sessão ---------- */
const regenerar = req => new Promise((ok, no) => req.session.regenerate(e => e ? no(e) : ok()));
async function abrirSessao(req, u) {
  await regenerar(req);                       // novo id a cada login (evita fixação de sessão)
  req.session.uid = u.id; req.session.nome = u.nome; req.session.email = u.email;
  req.session.demo = !!u.demo;                // marca a sessão do modo "Conhecer o app"
  req.session.ultimo = Date.now();
}
function exigir(req, res, next) {
  const s = req.session;
  if (s.uid && Date.now() - s.ultimo < IDLE) {
    s.ultimo = Date.now();
    res.set('Cache-Control', 'no-store');
    return next();
  }
  if (s.uid) s.destroy(() => { });
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  res.redirect('/login');
}

/* ---------- rotas públicas ---------- */
app.get('/login', (req, res) => {
  if (!req.query.redefinir && req.session.uid && Date.now() - req.session.ultimo < IDLE) return res.redirect('/');
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
    res.status(201).json({ id: r.insertId, nome: dados.nome, email: dados.email });
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
    await abrirSessao(req, { id: u.id, nome: u.nome, email: dados.email });
    res.json({ id: u.id, nome: u.nome, email: dados.email });
  } catch (e) {
    console.error('Erro MySQL:', e.code, e.message);
    res.status(500).json({ erro: 'Erro ao consultar o banco.' });
  }
});

app.post('/api/recuperar-senha', async (req, res) => {
  const email = String(req.body && req.body.email || '').trim().toLowerCase();
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return res.status(422).json({ erro: 'Informe um e-mail válido.' });
  if (limiteReset(req.ip)) return res.status(429).json({ erro: 'Muitas solicitações. Aguarde 15 minutos e tente novamente.' });
  const mail = configuracaoEmail();
  if (!mail) return res.status(503).json({ erro: 'Recuperação temporariamente indisponível. Configure o SMTP/OAuth2 e APP_BASE_URL no servidor.' });
  try {
    const [[usuario]] = await pool.execute('SELECT id, nome FROM usuarios WHERE email = ?', [email]);
    if (usuario) {
      const token = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const link = mail.baseURL + '/login?redefinir#token=' + token;
      await pool.execute('DELETE FROM tokens_recuperacao_senha WHERE usuario_id = ?', [usuario.id]);
      await pool.execute(
        'INSERT INTO tokens_recuperacao_senha (usuario_id, token_hash, expira_em) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE))',
        [usuario.id, hash]);
      try {
        await mail.transporter.sendMail({
          from: mail.from,
          to: email,
          subject: 'Redefinição de senha — Gerenciador de Custos',
          text: `Olá, ${usuario.nome}.\n\nPara criar uma nova senha, acesse este link (válido por 30 minutos e de uso único):\n${link}\n\nSe você não solicitou a redefinição, ignore esta mensagem.`,
          html: `<p>Olá, ${escaparHTML(usuario.nome)}.</p><p>Para criar uma nova senha, acesse o link abaixo. Ele expira em 30 minutos e só pode ser usado uma vez.</p><p><a href="${link}">Redefinir minha senha</a></p><p>Se você não solicitou a redefinição, ignore esta mensagem.</p>`
        });
      } catch (e) {
        await pool.execute('DELETE FROM tokens_recuperacao_senha WHERE usuario_id = ? AND token_hash = ?', [usuario.id, hash]);
        console.error('Falha ao enviar e-mail de recuperação:', e.code || e.message);
      }
    }
    res.json({ mensagem: 'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.' });
  } catch (e) {
    console.error('Falha ao solicitar recuperação de senha:', e.code || e.message);
    res.status(500).json({ erro: 'Não foi possível solicitar a recuperação agora. Tente novamente.' });
  }
});

app.post('/api/redefinir-senha', async (req, res) => {
  const token = String(req.body && req.body.token || '');
  const senha = String(req.body && req.body.senha || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite uma nova recuperação.' });
  if (senha.length < 8 || Buffer.byteLength(senha) > 72)
    return res.status(422).json({ erro: 'A senha deve ter ao menos 8 caracteres e no máximo 72 bytes.' });
  let conexao;
  try {
    const senhaHash = await bcrypt.hash(senha, 12);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    conexao = await pool.getConnection();
    await conexao.beginTransaction();
    const [[registro]] = await conexao.execute(
      'SELECT usuario_id FROM tokens_recuperacao_senha WHERE token_hash = ? AND expira_em > CURRENT_TIMESTAMP FOR UPDATE',
      [tokenHash]);
    if (!registro) {
      await conexao.rollback();
      return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite uma nova recuperação.' });
    }
    await conexao.execute('UPDATE usuarios SET senha = ? WHERE id = ?', [senhaHash, registro.usuario_id]);
    await conexao.execute('DELETE FROM tokens_recuperacao_senha WHERE usuario_id = ?', [registro.usuario_id]);
    await conexao.commit();
    res.json({ mensagem: 'Senha redefinida. Entre com sua nova senha.' });
  } catch (e) {
    if (conexao) {
      try { await conexao.rollback(); }
      catch (rollbackError) { console.error('Falha ao reverter redefinição de senha:', rollbackError.code || rollbackError.message); }
    }
    console.error('Falha ao redefinir senha:', e.code || e.message);
    res.status(500).json({ erro: 'Não foi possível redefinir a senha agora. Tente novamente.' });
  } finally {
    if (conexao) conexao.release();
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('gc.sid'); res.status(204).end(); });
});

/* modo "Conhecer o app": sessão sem usuário no banco (tem que ficar ANTES do exigir) */
app.post('/api/demo', async (req, res) => {
  try {
    await abrirSessao(req, { id: 'demo', nome: 'Visitante', email: '', demo: true });
    res.json({ demo: true });
  } catch (e) {
    res.status(500).json({ erro: 'Não foi possível abrir o modo de teste.' });
  }
});

/* ---------- tudo abaixo exige login ---------- */
app.use(exigir);
app.get('/api/me', (req, res) => res.json({
  id: req.session.uid, nome: req.session.nome, email: req.session.email, demo: !!req.session.demo
}));

/* módulos funcionais do painel: entregues somente a usuários autenticados */
for (const nome of ['Dados.js', 'Orcamento.js', 'Contas.js', 'Backup.js', 'Pwa.js']) {
  app.get('/' + nome, (req, res) => res.sendFile(path.join(__dirname, nome), {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }
  }));
}

/* o visitante do modo de teste não grava nem lê nada do banco */
app.use('/api/lancamentos', (req, res, next) =>
  req.session.demo ? res.status(403).json({ erro: 'Indisponível no modo de teste.' }) : next());

/* emissor de notas (o próprio router também bloqueia o modo de teste) */
app.use('/api/notas', require('./publico/notas')(pool));

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
app.use(express.static(APP));   // index.html, app.js, notas.html etc. (só chegam aqui com login)

/* JSON malformado e erros inesperados: resposta limpa em vez de página de erro do Express */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Requisição inválida.' });
  console.error('Erro:', err.message);
  res.status(500).json({ erro: 'Erro interno.' });
});

/* ---------- inicialização ---------- */
const DICAS = {
  ER_ACCESS_DENIED_ERROR: 'Usuário ou senha do MySQL incorretos: edite DB.user / DB.password no topo do server.js (ou defina DB_USER / DB_PASS).',
  ER_BAD_DB_ERROR: 'O banco "' + DB.database + '" não existe: rode o schema_mysql.sql no DBeaver (Alt+X).',
  ECONNREFUSED: 'O MySQL não está ligado (ou a porta ' + DB.port + ' está errada).'
};
pool.query('SELECT 1')
  .then(() => console.log('MySQL conectado em', DB.host + ':' + DB.port, '/', DB.database))
  .then(() => pool.query(`SELECT
      (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'senha') AS senha,
      (SELECT COUNT(*) FROM information_schema.TABLES  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lancamentos') AS lanc,
      (SELECT COUNT(*) FROM information_schema.TABLES  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notas') AS notas,
      (SELECT COUNT(*) FROM information_schema.TABLES  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tokens_recuperacao_senha') AS tokens_reset`))
  .then(([[r]]) => {
    if (!+r.senha || !+r.lanc)
      console.error('ATENÇÃO - faltam a coluna usuarios.senha e/ou a tabela lancamentos. Rode o schema_mysql.sql no DBeaver (Alt+X).');
    if (!+r.notas)
      console.error('ATENÇÃO - falta a tabela notas (emissor de notas). Rode o schema_notas.sql no DBeaver (Alt+X).');
    if (!+r.tokens_reset)
      console.error('ATENÇÃO - falta a tabela tokens_recuperacao_senha. Rode schema_mysql.sql no DBeaver (Alt+X).');
  })
  .catch(e => {
    console.error('ATENÇÃO - sem conexão com o MySQL:', e.code, e.message);
    if (DICAS[e.code]) console.error('  ->', DICAS[e.code]);
  });

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    const ips = Object.values(os.networkInterfaces()).flat()
      .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log('\nGerenciador de Custos no ar');
    console.log('  PC:      http://localhost:' + PORT);
    ips.forEach(ip => console.log('  Celular: http://' + ip + ':' + PORT));
    console.log('');
  });
}
module.exports = { app, validar, configuracaoEmail }; // Exporta para os testes