'use strict';
const LS_KEY = 'gc.lancamentos.v2';
const CATS_FALLBACK = [
  {id:'moradia',nome:'Moradia',icone:'🏠'},{id:'alimentacao',nome:'Alimentação',icone:'🛒'},
  {id:'transporte',nome:'Transporte',icone:'🚌'},{id:'trabalho',nome:'Trabalho',icone:'💻'},
  {id:'lazer',nome:'Lazer',icone:'🎬'},{id:'outros',nome:'Outros',icone:'📦'}];

const S = { cats: [], items: [], mes: mesDe(new Date()), filtro: 'todos' };
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

/* ---------- utilitários ---------- */
function mesDe(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function hojeISO(){ const d = new Date(); return mesDe(d) + '-' + String(d.getDate()).padStart(2,'0'); }
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function brl(c, forcar){
  const casas = (forcar || c % 100) ? 2 : 0;
  return 'R$ ' + (c/100).toLocaleString('pt-BR',{minimumFractionDigits:casas,maximumFractionDigits:casas});
}
function parseValor(txt){            // "1.234,56" | "186" | "12,5" -> centavos
  const n = parseFloat(String(txt).trim().replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n*100) : 0;
}
function nomeMes(ym){
  const [a,m] = ym.split('-').map(Number);
  const n = new Date(a, m-1, 1).toLocaleDateString('pt-BR',{month:'long'});
  return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + a;
}
function mudaMes(ym, delta){ const [a,m] = ym.split('-').map(Number); return mesDe(new Date(a, m-1+delta, 1)); }
function diaExtenso(iso){
  const [a,m,d] = iso.split('-').map(Number);
  return d + ' de ' + new Date(a,m-1,d).toLocaleDateString('pt-BR',{month:'long'});
}
function diaCurto(iso){
  const [a,m,d] = iso.split('-').map(Number);
  return d + ' ' + new Date(a,m-1,d).toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
}
const cat = id => S.cats.find(c => c.id === id);
function toast(t){ $toast.textContent = t; $toast.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(()=>$toast.hidden = true, 2200); }

/* ---------- dados ---------- */
async function getJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error(url); return r.json(); }
function salvar(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(S.items)); }catch(e){} }
async function carregar(){
  try{ S.cats = await getJSON('data/categorias.json'); }catch(e){ S.cats = CATS_FALLBACK; }
  try{ S.cfg = await getJSON('data/config.json'); }catch(e){}
  let guardado = null;
  try{ guardado = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  if(Array.isArray(guardado)){ S.items = guardado; return; }
  try{ S.items = await getJSON('data/lancamentos.json'); salvar(); }catch(e){ S.items = []; }
}
const doMes = () => S.items.filter(i => i.data.startsWith(S.mes))
  .sort((a,b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
function totais(lista){
  const e = lista.filter(i=>i.tipo==='entrada').reduce((s,i)=>s+i.centavos,0);
  const s = lista.filter(i=>i.tipo==='saida').reduce((x,i)=>x+i.centavos,0);
  return {e, s, saldo: e - s};
}

/* ---------- componentes ---------- */
function cabecalhoMes(){
  return `<header class="top">
    <button class="sq" data-act="mes" data-d="-1" aria-label="Mês anterior">&lt;</button>
    <h1>${nomeMes(S.mes)}</h1>
    <button class="sq" data-act="mes" data-d="1" aria-label="Próximo mês">&gt;</button></header>`;
}
function linha(i, mostrarData){
  const c = cat(i.categoria);
  const sub = i.tipo==='entrada' ? 'Entrada' : (c ? c.nome : 'Outros');
  return `<button class="row" data-go="#/editar/${esc(i.id)}">
    <span class="ico" aria-hidden="true">${i.tipo==='entrada' ? '💰' : (c ? c.icone : '📦')}</span>
    <span class="t"><b>${esc(i.descricao)}</b><small>${sub}${mostrarData ? ' · ' + diaCurto(i.data) : ''}</small></span>
    <span class="amt ${i.tipo==='entrada'?'in':''}">${i.tipo==='entrada'?'+':'−'} ${brl(i.centavos)}</span></button>`;
}
const CFG_PADRAO = {titular:'Seu Nome ou Empresa', texto:'Todos os direitos reservados.', anoInicial:new Date().getFullYear()};
const cfg = () => ({...CFG_PADRAO, ...(S.cfg||{})});
function anos(){ const c = cfg(), a = new Date().getFullYear(); return c.anoInicial && c.anoInicial < a ? c.anoInicial + '–' + a : String(a); }
function rodape(){
  const c = cfg();
  return `<footer class="foot no-print"><span>© ${anos()} ${esc(c.titular)}. ${esc(c.texto)}</span><span>Gerenciador de Custos</span></footer>`;
}
const botaoNovo = `<button class="btn" data-go="#/novo">+ Novo lançamento</button>`;

/* ---------- telas ---------- */
function telaResumo(){
  const lista = doMes(), t = totais(lista);
  const porCat = {};
  lista.filter(i=>i.tipo==='saida').forEach(i => porCat[i.categoria||'outros'] = (porCat[i.categoria||'outros']||0) + i.centavos);
  const topo = Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  const max = topo.length ? topo[0][1] : 1;
  return cabecalhoMes() + `
    <section class="card"><div class="lbl">Saldo do mês</div>
      <div class="saldo ${t.saldo<0?'neg':''}">${t.saldo<0?'− ':''}${brl(Math.abs(t.saldo),true)}</div>
      <div class="status">${!lista.length ? 'Nenhum lançamento neste mês' : t.saldo>=0 ? 'Você está no azul' : 'Você está no vermelho'}</div></section>
    <section class="duo">
      <div class="card"><div class="lbl">Entradas</div><div class="val">+ ${brl(t.e)}</div></div>
      <div class="card"><div class="lbl">Saídas</div><div class="val">− ${brl(t.s)}</div></div></section>
    ${topo.length ? `<section class="card"><b>Para onde foi</b><div class="bars">${topo.map(([id,v]) =>
      `<div class="bar"><span>${esc(cat(id)?.nome||'Outros')}</span><span><i style="width:${Math.max(4,v/max*100)}%"></i></span><span>${brl(v)}</span></div>`).join('')}</div></section>` : ''}
    <div class="sec"><h2>Últimos lançamentos</h2><button class="link" data-go="#/lista">Ver todos</button></div>
    ${lista.length ? `<section class="card list">${lista.slice(0,4).map(i=>linha(i,true)).join('')}</section>`
      : `<div class="empty">Toque em “Novo lançamento” para registrar sua primeira entrada ou saída.</div>`}
    <div class="grow"></div><button class="btn alt" data-go="#/relatorio">🖨️ Imprimir relatório</button>${botaoNovo}`;
}

function telaLista(){
  const tipo = {todos:null, entradas:'entrada', saidas:'saida'}[S.filtro];
  const lista = doMes().filter(i => !tipo || i.tipo === tipo);
  const dias = [...new Set(lista.map(i=>i.data))];
  const abas = [['todos','Todos'],['entradas','Entradas'],['saidas','Saídas']];
  return cabecalhoMes() + `
    <div class="seg" role="tablist">${abas.map(([k,n]) =>
      `<button role="tab" class="${S.filtro===k?'on':''}" aria-selected="${S.filtro===k}" data-act="filtro" data-k="${k}">${n}</button>`).join('')}</div>
    ${dias.length ? dias.map(d => `<div class="day">${diaExtenso(d)}</div>
      <section class="card list">${lista.filter(i=>i.data===d).map(i=>linha(i,false)).join('')}</section>`).join('')
      : `<div class="empty">Nada por aqui neste mês.</div>`}
    <div class="grow"></div>${botaoNovo}`;
}

function telaForm(id){
  const item = id ? S.items.find(i=>i.id===id) : null;
  if(id && !item){ location.hash = '#/lista'; return ''; }
  const tipo = item ? item.tipo : 'saida';
  const catSel = item ? (item.categoria || 'outros') : 'alimentacao';
  const valor = item ? (item.centavos/100).toFixed(2).replace('.',',') : '';
  const data = item ? item.data : hojeISO();
  return `<header class="top"><button class="sq" data-go="#/" aria-label="Voltar">&lt;</button>
      <h1>${item ? 'Editar lançamento' : 'Novo lançamento'}</h1><span></span></header>
    <div class="seg" id="tipo">
      <button class="${tipo==='entrada'?'on':''}" data-tipo="entrada">Entrada</button>
      <button class="${tipo==='saida'?'on':''}" data-tipo="saida">Saída</button></div>
    <div class="field" id="fValor"><label class="lbl" for="valor">Valor (R$)</label>
      <input id="valor" class="big" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${valor}">
      <div class="msg" id="mValor"></div></div>
    <div class="field"><label class="lbl" for="desc">Descrição</label>
      <input id="desc" autocomplete="off" maxlength="60" value="${item ? esc(item.descricao) : ''}"></div>
    <div class="field" id="fCat" ${tipo==='entrada'?'hidden':''}><span class="lbl">Categoria</span>
      <div class="chips" id="chips">${S.cats.map(c =>
        `<button type="button" class="chip ${c.id===catSel?'on':''}" data-cat="${c.id}">${c.nome}</button>`).join('')}</div></div>
    <div class="field"><label class="lbl" for="data">Data</label><input id="data" type="date" value="${data}"></div>
    <div class="grow"></div>
    <button class="btn" data-act="salvar" data-id="${item ? esc(item.id) : ''}">${item ? 'Salvar alterações' : 'Salvar'}</button>
    ${item ? `<button class="btn ghost" data-act="excluir" data-id="${esc(item.id)}">Excluir lançamento</button>` : ''}`;
}

/* ---------- ações ---------- */
function salvarForm(id){
  const tipo = document.querySelector('#tipo .on').dataset.tipo;
  const centavos = parseValor(document.getElementById('valor').value);
  const data = document.getElementById('data').value;
  if(!centavos){
    document.getElementById('fValor').classList.add('err');
    document.getElementById('mValor').textContent = 'Informe um valor maior que zero.';
    document.getElementById('valor').focus(); return;
  }
  if(!data){ document.getElementById('data').focus(); return; }
  const categoria = tipo==='saida' ? (document.querySelector('#chips .on')?.dataset.cat || 'outros') : null;
  const descricao = document.getElementById('desc').value.trim()
    || (tipo==='entrada' ? 'Entrada' : cat(categoria).nome);          // registrar rápido: descrição é opcional
  const novo = {id: id || 'l' + Date.now().toString(36), tipo, descricao, categoria, data, centavos};
  if(id) S.items = S.items.map(i => i.id===id ? novo : i); else S.items.push(novo);
  salvar(); S.mes = data.slice(0,7); toast(id ? 'Alterações salvas' : 'Lançamento salvo');
  location.hash = '#/';
}
function excluir(id){
  if(!confirm('Excluir este lançamento? Essa ação não pode ser desfeita.')) return;
  S.items = S.items.filter(i=>i.id!==id); salvar(); toast('Lançamento excluído'); location.hash = '#/lista';
}

/* ---------- eventos e rotas ---------- */
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if(go){ location.hash = go.dataset.go; return; }
  const tp = e.target.closest('[data-tipo]');
  if(tp){ document.querySelectorAll('#tipo button').forEach(b=>b.classList.toggle('on', b===tp));
    document.getElementById('fCat').hidden = tp.dataset.tipo==='entrada'; return; }
  const ch = e.target.closest('[data-cat]');
  if(ch){ document.querySelectorAll('#chips .chip').forEach(b=>b.classList.toggle('on', b===ch)); return; }
  const a = e.target.closest('[data-act]'); if(!a) return;
  if(a.dataset.act==='mes'){ S.mes = mudaMes(S.mes, +a.dataset.d); render(); }
  if(a.dataset.act==='filtro'){ S.filtro = a.dataset.k; render(); }
  if(a.dataset.act==='salvar') salvarForm(a.dataset.id);
  if(a.dataset.act==='excluir') excluir(a.dataset.id);
});
document.addEventListener('keydown', e => { if(e.key==='Enter' && e.target.matches('#valor,#desc')) document.querySelector('[data-act=salvar]')?.click(); });
window.addEventListener('hashchange', render);

/* ---------- dashboard desktop (layout da imagem de referência) ---------- */
const DESK = matchMedia('(min-width: 960px)');
const PAL = ['#12485c','#3bb8c8','#f2a33a','#1f7a8c','#c9822b','#7a8f5a'];
const mesCurto = ym => { const [a,m] = ym.split('-').map(Number); return new Date(a,m-1,1).toLocaleDateString('pt-BR',{month:'short'}).replace('.',''); };

function donutSvg(partes, total){
  let off = 25;
  const arcos = partes.map(p => { const pct = p.v/total*100;
    const c = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${p.cor}" stroke-width="6" stroke-dasharray="${pct} ${100-pct}" stroke-dashoffset="${off}"/>`;
    off -= pct; return c; }).join('');
  return `<svg viewBox="0 0 42 42" class="donut" role="img" aria-label="Saídas por categoria">
    <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--chip)" stroke-width="6"/>${arcos}
    <text x="21" y="20" text-anchor="middle" class="dl">Saídas</text>
    <text x="21" y="25.5" text-anchor="middle" class="dv">${brl(total)}</text></svg>`;
}
function barras6(){
  const meses = []; for(let k=5;k>=0;k--) meses.push(mudaMes(S.mes,-k));
  const dados = meses.map(m => ({m, ...(({e,s}) => ({e,s}))(totais(S.items.filter(i=>i.data.startsWith(m))))}));
  const max = Math.max(1, ...dados.flatMap(d=>[d.e,d.s])), g = 63, bw = 20;
  return `<svg viewBox="0 0 420 190" class="chart" role="img" aria-label="Entradas e saídas dos últimos 6 meses">` +
    dados.map((d,i) => { const x = 30+i*g, he = d.e/max*130, hs = d.s/max*130;
      return `<rect x="${x}" y="${160-he}" width="${bw}" height="${he}" rx="3" fill="#1f7a8c"/>
        <rect x="${x+bw+3}" y="${160-hs}" width="${bw}" height="${hs}" rx="3" fill="#f2a33a"/>
        <text x="${x+bw+1.5}" y="180" text-anchor="middle" class="ax">${mesCurto(d.m)}</text>`; }).join('') + `</svg>`;
}
function barrasDia(lista){
  const [a,m] = S.mes.split('-').map(Number), n = new Date(a,m,0).getDate();
  const v = Array(n).fill(0);
  lista.filter(i=>i.tipo==='saida').forEach(i => v[+i.data.slice(8)-1] += i.centavos);
  const max = Math.max(1, ...v), bw = 400/n;
  return `<svg viewBox="0 0 420 190" class="chart" role="img" aria-label="Saídas por dia do mês">` +
    v.map((x,i) => { const h = x/max*140;
      return `<rect x="${10+i*bw+1}" y="${160-h}" width="${bw-2}" height="${h}" rx="2" fill="#12485c"/>` +
        ((i+1)%5===0 || i===0 ? `<text x="${10+i*bw+bw/2}" y="180" text-anchor="middle" class="ax">${i+1}</text>` : ''); }).join('') + `</svg>`;
}
function gauge(pct){
  const arco = 'M10 50 A40 40 0 0 1 90 50';
  return `<svg viewBox="0 0 100 58" class="gauge" role="img" aria-label="${pct}% da renda gasta">
    <path d="${arco}" pathLength="100" fill="none" stroke="var(--chip)" stroke-width="10" stroke-linecap="round"/>
    ${pct ? `<path d="${arco}" pathLength="100" fill="none" stroke="${pct>=90?'var(--neg)':'#f2a33a'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${pct} 100"/>` : ''}
    <text x="50" y="48" text-anchor="middle" class="gv">${pct}%</text></svg>`;
}

function telaDesk(rota, id){
  const lista = doMes(), t = totais(lista);
  const porCat = {};
  lista.filter(i=>i.tipo==='saida').forEach(i => porCat[i.categoria||'outros'] = (porCat[i.categoria||'outros']||0) + i.centavos);
  const partes = Object.entries(porCat).sort((a,b)=>b[1]-a[1]).map(([cid,v],k) => ({id:cid, v, cor:PAL[k%PAL.length]}));
  const pct = t.e ? Math.min(100, Math.round(t.s/t.e*100)) : (t.s ? 100 : 0);
  const tipo = {todos:null, entradas:'entrada', saidas:'saida'}[S.filtro];
  const tab = lista.filter(i => !tipo || i.tipo===tipo);
  const abas = [['todos','Todos'],['entradas','Entradas'],['saidas','Saídas']];
  const nav = (r, ic, n) => `<button class="nav ${rota===r?'on':''}" data-go="#/${r}"><span aria-hidden="true">${ic}</span>${n}</button>`;
  const side = `<nav class="side"><div class="brand">Gerenciador<br>de Custos</div>
    ${nav('', '📊', 'Resumo')}${nav('lista', '🧾', 'Lançamentos')}${nav('relatorio', '🖨️', 'Imprimir relatório')}
    <button class="btn sm" data-go="#/novo">+ Novo lançamento</button>
    <div class="grow"></div><small class="lbl">Dados salvos neste navegador</small></nav>`;
  if(rota==='relatorio') return side + `<div class="main">${corpoRelatorio()}${rodape()}</div>`;
  const drawer = (rota==='novo' || rota==='editar')
    ? `<div class="scrim" data-go="#/"></div><aside class="drawer" aria-label="Lançamento"><div class="dwr">${telaForm(rota==='editar' ? id : undefined)}</div></aside>` : '';
  return `
  ${side}
  <div class="main">
    <header class="bar"><h1>${nomeMes(S.mes)}</h1>
      <div class="nv"><button class="sq" data-act="mes" data-d="-1" aria-label="Mês anterior">&lt;</button>
      <button class="sq" data-act="mes" data-d="1" aria-label="Próximo mês">&gt;</button></div></header>
    <div class="dash">
      <section class="card k"><div class="lbl">Saldo do mês</div>
        <div class="kv ${t.saldo<0?'neg':''}">${t.saldo<0?'− ':''}${brl(Math.abs(t.saldo),true)}</div>
        <div class="status">${!lista.length ? 'Sem lançamentos' : t.saldo>=0 ? 'Você está no azul' : 'Você está no vermelho'}</div></section>
      <section class="card k"><div class="lbl">Entradas</div><div class="kv">+ ${brl(t.e)}</div></section>
      <section class="card k"><div class="lbl">Saídas</div><div class="kv">− ${brl(t.s)}</div></section>
      <section class="card k"><div class="lbl">Da renda já gasta</div>${gauge(pct)}</section>

      <section class="card w5"><h2>Para onde foi</h2>
        ${partes.length ? `<div class="dn">${donutSvg(partes, t.s)}<ul class="leg">${partes.map(p =>
          `<li><i style="background:${p.cor}"></i><span>${esc(cat(p.id)?.nome||'Outros')}</span><b>${brl(p.v)}</b></li>`).join('')}</ul></div>`
          : `<div class="empty">Sem saídas neste mês.</div>`}</section>
      <section class="card w7"><h2>Entradas e saídas · 6 meses</h2>${barras6()}
        <div class="key"><i style="background:#1f7a8c"></i>Entradas <i style="background:#f2a33a"></i>Saídas</div></section>

      <section class="card w5"><h2>Saídas por dia</h2>${barrasDia(lista)}</section>
      <section class="card w7" id="tabela"><div class="sec"><h2>Lançamentos</h2>
        <div class="seg sm" role="tablist">${abas.map(([k,n]) =>
          `<button role="tab" class="${S.filtro===k?'on':''}" aria-selected="${S.filtro===k}" data-act="filtro" data-k="${k}">${n}</button>`).join('')}</div></div>
        ${tab.length ? `<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th></tr></thead><tbody>${tab.map(i =>
          `<tr tabindex="0" data-go="#/editar/${esc(i.id)}"><td>${diaCurto(i.data)}</td><td>${esc(i.descricao)}</td>
          <td>${i.tipo==='entrada' ? 'Entrada' : esc(cat(i.categoria)?.nome||'Outros')}</td>
          <td class="r amt ${i.tipo==='entrada'?'in':''}">${i.tipo==='entrada'?'+':'−'} ${brl(i.centavos)}</td></tr>`).join('')}</tbody></table>`
          : `<div class="empty">Nada por aqui neste mês.</div>`}</section>
    </div>${rodape()}</div>${drawer}`;
}


/* ---------- relatórios imprimíveis ---------- */
S.rel = { per: 'mensal', ref: hojeISO() };
const PERIODOS = [['diario','Diário'],['semanal','Semanal'],['mensal','Mensal'],['anual','Anual']];
const isoDe = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const dtDe = iso => { const [a,m,d] = iso.split('-').map(Number); return new Date(a, m-1, d); };

function intervalo(per, ref){
  const d = dtDe(ref); let i, f;
  if(per==='diario'){ i = f = d; }
  else if(per==='semanal'){ const dow = (d.getDay()+6)%7;                       // semana de segunda a domingo
    i = new Date(d.getFullYear(), d.getMonth(), d.getDate()-dow); f = new Date(i.getFullYear(), i.getMonth(), i.getDate()+6); }
  else if(per==='mensal'){ i = new Date(d.getFullYear(), d.getMonth(), 1); f = new Date(d.getFullYear(), d.getMonth()+1, 0); }
  else { i = new Date(d.getFullYear(), 0, 1); f = new Date(d.getFullYear(), 11, 31); }
  return [isoDe(i), isoDe(f)];
}
function moverRef(per, ref, dir){
  const d = dtDe(ref);
  if(per==='diario') d.setDate(d.getDate()+dir);
  else if(per==='semanal') d.setDate(d.getDate()+7*dir);
  else if(per==='mensal'){ d.setDate(1); d.setMonth(d.getMonth()+dir); }
  else { d.setDate(1); d.setFullYear(d.getFullYear()+dir); }
  return isoDe(d);
}
function rotuloPeriodo(per, i, f){
  if(per==='diario') return dtDe(i).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  if(per==='semanal') return 'Semana de ' + diaCurto(i) + ' a ' + diaCurto(f) + ' de ' + f.slice(0,4);
  if(per==='mensal') return nomeMes(i.slice(0,7));
  return 'Ano de ' + i.slice(0,4);
}

function corpoRelatorio(){
  const {per, ref} = S.rel, [i, f] = intervalo(per, ref);
  const itens = S.items.filter(x => x.data >= i && x.data <= f)
    .sort((a,b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  const t = totais(itens), titulo = rotuloPeriodo(per, i, f);
  const porCat = {};
  itens.filter(x=>x.tipo==='saida').forEach(x => porCat[x.categoria||'outros'] = (porCat[x.categoria||'outros']||0) + x.centavos);
  const cats = Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  let porMes = '';
  if(per==='anual'){
    const ano = i.slice(0,4);
    porMes = `<h3>Resumo por mês</h3><table><thead><tr><th>Mês</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Saldo</th></tr></thead><tbody>` +
      Array.from({length:12}, (_,k) => { const m = ano + '-' + String(k+1).padStart(2,'0');
        const x = totais(itens.filter(y => y.data.startsWith(m)));
        return `<tr><td>${nomeMes(m).split(' ')[0]}</td><td class="r">${brl(x.e)}</td><td class="r">${brl(x.s)}</td><td class="r"><b>${x.saldo<0?'− ':''}${brl(Math.abs(x.saldo))}</b></td></tr>`; }).join('') + `</tbody></table>`;
  }
  return `
  <div class="no-print rctl">
    <div class="sec"><h1 class="rh">Imprimir relatório</h1>
      <div class="rbtns"><button class="btn sm rbtn" data-act="pdf">⬇️ Salvar PDF</button>
        <button class="btn sm rbtn alt" data-act="imprimir">🖨️ Imprimir</button></div></div>
    <div class="seg" role="tablist">${PERIODOS.map(([k,n]) =>
      `<button role="tab" class="${per===k?'on':''}" aria-selected="${per===k}" data-act="per" data-k="${k}">${n}</button>`).join('')}</div>
    <div class="rnav"><button class="sq" data-act="refmov" data-d="-1" aria-label="Período anterior">&lt;</button>
      <input type="date" id="relData" value="${ref}" aria-label="Data de referência">
      <button class="sq" data-act="refmov" data-d="1" aria-label="Próximo período">&gt;</button></div>
    <p class="lbl rdica">“Salvar PDF” baixa o arquivo direto. “Imprimir” abre a janela do navegador.</p></div>
  <article class="report">
    <header><div class="lbl">Gerenciador de Custos · Relatório ${PERIODOS.find(p=>p[0]===per)[1].toLowerCase()}</div>
      <h2 class="rt">${titulo.charAt(0).toUpperCase() + titulo.slice(1)}</h2></header>
    <div class="rk"><div class="card"><div class="lbl">Entradas</div><div class="val">+ ${brl(t.e)}</div></div>
      <div class="card"><div class="lbl">Saídas</div><div class="val">− ${brl(t.s)}</div></div>
      <div class="card"><div class="lbl">Saldo</div><div class="val ${t.saldo<0?'negc':''}">${t.saldo<0?'− ':''}${brl(Math.abs(t.saldo),true)}</div></div></div>
    ${porMes}
    ${cats.length ? `<h3>Saídas por categoria</h3><table><thead><tr><th>Categoria</th><th class="r">Valor</th><th class="r">%</th></tr></thead><tbody>` +
      cats.map(([id,v]) => `<tr><td>${esc(cat(id)?.nome||'Outros')}</td><td class="r">${brl(v)}</td><td class="r">${Math.round(v/t.s*100)}%</td></tr>`).join('') + `</tbody></table>` : ''}
    <h3>Lançamentos (${itens.length})</h3>
    ${itens.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th></tr></thead><tbody>` +
      itens.map(x => `<tr><td>${diaCurto(x.data)}</td><td>${esc(x.descricao)}</td><td>${x.tipo==='entrada' ? 'Entrada' : esc(cat(x.categoria)?.nome||'Outros')}</td>
        <td class="r amt ${x.tipo==='entrada'?'in':''}">${x.tipo==='entrada'?'+':'−'} ${brl(x.centavos)}</td></tr>`).join('') + `</tbody></table></div>`
      : `<div class="empty">Nenhum lançamento neste período.</div>`}
    <footer class="lbl rf">Gerado em ${new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</footer>
  </article>`;
}
function telaRelatorio(){
  return `<header class="top no-print"><button class="sq" data-go="#/" aria-label="Voltar">&lt;</button><span></span><span></span></header>` + corpoRelatorio();
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if(!a) return;
  if(a.dataset.act==='per'){ S.rel.per = a.dataset.k; render(); }
  if(a.dataset.act==='refmov'){ S.rel.ref = moverRef(S.rel.per, S.rel.ref, +a.dataset.d); render(); }
  if(a.dataset.act==='imprimir'){
    const [i] = intervalo(S.rel.per, S.rel.ref), antes = document.title;
    document.title = 'Relatorio-' + S.rel.per + '-' + i;              // nome sugerido ao salvar em PDF
    window.addEventListener('afterprint', () => document.title = antes, {once:true});
    window.print();
  }
});
document.addEventListener('change', e => { if(e.target.id==='relData' && e.target.value){ S.rel.ref = e.target.value; render(); } });


/* ---------- PDF (gerador próprio, sem bibliotecas, funciona offline) ---------- */
const HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278].concat(Array(10).fill(556),
  [278,278,584,584,584,556,1015],
  [667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611],
  [278,278,278,469,556,333],
  [556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500],
  [334,260,334,584]);                                   // larguras da Helvetica (ASCII 32–126)
const pdfEsc = s => s.replace(/[^\x00-\xff]/g,'?').replace(/([\\()])/g,'\\$1');

function pdfRelatorio(){
  const {per, ref} = S.rel, [ini, fim] = intervalo(per, ref);
  const itens = S.items.filter(x => x.data >= ini && x.data <= fim)
    .sort((a,b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  const t = totais(itens);
  let titulo = rotuloPeriodo(per, ini, fim); titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  const W=595, H=842, M=42, R=W-M, BOT=H-70, CIN=[.35,.35,.35], VER=[.04,.35,.29], VRM=[.54,.11,.11], PRE=[0,0,0];
  const pages = []; let ops, y;
  const novaPag = () => { ops = []; pages.push(ops); y = M + 10; };
  const tw = (s,size) => [...s].reduce((a,ch) => { const c = ch.normalize('NFD').charCodeAt(0); return a + (c>=32 && c<=126 ? HW[c-32] : 556); }, 0) * size / 1000;
  const txt = (s,x,yy,size=10,bold=false,cor=PRE,al='l') => {
    s = String(s).replace(/[−–]/g,'-');
    const xx = al==='r' ? x - tw(s,size) : x;
    ops.push(`BT /F${bold?2:1} ${size} Tf ${cor.join(' ')} rg ${xx.toFixed(2)} ${(H-yy).toFixed(2)} Td (${pdfEsc(s)}) Tj ET`);
  };
  const hline = (yy,cor=[.75,.75,.75]) => ops.push(`${cor.join(' ')} RG 0.6 w ${M} ${H-yy} m ${R} ${H-yy} l S`);
  const cortar = (s,size,max) => { s = String(s); while(s.length>1 && tw(s,size)>max) s = s.slice(0,-1); return s; };
  const sub = s => { if(y > BOT-70) novaPag(); y += 8; txt(s,M,y,12,true); y += 16; };
  const tabela = (cols, linhas) => {
    const head = () => { cols.forEach(c => txt(c.t,c.x,y,9,true,CIN,c.al)); y += 6; hline(y); y += 15; };
    head();
    linhas.forEach(l => {
      if(y > BOT){ novaPag(); head(); }
      l.forEach((v,k) => { const c = cols[k], s = typeof v==='string' ? v : v.s;
        txt(c.max ? cortar(s,10,c.max) : s, c.x, y, 10, !!v.b, v.cor || PRE, c.al); });
      y += 6; hline(y,[.88,.88,.88]); y += 14;
    });
  };
  const sinal = (x,pos) => (pos ? '+ ' : '- ') + brl(x);

  novaPag();
  txt('Gerenciador de Custos · Relatório ' + PERIODOS.find(p=>p[0]===per)[1].toLowerCase(), M, y, 9, false, CIN); y += 26;
  txt(titulo, M, y, 20, true); y += 24;
  const bw = (R-M-24)/3;
  [['Entradas', sinal(t.e,true), VER], ['Saídas', sinal(t.s,false), PRE],
   ['Saldo', (t.saldo<0?'- ':'') + brl(Math.abs(t.saldo),true), t.saldo<0 ? VRM : PRE]].forEach(([l,v,cor],k) => {
    const x = M + k*(bw+12);
    ops.push(`0.7 0.7 0.7 RG 0.8 w ${x} ${H-y-52} ${bw} 52 re S`);
    txt(l, x+12, y+19, 9, false, CIN); txt(v, x+12, y+40, 15, true, cor);
  });
  y += 52 + 14;

  if(per==='anual'){
    sub('Resumo por mês');
    tabela([{t:'Mês',x:M},{t:'Entradas',x:M+250,al:'r'},{t:'Saídas',x:M+370,al:'r'},{t:'Saldo',x:R,al:'r'}],
      Array.from({length:12}, (_,k) => { const m = ini.slice(0,4) + '-' + String(k+1).padStart(2,'0');
        const x = totais(itens.filter(z => z.data.startsWith(m)));
        return [nomeMes(m).split(' ')[0], brl(x.e), brl(x.s), {s:(x.saldo<0?'- ':'') + brl(Math.abs(x.saldo)), b:true, cor:x.saldo<0?VRM:PRE}]; }));
  }
  const porCat = {};
  itens.filter(x=>x.tipo==='saida').forEach(x => porCat[x.categoria||'outros'] = (porCat[x.categoria||'outros']||0) + x.centavos);
  const lista = Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  if(lista.length){
    sub('Saídas por categoria');
    tabela([{t:'Categoria',x:M},{t:'Valor',x:R-90,al:'r'},{t:'%',x:R,al:'r'}],
      lista.map(([id,v]) => [cat(id)?.nome || 'Outros', brl(v), Math.round(v/t.s*100) + '%']));
  }
  sub(`Lançamentos (${itens.length})`);
  if(itens.length){
    tabela([{t:'Data',x:M},{t:'Descrição',x:M+62,max:200},{t:'Categoria',x:M+280,max:120},{t:'Valor',x:R,al:'r'}],
      itens.map(x => [diaCurto(x.data), x.descricao, x.tipo==='entrada' ? 'Entrada' : (cat(x.categoria)?.nome || 'Outros'),
        {s:sinal(x.centavos, x.tipo==='entrada'), b:true, cor:x.tipo==='entrada'?VER:PRE}]));
  } else { txt('Nenhum lançamento neste período.', M, y, 10, false, CIN); }

  const gerado = new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
  pages.forEach((o,k) => { ops = o; txt('© ' + anos() + ' ' + cfg().titular + ' · Gerado em ' + gerado, M, H-30, 8, false, CIN); txt(`Página ${k+1} de ${pages.length}`, R, H-30, 8, false, CIN, 'r'); });

  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_,k)=>`${5+k*2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((o,k) => { const corpo = o.join('\n');
    objs[5+k*2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+k*2} 0 R >>`;
    objs[6+k*2] = `<< /Length ${corpo.length} >>\nstream\n${corpo}\nendstream`; });
  let pdf = '%PDF-1.4\n'; const off = [];
  for(let k=1; k<objs.length; k++){ off[k] = pdf.length; pdf += `${k} 0 obj\n${objs[k]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + off.slice(1).map(o => String(o).padStart(10,'0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return {bytes: Uint8Array.from(pdf, c => c.charCodeAt(0)), nome: `Relatorio-${per}-${ini}.pdf`};
}
document.addEventListener('click', e => {
  if(!e.target.closest('[data-act="pdf"]')) return;
  try{
    const {bytes, nome} = pdfRelatorio();
    const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
    const a = document.createElement('a'); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('PDF salvo em Downloads');
  }catch(err){ console.error(err); toast('Não foi possível gerar o PDF'); }
});

function render(){
  const [ , rota, id] = (location.hash || '#/').slice(1).split('/');
  document.body.classList.toggle('desk', DESK.matches);
  if(DESK.matches){
    $app.innerHTML = telaDesk(rota || '', id);
    if(rota==='novo' || rota==='editar') document.getElementById('valor')?.focus();
    else if(rota==='lista') document.getElementById('tabela')?.scrollIntoView();
    else window.scrollTo(0,0);
    return;
  }
  $app.innerHTML = (rota==='lista' ? telaLista() : rota==='relatorio' ? telaRelatorio() : rota==='novo' ? telaForm() : rota==='editar' ? telaForm(id) : telaResumo()) + ((rota==='novo' || rota==='editar') ? '' : rodape());
  if(rota==='novo') document.getElementById('valor').focus();
  window.scrollTo(0,0);
}
DESK.addEventListener('change', render);
document.addEventListener('keydown', e => { if(e.key==='Enter' && e.target.matches('tr[data-go]')) location.hash = e.target.dataset.go;
  if(e.key==='Escape' && document.querySelector('.drawer')) location.hash = '#/'; });
carregar().then(render);