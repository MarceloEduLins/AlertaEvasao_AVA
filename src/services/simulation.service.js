const repository = require('../repositories/academic.repository');
const academic = require('./academic.service');
const notificationService = require('./notification.service');
const avaRules = require('./ava-rules');
const avaService = require('./ava.service');

const DAY = 86400000;

function parseDate(value) { return new Date(`${value}T12:00:00Z`); }
function iso(date) { return new Date(date).toISOString().slice(0, 10); }
function addDays(value, days) { const d = parseDate(value); d.setUTCDate(d.getUTCDate() + days); return iso(d); }
function compareDate(a,b) { return parseDate(a) - parseDate(b); }
function betweenExclusiveInclusive(date, from, to) { return compareDate(date, from) > 0 && compareDate(date, to) <= 0; }

function hashFloat(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function subjectById(data, id) { return data.subjects.find((s) => s.id === id); }
function studentById(data, id) { return data.students.find((s) => s.id === id); }
function enrollment(data, studentId, subjectId) { return data.enrollments.find((e) => e.studentId === studentId && e.subjectId === subjectId); }

function absenceRate(student, subjectId, date) {
  const base = {
    stable: 0.025,
    attendance_risk: 0.22,
    exam_difficulty: 0.055,
    project_difficulty: 0.065,
    ava_disengagement: 0.075,
    mixed_risk: 0.14
  }[student.archetype] ?? 0.06;

  if (student.focus && subjectId === 'fil' && compareDate(date, '2026-04-01') >= 0) return 0.30;
  if (student.focus && subjectId === 'exp' && compareDate(date, '2026-04-15') >= 0) return 0.19;
  return base;
}

function simulateOneDay(data, date, ctx) {
  const d = parseDate(date);
  const day = d.getUTCDay();
  const schedule = data.timetable.find((item) => item.day === day);
  if (schedule) {
    schedule.periods.forEach((subjectId, periodIndex) => {
      const subject = subjectById(data, subjectId);
      data.students.forEach((student) => {
        const e = enrollment(data, student.id, subjectId);
        if (!e || e.classesHeld >= subject.totalClasses) return;
        e.classesHeld += 1;
        const miss = hashFloat(`${student.id}|${subjectId}|${date}|${periodIndex}|absence`) < absenceRate(student, subjectId, date);
        if (miss) e.absences += 1;
      });
    });
  }

  simulateAvaDay(data, date, ctx);
}

// Cada aluno estuda cada disciplina em ~3 dias fixos da semana; a "regularidade" é a chance
// de manter esse hábito. Isso deixa a série semanal realista (pouco ruído para quem é regular).
const STUDY_REGULARITY = { stable: 0.95, attendance_risk: 0.82, exam_difficulty: 0.9, project_difficulty: 0.82, ava_disengagement: 0.6, mixed_risk: 0.65 };
const DELIVERY_CHANCE = { stable: 0.9, attendance_risk: 0.6, exam_difficulty: 0.8, project_difficulty: 0.45, ava_disengagement: 0.3, mixed_risk: 0.35 };

function studyDays(student, subjectId) {
  const days = [];
  for (let weekday = 0; weekday < 7 && days.length < 3; weekday += 1) {
    if (hashFloat(`${student.id}|${subjectId}|studyday|${weekday}`) < 0.45) days.push(weekday);
  }
  while (days.length < 3) days.push(Math.floor(hashFloat(`${student.id}|${subjectId}|extra|${days.length}`) * 7));
  return new Set(days);
}

function studyRegularity(student, date) {
  if (student.focus && compareDate(date, '2026-05-10') >= 0 && compareDate(date, '2026-06-01') < 0) return 0;
  if (student.archetype === 'ava_disengagement' && compareDate(date, '2026-04-20') >= 0) return 0.15;
  return STUDY_REGULARITY[student.archetype] ?? 0.8;
}
const BROWSE_TYPES = ['acesso', 'material', 'forum'];
const DUPLICATE_EXPORT_CHANCE = 0.03;

/** Contexto mantido durante um avanço: eventos novos e entregas já feitas. */
function buildAvaContext(data) {
  const existing = repository.readEvents();
  const delivered = new Set();
  for (const event of existing) if (event.tipo === 'entrega') delivered.add(`${event.aluno}|${event.atividade}`);
  return { newEvents: [], delivered, deliveries: new Map() };
}

function incidentFor(data, date) {
  return (data.simulation.collectionIncidents || []).filter((item) => compareDate(date, item.from) >= 0 && compareDate(date, item.to) <= 0);
}

function forcedAccess(student, date) {
  return Boolean(student.focus && (date === '2026-05-09' || date === '2026-06-01'));
}

/**
 * Simula a atividade real dos alunos no AVA e a exportação diária para o sistema.
 * O que o sistema enxerga são apenas os eventos exportados; dias de falha de coleta
 * perdem os eventos e ficam registrados no log da coleta.
 */
function simulateAvaDay(data, date, ctx) {
  const incidents = incidentFor(data, date);
  const exportFailure = incidents.find((item) => item.type === 'export_failure');
  const silentSubjects = new Set(incidents.filter((item) => item.type === 'silent_gap').map((item) => item.subjectId));
  data.simulation.collectionLog ||= [];
  data.simulation.collectionLog = data.simulation.collectionLog.filter((item) => item.date !== date);
  data.simulation.collectionLog.push(exportFailure
    ? { date, status: 'falha', note: exportFailure.note }
    : { date, status: 'ok', note: null });

  const activitiesBySubject = new Map();
  for (const activity of data.activities || []) {
    if (!activitiesBySubject.has(activity.subjectId)) activitiesBySubject.set(activity.subjectId, []);
    activitiesBySubject.get(activity.subjectId).push(activity);
  }

  data.students.forEach((student) => {
    const weekday = (parseDate(date).getUTCDay() + 6) % 7;
    const regularity = studyRegularity(student, date);
    const dayEvents = [];
    let counter = 0;
    const makeEvent = (subjectId, tipo, extra = {}) => {
      counter += 1;
      return { id: `ev-${date}-${student.pseudoId}-${subjectId}-${counter}`, aluno: student.pseudoId, disciplina: subjectId, data: date, tipo, origem: 'exportacao-diaria', ...extra };
    };

    data.subjects.forEach((subject) => {
      const studies = (studyDays(student, subject.id).has(weekday) && hashFloat(`${student.id}|${subject.id}|${date}|study`) < regularity)
        || forcedAccess(student, date);
      if (!studies) return;
      {
        const count = 2 + Math.floor(hashFloat(`${student.id}|${subject.id}|${date}|count`) * 2);
        for (let i = 0; i < count; i += 1) {
          dayEvents.push(makeEvent(subject.id, BROWSE_TYPES[Math.floor(hashFloat(`${student.id}|${subject.id}|${date}|type|${i}`) * 3)]));
        }
      }
      // Entregas: atividade aberta (até 6 dias antes do prazo) ou atrasada há até 21 dias.
      const isReturn = student.focus && date === '2026-06-01';
      const open = (activitiesBySubject.get(subject.id) || [])
        .filter((activity) => !ctx.delivered.has(`${student.pseudoId}|${activity.id}`))
        .filter((activity) => compareDate(date, addDays(activity.dueDate, -6)) >= 0 && compareDate(date, addDays(activity.dueDate, 21)) <= 0)
        .sort((a, b) => compareDate(a.dueDate, b.dueDate));
      open.forEach((activity, index) => {
        const late = compareDate(date, activity.dueDate) > 0;
        let chance = (DELIVERY_CHANCE[student.archetype] ?? 0.5) * (late ? 0.6 : 1);
        if (isReturn) chance = subject.id === 'exp' && index === open.length - 1 ? 0 : 1; // retoma, mas deixa 1 pendência
        if (hashFloat(`${student.id}|${activity.id}|${date}|deliver`) < chance) {
          ctx.delivered.add(`${student.pseudoId}|${activity.id}`);
          dayEvents.push(makeEvent(subject.id, 'entrega', { atividade: activity.id }));
        }
      });
    });
    if (!dayEvents.length) return;

    // Aluno ainda sem histórico vinculado ao AVA: a atividade existe, mas o sistema não a recebe.
    if (student.avaHistoryFrom && compareDate(date, student.avaHistoryFrom) < 0) return;
    if (exportFailure) return;

    const exported = dayEvents.filter((event) => !silentSubjects.has(event.disciplina));
    exported.forEach((event) => {
      ctx.newEvents.push(event);
      // Reexportação ocasional do mesmo evento: o agregador precisa contar uma vez pelo ID.
      if (hashFloat(`${event.id}|dup`) < DUPLICATE_EXPORT_CHANCE) ctx.newEvents.push({ ...event });
    });
    if (exported.length) data.enrollments.filter((e) => e.studentId === student.id).forEach((e) => { e.lastAvaAccess = date; });
  });
}

/** Atualiza o contador de pendências a partir de prazos e entregas conhecidas. */
function refreshPending(data, date, ctx) {
  const allEvents = [...repository.readEvents(), ...ctx.newEvents];
  const deliveriesByStudent = new Map();
  for (const event of allEvents) {
    if (event.tipo !== 'entrega') continue;
    if (!deliveriesByStudent.has(event.aluno)) deliveriesByStudent.set(event.aluno, []);
    deliveriesByStudent.get(event.aluno).push(event);
  }
  for (const enrollmentItem of data.enrollments) {
    const student = studentById(data, enrollmentItem.studentId);
    if (student.avaHistoryFrom && compareDate(date, student.avaHistoryFrom) < 0) { enrollmentItem.pendingActivities = 0; continue; }
    const activities = (data.activities || []).filter((a) => a.subjectId === enrollmentItem.subjectId);
    enrollmentItem.pendingActivities = avaRules.pendingFromDeadlines(activities, deliveriesByStudent.get(student.pseudoId) || [], date).count;
  }
}

function componentGrade(student, subject, ra, component, index) {
  let base = {
    stable: 8.3,
    attendance_risk: 7.2,
    exam_difficulty: 7.2,
    project_difficulty: 7.3,
    ava_disengagement: 6.9,
    mixed_risk: 6.4
  }[student.archetype] ?? 7;

  const type = component.type.toLowerCase();
  if (student.archetype === 'exam_difficulty' && type.includes('prova')) base -= 2.3;
  if (student.archetype === 'exam_difficulty' && (type.includes('projeto') || type.includes('seminário'))) base += 0.7;
  if (student.archetype === 'project_difficulty' && (type.includes('projeto') || type.includes('produção') || type.includes('artigo'))) base -= 2.2;
  if (student.archetype === 'project_difficulty' && type.includes('prova')) base += 0.5;
  if (student.archetype === 'ava_disengagement' && ['RA2','RA3'].includes(ra.id)) base -= 0.8;
  if (student.archetype === 'attendance_risk' && ['RA2','RA3'].includes(ra.id)) base -= 0.45;
  if (student.archetype === 'mixed_risk') base -= 0.45;

  const jitter = (hashFloat(`${student.id}|${subject.id}|${ra.id}|${component.type}|grade`) - 0.5) * 2.0;
  let grade = clamp(base + jitter, 2.0, 9.8);

  // História demonstrativa da aluna-foco: RA1 baixa por causa da prova, não do conjunto todo.
  if (student.focus && subject.id === 'alg' && ra.id === 'RA1') {
    if (type.includes('prova')) grade = 4.2;
    else grade = 7.8;
  }
  if (student.focus && subject.id === 'exp' && ra.id === 'RA1') {
    if (type.includes('projeto')) grade = 6.0;
    else grade = 7.4;
  }
  return Number(grade.toFixed(1));
}

function assessmentAverage(components) {
  const sumWeight = components.reduce((s,c) => s + Number(c.weight || 0), 0) || 1;
  return components.reduce((s,c) => s + c.grade * c.weight, 0) / sumWeight;
}

function appendLog(data, item) {
  data.simulation.activityLog.unshift({ id: `l${Date.now()}${Math.floor(hashFloat(JSON.stringify(item))*9999)}`, ...item });
  data.simulation.activityLog = data.simulation.activityLog.slice(0, 120);
}

function processCalendarEvents(data, from, to) {
  data.simulation.processedCalendarEvents ||= [];
  for (const subject of data.subjects) {
    for (const ra of subject.ras || []) {
      const examKey = `${subject.id}|${ra.id}|exam`;
      if (betweenExclusiveInclusive(ra.date, from, to) && !data.simulation.processedCalendarEvents.includes(examKey)) {
        appendLog(data, { date: ra.date, kind:'assessment', tone:'neutral', title:`${ra.id} realizada • ${subject.name}`, detail:`Componentes: ${ra.components.map(c=>c.type).join(' + ')}.` });
        data.simulation.processedCalendarEvents.push(examKey);
      }
      const releaseKey = `${subject.id}|${ra.id}|release`;
      if (betweenExclusiveInclusive(ra.releaseDate, from, to) && !data.simulation.processedCalendarEvents.includes(releaseKey)) {
        const grades = [];
        let below = 0;
        for (const student of data.students) {
          const e = enrollment(data, student.id, subject.id);
          const components = ra.components.map((component, index) => ({ ...component, grade: componentGrade(student, subject, ra, component, index) }));
          const avg = assessmentAverage(components);
          e.assessments[ra.id] = { date:ra.date, releaseDate:ra.releaseDate, components };
          grades.push(avg);
          if (avg < 7) below += 1;
          if (student.focus && avg < 7) {
            const weakest = [...components].sort((a,b)=>a.grade-b.grade)[0];
            appendLog(data, { date:ra.releaseDate, kind:'student', tone:'warning', studentId:student.id, title:`${student.name}: ${ra.id} abaixo da referência em ${subject.name}`, detail:`Média ${avg.toFixed(1)}. O componente que mais puxou a nota para baixo foi ${weakest.type} (${weakest.grade.toFixed(1)}).` });
          }
        }
        const mean = grades.reduce((a,b)=>a+b,0)/grades.length;
        appendLog(data, { date:ra.releaseDate, kind:'result', tone:below >= Math.ceil(data.students.length*0.35)?'warning':'neutral', title:`Resultados liberados • ${ra.id} de ${subject.name}`, detail:`Média da turma: ${mean.toFixed(1)}. ${below} de ${data.students.length} alunos ficaram abaixo de 7,0.` });
        data.simulation.processedCalendarEvents.push(releaseKey);
      }
    }
  }
}

function allowedAbsences(subject, requiredAttendance=75) {
  return Math.floor(subject.totalClasses * ((100-requiredAttendance)/100));
}

function applyFocusStory(data, from, to) {
  const s = studentById(data, data.simulation.focusStudentId);
  if (!s) return;
  const classData = data.classes.find(c=>c.id===s.classId);
  const required = classData.requiredAttendance || 75;
  const fil = subjectById(data,'fil');
  const filE = enrollment(data,s.id,'fil');

  if (betweenExclusiveInclusive('2026-04-20', from, to)) {
    filE.absences = Math.max(filE.absences, allowedAbsences(fil,required)-5);
    appendLog(data,{date:'2026-04-20',kind:'threshold',tone:'warning',studentId:s.id,title:`${s.name}: restam 5 faltas em Filosofia`,detail:'O sistema entrou na faixa de lembrete e preparou uma comunicação preventiva curta.'});
  }
  if (betweenExclusiveInclusive('2026-05-11', from, to)) {
    filE.absences = Math.max(filE.absences, allowedAbsences(fil,required)-2);
    appendLog(data,{date:'2026-05-11',kind:'threshold',tone:'danger',studentId:s.id,title:`${s.name}: restam somente 2 faltas em Filosofia`,detail:'O alerta de frequência evoluiu de lembrete para atenção.'});
  }

  // A queda de engajamento no AVA da aluna-foco vem da própria simulação de acesso
  // (sem acesso entre 10/05 e 31/05); aqui só registramos os marcos na linha do tempo.
  if (betweenExclusiveInclusive('2026-05-25', from, to)) {
    const last = data.enrollments.find((e) => e.studentId === s.id)?.lastAvaAccess;
    const days = last ? Math.round((parseDate('2026-05-25') - parseDate(last)) / DAY) : null;
    appendLog(data,{date:'2026-05-25',kind:'ava',tone:'danger',studentId:s.id,title:`${s.name}: ${days ?? '?'} dias sem acessar o AVA`,detail:'Sem acesso e com atividades vencidas: o sistema preparou uma sugestão de apoio para revisão.'});
  }
  if (betweenExclusiveInclusive('2026-06-01', from, to)) {
    appendLog(data,{date:'2026-06-01',kind:'intervention',tone:'success',studentId:s.id,title:`${s.name}: retomou o AVA`,detail:'Acesso registrado e entregas atrasadas feitas. O nível de atenção é recalculado automaticamente.'});
  }
}

function eventFingerprint(candidate) {
  return [candidate.studentId,candidate.subjectId,candidate.type,candidate.level,candidate.reference||''].join('|');
}

/**
 * Gera SUGESTÕES de apoio para revisão humana. Nada é enviado ao aluno:
 * cada sugestão fica com status `pending_review` até um responsável aceitar,
 * ajustar ou descartar (ver POST /api/notifications/:id/review).
 */
function autoNotifications(data, date) {
  repository.writeData(data);
  const fresh = repository.readDataForUpdate();
  fresh.simulation.notificationFingerprints ||= [];
  const created=[];

  for (const student of fresh.students) {
    const profile = academic.getStudentProfile(student.id, parseDate(date));
    const weekly = avaService.getStudentWeekly(student.id, { referenceDate: date });
    const rawCandidates = notificationService.buildCandidates(student, profile, weekly);

    // Anti-spam: elimina sinais que já viraram sugestão e, se vários surgirem
    // no mesmo avanço, consolida tudo em uma única sugestão-resumo.
    const candidates=rawCandidates.filter((candidate)=>!fresh.simulation.notificationFingerprints.includes(eventFingerprint(candidate)));
    if(!candidates.length) continue;

    const notification=notificationService.buildDigestNotification(student,candidates,date);
    if(!notification) continue;

    // Cooldown: lembretes/atenções aguardam ao menos 5 dias desde a última sugestão
    // do aluno. Situações críticas entram na fila imediatamente.
    const previous=[...(fresh.notifications||[])]
      .filter((item)=>item.studentId===student.id && item.simulatedDate)
      .sort((a,b)=>String(b.simulatedDate).localeCompare(String(a.simulatedDate)))[0];
    const daysSinceLast=previous ? Math.floor((parseDate(date)-parseDate(previous.simulatedDate))/DAY) : Infinity;
    if(notification.level!=='critical' && daysSinceLast<5) continue;

    candidates.forEach((candidate)=>fresh.simulation.notificationFingerprints.push(eventFingerprint(candidate)));

    const n={
      id:`n${date.replace(/-/g,'')}${student.id}${created.length}`,
      createdAt:new Date().toISOString(),
      simulatedDate:date,
      status:'pending_review',
      origin:'automatic_suggestion',
      to:student.email,
      studentId:student.id,
      subjectId:notification.subjectId || candidates[0]?.subjectId || null,
      evidence:notificationService.buildEvidence(weekly, candidates),
      ...notification
    };
    fresh.notifications.unshift(n); created.push(n);
    if (student.focus) appendLog(fresh,{date,kind:'notification',tone:notification.level==='critical'?'danger':'warning',studentId:student.id,title:`Sugestão de apoio aguardando revisão: ${notification.subject}`,detail:'Nada foi enviado. Um responsável precisa aceitar, ajustar ou descartar.'});
  }

  repository.writeData(fresh);
  return {data:fresh,created};
}

function getUpcomingEvents(data, afterDate, limit=8) {
  const events=[];
  for (const subject of data.subjects) {
    for (const ra of subject.ras || []) {
      if (compareDate(ra.date,afterDate)>0) events.push({date:ra.date,type:'assessment',subjectId:subject.id,subject:subject.name,title:`${ra.id} • ${subject.name}`,detail:ra.components.map(c=>`${c.type} ${Math.round(c.weight*100)}%`).join(' + ')});
      if (compareDate(ra.releaseDate,afterDate)>0) events.push({date:ra.releaseDate,type:'release',subjectId:subject.id,subject:subject.name,title:`Resultados ${ra.id} • ${subject.name}`,detail:'Notas liberadas e indicadores recalculados.'});
    }
  }
  ['2026-04-20','2026-05-11','2026-05-25','2026-06-01'].forEach((date,i)=>{
    if (compareDate(date,afterDate)>0) events.push({date,type:'story',title:['Faixa de 5 faltas • aluno-foco','Faixa de atenção • aluno-foco','Alerta crítico de AVA • aluno-foco','Retomada após intervenção • aluno-foco'][i],detail:'Marco demonstrativo para visualizar a proatividade.'});
  });
  return events.sort((a,b)=>compareDate(a.date,b.date)).slice(0,limit);
}

function getStatus() {
  const data=repository.readData();
  const current=data.simulation.currentDate;
  return {
    simulation:data.simulation,
    class:data.classes[0],
    timetable:data.timetable,
    subjects:data.subjects,
    focusStudent:studentById(data,data.simulation.focusStudentId),
    upcoming:getUpcomingEvents(data,current,10),
    recentActivity:(data.simulation.activityLog||[]).slice(0,20),
    notifications:(data.notifications||[]).slice(0,10)
  };
}

function advance(days=7) {
  let data=repository.readDataForUpdate();
  const from=data.simulation.currentDate;
  const maxDate=data.simulation.endDate;
  let to=addDays(from,days);
  if (compareDate(to,maxDate)>0) to=maxDate;
  if (compareDate(to,from)<=0) return getStatus();

  const previousLogIds=new Set((data.simulation.activityLog||[]).map((item)=>item.id));
  const previousNotificationIds=new Set((data.notifications||[]).map((item)=>item.id));

  const ctx=buildAvaContext(data);
  let cursor=addDays(from,1);
  while (compareDate(cursor,to)<=0) {
    simulateOneDay(data,cursor,ctx);
    cursor=addDays(cursor,1);
  }
  refreshPending(data,to,ctx);
  repository.appendEvents(ctx.newEvents);
  processCalendarEvents(data,from,to);
  applyFocusStory(data,from,to);
  data.simulation.currentDate=to;
  data.simulation.week=Math.floor((parseDate(to)-parseDate(data.simulation.startDate))/(7*DAY))+1;
  appendLog(data,{date:to,kind:'time',tone:'neutral',title:`Simulação avançou para ${to}`,detail:`Semana ${data.simulation.week} do semestre demonstrativo.`});
  repository.writeData(data);

  const notificationResult=autoNotifications(data,to);
  const fresh=notificationResult.data;
  const newRelevantActivity=(fresh.simulation.activityLog||[])
    .filter((item)=>!previousLogIds.has(item.id) && item.kind!=='time');
  const highlights=newRelevantActivity
    .slice(0,8)
    .map((item)=>({date:item.date,kind:item.kind,tone:item.tone,title:item.title,detail:item.detail}));
  const newNotifications=(fresh.notifications||[]).filter((item)=>!previousNotificationIds.has(item.id));
  const actualDays=Math.max(1,Math.round((parseDate(to)-parseDate(from))/DAY));

  fresh.simulation.lastAdvance={
    from,
    to,
    days:actualDays,
    eventCount:newRelevantActivity.length,
    notificationCount:newNotifications.length,
    highlights,
    message:highlights.length
      ? `O calendário avançou ${actualDays} dia(s) e ${newRelevantActivity.length} evento(s) relevante(s) foram processados.`
      : `O calendário avançou ${actualDays} dia(s). Nenhum marco acadêmico relevante ocorreu neste intervalo.`
  };
  repository.writeData(fresh);
  return getStatus();
}

function advanceToNextEvent() {
  const data=repository.readData();
  const next=getUpcomingEvents(data,data.simulation.currentDate,1)[0];
  if (!next) return getStatus();
  const days=Math.max(1,Math.round((parseDate(next.date)-parseDate(data.simulation.currentDate))/DAY));
  return advance(days);
}

function reset() {
  repository.resetData();
  return getStatus();
}

module.exports={getStatus,advance,advanceToNextEvent,reset,getUpcomingEvents};
