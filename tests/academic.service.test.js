require('./helpers/temp-data');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateAssessment,
  calculateAttendance,
  calculateAva
} = require('../src/services/academic.service');
const {
  buildAttendanceNotification,
  buildGradeNotification,
  buildDigestNotification
} = require('../src/services/notification.service');

test('calcula RA ponderada e identifica componente mais fraco', () => {
  const result = calculateAssessment({
    components: [
      { type: 'Prova', weight: 0.4, grade: 8 },
      { type: 'Projeto', weight: 0.4, grade: 4 },
      { type: 'Atividades', weight: 0.2, grade: 7 }
    ]
  });
  assert.equal(result.grade, 6.2);
  assert.equal(result.weakest.type, 'Projeto');
});

test('calcula margem acumulada de faltas pela carga total da disciplina', () => {
  const result = calculateAttendance(
    { classesHeld: 46, absences: 15 },
    { totalClasses: 80 },
    75
  );
  assert.equal(result.allowedAbsences, 20);
  assert.equal(result.remainingAbsences, 5);
  assert.equal(result.alertLevel, 'reminder');
});

test('classifica inatividade no AVA com data de referência explícita', () => {
  const result = calculateAva(
    { lastAvaAccess: '2026-09-20', pendingActivities: 3 },
    new Date('2026-10-02T12:00:00')
  );
  assert.equal(result.inactiveDays, 12);
  assert.equal(result.alertLevel, 'attention');
});

test('gera mensagem curta quando restam 5 faltas', () => {
  const message = buildAttendanceNotification(
    { name: 'João Silva' },
    {
      subject: { name: 'Banco de Dados' },
      attendance: { alertLevel: 'reminder', remainingAbsences: 5, currentAttendance: 81.2 }
    }
  );
  assert.equal(message.level, 'reminder');
  assert.match(message.body, /5 faltas/);
});

test('lembrete de frequência usa uma referência única por faixa para evitar spam', () => {
  const a = buildAttendanceNotification(
    { name: 'João Silva' },
    { subject: { name: 'Banco de Dados' }, attendance: { alertLevel: 'reminder', remainingAbsences: 5, currentAttendance: 82 } }
  );
  const b = buildAttendanceNotification(
    { name: 'João Silva' },
    { subject: { name: 'Banco de Dados' }, attendance: { alertLevel: 'reminder', remainingAbsences: 3, currentAttendance: 79 } }
  );
  assert.equal(a.reference, 'band:reminder');
  assert.equal(b.reference, 'band:reminder');
});

test('média acadêmica de referência é 7,0 e nota 6,8 já gera lembrete preventivo', () => {
  const message = buildGradeNotification(
    { name: 'Ana Ribeiro' },
    {
      subject: { name: 'Raciocínio Algorítmico' },
      assessments: [{
        name: 'RA1', releaseDate: '2026-04-01', grade: 6.8,
        weakest: { type: 'Prova', grade: 6.2 }
      }]
    }
  );
  assert.equal(message.level, 'reminder');
  assert.match(message.body, /7,0/);
});

test('vários sinais simultâneos são consolidados em uma única sugestão-resumo', () => {
  const student = { name: 'Ana Ribeiro' };
  const digest = buildDigestNotification(student, [
    { type: 'grade', level: 'reminder', reference: 'RA1:x', subjectId: 'alg', summary: 'RA1 = 6,8' },
    { type: 'ava', level: 'attention', reference: 'band:8d', subjectId: 'alg', summary: '9 dias sem AVA' }
  ], '2026-04-10');
  assert.equal(digest.type, 'digest');
  assert.equal(digest.level, 'attention');
  assert.equal(digest.sourceReferences.length, 2);
  assert.match(digest.body, /tutoria/);
  assert.match(digest.body, /RA1 = 6,8/);
});
