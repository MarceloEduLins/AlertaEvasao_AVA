module.exports = function errorHandler(error, _req, res, _next) {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Corpo da requisição não é um JSON válido.' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Arquivo grande demais para importar de uma vez (limite de 2 MB).' });
  }
  console.error(error);
  res.status(500).json({ message: 'Erro interno do servidor.' });
};
