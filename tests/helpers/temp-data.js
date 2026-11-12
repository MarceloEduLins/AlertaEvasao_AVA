// Cada arquivo de teste usa uma pasta temporária própria: os testes nunca
// apagam o estado da demonstração que está rodando em src/data.
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.ALERTA_DATA_DIR || !process.env.ALERTA_DATA_DIR.includes('alerta-test-')) {
  process.env.ALERTA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'alerta-test-'));
}

module.exports = { dataDir: process.env.ALERTA_DATA_DIR };
