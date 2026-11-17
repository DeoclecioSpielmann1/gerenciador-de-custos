/* notas.js — rotas do emissor de notas (documento auxiliar, SEM valor fiscal).
   Uso no server.js, logo depois do bloqueio do modo demo:
       app.use('/api/notas', require('./notas')(pool));                         */
const express = require('express');

function docOk(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (![11, 14].includes(d.length) || /^(\d)\1+$/.test(d)) return false;
  const dv = (base, pesos) => { let s = 0; for (let i = 0; i < pesos.length; i++) s += +base[i] * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  if (d.length === 11)
    return dv(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]) === +d[9] && dv(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === +d[10];
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dv(d, p1) === +d[12] && dv(d, [6, ...p1]) === +d[13];
}

function montar(b = {}) {
  const txt = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
  const so = v => String(v || '').replace(/\D/g, '');
  const tipo = ['servico', 'produto'].includes(b.tipo) ? b.tipo : null;
  if (!tipo) return { erro: 'Tipo da nota inválido.' };
  const emitente = { nome: txt(b.emitente?.nome, 80), doc: so(b.emitente?.doc), endereco: txt(b.emitente?.endereco, 140) };
  if (emitente.nome.length < 3) return { erro: 'Informe o nome ou a razão social do emitente.' };
  if (!docOk(emitente.doc)) return { erro: 'CPF/CNPJ do emitente inválido.' };
  const cliente = { nome: txt(b.cliente?.nome, 80), doc: so(b.cliente?.doc) };
  if (cliente.nome.length < 2) return { erro: 'Informe o nome do cliente.' };
  if (cliente.doc && !docOk(cliente.doc)) return { erro: 'CPF/CNPJ do cliente inválido.' };
  const brutos = Array.isArray(b.itens) ? b.itens : [];
  if (!brutos.length || brutos.length > 50) return { erro: 'Inclua de 1 a 50 itens.' };
  const itens = [];
  for (const i of brutos) {
    const desc = txt(i?.desc, 80), qtd = i?.qtd, c = i?.c;
    if (!desc || !Number.isInteger(qtd) || qtd < 1 || qtd > 9999 || !Number.isInteger(c) || c < 1 || c > 99999999)
      return { erro: 'Confira os itens: descrição, quantidade e valor.' };
    itens.push({ desc, qtd, c });
  }
  const subtotal = itens.reduce((s, i) => s + i.qtd * i.c, 0);
  const desconto = Number.isInteger(b.desconto) ? b.desconto : 0;
  if (desconto < 0 || desconto >= subtotal) return { erro: 'O desconto deve ser menor que o subtotal.' };
  const pagamento = ['Pix', 'Dinheiro', 'Cartão', 'Boleto', 'A prazo'].includes(b.pagamento) ? b.pagamento : 'Pix';
  const data = String(b.data || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: 'Data inválida.' };
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d) return { erro: 'Data inválida.' };
  return { nota: { tipo, data, emitente, cliente, itens, desconto, pagamento, obs: txt(b.obs, 300), subtotal, total: subtotal - desconto } };
}

module.exports = function (pool) {
  const r = express.Router();
  r.use((req, res, next) => req.session.demo ? res.status(403).json({ erro: 'Indisponível no modo de teste.' }) : next());
  const falha = (res, e) => { console.error('Erro MySQL:', e.code, e.message); res.status(500).json({ erro: 'Erro no banco de dados.' }); };
  const ler = l => ({ ...(typeof l.dados === 'string' ? JSON.parse(l.dados) : l.dados), numero: l.numero, status: l.status, criada_em: l.criada_em });

  r.get('/', async (req, res) => {
    try {
      const [rows] = await pool.execute('SELECT numero, status, criada_em, dados FROM notas WHERE usuario_id = ? ORDER BY numero DESC LIMIT 500', [req.session.uid]);
      res.json(rows.map(ler));
    } catch (e) { falha(res, e); }
  });

  r.post('/', async (req, res) => {
    const { erro, nota } = montar(req.body);
    if (erro) return res.status(422).json({ erro });
    try {
      for (let t = 0; ; t++) {                       // repete se duas notas disputarem o mesmo número
        try {
          const [[{ prox }]] = await pool.query('SELECT COALESCE(MAX(numero), 0) + 1 AS prox FROM notas WHERE usuario_id = ?', [req.session.uid]);
          await pool.execute('INSERT INTO notas (usuario_id, numero, total_centavos, dados) VALUES (?, ?, ?, ?)',
            [req.session.uid, prox, nota.total, JSON.stringify(nota)]);
          return res.status(201).json({ ...nota, numero: prox, status: 'emitida', criada_em: new Date().toISOString() });
        } catch (e) { if (e.code !== 'ER_DUP_ENTRY' || t >= 2) throw e; }
      }
    } catch (e) { falha(res, e); }
  });

  r.post('/:n/cancelar', async (req, res) => {
    const n = +req.params.n;
    if (!Number.isInteger(n) || n < 1) return res.status(422).json({ erro: 'Número inválido.' });
    try {
      const [x] = await pool.execute("UPDATE notas SET status = 'cancelada' WHERE usuario_id = ? AND numero = ? AND status = 'emitida'", [req.session.uid, n]);
      x.affectedRows ? res.json({ numero: n, status: 'cancelada' }) : res.status(404).json({ erro: 'Nota não encontrada ou já cancelada.' });
    } catch (e) { falha(res, e); }
  });
  return r;
};
module.exports.montar = montar;
module.exports.docOk = docOk;