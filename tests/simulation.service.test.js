require('./helpers/temp-data');
const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../src/repositories/academic.repository');
const simulation = require('../src/services/simulation.service');
const academic = require('../src/services/academic.service');

test('simula semestre com seis matérias, 5 aulas por dia e resumo visual do avanço', () => {
  repository.resetData();
  try {
    const start = simulation.getStatus();
    assert.equal(start.subjects.length, 6);
    assert.equal(start.class.lessonsPerDay, 5);
    assert.ok(start.timetable.every((day) => day.periods.length === 5));
    assert.ok(start.subjects.some((subject) => subject.ras.length === 2));
    assert.ok(start.subjects.some((subject) => subject.ras.length === 3));

    const afterDay = simulation.advance(1);
    assert.equal(afterDay.simulation.lastAdvance.days, 1);
    assert.equal(afterDay.simulation.lastAdvance.from, start.simulation.currentDate);
    assert.equal(afterDay.simulation.lastAdvance.to, afterDay.simulation.currentDate);

    // Avança até depois da liberação da primeira RA de Raciocínio Algorítmico.
    simulation.advance(41);
    const profile = academic.getStudentProfile('s1');
    const alg = profile.subjects.find((item) => item.subject.id === 'alg');
    const ra1 = alg.assessments.find((item) => item.name === 'RA1');
    assert.equal(ra1.weakest.type, 'Prova');
    assert.equal(ra1.weakest.grade, 4.2);
    assert.ok(repository.listNotifications().some((n) => n.studentId === 's1' && (n.type === 'grade' || n.type === 'digest')));

    // Avança até o marco de 5 faltas restantes.
    simulation.advance(14);
    const later = academic.getStudentProfile('s1');
    const filosofia = later.subjects.find((item) => item.subject.id === 'fil');
    assert.ok(filosofia.attendance.remainingAbsences <= 5);
    assert.ok(repository.listNotifications().some((n) => n.studentId === 's1' && (
      n.type === 'attendance' ||
      n.sourceReferences?.some((source) => source.type === 'attendance')
    )));
  } finally {
    repository.resetData();
  }
});

test('completa o semestre e libera todas as RAs para todos os 30 alunos', () => {
  repository.resetData();
  try {
    const start = simulation.getStatus();
    const startDate = new Date(`${start.simulation.startDate}T12:00:00Z`);
    const endDate = new Date(`${start.simulation.endDate}T12:00:00Z`);
    const days = Math.ceil((endDate - startDate) / 86400000);
    simulation.advance(days);

    const data = repository.readData();
    assert.equal(data.students.length, 30);
    assert.ok(data.notifications.length > 0, 'O semestre deve gerar sugestões proativas.');
    assert.ok(data.notifications.every((n) => n.status === 'pending_review' && !n.sentAt), 'Nenhuma sugestão pode ser enviada sem revisão humana.');

    for (const enrollment of data.enrollments) {
      const subject = data.subjects.find((item) => item.id === enrollment.subjectId);
      assert.ok(subject, `Disciplina ausente: ${enrollment.subjectId}`);
      assert.ok(enrollment.classesHeld <= subject.totalClasses, 'Aulas realizadas ultrapassaram o total da disciplina.');
      assert.equal(
        Object.keys(enrollment.assessments || {}).length,
        subject.ras.length,
        `${enrollment.studentId}/${subject.name} não recebeu todas as RAs.`
      );
    }
  } finally {
    repository.resetData();
  }
});

test('anti-spam limita sugestões repetidas por faixa e consolida sinais simultâneos', () => {
  repository.resetData();
  try {
    simulation.advance(90);
    const data = repository.readData();
    const focus = data.students.find((student) => student.focus);
    const notifications = data.notifications.filter((item) => item.studentId === focus.id);
    assert.ok(notifications.length > 0);

    const attendanceRefs = [];
    for (const item of notifications) {
      for (const source of item.sourceReferences || []) {
        if (source.type === 'attendance') attendanceRefs.push(`${source.subjectId}:${source.reference}`);
      }
      if (item.type === 'attendance') attendanceRefs.push(`${item.subjectId}:${item.reference}`);
    }
    assert.equal(attendanceRefs.length, new Set(attendanceRefs).size, 'Uma mesma faixa de frequência não deve gerar e-mail repetido.');
  } finally {
    repository.resetData();
  }
});
