function atualizarEnv(contents, key, value) {
  const linha = key + '=' + JSON.stringify(value);
  const expressao = new RegExp('^' + key + '=.*$', 'm');
  if (expressao.test(contents)) return contents.replace(expressao, linha);
  const anterior = contents.replace(/\s*$/, '');
  return (anterior ? anterior + '\n' : '') + linha + '\n';
}

module.exports = { atualizarEnv };
