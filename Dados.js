'use strict';
/* Dados extras e rotas: orçamento por categoria, contas a pagar/fixas e backup.
   Cada usuário tem suas próprias chaves no localStorage (mesma regra do app.js).
   Os módulos orcamento.js, contas.js e backup.js acrescentam funções a este objeto. */
const Extras = (() => {
  const usuario = () => Auth.sessao() || {};
  const chave = suf => { const u = usuario(); return u.demo ? 'demo_gc.' + suf + '.v1' : 'gc.' + suf + '.v1.' + (u.email || 'anon'); };
  const ler = (suf, pad) => { try { const v = JSON.parse(localStorage.getItem(chave(suf))); return v == null ? pad : v; } catch (e) { return pad; } };
  const gravar = (suf, v) => { try { localStorage.setItem(chave(suf), JSON.stringify(v)); } catch (e) { } };
  const novoId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const pad2 = n => String(n).padStart(2, '0');
  const ultimoDia = ym => { const [a, m] = ym.split('-').map(Number); return new Date(a, m, 0).getDate(); };

  function salvar() { gravar('orc', S.orc); gravar('rec', S.rec); gravar('contas', S.contas); }
  function limparDemo() { ['orc', 'rec', 'contas', 'bk'].forEach(s => { try { localStorage.removeItem('demo_gc.' + s + '.v1'); } catch (e) { } }); }

  /* contas fixas -> geram uma conta pendente por mês (mês atual e o próximo), sem duplicar */
  function gerarRecorrentes() {
    const hoje = mesDe(new Date()), prox = mudaMes(hoje, 1), piso = mudaMes(hoje, -12);
    let mudou = false;
    S.rec.forEach(r => {
      r.gerados = r.gerados || [];
      const fim = r.inicio > prox ? r.inicio : prox;
      let ym = r.inicio < piso ? piso : r.inicio, n = 0;
      while (ym <= fim && n++ < 40) {
        if (!r.gerados.includes(ym)) {
          S.contas.push({ id: novoId(), tipo: r.tipo, descricao: r.descricao, categoria: r.categoria, centavos: r.centavos,
            venc: ym + '-' + pad2(Math.min(r.dia, ultimoDia(ym))), recId: r.id });
          r.gerados.push(ym); mudou = true;
        }
        ym = mudaMes(ym, 1);
      }
    });
    return mudou;
  }
  function iniciar() {
    S.orc = ler('orc', {}); S.rec = ler('rec', []); S.contas = ler('contas', []);
    if (!S.orc || typeof S.orc !== 'object' || Array.isArray(S.orc)) S.orc = {};
    if (!Array.isArray(S.rec)) S.rec = [];
    if (!Array.isArray(S.contas)) S.contas = [];
    if (gerarRecorrentes()) salvar();
  }

  const gastosPorCat = ym => {
    const o = {};
    S.items.forEach(i => { if (i.tipo === 'saida' && i.data.startsWith(ym)) { const k = i.categoria || 'outros'; o[k] = (o[k] || 0) + i.centavos; } });
    return o;
  };
  const pendentes = () => S.contas.slice().sort((a, b) => a.venc.localeCompare(b.venc) || a.id.localeCompare(b.id));
  const diasAte = iso => Math.round((dtDe(iso) - dtDe(hojeISO())) / 864e5);
  const alertas = () => S.contas.filter(c => c.tipo === 'saida' && diasAte(c.venc) <= 3).length;
  const badge = () => { const n = alertas(); return n ? `<b class="bdg" aria-label="${n} contas vencendo ou atrasadas">${n}</b>` : ''; };

  function avisoOrcamento(c, data) {
    const lim = S.orc[c]; if (!lim) return '';
    const p = Math.round((gastosPorCat(data.slice(0, 7))[c] || 0) / lim * 100);
    return p >= 80 ? ` · ⚠️ ${cat(c)?.nome || 'Outros'}: ${p}% do limite` : '';
  }

  const ultimoBackup = () => ler('bk', null);
  const marcarBackup = () => gravar('bk', new Date().toISOString());
  function lembrete() {
    if (!S.items.length || Auth.isDemo()) return '';
    const u = ultimoBackup(), dias = u ? Math.floor((Date.now() - new Date(u)) / 864e5) : null;
    if (u && dias < 30) return '';
    return `<button class="lembrete" data-go="#/backup"><span aria-hidden="true">💾</span><span>${u ? 'Seu último backup foi há ' + dias + ' dias.' : 'Você ainda não fez backup.'} Toque para salvar uma cópia dos seus dados.</span></button>`;
  }

  /* ---------- rotas extras ---------- */
  function tela(rota, id, desk) {
    if (rota === 'orcamento') return { titulo: 'Orçamento', mes: true, html: `<div class="pg">${Extras.htmlOrcamento()}</div>` };
    if (rota === 'backup') return { titulo: 'Backup', html: `<div class="pg">${Extras.htmlBackup()}</div>` };
    if (rota === 'contas' || rota === 'conta-nova' || rota === 'conta') {
      const lista = { titulo: 'Contas a pagar', acao: ['#/conta-nova', '+ Nova conta'], html: `<div class="pg">${Extras.htmlContas()}</div>` };
      if (rota === 'contas') return lista;
      const f = Extras.formConta(rota === 'conta' ? id : undefined);
      return desk ? { ...lista, drawer: f } : { cheio: true, html: f };
    }
    return null;
  }
  const btnMes = d => `<button class="sq" data-act="mes" data-d="${d}" aria-label="${d < 0 ? 'Mês anterior' : 'Próximo mês'}">${d < 0 ? '&lt;' : '&gt;'}</button>`;
  function topo(ex, desk) {
    if (ex.cheio) return '';
    if (desk) return `<header class="bar"><div class="ttl"><h1>${ex.titulo}</h1>${ex.mes ? `<div class="nv">${btnMes(-1)}<span class="mlbl">${nomeMes(S.mes)}</span>${btnMes(1)}</div>` : ''}</div>
      ${ex.acao ? `<button class="btn go" data-go="${ex.acao[0]}">${ex.acao[1]}</button>` : ''}</header>`;
    return `<header class="top"><button class="sq" data-go="#/" aria-label="Voltar">&lt;</button><h1>${ex.titulo}</h1><span></span></header>` +
      (ex.mes ? `<div class="mnav">${btnMes(-1)}<b>${nomeMes(S.mes)}</b>${btnMes(1)}</div>` : '');
  }

  /* ---------- blocos do Resumo ---------- */
  const atalhos = () => lembrete() + `<nav class="atalhos" aria-label="Atalhos">
    <button data-go="#/orcamento"><span aria-hidden="true">🎯</span>Orçamento</button>
    <button data-go="#/contas"><span aria-hidden="true">🔁</span>Contas${badge()}</button>
    <button data-go="#/backup"><span aria-hidden="true">💾</span>Backup</button></nav>`;
  function resumoMobile() {
    const ps = pendentes();
    const contas = ps.length ? `<section class="card"><h2 class="ch">Contas a pagar</h2>${ps.slice(0, 3).map(Extras.linhaConta).join('')}
      <button class="link" data-go="#/contas">Ver todas (${ps.length})</button></section>` : '';
    return contas + Extras.cardOrcamento('') + Extras.cardComparativo('');
  }
  function cardsDesk() {
    const ps = pendentes();
    const contas = `<section class="card w6"><div class="sec"><h2 class="ch">Contas a pagar</h2><button class="link" data-go="#/contas">Ver todas</button></div>
      ${ps.length ? ps.slice(0, 4).map(Extras.linhaConta).join('') : '<div class="empty">Nenhuma conta pendente.</div>'}</section>`;
    return Extras.cardOrcamento('w6') + contas + Extras.cardComparativo('w12');
  }

  return { salvar, limparDemo, iniciar, gerarRecorrentes, novoId, ultimoDia, gastosPorCat, pendentes, diasAte, alertas, badge,
    avisoOrcamento, ultimoBackup, marcarBackup, lembrete, tela, topo, atalhos, resumoMobile, cardsDesk };
})();