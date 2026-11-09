'use strict';
/* Backup: exportar (JSON/CSV), restaurar (mesclando) e apagar dados */
(() => {
  const baixar = (blob, nome) => {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const lerArquivo = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('Não foi possível ler o arquivo.')); r.readAsText(f); });

  Extras.htmlBackup = () => {
    const u = Extras.ultimoBackup();
    return `<section class="card"><h2 class="ch">Salvar uma cópia</h2>
      <p class="lbl">Seus dados ficam guardados neste navegador. Baixe uma cópia para não perder nada ao limpar o navegador ou trocar de aparelho.</p>
      <p class="lbl">Último backup: <b>${u ? new Date(u).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca'}</b> · ${S.items.length} ${S.items.length === 1 ? 'lançamento' : 'lançamentos'}</p>
      <div class="rbtns"><button class="btn sm rbtn" data-act="bk-json">⬇️ Backup completo (.json)</button><button class="btn sm rbtn alt" data-act="bk-csv">📄 Planilha (.csv)</button></div></section>
      <section class="card"><h2 class="ch">Restaurar um backup</h2>
      <p class="lbl">Escolha um arquivo .json gerado por este app. Os dados do arquivo são somados aos atuais e nada é apagado.</p>
      <div class="rbtns"><button class="btn sm rbtn alt" data-act="bk-abrir">⬆️ Escolher arquivo…</button></div>
      <input type="file" id="bkFile" accept=".json,application/json" hidden></section>
      <section class="card"><h2 class="ch">Apagar meus dados</h2>
      <p class="lbl">Remove lançamentos, orçamento e contas desta conta, neste navegador. Faça um backup antes.</p>
      <div class="rbtns"><button class="btn sm ghost rbtn" data-act="bk-apagar">🗑️ Apagar tudo</button></div></section>`;
  };

  function exportarJSON() {
    const d = { app: 'gerenciador-de-custos', versao: 1, exportadoEm: new Date().toISOString(), usuario: (Auth.sessao() || {}).email || null,
      dados: { lancamentos: S.items, orcamentos: S.orc, fixas: S.rec, contas: S.contas } };
    baixar(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), 'gc-backup-' + hojeISO() + '.json');
    Extras.marcarBackup(); toast('Backup salvo em Downloads'); S.semRolar = true; render();
  }
  function exportarCSV() {
    const cel = v => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)']];
    S.items.slice().sort((a, b) => a.data.localeCompare(b.data)).forEach(i => linhas.push([
      i.data.split('-').reverse().join('/'), i.tipo === 'entrada' ? 'Entrada' : 'Saída', i.descricao,
      i.tipo === 'entrada' ? '' : (cat(i.categoria)?.nome || 'Outros'), (i.centavos / 100).toFixed(2).replace('.', ',')]));
    baixar(new Blob(['\uFEFF' + linhas.map(l => l.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'gc-lancamentos-' + hojeISO() + '.csv');
    toast('Planilha salva em Downloads');
  }

  async function importar(file) {
    try {
      if (file.size > 5e6) throw new Error('Arquivo muito grande.');
      const j = JSON.parse(await lerArquivo(file)), d = j && j.app === 'gerenciador-de-custos' && j.dados;
      if (!d || !Array.isArray(d.lancamentos)) throw new Error('Este arquivo não é um backup do app.');
      const dataOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s), idOk = s => typeof s === 'string' && s.length > 0 && s.length <= 40;
      const valOk = x => x && idOk(x.id) && (x.tipo === 'entrada' || x.tipo === 'saida') && Number.isInteger(x.centavos) && x.centavos > 0 && typeof x.descricao === 'string';
      const cat1 = x => x.tipo === 'saida' ? (typeof x.categoria === 'string' ? x.categoria.slice(0, 40) : 'outros') : null;
      const novos = (lista, ok, mapa, atuais) => { const ids = new Set(atuais.map(i => i.id)); return (Array.isArray(lista) ? lista : []).filter(x => ok(x) && !ids.has(x.id)).map(mapa); };
      const base = x => ({ id: x.id, tipo: x.tipo, descricao: x.descricao.slice(0, 60), categoria: cat1(x), centavos: x.centavos });
      const L = novos(d.lancamentos, x => valOk(x) && dataOk(x.data), x => ({ ...base(x), data: x.data }), S.items);
      const C = novos(d.contas, x => valOk(x) && dataOk(x.venc), x => ({ ...base(x), venc: x.venc, ...(idOk(x.recId) ? { recId: x.recId } : {}) }), S.contas);
      const F = novos(d.fixas, x => valOk(x) && Number.isInteger(x.dia) && x.dia >= 1 && x.dia <= 31 && /^\d{4}-\d{2}$/.test(x.inicio || ''),
        x => ({ ...base(x), dia: x.dia, inicio: x.inicio, gerados: Array.isArray(x.gerados) ? x.gerados.filter(m => /^\d{4}-\d{2}$/.test(m)) : [] }), S.rec);
      const O = Object.entries(d.orcamentos && typeof d.orcamentos === 'object' ? d.orcamentos : {})
        .filter(([k, v]) => /^[\w-]{1,40}$/.test(k) && Number.isInteger(v) && v > 0 && !(k in S.orc));
      if (!L.length && !C.length && !F.length && !O.length) { toast('Nada novo para importar.'); return; }
      if (!confirm(`Importar ${L.length} lançamento(s), ${C.length} conta(s), ${F.length} conta(s) fixa(s) e ${O.length} limite(s)?\nOs dados atuais serão mantidos.`)) return;
      S.items.push(...L); S.contas.push(...C); S.rec.push(...F); O.forEach(([k, v]) => S.orc[k] = v);
      salvar(); Extras.salvar(); toast('Backup restaurado'); S.semRolar = true; render();
    } catch (err) { toast(err instanceof SyntaxError ? 'Arquivo inválido.' : (err.message || 'Falha ao importar.'), 3500); }
  }
  function apagarTudo() {
    if (prompt('Isso apaga todos os seus lançamentos, orçamentos e contas deste navegador.\nDigite APAGAR para confirmar:') !== 'APAGAR') return;
    S.items = []; S.orc = {}; S.rec = []; S.contas = []; salvar(); Extras.salvar(); toast('Dados apagados'); S.semRolar = true; render();
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const k = a.dataset.act;
    if (k === 'bk-json') exportarJSON();
    else if (k === 'bk-csv') exportarCSV();
    else if (k === 'bk-abrir') document.getElementById('bkFile')?.click();
    else if (k === 'bk-apagar') apagarTudo();
  });
  document.addEventListener('change', e => { if (e.target.id === 'bkFile' && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; importar(f); } });
})();