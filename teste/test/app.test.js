// Funções utilitárias extraídas do front-end para teste unitário
function mesDe(d) { 
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); 
}

function mudaMes(ym, delta) { 
  const [a, m] = ym.split('-').map(Number); 
  return mesDe(new Date(a, m - 1 + delta, 1)); 
}

function nomeMes(ym) {
  const [a, m] = ym.split('-').map(Number);
  const n = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + a;
}

function parseValor(txt) {
  const n = parseFloat(String(txt).trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function brl(c, forcar) {
  const casas = (forcar || c % 100) ? 2 : 0;
  return 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

describe('Testes de Regras do Front-end (App)', () => {
  
  test('Deve avançar e retroceder os meses corretamente (mudaMes)', () => {
    const mesAtual = '2026-06';
    
    // Avançar 1 mês
    expect(mudaMes(mesAtual, 1)).toBe('2026-07');
    
    // Retroceder 1 mês
    expect(mudaMes(mesAtual, -1)).toBe('2026-05');
    
    // Virada de ano (avançar 7 meses de junho de 2026 vai para janeiro de 2027)
    expect(mudaMes(mesAtual, 7)).toBe('2027-01');
  });

  test('Deve formatar o nome do mês corretamente (nomeMes)', () => {
    expect(nomeMes('2026-06')).toBe('Junho 2026');
    expect(nomeMes('2026-12')).toBe('Dezembro 2026');
  });

  test('Deve converter strings monetárias em centavos perfeitamente (parseValor)', () => {
    expect(parseValor('150,50')).toBe(15050);
    expect(parseValor('1.200,00')).toBe(120000);
    expect(parseValor('45')).toBe(4500);
    expect(parseValor('inválido')).toBe(0);
  });

  test('Deve formatar centavos em Reais de forma limpa (brl)', () => {
    expect(brl(15050)).toBe('R$ 150,50');
    expect(brl(10000)).toBe('R$ 100'); // Sem centavos quando inteiro
  });

});