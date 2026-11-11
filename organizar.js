// Organiza as pastas do projeto. Rode dentro da pasta do projeto (onde está o server.js):
//   node organizar.js              -> SIMULAÇÃO: só mostra o que seria feito, não mexe em nada
//   node organizar.js --aplicar    -> faz um backup e move os arquivos
//   node organizar.js --verificar  -> confere se tudo está no lugar certo
const fs = require('fs'), path = require('path');
const raiz = __dirname, arg = process.argv[2] || '';
const J = (...p) => path.join(raiz, ...p), existe = (...p) => fs.existsSync(J(...p));
const le = (...p) => existe(...p) ? fs.readFileSync(J(...p), 'utf8') : '';

const DESTINO = {                       // arquivo -> pasta final
  'style.css': 'publico',
  'Sw.js': 'publico',                      // precisa abrir sem login (service worker)
  'index.html': 'app', 'auth.js': 'app', 'app.js': 'app', 'Pwa.js': 'app',
  'Backup.js': 'app', 'Contas.js': 'app', 'Dados.js': 'app', 'Orcamento.js': 'app',
  'categorias.json': 'data', 'config.json': 'data'
};
const ANTIGOS = ['auth.css', 'lancamentos.json', 'seed.js'];   // não são mais usados -> _antigos/

function verificar() {
  const app = le('app', 'app.js'), srv = le('server.js');
  const itens = [
    ['server.js (versão com login e /api/lancamentos)', srv.includes('/api/lancamentos') && srv.includes('/api/login')],
    ['package.json', existe('package.json')],
    ['schema_mysql.sql', existe('schema_mysql.sql')],
    ['publico/login.html', existe('publico', 'login.html')],
    ['publico/style.css', existe('publico', 'style.css')],
    ['app/index.html (novo, sem auth.css)', existe('app', 'index.html') && !le('app', 'index.html').includes('auth.css')],
    ['app/auth.js (novo, usa /api/me)', le('app', 'auth.js').includes('/api/me')],
    ['app/app.js', existe('app', 'app.js')],
    ['app/app.js atualizado (rode: node aplicar-alteracoes.js)', app.includes("api('/api/lancamentos')") && !app.includes('const lsKey')],
    ['data/categorias.json', existe('data', 'categorias.json')],
    ['data/config.json', existe('data', 'config.json')],
    ['node_modules (npm install já rodou)', existe('node_modules')]
  ];
  console.log('\nVerificação:');
  itens.forEach(([n, ok]) => console.log('  ' + (ok ? '[ok]    ' : '[FALTA] ') + n));
  const faltas = itens.filter(i => !i[1]).length;
  console.log(faltas ? `\n${faltas} item(ns) pendente(s). Veja o LEIA-ME.txt.` : '\nTudo certo. Rode: npm start');
}
if (arg === '--verificar') return verificar();

// ---- monta o plano ----
const plano = [], usados = new Set();
const achar = nome => [[nome], ['data', nome]].map(p => J(...p)).find(p => fs.existsSync(p));
for (const [nome, pasta] of Object.entries(DESTINO)) {
  const de = achar(nome); if (!de) continue;
  const para = J(pasta, nome);
  if (path.resolve(de).toLowerCase() === path.resolve(para).toLowerCase()) continue;      // já no lugar
  if (fs.existsSync(para)) plano.push([de, J('_antigos', nome), 'já existe a versão nova em ' + pasta + '/']);
  else plano.push([de, para, 'vai para ' + pasta + '/']);
}
for (const nome of ANTIGOS) { const de = achar(nome); if (de) plano.push([de, J('_antigos', nome), 'não é mais usado']); }

const rel = p => path.relative(raiz, p).replace(/\\/g, '/');
console.log(arg === '--aplicar' ? '\nOrganizando...\n' : '\nSIMULAÇÃO (nada foi alterado). Para aplicar: node organizar.js --aplicar\n');
if (!plano.length) console.log('  Nenhum arquivo para mover.');
plano.forEach(([de, para, why]) => console.log(`  ${rel(de).padEnd(22)} -> ${rel(para).padEnd(26)} (${why})`));

if (arg !== '--aplicar') { console.log('\nNão mexo em: node_modules, .git, PDF/DOCX da documentação e arquivos que não estão na lista.'); return; }

// ---- backup + execução ----
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const bak = path.join(path.dirname(raiz), path.basename(raiz) + '_backup_' + stamp);
fs.cpSync(raiz, bak, { recursive: true, filter: s => !/[\\/](node_modules|\.git)([\\/]|$)/.test(s) });
console.log('\nBackup criado em: ' + bak);
for (let [de, para] of plano) {
  fs.mkdirSync(path.dirname(para), { recursive: true });
  for (let n = 1; fs.existsSync(para); n++) para = para.replace(/(\.\d+)?$/, '.' + n);   // evita sobrescrever
  fs.renameSync(de, para);
}
console.log('Pronto: ' + plano.length + ' arquivo(s) movido(s).');
verificar();