// Iniciar:  npm install   e depois   npm start      (abra http://localhost:3000)
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

/* ====== CONFIGURE AQUI (os mesmos dados da sua conexão no DBeaver) ====== */
const DB = {
  host:     process.env.DB_HOST || 'localhost',
  port:     +(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',                 // <- coloque a senha do MySQL aqui
  database: process.env.DB_NAME || 'gerenciador_custos'
};
/* ======================================================================= */

const app = express();
app.use(express.json({ limit: '10kb' }));

// Nunca entregar arquivos internos pelo navegador
app.use((req, res, next) =>
  /^\/(server\.js|package(-lock)?\.json|node_modules|\.git|.*\.sql)(\/|$)/i.test(req.path) ? res.status(404).end() : next());
app.use(express.static(__dirname));

const pool = mysql.createPool({ ...DB, waitForConnections: true, connectionLimit: 5 });

// Mesmas regras do front-end (a validação do servidor é a que vale de verdade)
function validar({ nome = '', email = '', telefone = '' }) {
  const erros = {};
  nome = String(nome).trim().replace(/\s+/g, ' ');
  email = String(email).trim().toLowerCase();
  telefone = String(telefone).replace(/\D/g, '');
  if (nome.length < 3 || nome.length > 80 || !/^\p{L}[\p{L}'.\- ]*$/u.test(nome)) erros.nome = 'Nome inválido.';
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erros.email = 'E-mail inválido.';
  const ddd = +telefone.slice(0, 2);
  if (![10, 11].includes(telefone.length) || ddd < 11 || (telefone.length === 11 && telefone[2] !== '9'))
    erros.telefone = 'Telefone inválido.';
  return { erros, dados: { nome, email, telefone } };
}

app.post('/api/usuarios', async (req, res) => {
  const { erros, dados } = validar(req.body || {});
  if (Object.keys(erros).length) return res.status(422).json({ erros });
  try {
    // Mesmo e-mail = atualiza nome/telefone e reaproveita o cadastro
    const [r] = await pool.execute(
      `INSERT INTO usuarios (nome, email, telefone) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE nome = VALUES(nome), telefone = VALUES(telefone), id = LAST_INSERT_ID(id)`,
      [dados.nome, dados.email, dados.telefone]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error('Erro MySQL:', e.code, e.message);
    res.status(500).json({ erro: 'Erro ao salvar no banco.' });
  }
});

pool.query('SELECT 1')
  .then(() => console.log('MySQL conectado em', DB.host + ':' + DB.port, '/', DB.database))
  .catch(e => console.error('ATENÇÃO - sem conexão com o MySQL:', e.code, e.message));

app.listen(3000, () => console.log('Aberto em http://localhost:3000'));