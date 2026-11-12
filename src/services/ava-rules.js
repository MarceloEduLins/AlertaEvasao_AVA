/**
 * Regras centrais do AVA (funções puras, sem acesso a arquivo).
 *
 * Contrato combinado em aula (Aulas 07–11, equipe 08):
 *  - agregar eventos por aluno pseudonimizado × disciplina × semana (seg–dom);
 *  - o mesmo evento importado duas vezes conta uma vez (deduplicação pelo ID);
 *  - dois eventos no mesmo dia contam dois eventos e um dia ativo;
 *  - pendências vêm de atividades previstas e prazos, não da soma dos logs;
 *  - histórico desconhecido NÃO equivale a zero atividade;
 *  - a saída é uma sugestão revisável, nunca um rótulo de evasão.
 */

const EVENT_TYPES = ['acesso', 'material', 'forum', 'entrega'];
/** Corte didático da queda de atividade. Precisa ser calibrado com a equipe pedagógica. */
const DEFAULT_DROP_RATIO = 0.5;
/**
 * Base mínima para avaliar queda: abaixo disso, a variação semanal de uma disciplina é ruído
 * (ex.: 3 → 1 evento). Decisão registrada em docs/decisoes.md; também precisa de calibração.
 */
const DEFAULT_MIN_BASELINE = 5;
/** Uma atividade vencida e não entregue deixa de contar como pendente após esta janela. */
const PENDING_WINDOW_DAYS = 21;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  if (!ISO_DATE.test(day)) return null;
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  return date;
}

function isoDay(date) { return date.toISOString().slice(0, 10); }

function addDays(value, days) {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

/** Segunda-feira (ISO) da semana que contém a data. */
function weekStart(value) {
  const date = parseIsoDate(value);
  if (!date) throw new Error(`Data inválida: ${value}`);
  const weekday = (date.getUTCDay() + 6) % 7; // 0 = segunda
  date.setUTCDate(date.getUTCDate() - weekday);
  return isoDay(date);
}

function weekEnd(start) { return addDays(start, 6); }

function daysBetween(from, to) {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / 86400000);
}

/**
 * Valida um evento do AVA. Retorna `null` se válido ou o motivo da rejeição.
 * Campos: id, aluno (pseudônimo), disciplina, data (YYYY-MM-DD ou ISO), tipo, atividade (só em entrega).
 */
function validateEvent(event, { knownStudents, knownSubjects, knownActivities } = {}) {
  if (!event || typeof event !== 'object') return 'registro vazio';
  if (typeof event.id !== 'string' || !event.id.trim()) return 'id ausente';
  if (typeof event.aluno !== 'string' || !event.aluno.trim()) return 'aluno (pseudônimo) ausente';
  if (knownStudents && !knownStudents.has(event.aluno)) return `aluno desconhecido: ${event.aluno}`;
  if (typeof event.disciplina !== 'string' || !event.disciplina.trim()) return 'disciplina ausente';
  if (knownSubjects && !knownSubjects.has(event.disciplina)) return `disciplina desconhecida: ${event.disciplina}`;
  if (!parseIsoDate(event.data)) return `data inválida: ${event.data ?? '(vazia)'}`;
  if (!EVENT_TYPES.includes(event.tipo)) return `tipo inválido: ${event.tipo ?? '(vazio)'} (use ${EVENT_TYPES.join(', ')})`;
  if (event.tipo === 'entrega') {
    if (!event.atividade) return 'entrega sem atividade';
    if (knownActivities && !knownActivities.has(event.atividade)) return `atividade desconhecida: ${event.atividade}`;
  }
  return null;
}

/**
 * Agrega eventos por aluno × disciplina × semana.
 * Eventos repetidos (mesmo id) são contados uma única vez; inválidos são ignorados e relatados.
 */
function aggregateWeekly(events, options = {}) {
  const seen = new Set();
  const groups = new Map();
  let duplicates = 0;
  const invalid = [];

  for (const event of events || []) {
    const reason = validateEvent(event, options);
    if (reason) { invalid.push({ id: event?.id ?? null, reason }); continue; }
    if (seen.has(event.id)) { duplicates += 1; continue; }
    seen.add(event.id);

    const day = event.data.slice(0, 10);
    const semana = weekStart(day);
    const key = `${event.aluno}|${event.disciplina}|${semana}`;
    let group = groups.get(key);
    if (!group) {
      group = { aluno: event.aluno, disciplina: event.disciplina, semana, eventos: 0, dias: new Set(), entregas: 0, eventIds: [] };
      groups.set(key, group);
    }
    group.eventos += 1;
    group.dias.add(day);
    if (event.tipo === 'entrega') group.entregas += 1;
    group.eventIds.push(event.id);
  }

  const rows = [...groups.values()].map(({ dias, ...rest }) => ({ ...rest, diasAtivos: dias.size }));
  return { rows, uniqueEvents: seen.size, duplicates, invalid };
}

/**
 * Pendências por prazo: atividades com prazo até `referenceDate`, ainda sem entrega até essa data
 * e vencidas há no máximo `windowDays` dias.
 */
function pendingFromDeadlines(activities, deliveries, referenceDate, { windowDays = PENDING_WINDOW_DAYS } = {}) {
  const deliveredAt = new Map();
  for (const delivery of deliveries || []) {
    const current = deliveredAt.get(delivery.atividade);
    if (!current || delivery.data < current) deliveredAt.set(delivery.atividade, delivery.data.slice(0, 10));
  }
  const pending = [];
  const deliveredLate = [];
  const deliveredOnTime = [];
  for (const activity of activities || []) {
    if (activity.dueDate > referenceDate) continue;
    const delivered = deliveredAt.get(activity.id);
    if (delivered && delivered <= referenceDate) {
      (delivered <= activity.dueDate ? deliveredOnTime : deliveredLate).push(activity.id);
      continue;
    }
    if (daysBetween(activity.dueDate, referenceDate) <= windowDays) {
      pending.push({ id: activity.id, title: activity.title, dueDate: activity.dueDate });
    }
  }
  return { count: pending.length, items: pending, deliveredOnTime: deliveredOnTime.length, deliveredLate: deliveredLate.length };
}

/**
 * Completude da coleta em uma semana: compara os dias esperados (até `asOf`)
 * com o registro diário da coleta. Dia sem registro ou com falha deixa a semana incompleta.
 */
function collectionQuality(collectionLog, start, asOf) {
  const byDate = new Map((collectionLog || []).map((item) => [item.date, item]));
  const end = weekEnd(start);
  const last = asOf && asOf < end ? asOf : end;
  const expected = [];
  for (let day = start; day <= last; day = addDays(day, 1)) expected.push(day);
  const failed = [];
  const missing = [];
  for (const day of expected) {
    const entry = byDate.get(day);
    if (!entry) missing.push(day);
    else if (entry.status !== 'ok') failed.push({ date: day, note: entry.note || 'falha na coleta' });
  }
  const complete = expected.length === 7 && !failed.length && !missing.length;
  return {
    semana: start,
    expectedDays: expected.length,
    collectedDays: expected.length - failed.length - missing.length,
    failed,
    missing,
    status: complete ? 'completa' : 'incompleta'
  };
}

/**
 * Sugestão de apoio revisável (base da Aula 08/09, adaptada).
 * atual/anterior: { eventos, diasAtivos } ou null quando desconhecido.
 * pendentes: número inteiro ou null quando desconhecido.
 */
function suggest(atual, anterior, pendentes, { dropRatio = DEFAULT_DROP_RATIO, minBaseline = DEFAULT_MIN_BASELINE } = {}) {
  if (atual == null || anterior == null || pendentes == null) {
    return { estado: 'incompleto', motivos: [], acao: 'conferir dados', revisarAntesDeEnviar: true };
  }
  const motivos = [];
  if (anterior.eventos > 0 && anterior.eventos >= minBaseline && atual.eventos <= anterior.eventos * dropRatio) {
    motivos.push('queda de atividade');
  }
  if (pendentes > 0) motivos.push('atividade pendente');
  return {
    estado: motivos.length ? 'revisar' : 'sem_sinal',
    motivos,
    acao: motivos.length ? 'oferecer apoio' : null,
    revisarAntesDeEnviar: true
  };
}

/** Converte CSV simples (cabeçalho: id,aluno,disciplina,data,tipo,atividade) em eventos. */
function parseEventsCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  const header = (lines.shift() || '').split(/[;,]/).map((item) => item.trim().toLowerCase());
  const required = ['id', 'aluno', 'disciplina', 'data', 'tipo'];
  const missing = required.filter((name) => !header.includes(name));
  if (missing.length) return { error: `Cabeçalho inválido: faltam as colunas ${missing.join(', ')}.`, rows: [] };
  const rows = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const values = line.split(/[;,]/).map((item) => item.trim());
    const row = { linha: index + 2 };
    header.forEach((name, position) => { row[name] = values[position] || undefined; });
    rows.push(row);
  });
  return { error: null, rows };
}

module.exports = {
  EVENT_TYPES,
  DEFAULT_DROP_RATIO,
  DEFAULT_MIN_BASELINE,
  PENDING_WINDOW_DAYS,
  parseIsoDate,
  addDays,
  weekStart,
  weekEnd,
  daysBetween,
  validateEvent,
  aggregateWeekly,
  pendingFromDeadlines,
  collectionQuality,
  suggest,
  parseEventsCsv
};
