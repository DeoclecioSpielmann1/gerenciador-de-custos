'use strict';
/* Contas a pagar / a receber e contas fixas (repetem todo mês) */
(() => {
  const soma = l => l.reduce((s, c) => s + c.centavos, 0);
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
  const rotVenc = c => {
    const d = Extras.diasAte(c.venc), v = c.tipo === 'entrada' ? 'Previsto' : 'Vence';
    return d < 0 ? `<span class="late">Atrasada ${plural(-d, 'dia', 'dias')}</span>` : d === 0 ? `<b>${v} hoje</b>` : `${v} ${diaCurto(c.venc)}`;
  };
  const btn = (cls, act, id, ic, tx, label, extra = '') =>
    `<button class="ib ${cls}" ${act.startsWith('#') ? `data-go="${act}"` : `data-act="${act}" ${extra}`} data-id="${esc(id)}" aria-label="${esc(label)}" title="${tx}"><span aria-hidden="true">${ic}</span><span class="tx">${tx}</span></button>`;

  function linhaConta(c) {
    const k = cat(c.categoria), ent = c.tipo === 'entrada';
    return `<div class="rw"><div class="row st">
      <span class="ico" aria-hidden="true">${ent ? '💰' : (k ? k.icone : '📦')}</span>
      <span class="t"><b>${esc(c.descricao)}</b><small>${rotVenc(c)}${c.recId ? ' · 🔁 fixa' : ''}</small></span>
      <span class="amt ${ent ? 'in' : ''}">${ent ? '+' : '−'} ${brl(c.centavos)}</span></div>
      <div class="acts">
        ${btn('ok', 'pagar', c.id, '✅', ent ? 'Receber' : 'Pagar', (ent ? 'Marcar como recebida: ' : 'Marcar como paga: ') + c.descricao)}
        ${btn('', '#/conta/' + c.id, c.id, '✏️', 'Editar', 'Editar ' + c.descricao)}
        ${btn('del', 'excluir-conta', c.id, '🗑️', 'Excluir', 'Excluir ' + c.descricao, 'data-ficar')}</div></div>`;
  }

  Object.assign(Extras, {
    linhaConta,

    htmlContas() {
      const ps = Extras.pendentes(), pagar = ps.filter(c => c.tipo === 'saida'), rec = ps.filter(c => c.tipo === 'entrada');
      const atras = ps.filter(c => Extras.diasAte(c.venc) < 0).length;
      return `<section class="kpis">
        <div class="card"><div class="lbl">A pagar</div><div class="val">− ${brl(soma(pagar))}</div><div class="status">${plural(pagar.length, 'conta', 'contas')}</div></div>
        <div class="card"><div class="lbl">A receber</div><div class="val">+ ${brl(soma(rec))}</div><div class="status">${plural(rec.length, 'conta', 'contas')}</div></div>
        <div class="card"><div class="lbl">Atrasadas</div><div class="val ${atras ? 'negc' : ''}">${atras}</div><div class="status">${atras ? 'Regularize assim que puder' : 'Tudo em dia'}</div></div></section>
        <section class="card"><h2 class="ch">Pendentes</h2>${ps.length ? ps.map(linhaConta).join('')
          : '<div class="empty">Nenhuma conta pendente. Cadastre aluguel, internet, salário… e marque como paga quando acontecer.</div>'}</section>
        <section class="card"><h2 class="ch">Contas fixas (repetem todo mês)</h2>${S.rec.length ? S.rec.map(r =>
          `<div class="fx"><div class="t"><b>${esc(r.descricao)}</b><small class="lbl">Todo dia ${r.dia} · ${r.tipo === 'entrada' ? '+' : '−'} ${brl(r.centavos)}</small></div>
          ${btn('del', 'excluir-fixa', r.id, '🗑️', 'Parar', 'Parar de repetir ' + r.descricao)}</div>`).join('')
          : '<div class="empty">Ao criar uma conta, marque “Repetir todo mês” para ela aparecer sozinha a cada mês.</div>'}</section>
        ${DESK.matches ? '' : '<button class="btn" data-go="#/conta-nova">+ Nova conta</button>'}`;
    },

    formConta(id) {
      const c = id ? S.contas.find(x => x.id === id) : null;
      if (id && !c) { location.hash = '#/contas'; return ''; }
      const tipo = c ? c.tipo : 'saida', sel = c ? (c.categoria || 'outros') : 'alimentacao';
      return `<header class="top"><button class="sq" data-go="#/contas" aria-label="Voltar">&lt;</button><h1>${c ? 'Editar conta' : 'Nova conta'}</h1><span></span></header>
      <div class="seg" id="ctipo"><button class="${tipo === 'saida' ? 'on' : ''}" data-ctipo="saida">A pagar</button><button class="${tipo === 'entrada' ? 'on' : ''}" data-ctipo="entrada">A receber</button></div>
      <div class="field" id="cfValor"><label class="lbl" for="cValor">Valor (R$)</label>
        <input id="cValor" class="big" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${c ? (c.centavos / 100).toFixed(2).replace('.', ',') : ''}"><div class="msg" id="cmValor"></div></div>
      <div class="field"><label class="lbl" for="cDesc">Descrição</label>
        <input id="cDesc" autocomplete="off" maxlength="60" placeholder="Ex.: Aluguel, Internet, Salário" value="${c ? esc(c.descricao) : ''}"></div>
      <div class="field" id="cfCat" ${tipo === 'entrada' ? 'hidden' : ''}><span class="lbl">Categoria</span>
        <div class="chips" id="cchips">${S.cats.map(k => `<button type="button" class="chip ${k.id === sel ? 'on' : ''}" data-ccat="${esc(k.id)}">${esc(k.nome)}</button>`).join('')}</div></div>
      <div class="field"><label class="lbl" for="cVenc">Vencimento</label><input id="cVenc" type="date" value="${c ? c.venc : hojeISO()}"></div>
      ${c ? (c.recId ? '<p class="lbl">🔁 Esta conta faz parte de uma conta fixa. A alteração vale só para este mês.</p>' : '')
          : '<label class="chk"><input type="checkbox" id="cRep"><span>🔁 Repetir todo mês neste dia</span></label>'}
      <div class="grow"></div>
      <button class="btn" data-act="salvar-conta" data-id="${c ? esc(c.id) : ''}">${c ? 'Salvar alterações' : 'Salvar'}</button>
      ${c ? `<button class="btn ghost" data-act="excluir-conta" data-id="${esc(c.id)}">Excluir conta</button>` : ''}`;
    }
  });

  function salvarConta(id) {
    const g = i => document.getElementById(i);
    const tipo = document.querySelector('#ctipo .on').dataset.ctipo, centavos = parseValor(g('cValor').value), venc = g('cVenc').value;
    if (!centavos) { g('cfValor').classList.add('err'); g('cmValor').textContent = 'Informe um valor maior que zero.'; g('cValor').focus(); return; }
    if (!venc) { g('cVenc').focus(); return; }
    const categoria = tipo === 'saida' ? (document.querySelector('#cchips .on')?.dataset.ccat || 'outros') : null;
    const descricao = g('cDesc').value.trim() || (tipo === 'entrada' ? 'A receber' : (cat(categoria)?.nome || 'Conta'));
    if (id) S.contas = S.contas.map(c => c.id === id ? { ...c, tipo, descricao, categoria, centavos, venc } : c);
    else if (g('cRep')?.checked) {
      S.rec.push({ id: Extras.novoId(), tipo, descricao, categoria, centavos, dia: +venc.slice(8), inicio: venc.slice(0, 7), gerados: [] });
      Extras.gerarRecorrentes();
    } else S.contas.push({ id: Extras.novoId(), tipo, descricao, categoria, centavos, venc });
    Extras.salvar(); toast(id ? 'Alterações salvas' : 'Conta salva'); location.hash = '#/contas';
  }
  function pagarConta(id) {
    const c = S.contas.find(x => x.id === id); if (!c) return;
    const l = { id: 'l' + Date.now().toString(36), tipo: c.tipo, descricao: c.descricao, categoria: c.tipo === 'saida' ? (c.categoria || 'outros') : null, data: hojeISO(), centavos: c.centavos };
    S.items.push(l); salvar();
    S.contas = S.contas.filter(x => x.id !== id); Extras.salvar();
    toast((c.tipo === 'entrada' ? 'Recebimento registrado' : 'Pagamento registrado') + (l.categoria ? Extras.avisoOrcamento(l.categoria, l.data) : ''), 4200);
    S.semRolar = true; render();
  }
  function excluirConta(id, ficar) {
    const c = S.contas.find(x => x.id === id); if (!c) return;
    if (!confirm('Excluir “' + c.descricao + '”? Essa ação não pode ser desfeita.')) return;
    S.contas = S.contas.filter(x => x.id !== id); Extras.salvar(); toast('Conta excluída');
    if (ficar) { S.semRolar = true; render(); } else location.hash = '#/contas';
  }
  function excluirFixa(id) {
    const r = S.rec.find(x => x.id === id); if (!r) return;
    if (!confirm('Parar de repetir “' + r.descricao + '”? As contas já criadas continuam na lista.')) return;
    S.rec = S.rec.filter(x => x.id !== id); Extras.salvar(); toast('Conta fixa removida'); S.semRolar = true; render();
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-ctipo]');
    if (t) { document.querySelectorAll('#ctipo button').forEach(b => b.classList.toggle('on', b === t)); document.getElementById('cfCat').hidden = t.dataset.ctipo === 'entrada'; return; }
    const ch = e.target.closest('[data-ccat]');
    if (ch) { document.querySelectorAll('#cchips .chip').forEach(b => b.classList.toggle('on', b === ch)); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const k = a.dataset.act;
    if (k === 'salvar-conta') salvarConta(a.dataset.id);
    else if (k === 'pagar') pagarConta(a.dataset.id);
    else if (k === 'excluir-conta') excluirConta(a.dataset.id, a.hasAttribute('data-ficar'));
    else if (k === 'excluir-fixa') excluirFixa(a.dataset.id);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('#cValor,#cDesc')) document.querySelector('[data-act=salvar-conta]')?.click(); });
})();