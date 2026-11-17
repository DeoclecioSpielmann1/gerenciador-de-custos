/* notas-app.js — emissor de notas (documento auxiliar, SEM valor fiscal). */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const digitos = v => String(v || '').replace(/\D/g, '');
  const parseBRL = v => parseInt(digitos(v), 10) || 0;
  const pad = n => String(n).padStart(6, '0');
  const fmtData = d => String(d).split('-').reverse().join('/');
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const demo = () => !!(window.Auth && Auth.isDemo());
  const PAGAMENTOS = ['Pix', 'Dinheiro', 'Cartão', 'Boleto', 'A prazo'];

  /* ---------- CPF / CNPJ ---------- */
  function docValido(v) {
    const d = digitos(v);
    if (![11, 14].includes(d.length) || /^(\d)\1+$/.test(d)) return false;
    const dv = (b, p) => { let s = 0; for (let i = 0; i < p.length; i++) s += +b[i] * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    if (d.length === 11) return dv(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]) === +d[9] && dv(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === +d[10];
    const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return dv(d, p1) === +d[12] && dv(d, [6, ...p1]) === +d[13];
  }
  function maskDoc(v) {
    const d = digitos(v).slice(0, 14);
    if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  }

  /* ---------- armazenamento (servidor, ou localStorage no modo de teste) ---------- */
  const K_DEMO = 'demo_nf_notas';
  const lerDemo = () => { try { return JSON.parse(localStorage.getItem(K_DEMO)) || []; } catch (e) { return []; } };
  const gravDemo = l => { try { localStorage.setItem(K_DEMO, JSON.stringify(l)); } catch (e) { } };
  const kEmit = () => Auth.chave('nf_emitente');
  const lerEmit = () => { try { return JSON.parse(localStorage.getItem(kEmit())) || {}; } catch (e) { return {}; } };
  const salvarEmit = e => { try { localStorage.setItem(kEmit(), JSON.stringify(e)); } catch (x) { } };
  const soma = itens => itens.reduce((s, i) => s + i.qtd * i.c, 0);

  async function chamar(url, opc) {
    let r;
    try { r = await fetch(url, { credentials: 'same-origin', ...opc }); }
    catch (e) { throw new Error('Sem conexão com o servidor. Confira a rede e tente de novo.'); }
    if (r.status === 401) { location.replace('/login'); throw new Error('Sessão expirada.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não foi possível concluir. Tente novamente.');
    return j;
  }
  const POST = corpo => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
  const Api = {
    async listar() { return demo() ? lerDemo() : chamar('/api/notas'); },
    async emitir(d) {
      if (!demo()) return chamar('/api/notas', POST(d));
      const l = lerDemo(), sub = soma(d.itens);
      const n = { ...d, numero: l.reduce((m, x) => Math.max(m, x.numero), 0) + 1, status: 'emitida', subtotal: sub, total: sub - d.desconto, criada_em: new Date().toISOString() };
      n.emitente = { ...d.emitente, doc: digitos(d.emitente.doc) }; n.cliente = { ...d.cliente, doc: digitos(d.cliente.doc) };
      l.unshift(n); gravDemo(l); return n;
    },
    async cancelar(n) {
      if (!demo()) return chamar('/api/notas/' + n + '/cancelar', POST());
      gravDemo(lerDemo().map(x => x.numero === n ? { ...x, status: 'cancelada' } : x)); return {};
    }
  };

  /* ---------- estado ---------- */
  const S = { aba: 'emitir', lista: [], ver: null, rasc: null, carregando: false, erroLista: '', seq: 0 };

  /* ---------- telas ---------- */
  const F = (id, rot, val, attrs = '') =>
    `<div class="field"><label class="lbl" for="${id}">${rot}</label><input id="${id}" value="${esc(val)}" ${attrs} aria-describedby="m-${id}"><small class="msg" id="m-${id}" role="alert"></small></div>`;

  const itemHTML = it => { const i = S.seq++; return `
    <div class="it">
      <div class="field it-d"><label class="lbl" for="d${i}">Descrição</label><input id="d${i}" data-f="desc" maxlength="80" value="${esc(it.desc)}" autocomplete="off"></div>
      <div class="field"><label class="lbl" for="q${i}">Qtd.</label><input id="q${i}" data-f="qtd" inputmode="numeric" maxlength="4" value="${it.qtd || 1}"></div>
      <div class="field"><label class="lbl" for="v${i}">Valor unitário</label><input id="v${i}" data-f="c" inputmode="numeric" placeholder="R$ 0,00" value="${it.c ? brl(it.c) : ''}"></div>
      <output class="it-s" aria-label="Subtotal do item">${brl((it.qtd || 0) * (it.c || 0))}</output>
      <button type="button" class="ib del" data-rm aria-label="Remover item">✕</button>
    </div>`; };

  function telaEmitir() {
    const e = lerEmit();
    const d = S.rasc || { tipo: 'servico', data: hoje(), emitente: { nome: e.nome || '', doc: maskDoc(e.doc || ''), endereco: e.endereco || '' },
      cliente: { nome: '', doc: '' }, itens: [{ desc: '', qtd: 1, c: 0 }], desconto: 0, pagamento: 'Pix', obs: '', lanc: true };
    return `
    <form id="nf" class="nf-grid" novalidate>
      <section class="card c6"><h2>Emitente</h2>
        ${F('eNome', 'Nome ou razão social', d.emitente.nome, 'maxlength="80" autocomplete="organization"')}
        ${F('eDoc', 'CPF ou CNPJ', d.emitente.doc, 'inputmode="numeric" maxlength="18"')}
        ${F('eEnd', 'Endereço (opcional)', d.emitente.endereco, 'maxlength="140" autocomplete="street-address"')}
      </section>
      <section class="card c6"><h2>Cliente</h2>
        ${F('cNome', 'Nome do cliente', d.cliente.nome, 'maxlength="80"')}
        ${F('cDoc', 'CPF ou CNPJ (opcional)', d.cliente.doc, 'inputmode="numeric" maxlength="18"')}
        <div class="two">
          <div class="field"><span class="lbl">Tipo da nota</span>
            <div class="seg" role="group" aria-label="Tipo da nota">
              <button type="button" data-tipo="servico" class="${d.tipo === 'servico' ? 'on' : ''}">Serviço</button>
              <button type="button" data-tipo="produto" class="${d.tipo === 'produto' ? 'on' : ''}">Venda</button>
            </div></div>
          ${F('nData', 'Data', d.data, 'type="date"')}
        </div>
      </section>
      <section class="card"><h2>Itens</h2>
        <div id="itens">${d.itens.map(itemHTML).join('')}</div>
        <small class="msg" id="m-eItens" role="alert"></small>
        <button type="button" class="btn alt sm" data-add>+ Adicionar item</button>
      </section>
      <section class="card c7"><h2>Pagamento</h2>
        <div class="chips" role="group" aria-label="Forma de pagamento">
          ${PAGAMENTOS.map(p => `<button type="button" class="chip ${d.pagamento === p ? 'on' : ''}" data-pg="${p}">${p}</button>`).join('')}
        </div>
        <div class="field"><label class="lbl" for="nObs">Observações (opcional)</label><input id="nObs" maxlength="300" value="${esc(d.obs)}"></div>
        <label class="nf-check"><input type="checkbox" id="nLanc" ${d.lanc ? 'checked' : ''} ${demo() ? 'disabled' : ''}>
          <span>Lançar o total como entrada no caixa${demo() ? ' (indisponível no modo de teste)' : ''}</span></label>
      </section>
      <section class="card c5"><h2>Total</h2>
        <div class="tot"><span class="lbl">Subtotal</span><span id="nSub">${brl(0)}</span></div>
        ${F('nDesc', 'Desconto', d.desconto ? brl(d.desconto) : '', 'inputmode="numeric" placeholder="R$ 0,00"')}
        <div class="tot"><span class="lbl">Total</span><b id="nTot">${brl(0)}</b></div>
        <p class="msg" id="eGeral" role="alert"></p>
        <button class="btn go" type="submit" id="bEmitir">Emitir nota</button>
      </section>
    </form>`;
  }

  function telaLista() {
    if (S.carregando) return '<p class="empty">Carregando notas…</p>';
    if (S.erroLista) return `<p class="empty msg">${esc(S.erroLista)}</p>`;
    if (!S.lista.length) return '<p class="empty">Nenhuma nota emitida ainda. Use a aba “Emitir nota” para criar a primeira.</p>';
    return `<div class="list card">${S.lista.map(n => `
      <button type="button" class="row" data-n="${n.numero}">
        <span class="ico" aria-hidden="true">🧾</span>
        <span class="t"><b>Nº ${pad(n.numero)} · ${esc(n.cliente.nome)}</b><small>${fmtData(n.data)} · ${esc(n.pagamento)}${n.status === 'cancelada' ? ' · cancelada' : ''}</small></span>
        <span class="amt ${n.status === 'cancelada' ? '' : 'in'}">${brl(n.total)}</span>
      </button>`).join('')}</div>`;
  }

  function telaVer(n) {
    const cancel = n.status === 'cancelada';
    const linhas = n.itens.map(i => `<tr><td>${esc(i.desc)}</td><td class="r">${i.qtd}</td><td class="r">${brl(i.c)}</td><td class="r">${brl(i.qtd * i.c)}</td></tr>`).join('');
    return `
    <div class="nf-bar no-print">
      <button type="button" class="btn alt" data-a="voltar">← Notas emitidas</button>
      <button type="button" class="btn go" data-a="imprimir">Imprimir ou salvar em PDF</button>
      <button type="button" class="btn alt" data-a="nova">Emitir outra nota</button>
      ${cancel ? '' : '<button type="button" class="btn ghost" data-a="cancelar">Cancelar nota</button>'}
    </div>
    <article class="doc ${cancel ? 'cancelada' : ''}">
      <header class="doc-h">
        <div><h2 class="doc-t">${n.tipo === 'produto' ? 'Nota de venda' : 'Nota de serviço'} nº ${pad(n.numero)}</h2>
          <p class="lbl">Emitida em ${fmtData(n.data)}</p></div>
        ${cancel ? '<strong class="selo">Cancelada</strong>' : ''}
      </header>
      <div class="doc-p">
        <section><h3>Emitente</h3><p><b>${esc(n.emitente.nome)}</b></p><p>${esc(maskDoc(n.emitente.doc))}</p>${n.emitente.endereco ? `<p>${esc(n.emitente.endereco)}</p>` : ''}</section>
        <section><h3>Cliente</h3><p><b>${esc(n.cliente.nome)}</b></p>${n.cliente.doc ? `<p>${esc(maskDoc(n.cliente.doc))}</p>` : ''}</section>
      </div>
      <div class="tw"><table><thead><tr><th>Descrição</th><th class="r">Qtd.</th><th class="r">Unitário</th><th class="r">Total</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <div class="doc-tot">
        <div><span>Subtotal</span><span>${brl(n.subtotal)}</span></div>
        ${n.desconto ? `<div><span>Desconto</span><span>− ${brl(n.desconto)}</span></div>` : ''}
        <div class="g"><span>Total</span><span>${brl(n.total)}</span></div>
        <div><span>Pagamento</span><span>${esc(n.pagamento)}</span></div>
      </div>
      ${n.obs ? `<section><h3>Observações</h3><p>${esc(n.obs)}</p></section>` : ''}
      <p class="doc-f">Documento auxiliar sem valor fiscal. Não substitui NF-e, NFS-e ou NFC-e.</p>
    </article>`;
  }

  function render() {
    const abas = S.ver ? '' : `
      <div class="seg no-print" role="tablist">
        <button type="button" role="tab" data-aba="emitir" aria-selected="${S.aba === 'emitir'}" class="${S.aba === 'emitir' ? 'on' : ''}">Emitir nota</button>
        <button type="button" role="tab" data-aba="lista" aria-selected="${S.aba === 'lista'}" class="${S.aba === 'lista' ? 'on' : ''}">Notas emitidas</button>
      </div>
      <p class="nf-aviso">Gera um documento para controle e recibo. Para nota fiscal oficial (NF-e, NFS-e), use o emissor da sua prefeitura ou da SEFAZ.</p>`;
    $('#app').innerHTML = `<header class="nf-head"><a class="sq no-print" href="/" aria-label="Voltar ao painel">←</a><h1>Emissor de notas</h1><span></span></header>${abas}` +
      (S.ver ? telaVer(S.ver) : S.aba === 'emitir' ? telaEmitir() : telaLista());
    if (!S.ver && S.aba === 'emitir') recalc();
  }

  /* ---------- formulário ---------- */
  function coletar() {
    const g = id => $('#' + id).value;
    return {
      tipo: $('[data-tipo].on').dataset.tipo, data: g('nData'),
      emitente: { nome: g('eNome'), doc: g('eDoc'), endereco: g('eEnd') },
      cliente: { nome: g('cNome'), doc: g('cDoc') },
      itens: $$('.it').map(r => ({ desc: $('[data-f=desc]', r).value, qtd: parseInt($('[data-f=qtd]', r).value, 10) || 0, c: parseBRL($('[data-f=c]', r).value) })),
      desconto: parseBRL(g('nDesc')), pagamento: $('[data-pg].on').dataset.pg, obs: g('nObs'), lanc: $('#nLanc').checked
    };
  }
  function recalc() {
    if (!$('#nf')) return;
    const d = coletar();
    $$('.it').forEach((r, i) => { $('.it-s', r).textContent = brl(d.itens[i].qtd * d.itens[i].c); });
    const sub = soma(d.itens);
    $('#nSub').textContent = brl(sub);
    $('#nTot').textContent = brl(Math.max(sub - d.desconto, 0));
  }
  function validar(d) {
    const e = {}, sub = soma(d.itens);
    if (d.emitente.nome.trim().length < 3) e.eNome = 'Informe o nome ou a razão social.';
    if (!docValido(d.emitente.doc)) e.eDoc = 'CPF ou CNPJ inválido.';
    if (d.cliente.nome.trim().length < 2) e.cNome = 'Informe o nome do cliente.';
    if (digitos(d.cliente.doc) && !docValido(d.cliente.doc)) e.cDoc = 'CPF ou CNPJ inválido.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) e.nData = 'Informe uma data válida.';
    else {
      const [a, m, dia] = d.data.split('-').map(Number);
      const dt = new Date(a, m - 1, dia);
      if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== dia) e.nData = 'Informe uma data válida.';
    }
    if (d.itens.some(i => !i.desc.trim() || i.qtd < 1 || i.c < 1)) e.eItens = 'Preencha descrição, quantidade e valor de todos os itens.';
    else if (d.desconto >= sub && d.desconto > 0) e.nDesc = 'O desconto deve ser menor que o subtotal.';
    return e;
  }
  function mostrarErros(e) {
    $$('#nf .msg').forEach(m => { m.textContent = ''; });
    $$('#nf input').forEach(i => i.removeAttribute('aria-invalid'));
    Object.entries(e).forEach(([id, msg]) => { const m = $('#m-' + id); if (m) m.textContent = msg; const i = $('#' + id); if (i) i.setAttribute('aria-invalid', 'true'); });
    const p = Object.keys(e)[0];
    if (p) ($('#' + p) || $('#itens input'))?.focus();
  }
  async function lancarEntrada(n) {
    if (n.total > 99999999999) return false;
    try {
      const r = await fetch('/api/lancamentos', { credentials: 'same-origin', ...POST({
        id: 'nf' + n.numero + Date.now().toString(36), tipo: 'entrada',
        descricao: ('Nota ' + pad(n.numero) + ' · ' + n.cliente.nome).slice(0, 60), data: n.data, centavos: n.total }) });
      return r.ok;
    } catch (e) { return false; }
  }
  async function emitir() {
    const d = coletar(), e = validar(d);
    mostrarErros(e);
    if (Object.keys(e).length) return;
    const btn = $('#bEmitir'); btn.disabled = true; btn.textContent = 'Emitindo…';
    try {
      const n = await Api.emitir(d);
      salvarEmit({ nome: d.emitente.nome.trim(), doc: digitos(d.emitente.doc), endereco: d.emitente.endereco.trim() });
      let aviso = '';
      if (d.lanc && !demo()) aviso = (await lancarEntrada(n)) ? ' Entrada registrada no caixa.' : ' Não foi possível registrar a entrada no caixa.';
      S.rasc = null; S.ver = n; render(); window.scrollTo(0, 0);
      toast('Nota nº ' + pad(n.numero) + ' emitida.' + aviso);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Emitir nota';
      $('#eGeral').textContent = err.message;
    }
  }

  /* ---------- navegação ---------- */
  async function abrirLista() {
    S.ver = null; S.aba = 'lista'; S.carregando = true; render();
    try { S.lista = await Api.listar(); S.erroLista = ''; } catch (e) { S.erroLista = e.message; }
    S.carregando = false; render();
  }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast no-print'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.append(t); setTimeout(() => t.remove(), 4000);
  }

  function ligar() {
    const app = $('#app');
    app.addEventListener('submit', ev => { ev.preventDefault(); emitir(); });
    app.addEventListener('click', async ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.aba) {
        if (S.aba === 'emitir' && $('#nf')) S.rasc = coletar();
        if (b.dataset.aba === 'lista') return abrirLista();
        S.aba = 'emitir'; return render();
      }
      if (b.dataset.tipo) { $$('[data-tipo]').forEach(x => x.classList.toggle('on', x === b)); return; }
      if (b.dataset.pg) { $$('[data-pg]').forEach(x => x.classList.toggle('on', x === b)); return; }
      if ('add' in b.dataset) { $('#itens').insertAdjacentHTML('beforeend', itemHTML({ desc: '', qtd: 1, c: 0 })); $('#itens .it:last-child input').focus(); return; }
      if ('rm' in b.dataset) { if ($$('.it').length > 1) { b.closest('.it').remove(); recalc(); } return; }
      if (b.dataset.n) { S.ver = S.lista.find(n => n.numero === +b.dataset.n) || null; render(); window.scrollTo(0, 0); return; }
      const a = b.dataset.a;
      if (a === 'voltar') return abrirLista();
      if (a === 'nova') { S.ver = null; S.aba = 'emitir'; S.rasc = null; return render(); }
      if (a === 'imprimir') return window.print();
      if (a === 'cancelar') {
        if (!confirm('Cancelar a nota nº ' + pad(S.ver.numero) + '? Isso não pode ser desfeito.\nSe ela gerou uma entrada no caixa, exclua o lançamento no painel.')) return;
        try { await Api.cancelar(S.ver.numero); S.ver = { ...S.ver, status: 'cancelada' }; render(); toast('Nota cancelada.'); }
        catch (e) { toast(e.message); }
      }
    });
    app.addEventListener('input', ev => {
      const t = ev.target;
      if (t.matches('[data-f=qtd]')) t.value = digitos(t.value);
      else if (t.matches('[data-f=c], #nDesc')) { const c = parseBRL(t.value); t.value = c ? brl(c) : ''; }
      else if (t.matches('#eDoc, #cDoc')) t.value = maskDoc(t.value);
      else return;
      recalc();
    });
  }

  if (!window.Auth) { $('#app').innerHTML = '<p class="empty msg">Não foi possível carregar o /auth.js. Abra o app pelo servidor (npm start).</p>'; return; }
  Auth.init(() => { ligar(); render(); });
})();