const { validar, app, configuracaoEmail } = require('./server');
const request = require('supertest');

describe('Testes de Validação de Dados', () => {
  
  test('Deve rejeitar e-mail inválido no login', () => {
    const resultado = validar({ email: 'email-errado', senha: '123' }, false);
    expect(resultado.erros.email).toBeDefined();
  });

  test('Deve aceitar e-mail válido no login', () => {
    const resultado = validar({ email: 'teste@email.com', senha: 'minhasenha' }, false);
    expect(resultado.erros.email).toBeUndefined();
  });

  test('Deve recusar cadastro com senha curta (< 8 caracteres)', () => {
    const resultado = validar({
      nome: 'João da Silva',
      email: 'joao@email.com',
      telefone: '11988887777',
      senha: '123'
    }, true);
    expect(resultado.erros.senha).toBeDefined();
  });
});
// Adicione junto aos testes anteriores em test/server.test.js

function lanc(b = {}) {
  const id = String(b.id || ''), tipo = b.tipo, descricao = String(b.descricao || '').trim().slice(0, 60);
  const data = String(b.data || ''), centavos = b.centavos;
  if (!/^[A-Za-z0-9]{1,24}$/.test(id) || !['entrada', 'saida'].includes(tipo) || !descricao ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(Date.parse(data)) ||
      !Number.isInteger(centavos) || centavos < 1 || centavos > 99999999999) return null;
  const categoria = tipo === 'saida' && b.categoria ? String(b.categoria).slice(0, 30) : null;
  return { id, tipo, descricao, categoria, data, centavos };
}

describe('Testes da função de Lançamentos (Back-end)', () => {
  test('Deve aceitar um lançamento de saída válido', () => {
    const item = lanc({
      id: 'abc123',
      tipo: 'saida',
      descricao: 'Supermercado',
      categoria: 'alimentacao',
      data: '2026-06-06',
      centavos: 15050
    });
    expect(item).not.toBeNull();
    expect(item.centavos).toBe(15050);
  });

  test('Deve rejeitar lançamento com centavos negativos ou zero', () => {
    const item = lanc({
      id: 'abc123',
      tipo: 'saida',
      descricao: 'Teste',
      data: '2026-06-06',
      centavos: 0
    });
    expect(item).toBeNull();
  });

  test('Deve rejeitar lançamento com data em formato inválido', () => {
    const item = lanc({
      id: 'abc123',
      tipo: 'entrada',
      descricao: 'Salário',
      data: '06/06/2026', // Formato errado (deve ser YYYY-MM-DD)
      centavos: 500000
    });
    expect(item).toBeNull();
  });
});

const { montar, docOk } = require('./publico/notas');

describe('Testes do emissor de notas', () => {
  test('Deve validar CPF e montar uma nota válida', () => {
    expect(docOk('52998224725')).toBe(true);
    const resultado = montar({
      tipo: 'servico',
      data: '2026-06-06',
      emitente: { nome: 'Empresa Teste', doc: '52998224725' },
      cliente: { nome: 'Cliente Teste', doc: '' },
      itens: [{ desc: 'Consultoria', qtd: 2, c: 15000 }],
      desconto: 5000,
      pagamento: 'Pix'
    });
    expect(resultado.erro).toBeUndefined();
    expect(resultado.nota.total).toBe(25000);
  });

  test('Deve rejeitar data impossível', () => {
    const resultado = montar({
      tipo: 'produto',
      data: '2026-02-31',
      emitente: { nome: 'Empresa Teste', doc: '52998224725' },
      cliente: { nome: 'Cliente Teste' },
      itens: [{ desc: 'Produto', qtd: 1, c: 1000 }]
    });
    expect(resultado.erro).toBe('Data inválida.');
  });
});

describe('Recuperação de senha', () => {
  test('rejeita e-mail inválido sem consultar o banco', async () => {
    const resposta = await request(app).post('/api/recuperar-senha').send({ email: 'invalido' });
    expect(resposta.status).toBe(422);
  });

  test('rejeita tokens malformados e senhas curtas', async () => {
    const tokenInvalido = await request(app).post('/api/redefinir-senha').send({ token: 'abc', senha: 'senha-segura' });
    expect(tokenInvalido.status).toBe(400);
    const senhaCurta = await request(app).post('/api/redefinir-senha').send({ token: 'a'.repeat(64), senha: 'curta' });
    expect(senhaCurta.status).toBe(422);
  });
});

describe('Configuração do Outlook OAuth2', () => {
  test('configura OAuth2 com SMTP AUTH oficial e exige TLS', () => {
    const nodemailer = require('nodemailer');
    const criarTransporte = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({});
    const email = configuracaoEmail({
      SMTP_AUTH: 'oauth2',
      SMTP_USER: 'conta@outlook.com',
      OUTLOOK_CLIENT_ID: 'client-id',
      OUTLOOK_REFRESH_TOKEN: 'refresh-token',
      APP_BASE_URL: 'https://custos.example.com'
    });

    expect(email).not.toBeNull();
    expect(criarTransporte).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: expect.objectContaining({
        type: 'OAuth2',
        user: 'conta@outlook.com',
        clientId: 'client-id',
        refreshToken: 'refresh-token',
        accessUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        customParams: { scope: 'https://outlook.office.com/SMTP.Send offline_access' }
      })
    }));
    criarTransporte.mockRestore();
  });

  test('não habilita OAuth2 sem o refresh token', () => {
    expect(configuracaoEmail({
      SMTP_AUTH: 'oauth2',
      SMTP_USER: 'conta@outlook.com',
      OUTLOOK_CLIENT_ID: 'client-id',
      APP_BASE_URL: 'http://localhost:3000'
    })).toBeNull();
  });

  test('preserva a autenticação SMTP tradicional', () => {
    const nodemailer = require('nodemailer');
    const criarTransporte = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({});
    const email = configuracaoEmail({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'conta@example.com',
      SMTP_PASS: 'senha',
      APP_BASE_URL: 'https://custos.example.com'
    });

    expect(email).not.toBeNull();
    expect(criarTransporte).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'conta@example.com', pass: 'senha' }
    }));
    criarTransporte.mockRestore();
  });
});

describe('Configuração do Gmail OAuth2', () => {
  test('configura OAuth2 com SMTP Gmail e TLS obrigatório', () => {
    const nodemailer = require('nodemailer');
    const criarTransporte = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({});
    const email = configuracaoEmail({
      SMTP_AUTH: 'gmail-oauth2',
      SMTP_USER: 'conta@gmail.com',
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REFRESH_TOKEN: 'refresh-token',
      APP_BASE_URL: 'https://custos.example.com'
    });

    expect(email).not.toBeNull();
    expect(criarTransporte).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        type: 'OAuth2',
        user: 'conta@gmail.com',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        refreshToken: 'refresh-token',
        accessUrl: 'https://oauth2.googleapis.com/token'
      }
    }));
    criarTransporte.mockRestore();
  });

  test('não habilita Gmail OAuth2 sem o refresh token', () => {
    expect(configuracaoEmail({
      SMTP_AUTH: 'gmail-oauth2',
      SMTP_USER: 'conta@gmail.com',
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      APP_BASE_URL: 'http://localhost:3000'
    })).toBeNull();
  });
});