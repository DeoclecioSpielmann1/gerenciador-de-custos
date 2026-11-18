const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const dotenv = require('dotenv');
const { atualizarEnv } = require('./env-utils');

const ENV_PATH = path.join(__dirname, '..', '.env');
const TENANT = 'consumers';
const SCOPE = 'https://outlook.office.com/SMTP.Send offline_access';

async function postForm(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data)
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error_description || body.error || 'Erro na autenticação Microsoft.');
    error.code = body.error;
    throw error;
  }
  return body;
}

async function obterRefreshToken(clientId) {
  const inicio = await postForm(
    'https://login.microsoftonline.com/' + TENANT + '/oauth2/v2.0/devicecode',
    { client_id: clientId, scope: SCOPE }
  );
  console.log('\n' + inicio.message + '\n');

  const fim = Date.now() + inicio.expires_in * 1000;
  let intervalo = Math.max(inicio.interval || 5, 1);
  while (Date.now() < fim) {
    await new Promise(resolve => setTimeout(resolve, intervalo * 1000));
    try {
      const tokens = await postForm(
        'https://login.microsoftonline.com/' + TENANT + '/oauth2/v2.0/token',
        {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: clientId,
          device_code: inicio.device_code
        }
      );
      if (!tokens.refresh_token) throw new Error('A Microsoft não retornou refresh token. Verifique a permissão offline_access.');
      return tokens.refresh_token;
    } catch (error) {
      if (error.code === 'authorization_pending') continue;
      if (error.code === 'slow_down') {
        intervalo += 5;
        continue;
      }
      throw error;
    }
  }
  throw new Error('O código de autenticação expirou. Execute a configuração novamente.');
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const atual = fs.existsSync(ENV_PATH) ? dotenv.parse(fs.readFileSync(ENV_PATH)) : {};
    const clientId = (await rl.question('Application (client) ID do app Microsoft: ')).trim();
    const email = (await rl.question('E-mail da conta Outlook.com: ')).trim().toLowerCase();
    if (!/^[\w.-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(email)) throw new Error('Informe um endereço de e-mail válido.');
    if (!/^[a-f\d-]{36}$/i.test(clientId)) throw new Error('Informe um Application (client) ID válido.');

    const refreshToken = await obterRefreshToken(clientId);
    const dados = {
      SMTP_AUTH: 'oauth2',
      SMTP_HOST: 'smtp-mail.outlook.com',
      SMTP_PORT: '587',
      SMTP_SECURE: '0',
      SMTP_USER: email,
      SMTP_PASS: '',
      SMTP_FROM: 'Gerenciador de Custos <' + email + '>',
      OUTLOOK_CLIENT_ID: clientId,
      OUTLOOK_REFRESH_TOKEN: refreshToken,
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
    console.error('\nNão foi possível configurar o Outlook:', error.message);
    process.exitCode = 1;
  });
}

