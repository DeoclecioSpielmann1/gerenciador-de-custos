const request = require('supertest');
const express = require('express');
const session = require('express-session');

// Importamos ou replicamos a lógica de validação do server.js para testar isoladamente
function validar(b, cadastro) {
  const erros = {};
  const email = String(b.email || '').trim().toLowerCase();
  const senha = String(b.senha || '');
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

describe('Testes de Validação do Back-end', () => {
  test('Deve rejeitar e-mail inválido no cadastro', () => {
    const res = validar({ email: 'emailerrado.com', senha: 'senha1234', nome: 'Teste Silva', telefone: '11988887777' }, true);
    expect(res.erros.email).toBeDefined();
  });

  test('Deve aceitar dados de cadastro válidos', () => {
    const res = validar({ email: 'teste@email.com', senha: 'senhaSegura123', nome: 'Maria Silva', telefone: '11988887777' }, true);
    expect(Object.keys(res.erros).length).toBe(0);
    expect(res.dados.email).toBe('teste@email.com');
  });

  test('Deve rejeitar senha curta no cadastro', () => {
    const res = validar({ email: 'teste@email.com', senha: '123', nome: 'Maria Silva', telefone: '11988887777' }, true);
    expect(res.erros.senha).toBeDefined();
  });
});
// Simulação das funções de controle de tentativas de login do server.js
const falhas = new Map();
const bloqueado = k => { const f = falhas.get(k); return f && f.n >= 8 && Date.now() < f.ate; };
const falhou = k => { const f = falhas.get(k) || { n: 0 }; f.n++; f.ate = Date.now() + 15 * 60e3; falhas.set(k, f); };

describe('Testes de Segurança e Bloqueio de Login (Back-end)', () => {
  beforeEach(() => {
    falhas.clear();
  });

  test('Não deve bloquear o usuário na primeira tentativa com erro', () => {
    const chave = '127.0.0.1|teste@email.com';
    expect(bloqueado(chave)).toBe(false);
    falhou(chave);
    expect(bloqueado(chave)).toBe(false); // Precisa de 8 falhas para bloquear
  });

  test('Deve bloquear o usuário após atingir o limite de 8 tentativas', () => {
    const chave = '127.0.0.1|atacante@email.com';
    
    // Simula 8 falhas consecutivas
    for (let i = 0; i < 8; i++) {
      falhou(chave);
    }

    expect(bloqueado(chave)).toBe(true);
  });
});