# Publicar para testes no Railway

O deploy cria um endereço HTTPS acessível por notebook, computador e celular. Não coloque senhas, tokens ou o arquivo `.env` no GitHub.

## 1. Enviar o código

Publique as alterações deste projeto no repositório GitHub e conecte esse repositório ao Railway. A branch padrão atual é `main`.

## 2. Criar os serviços

No projeto Railway:

1. Crie um serviço MySQL usando o template oficial do Railway e aguarde ficar ativo.
2. Crie um serviço Node.js a partir do repositório GitHub. O Railway detecta o `npm start`.

No serviço Node.js, abra **Variables** e crie as referências para o serviço MySQL. Se o nome do serviço de banco for `MySQL`, use:

```text
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASS=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
```

Se o serviço tiver outro nome, substitua `MySQL` pelo nome exibido no Railway.

Adicione também:

```text
TRUST_PROXY=1
COOKIE_SECURE=1
SESSION_SECRET=<valor aleatório gerado localmente>
```

Gere `SESSION_SECRET` localmente com:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Cadastre o resultado diretamente nas variáveis do Railway; não o envie pelo chat nem o versione.

## 3. Preparar o banco

No serviço Node.js, configure o comando **Pre-deploy** como:

```text
npm run db:init
```

O script aplica o esquema de [schema_mysql.sql](./schema_mysql.sql) no banco indicado pelas variáveis, sem criar ou selecionar um banco com nome fixo. Ele pode ser executado novamente em deploys posteriores.

## 4. Gerar o link HTTPS

Após o primeiro deploy, abra **Settings → Networking → Generate Domain** no serviço Node.js. Copie o domínio HTTPS gerado e cadastre a variável:

```text
APP_BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
```

O Railway disponibiliza `PORT` e `RAILWAY_PUBLIC_DOMAIN` automaticamente. Configure `/health` como health check do serviço; essa rota verifica a conexão ao banco.

## 5. Convidar testadores

Envie o domínio gerado. Os testadores podem escolher **modo de teste** para usar dados locais de demonstração, ou criar uma conta para testar dados associados a ela. Lançamentos e notas de uma conta ficam no banco e podem ser acessados ao entrar na mesma conta em outro dispositivo.

O modo de teste e as categorias personalizadas mantêm dados no navegador/dispositivo e não sincronizam entre aparelhos. O servidor Railway precisa permanecer ativo para o link funcionar.
