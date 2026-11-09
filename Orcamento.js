'use strict';
/* Orçamento por categoria + comparativo com o mês anterior */
(() => {
  const pctDe = (g, l) => l ? Math.round(g / l * 100) : 0;
  const cls = p => p >= 100 ? 'over' : p >= 80 ? 'warn' : 'ok';
  const barra = (p, nome) => `<div class="pb ${cls(p)}" role="progressbar" aria-label="${esc(nome)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, p)}"><i style="width:${Math.min(100, p ? Math.max(2, p) : 0)}%"></i></div>`;
  const val = c => (c / 100).toFixed(2).replace('.', ',');
  const soma = l => l.reduce((s, c) => s + c.centavos, 0);
  const delta = (x, y, bomSobe) => {
    if (!x && !y) return '<span class="dt neu">—</span>';
    if (!y) return '<span class="dt neu">novo</span>';
    const p = Math.round((x - y) / Math.abs(y) * 100);
    if (!p) return '<span class="dt neu">0%</span>';
    return `<span class="dt ${(bomSobe ? p > 0 : p < 0) ? 'good' : 'bad'}">${p > 0 ? '▲ +' : '▼ −'}${Math.abs(p)}%</span>`;
  };

  Object.assign(Extras, {
    htmlOrcamento() {
      const g = Extras.gastosPorCat(S.mes), lim = S.orc;
      const ids = Object.keys(lim).filter(k => lim[k]);
      const tot = ids.reduce((s, k) => s + lim[k], 0), usado = ids.reduce((s, k) => s + (g[k] || 0), 0), p = pctDe(usado, tot);
      const resumo = tot
        ? `<section class="card"><div class="lbl">Orçamento de ${nomeMes(S.mes)}</div><div class="val">${brl(usado)} de ${brl(tot)}</div>${barra(p, 'Uso do orçamento total')}
           <div class="status">${p >= 100 ? 'Você passou do limite total' : 'Restam ' + brl(tot - usado) + ' (' + (100 - p) + '%)'}</div></section>`
        : `<section class="card"><b>Defina quanto quer gastar por categoria</b><p class="lbl">Informe um limite mensal nas categorias que quiser acompanhar. Avisamos quando você chegar a 80% e a 100%.</p></section>`;
      const linhas = S.cats.map(c => {
        const l = lim[c.id] || 0, gasto = g[c.id] || 0, p2 = pctDe(gasto, l);
        const st = l ? (gasto > l ? `<span class="late">estourou ${brl(gasto - l)}</span>` : 'restam ' + brl(l - gasto)) : 'sem limite';
        return `<li class="orc"><div class="o-top"><span class="ico" aria-hidden="true">${c.icone}</span>
          <div class="o-t"><b>${esc(c.nome)}</b><small>${brl(gasto)} gastos · ${st}</small></div>
          <input class="o-in" data-oc="${esc(c.id)}" inputmode="decimal" autocomplete="off" placeholder="Sem limite" aria-label="Limite mensal de ${esc(c.nome)} em reais" value="${l ? val(l) : ''}"></div>
          ${l ? barra(p2, 'Uso do limite de ' + c.nome) : ''}</li>`;
      }).join('');
      return resumo + `<section class="card"><h2 class="ch">Limites por categoria</h2><ul class="orcl">${linhas}</ul>
        <div class="rbtns"><button class="btn sm rbtn" data-act="salvar-orc">Salvar limites</button><button class="btn sm rbtn alt" data-act="sugerir-orc">Sugerir pela média</button></div>
        <p class="lbl rdica">O limite vale para todos os meses. Deixe em branco para não acompanhar a categoria.</p></section>`;
    },

    cardOrcamento(w) {
      const g = Extras.gastosPorCat(S.mes);
      const it = S.cats.filter(c => S.orc[c.id]).map(c => ({ c, p: pctDe(g[c.id] || 0, S.orc[c.id]) })).sort((a, b) => b.p - a.p).slice(0, 4);
      const corpo = it.length
        ? it.map(x => `<div class="orow"><span>${esc(x.c.nome)}</span>${barra(x.p, x.c.nome)}<b>${x.p}%</b></div>`).join('') + '<button class="link" data-go="#/orcamento">Ver orçamento</button>'
        : '<div class="empty">Defina limites por categoria e acompanhe aqui.<br><button class="link" data-go="#/orcamento">Definir orçamento</button></div>';
      return `<section class="card ${w || ''}"><h2 class="ch">Orçamento do mês</h2>${corpo}</section>`;
    },

    cardComparativo(w) {
      const a = S.mes, b = mudaMes(a, -1);
      const ta = totais(S.items.filter(i => i.data.startsWith(a))), tb = totais(S.items.filter(i => i.data.startsWith(b)));
      if (!ta.e && !ta.s && !tb.e && !tb.s) return '';
      const ga = Extras.gastosPorCat(a), gb = Extras.gastosPorCat(b), mb = nomeMes(b).split(' ')[0].toLowerCase();
      const ids = [...new Set([...Object.keys(ga), ...Object.keys(gb)])]
        .sort((x, y) => Math.abs((ga[y] || 0) - (gb[y] || 0)) - Math.abs((ga[x] || 0) - (gb[x] || 0))).slice(0, 5);
      const kpi = (n, x, y, bom, pre) => `<div><div class="lbl">${n}</div><div class="val">${pre}${brl(Math.abs(x), n === 'Saldo')}</div>${delta(x, y, bom)} <small class="lbl">vs ${mb}</small></div>`;
      let proj = '';
      const hoje = new Date();
      if (mesDe(hoje) === a) {
        const dia = hoje.getDate(), n = Extras.ultimoDia(a), l = [];
        if (dia >= 5 && dia < n && ta.s > 0) l.push(`No ritmo atual, as saídas do mês chegam a <b>${brl(Math.round(ta.s / dia * n))}</b>.`);
        const pm = S.contas.filter(c => c.venc.startsWith(a));
        if (pm.length) {
          const ap = soma(pm.filter(c => c.tipo === 'saida')), ar = soma(pm.filter(c => c.tipo === 'entrada')), prev = ta.saldo + ar - ap;
          l.push(`Saldo previsto no fim do mês: <b>${prev < 0 ? '− ' : ''}${brl(Math.abs(prev), true)}</b> (considerando as contas pendentes do mês).`);
        }
        if (l.length) proj = `<p class="proj">${l.join('<br>')}</p>`;
      }
      return `<section class="card ${w || ''}"><h2 class="ch">Comparativo com ${mb}</h2>
        <div class="cmp-k">${kpi('Entradas', ta.e, tb.e, true, '+ ')}${kpi('Saídas', ta.s, tb.s, false, '− ')}${kpi('Saldo', ta.saldo, tb.saldo, true, ta.saldo < 0 ? '− ' : '')}</div>
        ${ids.length ? `<ul class="cmp-l">${ids.map(k => `<li><span>${esc(cat(k)?.nome || 'Outros')}</span><span class="lbl">${brl(gb[k] || 0)} → ${brl(ga[k] || 0)}</span>${delta(ga[k] || 0, gb[k] || 0, false)}</li>`).join('')}</ul>` : ''}${proj}</section>`;
    }
  });

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'salvar-orc') {
      const novo = {}; let erro = false;
      document.querySelectorAll('[data-oc]').forEach(i => {
        const v = i.value.trim(); if (!v) { i.style.borderColor = ''; return; }
        const c = parseValor(v);
        if (!c) { i.style.borderColor = 'var(--neg)'; erro = true; } else { i.style.borderColor = ''; novo[i.dataset.oc] = c; }
      });
      if (erro) { toast('Há limites inválidos. Use valores maiores que zero.', 3500); return; }
      S.orc = novo; Extras.salvar(); toast('Limites salvos'); S.semRolar = true; render();
    }
    if (a.dataset.act === 'sugerir-orc') {
      const tot = {};
      [1, 2, 3].forEach(k => Object.entries(Extras.gastosPorCat(mudaMes(S.mes, -k))).forEach(([c, v]) => tot[c] = (tot[c] || 0) + v));
      let n = 0;
      document.querySelectorAll('[data-oc]').forEach(i => {
        const m = tot[i.dataset.oc];
        if (m && !i.value.trim()) { i.value = val(Math.ceil(m / 3 / 1000) * 1000); n++; }
      });
      toast(n ? 'Sugestões preenchidas. Revise e toque em Salvar limites.' : 'Sem histórico suficiente para sugerir.', 3500);
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.o-in')) document.querySelector('[data-act=salvar-orc]')?.click(); });
})();