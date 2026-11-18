const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const dotenv = require('dotenv');
const { atualizarEnv } = require('./env-utils');

const ENV_PATH = path.join(__dirname, '..', '.env');
const SCOPE = 'https://mail.google.com/';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function postForm(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data)
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error_description || body.error || 'Erro na autenticação Google.');
    error.code = body.error;
    throw error;
  }
  return body;
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function obterCodigo(credentials) {
  const state = base64url(crypto.randomBytes(32));
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  let finalizar;
  let rejeitar;
  let concluido = false;
  let timeout;
  const codigo = new Promise((resolve, reject) => {
    finalizar = resolve;
    rejeitar = reject;
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'GET' || url.pathname !== '/') {
      res.writeHead(404).end();
      return;
    }

    const terminar = (error, code) => {
      if (concluido) return;
      concluido = true;
      clearTimeout(timeout);
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Autorização não concluída. Volte ao terminal.');
        rejeitar(error);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Autorização concluída. Volte ao terminal.');
        finalizar(code);
      }
      server.close();
    };

    if (url.searchParams.get('state') !== state)
      return terminar(new Error('Resposta OAuth inválida (state não confere).'));
    if (url.searchParams.has('error'))
      return terminar(new Error('Autorização Google recusada: ' + url.searchParams.get('error')));
    const code = url.searchParams.get('code');
    if (!code) return terminar(new Error('A resposta Google não continha código de autorização.'));
    terminar(null, code);
  });

  server.on('error', error => {
    if (concluido) return;
    concluido = true;
    clearTimeout(timeout);
    rejeitar(error);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const redirectUri = 'http://127.0.0.1:' + address.port;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: credentials.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString();

  console.log('\nAbra esta URL no navegador e autorize o acesso à conta Gmail:\n' + authUrl + '\n');
  timeout = setTimeout(() => {
    if (concluido) return;
    concluido = true;
    server.close();
    rejeitar(new Error('A autorização expirou. Execute a configuração novamente.'));
  }, 5 * 60 * 1000);

  try {
    const code = await codigo;
    return { code, redirectUri, verifier };
  } finally {
    clearTimeout(timeout);
    if (server.listening) server.close();
  }
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const caminho = (await rl.question('Caminho do JSON OAuth do tipo Desktop app do Google: '))
      .trim().replace(/^["']|["']$/g, '');
    const email = (await rl.question('E-mail da conta Google/Gmail: ')).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Informe um endereço de e-mail válido.');

    const json = JSON.parse(fs.readFileSync(path.resolve(caminho), 'utf8'));
    const credentials = json.installed;
    if (!credentials || !credentials.client_id || !credentials.client_secret)
      throw new Error('O JSON precisa ser de um cliente OAuth do tipo Desktop app.');

    const { code, redirectUri, verifier } = await obterCodigo(credentials);
    const tokens = await postForm(TOKEN_URL, {
      code,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier
    });
    if (!tokens.refresh_token)
      throw new Error('O Google não retornou refresh token. Revogue o acesso anterior da aplicação e execute novamente.');

    const atual = fs.existsSync(ENV_PATH) ? dotenv.parse(fs.readFileSync(ENV_PATH)) : {};
    const dados = {
      SMTP_AUTH: 'gmail-oauth2',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '587',
      SMTP_SECURE: '0',
      SMTP_USER: email,
      SMTP_PASS: '',
      SMTP_FROM: 'Gerenciador de Custos <' + email + '>',
      GMAIL_CLIENT_ID: credentials.client_id,
      GMAIL_CLIENT_SECRET: credentials.client_secret,
      GMAIL_REFRESH_TOKEN: tokens.refresh_token,
      APP_BASE_URL: process.env.APP_BASE_URL || atual.APP_BASE_URL || 'http://localhost:3000'
    };
    let conteudo = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    for (const [key, value] of Object.entries(dados)) conteudo = atualizarEnv(conteudo, key, value);
    fs.writeFileSync(ENV_PATH, conteudo, { encoding: 'utf8', mode: 0o600 });
    console.log('\nConfiguração salva em .env. Reinicie o servidor para habilitar o envio.');
    console.log('O refresh token não foi exibido. Não compartilhe nem publique o arquivo .env.');
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('\nNão foi possível configurar o Gmail:', error.message);
    process.exitCode = 1;
  });
}
