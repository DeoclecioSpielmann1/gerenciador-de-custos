const { validar } = require('./server');

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