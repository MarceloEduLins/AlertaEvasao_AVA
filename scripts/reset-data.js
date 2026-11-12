// Restaura o estado inicial da demonstração (base acadêmica + eventos do AVA).
const repository = require('../src/repositories/academic.repository');

repository.resetData();
console.log(`Semestre demonstrativo restaurado para a data inicial em ${repository.dataDir()}.`);
console.log('Base: src/data/academic.json | Eventos do AVA: src/data/ava-events.json (ambos recriados a partir dos arquivos *.seed.json).');
