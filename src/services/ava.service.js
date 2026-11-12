/**
 * Integra as regras puras do AVA (ava-rules.js) com a base de demonstração.
 *
 * Janela de análise: as DUAS ÚLTIMAS SEMANAS COMPLETAS (seg–dom) antes da data simulada.
 *   - semana "atual"    = semana completa mais recente;
 *   - semana "anterior" = a semana completa antes dela.
 * Uma semana só é comparável quando: (1) faz parte do semestre, (2) o aluno já tinha
 * histórico no AVA, (3) a coleta da semana está completa e (4) a turma tem eventos na
 * disciplina (turma inteira sem logs indica falha de coleta, não inatividade).
 */
const repository = require('../repositories/academic.repository');
const rules = require('./ava-rules');

let aggregateCache = { events: null, result: null };

const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function aggregateAll(data) {
  const events = repository.readEvents();
  if (aggregateCache.events === events) return aggregateCache.result;
  const knownStudents = new Set(data.students.map((s) => s.pseudoId));
  const knownSubjects = new Set(data.subjects.map((s) => s.id));
  const knownActivities = new Set((data.activities || []).map((a) => a.id));
  const aggregation = rules.aggregateWeekly(events, { knownStudents, knownSubjects, knownActivities });

  const byKey = new Map(aggregation.rows.map((row) => [`${row.aluno}|${row.disciplina}|${row.semana}`, row]));
  const classTotals = new Map();
  for (const row of aggregation.rows) {
    const key = `${row.disciplina}|${row.semana}`;
    classTotals.set(key, (classTotals.get(key) || 0) + row.eventos);
  }

  // Entregas deduplicadas por aluno (para pendências por prazo).
  const seen = new Set();
  const deliveriesByStudent = new Map();
  for (const event of events) {
    if (event.tipo !== 'entrega' || seen.has(event.id)) continue;
    seen.add(event.id);
    if (!deliveriesByStudent.has(event.aluno)) deliveriesByStudent.set(event.aluno, []);
    deliveriesByStudent.get(event.aluno).push(event);
  }

  const result = {
    byKey,
    classTotals,
    deliveriesByStudent,
    stats: {
      rawEvents: events.length,
      uniqueEvents: aggregation.uniqueEvents,
      duplicatesIgnored: aggregation.duplicates,
      invalidIgnored: aggregation.invalid.length
    }
  };
  aggregateCache = { events, result };
  return result;
}

function analysisWindow(data, referenceDate) {
  const current = rules.weekStart(referenceDate || data.simulation.currentDate);
  const atual = rules.addDays(current, -7);
  const anterior = rules.addDays(current, -14);
  return { atual, anterior, current };
}

function weekKnownForStudent(data, student, week) {
  if (week < rules.weekStart(data.simulation.startDate)) return { known: false, reason: 'semana anterior ao início do semestre' };
  if (student.avaHistoryFrom && week < rules.weekStart(student.avaHistoryFrom)) {
    return { known: false, reason: `histórico do AVA disponível somente a partir de ${br(student.avaHistoryFrom)}` };
  }
  return { known: true };
}

function weekCollection(data, week) {
  const asOf = rules.addDays(data.simulation.currentDate, -1);
  return rules.collectionQuality(data.simulation.collectionLog, week, asOf);
}

/** Indicadores de uma semana para aluno × disciplina, ou null quando desconhecidos. */
function weekIndicators(data, agg, student, subjectId, week, { partial = false } = {}) {
  const known = weekKnownForStudent(data, student, week);
  if (!known.known) return { value: null, reason: known.reason };
  const collection = weekCollection(data, week);
  if (partial && collection.expectedDays === 0) return { value: null, reason: 'semana começando hoje', notStarted: true };
  if (partial && (collection.failed.length || collection.missing.length)) {
    return { value: null, reason: `coleta incompleta na semana em andamento (${collection.collectedDays} de ${collection.expectedDays} dias)`, collection };
  }
  if (!partial && collection.status !== 'completa') {
    return { value: null, reason: `coleta incompleta na semana de ${br(week)} (${collection.collectedDays} de ${collection.expectedDays} dias)`, collection };
  }
  const classTotal = agg.classTotals.get(`${subjectId}|${week}`) || 0;
  if (classTotal === 0 && !partial) {
    return { value: null, reason: `nenhum evento da turma nesta disciplina na semana de ${br(week)}: conferir a coleta`, collection, classWithoutLogs: true };
  }
  const row = agg.byKey.get(`${student.pseudoId}|${subjectId}|${week}`);
  return {
    value: row
      ? { eventos: row.eventos, diasAtivos: row.diasAtivos, entregas: row.entregas, eventIds: row.eventIds }
      : { eventos: 0, diasAtivos: 0, entregas: 0, eventIds: [] },
    collection
  };
}

function subjectAnalysis(data, agg, student, subject, window, options = {}) {
  const atual = weekIndicators(data, agg, student, subject.id, window.atual);
  const anterior = weekIndicators(data, agg, student, subject.id, window.anterior);
  const referenceDate = rules.weekEnd(window.atual);
  const activities = (data.activities || []).filter((a) => a.subjectId === subject.id);
  const deliveries = (agg.deliveriesByStudent.get(student.pseudoId) || []).filter((e) => activities.some((a) => a.id === e.atividade));
  // Pendências dependem de conhecer as entregas: sem histórico, também são desconhecidas.
  const pendingKnown = weekKnownForStudent(data, student, window.atual).known;
  const pending = pendingKnown ? rules.pendingFromDeadlines(activities, deliveries, referenceDate) : null;

  const result = rules.suggest(atual.value, anterior.value, pending ? pending.count : null, options);
  const reasonsIncomplete = [anterior.reason, atual.reason].filter(Boolean);
  return {
    subjectId: subject.id,
    subjectName: subject.name,
    periodo: {
      anterior: { inicio: window.anterior, fim: rules.weekEnd(window.anterior) },
      atual: { inicio: window.atual, fim: rules.weekEnd(window.atual) }
    },
    anterior: anterior.value && { eventos: anterior.value.eventos, diasAtivos: anterior.value.diasAtivos, entregas: anterior.value.entregas },
    atual: atual.value && { eventos: atual.value.eventos, diasAtivos: atual.value.diasAtivos, entregas: atual.value.entregas },
    pendencias: pending,
    resultado: result,
    dadosIncompletos: [...new Set(reasonsIncomplete)]
  };
}

function overallState(subjects) {
  if (subjects.some((s) => s.resultado.estado === 'revisar')) return 'revisar';
  if (subjects.some((s) => s.resultado.estado === 'incompleto')) return 'incompleto';
  return 'sem_sinal';
}

function collectionSummary(data, window) {
  return {
    anterior: weekCollection(data, window.anterior),
    atual: weekCollection(data, window.atual)
  };
}

/** Análise semanal de um aluno em todas as disciplinas. */
function getStudentWeekly(studentId, { referenceDate, dropRatio } = {}) {
  const data = repository.readData();
  const student = data.students.find((s) => s.id === studentId);
  if (!student) return null;
  const agg = aggregateAll(data);
  const window = analysisWindow(data, referenceDate);
  const subjects = data.subjects.map((subject) => subjectAnalysis(data, agg, student, subject, window, { dropRatio }));
  return {
    studentId: student.id,
    pseudoId: student.pseudoId,
    avaHistoryFrom: student.avaHistoryFrom || null,
    periodo: subjects[0]?.periodo,
    estado: overallState(subjects),
    coleta: collectionSummary(data, window),
    subjects
  };
}

/** Histórico semanal (últimas N semanas) de um aluno, para o gráfico do perfil. */
function getStudentHistory(studentId, weeks = 8) {
  const data = repository.readData();
  const student = data.students.find((s) => s.id === studentId);
  if (!student) return null;
  const agg = aggregateAll(data);
  const current = rules.weekStart(data.simulation.currentDate);
  const list = [];
  for (let i = weeks; i >= 0; i -= 1) {
    const week = rules.addDays(current, -7 * i);
    if (week < rules.weekStart(data.simulation.startDate)) continue;
    list.push(week);
  }
  return {
    weeks: list.map((week) => ({ semana: week, parcial: week === current, coleta: weekCollection(data, week) })),
    subjects: data.subjects.map((subject) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      color: subject.color,
      values: list.map((week) => {
        const r = weekIndicators(data, agg, student, subject.id, week, { partial: week === current });
        if (r.notStarted) return { semana: week, naoIniciada: true };
        return r.value
          ? { semana: week, eventos: r.value.eventos, diasAtivos: r.value.diasAtivos, entregas: r.value.entregas, parcial: week === current }
          : { semana: week, desconhecido: true, motivo: r.reason };
      })
    }))
  };
}

/** Visão da turma: coleta por semana, totais por disciplina e estado de cada aluno. */
function getClassOverview(classId) {
  const data = repository.readData();
  const agg = aggregateAll(data);
  const window = analysisWindow(data);
  const startWeek = rules.weekStart(data.simulation.startDate);
  const current = rules.weekStart(data.simulation.currentDate);
  const weeks = [];
  for (let week = startWeek; week <= current; week = rules.addDays(week, 7)) weeks.push(week);

  const students = data.students.filter((s) => s.classId === classId);
  const studentStates = students.map((student) => {
    const subjects = data.subjects.map((subject) => subjectAnalysis(data, agg, student, subject, window));
    return {
      studentId: student.id,
      name: student.name,
      pseudoId: student.pseudoId,
      estado: overallState(subjects),
      revisar: subjects.filter((s) => s.resultado.estado === 'revisar').map((s) => ({ subjectId: s.subjectId, motivos: s.resultado.motivos })),
      incompletos: [...new Set(subjects.flatMap((s) => s.dadosIncompletos))]
    };
  });

  return {
    periodo: { anterior: window.anterior, atual: window.atual },
    stats: agg.stats,
    weeks: weeks.map((week) => {
      const collection = weekCollection(data, week);
      return {
        semana: week,
        parcial: week === current,
        coleta: collection,
        disciplinas: data.subjects.map((subject) => {
          const total = agg.classTotals.get(`${subject.id}|${week}`) || 0;
          return { subjectId: subject.id, eventos: total, semLogs: total === 0 && collection.collectedDays > 0 };
        })
      };
    }),
    incidents: data.simulation.collectionIncidents || [],
    counts: studentStates.reduce((acc, s) => { acc[s.estado] = (acc[s.estado] || 0) + 1; return acc; }, { revisar: 0, sem_sinal: 0, incompleto: 0 }),
    students: studentStates
  };
}

/** Eventos de origem de um agregado (rastreabilidade). Retorna pseudônimos, nunca nomes. */
function listSourceEvents({ studentId, subjectId, week }) {
  const data = repository.readData();
  const student = data.students.find((s) => s.id === studentId);
  if (!student) return null;
  if (!rules.parseIsoDate(week)) return { error: 'Semana inválida. Use a segunda-feira no formato AAAA-MM-DD.' };
  const start = rules.weekStart(week);
  const end = rules.weekEnd(start);
  const seen = new Set();
  const rows = repository.readEvents()
    .filter((e) => e.aluno === student.pseudoId && (!subjectId || e.disciplina === subjectId) && e.data >= start && e.data.slice(0, 10) <= end)
    .map((e) => {
      const duplicate = seen.has(e.id);
      seen.add(e.id);
      return { ...e, duplicado: duplicate };
    });
  return { aluno: student.pseudoId, semana: start, total: rows.length, unicos: seen.size, eventos: rows };
}

/** Importação de eventos (CSV ou JSON). dryRun valida sem gravar. */
function importEvents(input, { dryRun = false } = {}) {
  let rows;
  if (typeof input === 'string') {
    const parsed = rules.parseEventsCsv(input);
    if (parsed.error) return { ok: false, error: parsed.error };
    rows = parsed.rows;
  } else if (Array.isArray(input)) {
    rows = input.map((row, index) => ({ linha: index + 1, ...row }));
  } else {
    return { ok: false, error: 'Envie um CSV (campo "csv") ou uma lista de eventos (campo "events").' };
  }
  if (!rows.length) return { ok: false, error: 'Arquivo sem linhas de evento.' };
  if (rows.length > 5000) return { ok: false, error: 'Limite de 5000 eventos por importação.' };

  const data = repository.readData();
  const options = {
    knownStudents: new Set(data.students.map((s) => s.pseudoId)),
    knownSubjects: new Set(data.subjects.map((s) => s.id)),
    knownActivities: new Set((data.activities || []).map((a) => a.id))
  };
  const existing = new Set(repository.readEvents().map((e) => e.id));
  const accepted = [];
  const duplicates = [];
  const rejected = [];
  for (const row of rows) {
    const event = { id: row.id, aluno: row.aluno, disciplina: row.disciplina, data: row.data, tipo: row.tipo };
    if (row.atividade) event.atividade = row.atividade;
    const reason = rules.validateEvent(event, options);
    if (reason) { rejected.push({ linha: row.linha, id: row.id || null, motivo: reason }); continue; }
    if (existing.has(event.id)) { duplicates.push({ linha: row.linha, id: event.id }); continue; }
    existing.add(event.id);
    accepted.push({ ...event, data: event.data.slice(0, 10), origem: 'importacao' });
  }
  if (!dryRun && accepted.length) repository.appendEvents(accepted);
  return {
    ok: true,
    dryRun,
    recebidos: rows.length,
    aceitos: accepted.length,
    duplicados: duplicates,
    rejeitados: rejected,
    mensagem: dryRun
      ? `${accepted.length} evento(s) seriam importados, ${duplicates.length} duplicado(s) ignorado(s), ${rejected.length} rejeitado(s).`
      : `${accepted.length} evento(s) importado(s); ${duplicates.length} duplicado(s) ignorado(s); ${rejected.length} rejeitado(s).`
  };
}

module.exports = {
  getStudentWeekly,
  getStudentHistory,
  getClassOverview,
  listSourceEvents,
  importEvents,
  analysisWindow
};
