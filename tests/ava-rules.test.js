// Matriz de cenários da Aula 09 (equipe 08) + casos de fronteira e inválidos.
// Os IDs T01..T13 são os mesmos usados em docs/evidencias.csv.
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/services/ava-rules');

const ev = (id, aluno, disciplina, data, tipo = 'acesso', extra = {}) => ({ id, aluno, disciplina, data, tipo, ...extra });

test('T01 mesmo evento importado duas vezes conta uma vez pelo ID', () => {
  const result = rules.aggregateWeekly([
    ev('e1', 'ps-a', 'alg', '2026-03-03'),
    ev('e1', 'ps-a', 'alg', '2026-03-03')
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].eventos, 1);
  assert.equal(result.duplicates, 1);
});

test('T02 dois eventos distintos no mesmo dia: dois eventos e um dia ativo', () => {
  const { rows } = rules.aggregateWeekly([
    ev('e1', 'ps-a', 'alg', '2026-03-03T08:00:00Z'),
    ev('e2', 'ps-a', 'alg', '2026-03-03T21:30:00Z', 'material')
  ]);
  assert.deepEqual([rows[0].eventos, rows[0].diasAtivos], [2, 1]);
});

test('T03 virada de semana: domingo e segunda caem em semanas diferentes (seg–dom)', () => {
  const { rows } = rules.aggregateWeekly([
    ev('e1', 'ps-a', 'alg', '2026-03-08'), // domingo
    ev('e2', 'ps-a', 'alg', '2026-03-09')  // segunda
  ]);
  assert.deepEqual(rows.map((r) => r.semana).sort(), ['2026-03-02', '2026-03-09']);
});

test('T04 escopo aluno × disciplina: grupos não se misturam', () => {
  const { rows } = rules.aggregateWeekly([
    ev('e1', 'ps-a', 'alg', '2026-03-03'),
    ev('e2', 'ps-a', 'fil', '2026-03-03'),
    ev('e3', 'ps-b', 'alg', '2026-03-03')
  ]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.eventos === 1));
});

test('T05 evento inválido é rejeitado com motivo e não entra na contagem', () => {
  const result = rules.aggregateWeekly([
    ev('e1', 'ps-a', 'alg', '2026-02-31'),
    ev('e2', 'ps-a', 'alg', '2026-03-03', 'login'),
    { aluno: 'ps-a', disciplina: 'alg', data: '2026-03-03', tipo: 'acesso' },
    ev('e4', 'ps-a', 'alg', '2026-03-03', 'entrega')
  ]);
  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.invalid.map((i) => i.reason.split(':')[0]), ['data inválida', 'tipo inválido', 'id ausente', 'entrega sem atividade']);
});

test('T06 histórico desconhecido não equivale a zero: estado incompleto, conferir dados', () => {
  assert.deepEqual(rules.suggest(null, { eventos: 20 }, 1), { estado: 'incompleto', motivos: [], acao: 'conferir dados', revisarAntesDeEnviar: true });
  assert.equal(rules.suggest({ eventos: 10 }, null, 0).estado, 'incompleto');
  assert.equal(rules.suggest({ eventos: 10 }, { eventos: 20 }, null).estado, 'incompleto');
});

test('T07 de 20 para 10 eventos e uma pendência: sugerir apoio com dois motivos', () => {
  const result = rules.suggest({ eventos: 10 }, { eventos: 20 }, 1);
  assert.equal(result.estado, 'revisar');
  assert.deepEqual(result.motivos, ['queda de atividade', 'atividade pendente']);
  assert.equal(result.acao, 'oferecer apoio');
  assert.equal(result.revisarAntesDeEnviar, true);
});

test('T08 fronteira do corte de 50%: 10 de 20 é queda; 11 de 20 não é', () => {
  assert.deepEqual(rules.suggest({ eventos: 10 }, { eventos: 20 }, 0).motivos, ['queda de atividade']);
  assert.equal(rules.suggest({ eventos: 11 }, { eventos: 20 }, 0).estado, 'sem_sinal');
});

test('T09 zero conhecido é diferente de desconhecido; semana anterior zerada não gera queda', () => {
  assert.equal(rules.suggest({ eventos: 0 }, { eventos: 0 }, 0).estado, 'sem_sinal');
  assert.deepEqual(rules.suggest({ eventos: 0 }, { eventos: 12 }, 0).motivos, ['queda de atividade']);
});

test('T10 base mínima: variação pequena (4 → 0) não é tratada como queda', () => {
  assert.equal(rules.suggest({ eventos: 0 }, { eventos: 4 }, 0).estado, 'sem_sinal');
  assert.equal(rules.suggest({ eventos: 0 }, { eventos: 4 }, 0, { minBaseline: 1 }).estado, 'revisar');
});

test('T11 pendências vêm de prazos e entregas, não da soma dos logs', () => {
  const activities = [
    { id: 'a1', title: 'A1', dueDate: '2026-03-06' }, // entregue no prazo
    { id: 'a2', title: 'A2', dueDate: '2026-03-13' }, // entregue atrasada
    { id: 'a3', title: 'A3', dueDate: '2026-03-20' }, // não entregue → pendente
    { id: 'a4', title: 'A4', dueDate: '2026-02-20' }, // vencida há mais de 21 dias → fora da janela
    { id: 'a5', title: 'A5', dueDate: '2026-03-27' }  // prazo futuro → não pendente
  ];
  const deliveries = [
    { atividade: 'a1', data: '2026-03-05' },
    { atividade: 'a2', data: '2026-03-15' },
    { atividade: 'a5', data: '2026-03-30' } // entrega depois da referência não conta
  ];
  const result = rules.pendingFromDeadlines(activities, deliveries, '2026-03-22');
  assert.equal(result.count, 1);
  assert.equal(result.items[0].id, 'a3');
  assert.equal(result.deliveredOnTime, 1);
  assert.equal(result.deliveredLate, 1);
});

test('T12 completude da coleta: falha ou dia sem registro deixa a semana incompleta', () => {
  const ok = (date) => ({ date, status: 'ok' });
  const days = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'];
  assert.equal(rules.collectionQuality(days.map(ok), '2026-03-02').status, 'completa');
  const withFailure = days.map((d) => (d === '2026-03-04' ? { date: d, status: 'falha', note: 'exportação' } : ok(d)));
  const failed = rules.collectionQuality(withFailure, '2026-03-02');
  assert.equal(failed.status, 'incompleta');
  assert.equal(failed.collectedDays, 6);
  assert.equal(rules.collectionQuality(days.slice(0, 6).map(ok), '2026-03-02').missing[0], '2026-03-08');
  assert.equal(rules.collectionQuality(days.map(ok), '2026-03-02', '2026-03-04').status, 'incompleta', 'semana em andamento não é completa');
});

test('T13 CSV: cabeçalho obrigatório e número da linha preservado para mensagens de erro', () => {
  assert.match(rules.parseEventsCsv('id,aluno,data\n1,2,3').error, /disciplina, tipo/);
  const parsed = rules.parseEventsCsv('id,aluno,disciplina,data,tipo\r\ne1,ps-a,alg,2026-03-03,acesso\n\ne2,ps-a,alg,2026-03-04,forum');
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.rows.map((r) => r.linha), [2, 4]);
});
