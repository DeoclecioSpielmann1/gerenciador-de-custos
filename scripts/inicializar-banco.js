const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || process.env.MYSQLHOST,
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER,
  password: process.env.DB_PASS || process.env.MYSQLPASSWORD,
  database: process.env.DB_NAME || process.env.MYSQLDATABASE
};

async function main() {
  if (!config.host || !config.user || !config.password || !config.database ||
    !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('Configure DB_HOST, DB_PORT, DB_USER, DB_PASS e DB_NAME (ou as variáveis MYSQL correspondentes).');
  }

  const arquivoSchema = path.join(__dirname, '..', 'schema_mysql.sql');
  const schema = fs.readFileSync(arquivoSchema, 'utf8')
    .replace(/^CREATE DATABASE IF NOT EXISTS gerenciador_custos[^;]*;\s*USE gerenciador_custos;\s*/mi, '');
  if (/^\s*(CREATE DATABASE|USE)\b/im.test(schema))
    throw new Error('O schema contém uma seleção de banco inesperada; nenhuma alteração foi aplicada.');

  const conexao = await mysql.createConnection({ ...config, multipleStatements: true });
  try {
    await conexao.query(schema);
    console.log('Esquema MySQL inicializado com sucesso em', config.database);
  } finally {
    await conexao.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Falha ao inicializar o banco:', error.code || error.message);
    process.exitCode = 1;
  });
}
