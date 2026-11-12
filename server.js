const path = require('path');
const express = require('express');
const healthRoutes = require('./src/routes/health.routes');
const academicRoutes = require('./src/routes/academic.routes');
const errorHandler = require('./src/middleware/errorHandler');
const repository = require('./src/repositories/academic.repository');
const { validateAcademicData } = require('./src/services/data-validation.service');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/health', healthRoutes);
app.use('/api', academicRoutes);

app.use('/api', (_req, res) => res.status(404).json({ message: 'Rota da API não encontrada.' }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

if (require.main === module) {
  const validation = validateAcademicData(repository.readData());
  if (!validation.ok) {
    console.error('Base acadêmica inválida:');
    validation.errors.forEach((item) => console.error(`- ${item}`));
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`Alerta Evasão v6 rodando em http://localhost:${PORT}`);
    console.log(`Base: ${validation.summary.students} alunos, ${validation.summary.subjects} disciplinas, ${validation.summary.enrollments} matrículas.`);
  });
}

module.exports = app;
