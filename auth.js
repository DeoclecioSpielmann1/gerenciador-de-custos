/* auth.js — tela de acesso (Nome, E-mail, Telefone) + modo "Conhecer o app" */
(function () {
  'use strict';
  const API_URL = '/api/usuarios';        // backend Node/MySQL (opcional)
  const K_SESSAO = 'gc_sessao';
  const K_LOCAL = 'gc_usuarios_local';    // reserva se a API estiver fora do ar

  /* Onde a sessão fica guardada:
     localStorage   = continua logado ao fechar o navegador
     sessionStorage = pede login a cada vez que abrir o navegador */
  const STORE = localStorage;

  /* ---------- validações ---------- */
  const V = {
    nome(v) {
      v = v.trim().replace(/\s+/g, ' ');
      if (!v) return 'Informe seu nome.';
      if (v.length < 3) return 'O nome precisa ter ao menos 3 letras.';
      if (v.length > 80) return 'O nome pode ter no máximo 80 caracteres.';
      if (!/^\p{L}[\p{L}'.\- ]*$/u.test(v)) return 'Use apenas letras no nome.';
      return '';
    },
    email(v) {
      v = v.trim();
      if (!v) return 'Informe seu e-mail.';
      if (v.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Digite um e-mail válido, como nome@email.com.';
      return '';
    },
    telefone(v) {
      const d = v.replace(/\D/g, '');
      if (!d) return 'Informe seu telefone.';
      if (d.length < 10 || d.length > 11) return 'Digite DDD + número (10 ou 11 dígitos).';
      const ddd = +d.slice(0, 2);
      if (ddd < 11 || ddd > 99) return 'O DDD informado não é válido.';
      if (d.length === 11 && d[2] !== '9') return 'Celular com 11 dígitos deve começar com 9 após o DDD.';
      return '';
    }
  };

  function mascaraTelefone(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  /* ---------- sessão ---------- */
  const lerSessao = () => { try { return JSON.parse(STORE.getItem(K_SESSAO)); } catch (e) { return null; } };
  const gravarSessao = (s) => { try { STORE.setItem(K_SESSAO, JSON.stringify(s)); } catch (e) { } };

  /* ---------- gravação do cadastro ---------- */
  async function salvarUsuario(u) {
    try {
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u)
      });
      const dados = await r.json().catch(() => ({}));
      if (r.status === 422) return { ok: false, erros: dados.erros || {} };
      if (!r.ok) throw new Error('API indisponível');
      return { ok: true, id: dados.id, banco: true };
    } catch (e) {
      // sem API (ou erro de rede): guarda neste navegador para não perder o cadastro
      try {
        const lista = JSON.parse(localStorage.getItem(K_LOCAL) || '[]');
        lista.push({ ...u, criadoEm: new Date().toISOString(), sincronizado: false });
        localStorage.setItem(K_LOCAL, JSON.stringify(lista));
      } catch (e2) { }
      return { ok: true, banco: false };
    }
  }

  /* ---------- tela de login ---------- */
  function renderLogin(aoEntrar) {
    const app = document.getElementById('app');
    if (!app || app.querySelector('.auth')) return;      // já está na tela
    app.innerHTML = `
      <section class="auth">
        <div class="auth-card">
          <div class="auth-marca"><span class="auth-logo" aria-hidden="true"></span><strong>Gerenciador de Custos</strong></div>
          <h1>Entre para organizar suas contas</h1>
          <p class="auth-sub">Preencha seus dados para começar. Leva menos de um minuto.</p>
          <form id="authForm" novalidate>
            <div class="auth-campo">
              <label for="aNome">Nome completo</label>
              <input id="aNome" name="nome" type="text" autocomplete="name" maxlength="80" aria-describedby="eNome">
              <small id="eNome" class="auth-erro" role="alert"></small>
            </div>
            <div class="auth-campo">
              <label for="aEmail">E-mail</label>
              <input id="aEmail" name="email" type="email" autocomplete="email" inputmode="email" maxlength="120" aria-describedby="eEmail">
              <small id="eEmail" class="auth-erro" role="alert"></small>
            </div>
            <div class="auth-campo">
              <label for="aTel">Telefone</label>
              <input id="aTel" name="telefone" type="tel" autocomplete="tel-national" inputmode="numeric" placeholder="(49) 99999-9999" aria-describedby="eTel">
              <small id="eTel" class="auth-erro" role="alert"></small>
            </div>
            <p id="eGeral" class="auth-erro auth-erro-geral" role="alert"></p>
            <button class="auth-btn auth-btn-primario" type="submit" id="aEnviar">Entrar</button>
          </form>
          <div class="auth-ou"><span>ou</span></div>
          <button class="auth-btn auth-btn-sec" type="button" id="aDemo">Conhecer o app</button>
          <p class="auth-nota">No modo de teste você usa dados de exemplo e nada é salvo no seu cadastro.</p>
        </div>
      </section>`;

    const campos = {
      nome: [app.querySelector('#aNome'), app.querySelector('#eNome')],
      email: [app.querySelector('#aEmail'), app.querySelector('#eEmail')],
      telefone: [app.querySelector('#aTel'), app.querySelector('#eTel')]
    };
    const mostrar = (k, msg) => {
      const [inp, err] = campos[k];
      err.textContent = msg;
      inp.classList.toggle('invalido', !!msg);
      inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    const validar = (k) => { const m = V[k](campos[k][0].value); mostrar(k, m); return !m; };

    Object.keys(campos).forEach((k) => {
      campos[k][0].addEventListener('blur', () => validar(k));
      campos[k][0].addEventListener('input', () => { if (campos[k][0].classList.contains('invalido')) validar(k); });
    });
    campos.telefone[0].addEventListener('input', (e) => { e.target.value = mascaraTelefone(e.target.value); });

    const form = app.querySelector('#authForm');
    const btn = app.querySelector('#aEnviar');
    const geral = app.querySelector('#eGeral');

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (btn.disabled) return;
      geral.textContent = '';
      const ok = ['nome', 'email', 'telefone'].map(validar).every(Boolean);
      if (!ok) { const p = form.querySelector('.invalido'); if (p) p.focus(); return; }

      const usuario = {
        nome: campos.nome[0].value.trim().replace(/\s+/g, ' '),
        email: campos.email[0].value.trim().toLowerCase(),
        telefone: campos.telefone[0].value.replace(/\D/g, '')
      };
      btn.disabled = true; btn.textContent = 'Salvando…';
      const res = await salvarUsuario(usuario);
      btn.disabled = false; btn.textContent = 'Entrar';

      if (!res.ok) {
        if (res.erros) Object.entries(res.erros).forEach(([k, m]) => campos[k] && mostrar(k, m));
        else geral.textContent = res.geral || 'Não foi possível salvar. Tente novamente.';
        return;
      }
      gravarSessao({ demo: false, id: res.id || null, nome: usuario.nome, email: usuario.email });
      aoEntrar(lerSessao());
    });

    app.querySelector('#aDemo').addEventListener('click', () => {
      gravarSessao({ demo: true, nome: 'Visitante' });
      aoEntrar(lerSessao());
    });
    campos.nome[0].focus();
  }

  function faixaDemo() {
    if (document.getElementById('demoBar')) return;
    const bar = document.createElement('div');
    bar.id = 'demoBar'; bar.className = 'demo-bar';
    bar.innerHTML = '<span>Modo de teste: os dados abaixo são de exemplo e não são salvos.</span><button type="button">Criar minha conta</button>';
    bar.querySelector('button').addEventListener('click', () => Auth.sair());
    document.body.prepend(bar);
    document.body.classList.add('com-demo-bar');
  }

  /* ---------- API pública ---------- */
  let iniciar = null;                                   // função do app, definida por Auth.init
  const entrar = (s) => {
    if (s.demo) faixaDemo();
    if (iniciar) iniciar(s); else location.reload();    // reload só se o app.js ainda não registrou
  };

  const Auth = {
    init(iniciarApp) {
      iniciar = iniciarApp;
      const s = lerSessao();
      if (s) entrar(s); else renderLogin(entrar);       // renderLogin ignora se já estiver na tela
    },
    sessao: lerSessao,
    isDemo: () => !!(lerSessao() || {}).demo,
    chave: (base) => (Auth.isDemo() ? 'demo_' + base : base),
    sair() { try { STORE.removeItem(K_SESSAO); } catch (e) { } location.reload(); },
    _validar: V
  };
  window.Auth = Auth;

  /* desenha o login assim que o #app existir, sem esperar o app.js */
  const cedo = () => { if (!lerSessao()) renderLogin(entrar); };
  if (document.getElementById('app')) cedo();
  else document.addEventListener('DOMContentLoaded', cedo);
})();