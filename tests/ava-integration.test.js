// Fluxo integrado: simulação → eventos do AVA → agregados → sugestão → revisão humana.
// IDs T14..T21 correspondem a docs/evidencias.csv.
require('./helpers/temp-data');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../src/repositories/academic.repository');
const simulation = require('../src/services/simulation.service');
const ava = require('../src/services/ava.service');
const controller = require('../src/controllers/academic.controller');

function advanceTo(date) {
  const current = repository.readData().simulation.currentDate;
  const days = Math.round((new Date(`${date}T12:00:00Z`) - new Date(`${current}T12:00:00Z`)) / 86400000);
  if (days > 0) simulation.advance(days);
}

function call(handler, { params = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; }
    };
    handler({ params, body, query }, res);
  });
}

test('T14 semana com falha de exportação: análise incompleta, sem sugestão automática de AVA', () => {
  repository.resetData();
  advanceTo('2026-03-30'); // janela: 16/03–22/03 (anterior) e 23/03–29/03 (atual, com falha em 25 e 26/03)
  const weekly = ava.getStudentWeekly('s5');
  assert.equal(weekly.coleta.atual.status, 'incompleta');
  assert.equal(weekly.coleta.atual.failed.length, 2);
  assert.ok(weekly.subjects.every((s) => s.resultado.estado === 'incompleto'));
  assert.match(weekly.subjects[0].dadosIncompletos.join(' '), /coleta incompleta/);
  const avaSuggestions = repository.listNotifications().filter((n) => n.type === 'ava_semana' && n.simulatedDate === '2026-03-30');
  assert.equal(avaSuggestions.length, 0);
});

test('T15 turma inteira sem eventos numa disciplina: conferir a coleta, não tratar como inatividade', () => {
  repository.resetData();
  advanceTo('2026-05-11'); // semana atual 04/05–10/05: integração de "dec" não enviou eventos
  const weekly = ava.getStudentWeekly('s6');
  const dec = weekly.subjects.find((s) => s.subjectId === 'dec');
  assert.equal(dec.resultado.estado, 'incompleto');
  assert.match(dec.dadosIncompletos.join(' '), /nenhum evento da turma/);
  const alg = weekly.subjects.find((s) => s.subjectId === 'alg');
  assert.notEqual(alg.resultado.estado, 'incompleto');
});

test('T16 aluno sem histórico no AVA fica "incompleto" enquanto outros têm zero conhecido', () => {
  repository.resetData();
  advanceTo('2026-03-23');
  const lateHistory = ava.getStudentWeekly('s25');
  assert.ok(lateHistory.subjects.every((s) => s.resultado.estado === 'incompleto'));
  assert.match(lateHistory.subjects[0].dadosIncompletos.join(' '), /histórico do AVA disponível somente a partir de 13\/04\/2026/);
  assert.equal(lateHistory.subjects[0].pendencias, null, 'pendências também são desconhecidas');
  const regular = ava.getStudentWeekly('s6');
  assert.ok(regular.subjects.some((s) => s.resultado.estado !== 'incompleto'));
});

test('T17 aluna-foco: queda de atividade detectada com período e coleta completa', () => {
  repository.resetData();
  advanceTo('2026-05-18'); // atual 11/05–17/05 (sem acesso), anterior 04/05–10/05
  const weekly = ava.getStudentWeekly('s1');
  assert.equal(weekly.estado, 'revisar');
  assert.deepEqual(weekly.periodo.atual, { inicio: '2026-05-11', fim: '2026-05-17' });
  assert.equal(weekly.coleta.atual.status, 'completa');
  const alg = weekly.subjects.find((s) => s.subjectId === 'alg');
  assert.equal(alg.atual.eventos, 0);
  assert.ok(alg.anterior.eventos >= 5);
  assert.ok(alg.resultado.motivos.includes('queda de atividade'));
});

test('T18 a simulação gera sugestões para revisão e nunca envia mensagens', () => {
  repository.resetData();
  advanceTo('2026-06-01');
  const items = repository.listNotifications();
  assert.ok(items.length > 0);
  assert.ok(items.every((n) => n.status === 'pending_review' && !n.sentAt));
  const ana = items.filter((n) => n.studentId === 's1');
  assert.ok(ana.some((n) => n.evidence?.periodo && n.evidence?.coleta), 'sugestão carrega período e qualidade da coleta');
});

test('T19 importação: validação sem gravar, duplicados ignorados, linhas inválidas com motivo', () => {
  repository.resetData();
  const csv = fs.readFileSync(path.join(__dirname, '..', 'dados_demo', 'eventos_ava_demo.csv'), 'utf8');
  const before = repository.readEvents().length;
  const dry = ava.importEvents(csv, { dryRun: true });
  assert.equal(dry.recebidos, 10);
  assert.equal(dry.aceitos, 5);
  assert.equal(dry.duplicados.length, 1);
  assert.deepEqual(dry.rejeitados.map((r) => r.linha), [8, 9, 10, 11]);
  assert.equal(repository.readEvents().length, before, 'dryRun não grava');

  const real = ava.importEvents(csv);
  assert.equal(real.aceitos, 5);
  const again = ava.importEvents(csv);
  assert.equal(again.aceitos, 0, 'reimportar o mesmo arquivo não duplica eventos');
  const source = ava.listSourceEvents({ studentId: 's6', subjectId: 'alg', week: '2026-02-23' });
  assert.equal(source.unicos, 3);
});

test('T20 revisão humana: validações, decisão registrada e não sobrescrita', async () => {
  repository.resetData();
  advanceTo('2026-04-06');
  const target = repository.listNotifications().find((n) => n.status === 'pending_review');
  assert.ok(target);
  const params = { notificationId: target.id };

  assert.equal((await call(controller.reviewNotification, { params, body: { decision: 'enviar', reviewer: 'Tutora' } })).status, 400);
  assert.equal((await call(controller.reviewNotification, { params, body: { decision: 'aceitar' } })).status, 400);
  assert.equal((await call(controller.reviewNotification, { params, body: { decision: 'descartar', reviewer: 'Tutora' } })).status, 400);
  assert.equal((await call(controller.reviewNotification, { params, body: { decision: 'ajustar', reviewer: 'Tutora', body: target.body } })).status, 400);

  const adjusted = await call(controller.reviewNotification, { params, body: { decision: 'ajustar', reviewer: 'Tutora Paula', body: 'Oi! Podemos conversar esta semana?', note: 'tom mais curto' } });
  assert.equal(adjusted.status, 200);
  assert.equal(adjusted.body.status, 'adjusted');
  assert.equal(adjusted.body.finalBody, 'Oi! Podemos conversar esta semana?');
  assert.ok(!adjusted.body.sentAt);

  const repeat = await call(controller.reviewNotification, { params, body: { decision: 'descartar', reviewer: 'Outra', note: 'x' } });
  assert.equal(repeat.status, 409);
  const reviews = await call(controller.listReviews);
  assert.equal(reviews.body.length, 1);
  assert.equal(reviews.body[0].review.reviewer, 'Tutora Paula');
});

test('T21 entradas inválidas da API recebem mensagem compreensível', async () => {
  repository.resetData();
  const badDate = await call(controller.updateSubject, { params: { studentId: 's1', subjectId: 'alg' }, body: { lastAvaAccess: '2026-13-01' } });
  assert.equal(badDate.status, 400);
  assert.match(badDate.body.message, /AAAA-MM-DD/);
  const future = await call(controller.updateSubject, { params: { studentId: 's1', subjectId: 'alg' }, body: { lastAvaAccess: '2026-12-01' } });
  assert.equal(future.status, 400);
  const badDays = await call(controller.advanceSimulation, { body: { days: 0 } });
  assert.equal(badDays.status, 400);
  const badWeek = await call(controller.listAvaEvents, { query: { studentId: 's1', week: 'ontem' } });
  assert.equal(badWeek.status, 400);
});
