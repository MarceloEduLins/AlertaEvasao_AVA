// Usa uma pasta temporária: a verificação não altera a demonstração em andamento.
require('../tests/helpers/temp-data');
const repository = require('../src/repositories/academic.repository');
const simulation = require('../src/services/simulation.service');
const { checkPython, clusterClass } = require('../src/services/clustering.service');

async function main() {
  const health = await checkPython();
  if (!health.ok) {
    console.error('IA indisponível:', health.message);
    process.exitCode = 1;
    return;
  }
  console.log('Python/IA:', health);

  repository.resetData();
  try {
    // Avança o cenário até haver dados suficientes de presença, AVA e RA1.
    simulation.advance(70);
    const classId = repository.listClasses()[0]?.id;
    const result = await clusterClass(classId);
    const totalMembers = result.clusters.reduce((sum, cluster) => sum + cluster.size, 0);
    const nonEmpty = result.clusters.filter((cluster) => cluster.size > 0);

    if (totalMembers !== result.model.sampleSize) {
      throw new Error(`K-Means inconsistente: ${totalMembers} membros para ${result.model.sampleSize} linhas.`);
    }
    if (result.model.sampleSize !== 30) throw new Error(`Esperados 30 alunos; recebidos ${result.model.sampleSize}.`);
    if (nonEmpty.length < 3) throw new Error(`Agrupamento pouco variado: apenas ${nonEmpty.length} grupo(s) não vazio(s).`);
    if (!Array.isArray(result.projection) || result.projection.length !== result.model.sampleSize) {
      throw new Error(`Projeção PCA inconsistente: ${result.projection?.length ?? 0} pontos para ${result.model.sampleSize} alunos.`);
    }
    if (result.projection.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      throw new Error('A projeção PCA contém coordenadas inválidas.');
    }

    console.log(`K-Means + PCA OK: ${result.model.k} grupos, ${totalMembers} alunos, silhouette=${result.model.silhouetteScore ?? 'n/a'}`);
    nonEmpty.forEach((cluster) => console.log(`- ${cluster.name}: ${cluster.size} aluno(s) | ${cluster.signals.join(', ')}`));
  } finally {
    repository.resetData();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
