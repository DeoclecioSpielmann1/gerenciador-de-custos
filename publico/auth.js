/* auth.js — login/cadastro com senha (sessão no servidor) + modo "Conhecer o app".
   Usado em /login (desenha a tela) e no app (confere a sessão e expõe window.Auth). */
(function () {
  'use strict';
  const K_SESSAO = 'gc_sessao';          // cópia local só para o app.js saber nome/e-mail/demo
  const STORE = localStorage;
  const NA_LOGIN = location.pathname.replace(/\/+$/, '') === '/login';
  const $ = (s, r = document) => r.querySelector(s);

  /* ---------- validações (o servidor valida de novo) ---------- */
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
    },
    senha(v, cadastro) {
      if (!v) return 'Informe sua senha.';
      if (!cadastro) return '';
      if (v.length < 8) return 'Use pelo menos 8 caracteres.';
      if (new Blob([v]).size > 72) return 'Senha longa demais (máx. 72 caracteres).';
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

  /* ---------- sessão local ---------- */
  const lerSessao = () => { try { return JSON.parse(STORE.getItem(K_SESSAO)); } catch (e) { return null; } };
  const gravarSessao = s => { try { STORE.setItem(K_SESSAO, JSON.stringify(s)); } catch (e) { } };
  const limparSessao = () => { try { STORE.removeItem(K_SESSAO); } catch (e) { } };

  /* ---------- chamadas ao servidor ---------- */
  async function post(url, corpo) {
    let r;
    try {
      r = await fetch(url, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo || {})
      });
    } catch (e) {
      return { ok: false, status: 0, dados: { erro: 'Sem conexão com o servidor. Confira a rede e tente de novo.' } };
    }
    const dados = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, dados };
  }

  /* ---------- tela de login / cadastro ---------- */
  function renderLogin(modo) {
    const app = document.getElementById('app');
    if (!app) return;
    const cad = modo === 'cadastro';
    const campo = (id, rotulo, input) => `
      <div class="auth-campo">
        <label for="${id}">${rotulo}</label>${input}
        <small id="e-${id}" class="auth-erro" role="alert"></small>
      </div>`;

    app.innerHTML = `
      <section class="auth">
        <div class="auth-card">
          <div class="auth-marca"><span class="auth-logo" aria-hidden="true"></span><strong>Gerenciador de Custos</strong></div>
          <div class="auth-abas" role="tablist">
            <button type="button" role="tab" data-modo="entrar" aria-selected="${!cad}" class="${cad ? '' : 'on'}">Entrar</button>
            <button type="button" role="tab" data-modo="cadastro" aria-selected="${cad}" class="${cad ? 'on' : ''}">Criar conta</button>
          </div>
          <h1>${cad ? 'Crie sua conta' : 'Entre para organizar suas contas'}</h1>
          <p class="auth-sub">${cad ? 'Leva menos de um minuto.' : 'Use o e-mail e a senha do seu cadastro.'}</p>
          <form id="authForm" novalidate>
            ${cad ? campo('aNome', 'Nome completo',
              '<input id="aNome" name="nome" type="text" autocomplete="name" maxlength="80" aria-describedby="e-aNome">') : ''}
            ${campo('aEmail', 'E-mail',
              '<input id="aEmail" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" maxlength="120" aria-describedby="e-aEmail">')}
            ${cad ? campo('aTel', 'Telefone',
              '<input id="aTel" name="telefone" type="tel" autocomplete="tel-national" inputmode="numeric" placeholder="(49) 99999-9999" aria-describedby="e-aTel">') : ''}
            ${campo('aSenha', 'Senha', `
              <div class="auth-senha">
                <input id="aSenha" name="senha" type="password" maxlength="72"
                  autocomplete="${cad ? 'new-password' : 'current-password'}" aria-describedby="e-aSenha${cad ? ' dSenha' : ''}">
                <button type="button" class="auth-olho" aria-pressed="false" aria-controls="aSenha">Mostrar</button>
              </div>${cad ? '<small id="dSenha" class="auth-dica">Mínimo de 8 caracteres.</small>' : ''}`)}
            <p id="eGeral" class="auth-erro auth-erro-geral" role="alert"></p>
            <button class="auth-btn auth-btn-primario" type="submit" id="aEnviar">${cad ? 'Criar conta' : 'Entrar'}</button>
          </form>
          <div class="auth-ou"><span>ou</span></div>
          <button class="auth-btn auth-btn-sec" type="button" id="aDemo">Conhecer o app</button>
          <p class="auth-nota">No modo de teste você usa dados de exemplo e nada é salvo no seu cadastro.</p>
        </div>
      </section>`;

    const ids = { nome: 'aNome', email: 'aEmail', telefone: 'aTel', senha: 'aSenha' };
    const campos = {};
    Object.entries(ids).forEach(([k, id]) => { const i = $('#' + id, app); if (i) campos[k] = [i, $('#e-' + id, app)]; });

    const mostrar = (k, msg) => {
      const [inp, err] = campos[k];
      err.textContent = msg;
      inp.classList.toggle('invalido', !!msg);
      inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    const validar = k => { const m = V[k](campos[k][0].value, cad); mostrar(k, m); return !m; };

    Object.keys(campos).forEach(k => {
      campos[k][0].addEventListener('blur', () => { if (campos[k][0].value || campos[k][0].classList.contains('invalido')) validar(k); });
      campos[k][0].addEventListener('input', () => { if (campos[k][0].classList.contains('invalido')) validar(k); });
    });
    if (campos.telefone) campos.telefone[0].addEventListener('input', e => { e.target.value = mascaraTelefone(e.target.value); });

    app.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.modo !== modo) renderLogin(b.dataset.modo);
    }));

    const olho = $('.auth-olho', app);
    olho.addEventListener('click', () => {
      const ver = campos.senha[0].type === 'password';
      campos.senha[0].type = ver ? 'text' : 'password';
      olho.textContent = ver ? 'Ocultar' : 'Mostrar';
      olho.setAttribute('aria-pressed', ver);
      campos.senha[0].focus();
    });

    const form = $('#authForm', app), btn = $('#aEnviar', app), demo = $('#aDemo', app), geral = $('#eGeral', app);
    const ocupado = (sim, texto) => { btn.disabled = demo.disabled = sim; btn.textContent = texto; };
    const rotuloBtn = cad ? 'Criar conta' : 'Entrar';

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (btn.disabled) return;
      geral.textContent = '';
      const ok = Object.keys(campos).map(validar).every(Boolean);
      if (!ok) { form.querySelector('.invalido')?.focus(); return; }

      const corpo = { email: campos.email[0].value.trim().toLowerCase(), senha: campos.senha[0].value };
      if (cad) {
        corpo.nome = campos.nome[0].value.trim().replace(/\s+/g, ' ');
        corpo.telefone = campos.telefone[0].value.replace(/\D/g, '');
      }
      ocupado(true, cad ? 'Criando…' : 'Entrando…');
      const r = await post(cad ? '/api/cadastro' : '/api/login', corpo);

      if (r.ok) {
        gravarSessao({ demo: false, id: r.dados.id || null, nome: r.dados.nome || corpo.nome || '', email: corpo.email });
        location.replace('/');
        return;
      }
      ocupado(false, rotuloBtn);
      if (r.dados.erros) Object.entries(r.dados.erros).forEach(([k, m]) => campos[k] && mostrar(k, m));
      if (r.dados.erro) geral.textContent = r.dados.erro;
      else if (!r.dados.erros) geral.textContent = 'Não foi possível concluir. Tente novamente.';
      if (!cad && r.status === 401) { campos.senha[0].value = ''; campos.senha[0].focus(); }
      else form.querySelector('.invalido')?.focus();
    });

    demo.addEventListener('click', async () => {
      geral.textContent = '';
      ocupado(true, rotuloBtn);
      const r = await post('/api/demo');
      if (r.ok) { gravarSessao({ demo: true, nome: 'Visitante' }); location.replace('/'); return; }
      ocupado(false, rotuloBtn);
      geral.textContent = r.dados.erro || 'Não foi possível abrir o modo de teste.';
    });

    (campos.nome || campos.email)[0].focus();
  }

  /* ---------- no app: confere a sessão do servidor ---------- */
  async function verificar() {
    let r = null;
    try { r = await fetch('/api/me', { credentials: 'same-origin' }); } catch (e) { }
    if (r && r.status === 401) { limparSessao(); location.replace('/login'); return null; }
    if (r && r.ok) {                                   // o servidor é a fonte da verdade
      const d = await r.json().catch(() => null);
      if (d) { const s = { demo: !!d.demo, id: d.demo ? null : d.id, nome: d.nome, email: d.email }; gravarSessao(s); return s; }
    }
    const local = lerSessao();                         // servidor fora do ar: usa a cópia local
    if (!local) { location.replace('/login'); return null; }
    return local;
  }

  function faixaDemo() {
    if (document.getElementById('demoBar')) return;
    const bar = document.createElement('div');
    bar.id = 'demoBar'; bar.className = 'demo-bar';
    bar.innerHTML = '<span>Modo de teste: dados de exemplo, nada é salvo.</span><button type="button">Criar minha conta</button>';
    bar.querySelector('button').addEventListener('click', () => Auth.sair());
    document.body.append(bar);
    document.body.classList.add('com-demo-bar');
  }

  /* ---------- API pública ---------- */
  const Auth = {
    init(iniciarApp) {
      if (NA_LOGIN) return;                            // a tela de login se desenha sozinha
      verificar().then(s => { if (!s) return; if (s.demo) faixaDemo(); iniciarApp(s); });
    },
    sessao: lerSessao,
    isDemo: () => !!(lerSessao() || {}).demo,
    chave: base => (Auth.isDemo() ? 'demo_' + base : base),
    async sair() {
      try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { }
      limparSessao();
      location.replace('/login');
    },
    _validar: V
  };
  window.Auth = Auth;

  if (NA_LOGIN) {
    const abrir = () => renderLogin('entrar');
    if (document.getElementById('app')) abrir(); else document.addEventListener('DOMContentLoaded', abrir);
  }
})();