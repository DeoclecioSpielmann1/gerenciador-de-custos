// Aplica no app/app.js as 4 trocas (armazenamento no servidor em vez do localStorage).
//   node aplicar-alteracoes.js
// Faz uma cópia app.js.bak antes. Pode rodar de novo sem problema (detecta que já foi aplicado).
const fs = require('fs'), path = require('path'), vm = require('vm');
const alvo = [path.join(__dirname, 'app', 'app.js'), path.join(__dirname, 'app.js')].find(fs.existsSync);
if (!alvo) { console.log('app.js não encontrado (esperado em app/app.js). Rode antes: node organizar.js --aplicar'); process.exit(1); }

const original = fs.readFileSync(alvo, 'utf8');
if (original.includes("api('/api/lancamentos')")) { console.log('app.js já está atualizado. Nada a fazer.'); process.exit(0); }
const CRLF = original.includes('\r\n');
let s = original.replace(/\r\n/g, '\n');
const falhas = [];
const troca = (nome, re, fn, opcional) => { if (!re.test(s)) { if (!opcional) falhas.push(nome); return; } s = s.replace(re, fn); };

troca('1. bloco lsKey (topo)', /const lsKey = \(\) => \{[\s\S]*?\n\};\n/, () =>
`const api = async (url, metodo = 'GET', corpo) => {      // fala com o servidor; sem sessão volta para o login
  const r = await fetch(url, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  if (r.status === 401) { location.replace('/login'); throw new Error('sessão expirada'); }
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.status === 204 ? null : r.json();
};
`);

troca('2. salvar() e carregar()', /function salvar\(\) \{[^\n]*\n(?:async function carregar\(\) \{[\s\S]*?\n\}\n)/, () =>
`async function carregar() {
  try { S.cats = await getJSON('data/categorias.json'); } catch (e) { S.cats = CATS_FALLBACK; }
  try { S.cfg = await getJSON('data/config.json'); } catch (e) { }
  S.items = await api('/api/lancamentos');
  // migração única: lançamentos que já estavam guardados neste navegador sobem para o servidor
  const chave = LS_BASE + '.' + ((Auth.sessao() || {}).email || 'anon');
  let antigo = null; try { antigo = JSON.parse(localStorage.getItem(chave)); } catch (e) { }
  if (!S.items.length && Array.isArray(antigo) && antigo.length) {
    S.items = await api('/api/lancamentos/importar', 'POST', antigo);
    try { localStorage.removeItem(chave); } catch (e) { }
  }
}
`);

troca('3a. salvarForm async', /(^|\n)function salvarForm\(id\) \{/, (m, a) => a + 'async function salvarForm(id) {');
troca('3b. salvarForm grava no servidor', /(  if \(id\) S\.items = [^\n]*\n)  salvar\(\); (S\.mes = data\.slice\(0, 7\);)/, (m, a, b) =>
`  try { await api(id ? '/api/lancamentos/' + encodeURIComponent(id) : '/api/lancamentos', id ? 'PUT' : 'POST', novo); }
  catch (e) { toast('Não foi possível salvar'); return; }
${a}  ${b}`);

troca('4a. excluir async', /(^|\n)function excluir\(id, ficar\) \{/, (m, a) => a + 'async function excluir(id, ficar) {');
troca('4b. excluir apaga no servidor', /  S\.items = S\.items\.filter\(i => i\.id !== id\); salvar\(\); toast\('Lançamento excluído'\);/, () =>
`  try { await api('/api/lancamentos/' + encodeURIComponent(id), 'DELETE'); }
  catch (e) { toast('Não foi possível excluir'); return; }
  S.items = S.items.filter(i => i.id !== id); toast('Lançamento excluído');`);

troca('5. sair() sem o modo demo', /\n[ \t]*if \(Auth\.isDemo\(\)\) \{ try \{ localStorage\.removeItem\(lsKey\(\)\)[^\n]*/, () => '', true);

if (falhas.length) {
  console.log('Não consegui aplicar automaticamente (o trecho não foi encontrado):');
  falhas.forEach(f => console.log('  - ' + f));
  console.log('Nada foi alterado. Faça essas trocas à mão com o ALTERACOES-app.js.txt.');
  process.exit(1);
}
if (/\b(lsKey|salvar)\(/.test(s.replace(/salvarForm|\.salvar|data-act/g, ''))) console.log('Aviso: ainda há chamadas a lsKey() ou salvar() no arquivo. Confira manualmente.');
try { new vm.Script(s); } catch (e) { console.log('A troca geraria erro de sintaxe (' + e.message + '). Nada foi alterado.'); process.exit(1); }

fs.writeFileSync(alvo + '.bak', original);
fs.writeFileSync(alvo, CRLF ? s.replace(/\n/g, '\r\n') : s);
console.log('Pronto. Alterações aplicadas em ' + path.relative(__dirname, alvo) + ' (cópia: app.js.bak).');