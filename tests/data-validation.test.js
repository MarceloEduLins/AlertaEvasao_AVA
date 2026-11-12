require('./helpers/temp-data');
const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../src/repositories/academic.repository');
const { validateAcademicData } = require('../src/services/data-validation.service');

test('base V6 contém turma completa com 30 alunos e seis matérias', () => {
  repository.resetData();
  const data = repository.readData();
  const result = validateAcademicData(data);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.summary.students, 30);
  assert.equal(result.summary.subjects, 6);
  assert.equal(result.summary.enrollments, 180);
  assert.equal(result.summary.timetableDays, 5);
  assert.equal(result.summary.lessonsPerDay, 5);
  assert.ok(result.summary.totalRAs >= 12);
});

test('todo aluno está matriculado em todas as seis disciplinas', () => {
  const data = repository.readData();
  for (const student of data.students) {
    const enrollments = data.enrollments.filter((item) => item.studentId === student.id);
    assert.equal(enrollments.length, 6, `${student.name} não possui 6 matrículas`);
  }
});
