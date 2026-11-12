const REFERENCE_GRADE = 7;
const LEVEL_WEIGHT = { reminder: 1, attention: 2, critical: 3 };

const num = (value) => Number(value).toFixed(1).replace('.', ',');
const SHORT = [['Experiência Criativa: Navegando na Computação', 'Experiência Criativa'], ['Descoberta e Evolução da Computação', 'Descoberta da Computação'], ['Modelagem de Fenômenos Físicos', 'Modelagem Física'], ['Leitura e Escrita Acadêmica', 'Leitura e Escrita']];
const short = (name) => SHORT.reduce((acc, [from, to]) => acc.replace(from, to), String(name || ''));

function firstName(student) { return student.name.split(' ')[0]; }
function highestLevel(items) {
  return items.reduce((best, item) => (LEVEL_WEIGHT[item.level] || 0) > (LEVEL_WEIGHT[best] || 0) ? item.level : best, 'reminder');
}

function buildAttendanceNotification(student, subjectAnalysis) {
  const { subject, attendance } = subjectAnalysis;
  const remaining = attendance.remainingAbsences;
  if (!['reminder', 'attention', 'critical'].includes(attendance.alertLevel)) return null;
  const remainingText = remaining > 1 ? `${remaining} faltas` : remaining === 1 ? '1 falta' : 'nenhuma falta adicional';

  if (attendance.alertLevel === 'reminder') return {
    type: 'attendance', level: 'reminder', reference: 'band:reminder',
    subject: `Lembrete de frequência • ${subject.name}`,
    summary: `${short(subject.name)}: restam aproximadamente ${remainingText}.`,
    body: `Olá, ${firstName(student)}! Só um lembrete: em ${subject.name}, sua frequência atual é ${attendance.currentAttendance}% e restam aproximadamente ${remainingText} antes do limite configurado. Não é um alerta crítico; é apenas para você conseguir se organizar com antecedência.`
  };
  if (attendance.alertLevel === 'attention') return {
    type: 'attendance', level: 'attention', reference: 'band:attention',
    subject: `Atenção à frequência • ${subject.name}`,
    summary: `${short(subject.name)}: a margem caiu para ${remainingText}.`,
    body: `Olá, ${firstName(student)}. Sua margem de frequência em ${subject.name} ficou pequena: restam aproximadamente ${remainingText}. Frequência atual: ${attendance.currentAttendance}%. Vale evitar novas ausências e acompanhar as próximas aulas com atenção.`
  };
  return {
    type: 'attendance', level: 'critical', reference: 'band:critical',
    subject: `Alerta importante de frequência • ${subject.name}`,
    summary: `${short(subject.name)}: frequência em nível crítico (${attendance.currentAttendance}%).`,
    body: `Olá, ${firstName(student)}. Sua frequência em ${subject.name} chegou a um nível crítico. Frequência atual: ${attendance.currentAttendance}%. Margem estimada: ${remainingText}. Se houver alguma dificuldade, procure o professor ou o apoio acadêmico o quanto antes.`
  };
}

function buildAvaNotification(student, subjectAnalysis) {
  const { subject, ava } = subjectAnalysis;
  if (!['attention', 'critical'].includes(ava.alertLevel)) return null;
  if (ava.alertLevel === 'attention') return {
    type: 'ava', level: 'attention', reference: 'band:8d', subject: 'Lembrete sobre seu acesso ao AVA',
    summary: `${ava.inactiveDays} dias sem acessar o AVA; ${ava.pendingActivities} pendência(s) em ${short(subject.name)}.`,
    body: `Olá, ${firstName(student)}! Faz ${ava.inactiveDays} dias que você não acessa o AVA. Em ${subject.name}, há ${ava.pendingActivities} atividade(s) pendente(s). Vale dar uma olhada para não acumular conteúdo.`
  };
  return {
    type: 'ava', level: 'critical', reference: 'band:15d', subject: 'Atenção importante ao seu acesso no AVA',
    summary: `${ava.inactiveDays} dias sem AVA e atividades pendentes.`,
    body: `Olá, ${firstName(student)}. Identificamos ${ava.inactiveDays} dias sem acesso ao AVA e ${ava.pendingActivities} atividade(s) pendente(s) em ${subject.name}. Recomendamos verificar o ambiente virtual e, se necessário, procurar apoio acadêmico.`
  };
}

function buildGradeNotification(student, subjectAnalysis) {
  const assessment = subjectAnalysis.assessments?.[0];
  if (!assessment || assessment.grade === null || assessment.grade >= REFERENCE_GRADE) return null;
  const weakest = assessment.weakest;
  const grade = Number(assessment.grade);
  const level = grade < 5 ? 'critical' : grade < 6 ? 'attention' : 'reminder';
  const component = weakest?.type || 'avaliação';
  const componentGrade = Number.isFinite(Number(weakest?.grade)) ? num(weakest.grade) : '—';

  const subjects = {
    reminder: `Acompanhe sua ${assessment.name} • ${subjectAnalysis.subject.name}`,
    attention: `Atenção ao resultado de ${assessment.name} • ${subjectAnalysis.subject.name}`,
    critical: `Resultado crítico em ${assessment.name} • ${subjectAnalysis.subject.name}`
  };
  const openings = {
    reminder: 'Seu resultado ficou um pouco abaixo da média de referência 7,0.',
    attention: 'Seu resultado ficou abaixo da média de referência 7,0 e merece atenção.',
    critical: 'Seu resultado ficou bem abaixo da média de referência 7,0.'
  };

  return {
    type: 'grade', level, reference: `${assessment.name}:${assessment.releaseDate || ''}`,
    subject: subjects[level],
    summary: `${short(subjectAnalysis.subject.name)}: ${assessment.name} = ${num(grade)}; ponto mais fraco: ${component} (${componentGrade}).`,
    body: `Olá, ${firstName(student)}. ${openings[level]} Em ${assessment.name} de ${subjectAnalysis.subject.name}, sua média foi ${num(grade)}. O componente que mais reduziu o resultado foi ${component} (${componentGrade}). Use esse aviso para concentrar a recuperação exatamente onde houve maior dificuldade.`
  };
}

function buildDigestNotification(student, candidates, date) {
  if (!candidates?.length) return null;
  if (candidates.length === 1) return candidates[0];

  const level = highestLevel(candidates);
  const sorted = [...candidates].sort((a, b) => (LEVEL_WEIGHT[b.level] || 0) - (LEVEL_WEIGHT[a.level] || 0));
  const summaries = sorted.slice(0, 4).map((item) => `• ${item.summary || item.subject}`);
  const extra = sorted.length > 4 ? `\n• +${sorted.length - 4} outro(s) ponto(s) para conversarmos` : '';
  const subjects = {
    reminder: 'Resumo preventivo do seu acompanhamento acadêmico',
    attention: 'Atenção ao seu acompanhamento acadêmico',
    critical: 'Alerta importante no seu acompanhamento acadêmico'
  };

  return {
    type: 'digest',
    level,
    reference: `digest:${date}:${sorted.map((item) => `${item.type}:${item.reference}`).sort().join('|')}`,
    sourceReferences: sorted.map((item) => ({ type: item.type, subjectId: item.subjectId, level: item.level, reference: item.reference })),
    subject: subjects[level],
    summary: `${sorted.length} sinais acadêmicos novos foram identificados.`,
    body: `Olá, ${firstName(student)}. Estamos acompanhando seu semestre e percebemos alguns pontos em que podemos ajudar:\n\n${summaries.join('\n')}${extra}\n\nSe algo estiver dificultando sua rotina, responda esta mensagem ou procure a tutoria. Podemos combinar um horário para conversar e indicar materiais de apoio.`
  };
}

function formatBr(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/**
 * Sinal semanal do AVA (queda de atividade e/ou atividade pendente por prazo).
 * Só existe quando a análise semanal está em estado "revisar"; dados incompletos
 * nunca geram sugestão automática.
 */
function buildWeeklyAvaNotification(student, weekly) {
  if (!weekly || weekly.estado !== 'revisar') return null;
  const flagged = weekly.subjects.filter((item) => item.resultado.estado === 'revisar');
  const both = flagged.some((item) => item.resultado.motivos.length > 1);
  const periodo = weekly.periodo.atual;
  const drops = flagged.filter((item) => item.resultado.motivos.includes('queda de atividade'));
  const pendings = flagged.filter((item) => item.resultado.motivos.includes('atividade pendente'));
  const parts = [];
  if (drops.length) parts.push(`queda de atividade em ${drops.map((item) => `${short(item.subjectName)} (${item.anterior.eventos} → ${item.atual.eventos} eventos)`).join(', ')}`);
  if (pendings.length) parts.push(`${pendings.reduce((sum, item) => sum + item.pendencias.count, 0)} atividade(s) com prazo vencido em ${pendings.map((item) => short(item.subjectName)).join(', ')}`);
  const pendingItems = flagged.flatMap((item) => (item.pendencias?.items || []).map((p) => `${p.title} (prazo ${formatBr(p.dueDate)})`)).slice(0, 3);
  return {
    type: 'ava_semana',
    level: both ? 'attention' : 'reminder',
    reference: `semana:${periodo.inicio}:${flagged.map((item) => `${item.subjectId}=${item.resultado.motivos.join('+')}`).join(',')}`,
    subjectId: flagged[0].subjectId,
    subject: `Apoio no AVA • semana de ${formatBr(periodo.inicio)} a ${formatBr(periodo.fim)}`,
    summary: `AVA: ${parts.join('; ')}.`,
    body: `Olá, ${firstName(student)}. Na semana de ${formatBr(periodo.inicio)} a ${formatBr(periodo.fim)} notamos no AVA ${parts.join('; ')}.${pendingItems.length ? ` Atividades em aberto: ${pendingItems.join(', ')}.` : ''} Se precisar, a tutoria pode ajudar a organizar as entregas e indicar material de apoio.`
  };
}

/** Reúne todos os sinais candidatos de um aluno (frequência, RA, inatividade e sinal semanal do AVA). */
function buildCandidates(student, profile, weekly) {
  const candidates = [];
  for (const analysis of profile.subjects) {
    const attendance = buildAttendanceNotification(student, analysis);
    const grade = buildGradeNotification(student, analysis);
    if (attendance) candidates.push({ ...attendance, studentId: student.id, subjectId: analysis.subject.id });
    if (grade) candidates.push({ ...grade, studentId: student.id, subjectId: analysis.subject.id });
  }
  // Inatividade é comportamento geral: no máximo um sinal, usando a disciplina com mais pendências como contexto.
  const known = profile.subjects.filter((item) => Number.isFinite(item.ava.inactiveDays));
  const avaContext = [...known].sort((a, b) => (b.ava.pendingActivities - a.ava.pendingActivities) || (b.ava.inactiveDays - a.ava.inactiveDays))[0];
  const ava = avaContext ? buildAvaNotification(student, avaContext) : null;
  if (ava) candidates.push({ ...ava, studentId: student.id, subjectId: avaContext.subject.id });
  const weeklySignal = buildWeeklyAvaNotification(student, weekly);
  if (weeklySignal) candidates.push({ ...weeklySignal, studentId: student.id });
  return candidates;
}

/** Evidência anexada à sugestão: período, qualidade da coleta e indicadores que a originaram. */
function buildEvidence(weekly, candidates) {
  return {
    periodo: weekly?.periodo || null,
    coleta: weekly ? { anterior: weekly.coleta.anterior.status, atual: weekly.coleta.atual.status } : null,
    estadoSemanal: weekly?.estado || null,
    motivos: candidates.map((item) => ({ type: item.type, level: item.level, subjectId: item.subjectId || null, summary: item.summary || item.subject })),
    disciplinas: (weekly?.subjects || [])
      .filter((item) => item.resultado.estado !== 'sem_sinal')
      .map((item) => ({
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        estado: item.resultado.estado,
        motivos: item.resultado.motivos,
        anterior: item.anterior,
        atual: item.atual,
        pendencias: item.pendencias ? item.pendencias.count : null,
        dadosIncompletos: item.dadosIncompletos
      }))
  };
}

module.exports = {
  buildWeeklyAvaNotification,
  buildCandidates,
  buildEvidence,
  REFERENCE_GRADE,
  LEVEL_WEIGHT,
  buildAttendanceNotification,
  buildAvaNotification,
  buildGradeNotification,
  buildDigestNotification
};
