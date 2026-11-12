const repository = require('../repositories/academic.repository');

const DEFAULT_REQUIRED_ATTENDANCE = 75;

function daysBetween(dateString, referenceDate = new Date()) {
  const date = new Date(`${String(dateString).slice(0, 10)}T12:00:00Z`);
  const ref = new Date(referenceDate);
  const diff = ref.getTime() - date.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function calculateAssessment(assessment) {
  const components = assessment?.components || [];
  if (!components.length) return { grade: null, components: [], weakest: null };

  const totalWeight = components.reduce((sum, item) => sum + Number(item.weight || 0), 0) || 1;
  const grade = components.reduce(
    (sum, item) => sum + Number(item.grade || 0) * Number(item.weight || 0),
    0
  ) / totalWeight;

  const normalized = components.map((item) => ({
    ...item,
    weightedContribution: Number((Number(item.grade || 0) * Number(item.weight || 0)).toFixed(2))
  }));

  const weakest = [...normalized].sort((a, b) => a.grade - b.grade)[0] || null;
  return { grade: Number(grade.toFixed(2)), components: normalized, weakest };
}

function calculateAttendance(enrollment, subject, requiredAttendance = DEFAULT_REQUIRED_ATTENDANCE) {
  const totalClasses = Number(subject.totalClasses || 0);
  const held = Number(enrollment.classesHeld || 0);
  const absences = Number(enrollment.absences || 0);
  const present = Math.max(0, held - absences);
  const currentAttendance = held > 0 ? (present / held) * 100 : 100;
  const allowedAbsences = Math.floor(totalClasses * ((100 - requiredAttendance) / 100));
  const remainingAbsences = allowedAbsences - absences;

  let alertLevel = 'normal';
  if (remainingAbsences <= 0) alertLevel = 'critical';
  else if (remainingAbsences <= 2) alertLevel = 'attention';
  else if (remainingAbsences <= 5) alertLevel = 'reminder';

  return {
    currentAttendance: Number(currentAttendance.toFixed(1)),
    held,
    totalClasses,
    absences,
    allowedAbsences,
    remainingAbsences,
    requiredAttendance,
    alertLevel
  };
}

function calculateAva(enrollment, referenceDate = new Date()) {
  // Sem nenhum acesso conhecido o tempo de inatividade é desconhecido, não zero nem infinito.
  if (!enrollment.lastAvaAccess) {
    return {
      lastAccess: null,
      inactiveDays: null,
      pendingActivities: Number(enrollment.pendingActivities || 0),
      alertLevel: 'unknown'
    };
  }
  const inactiveDays = daysBetween(enrollment.lastAvaAccess, referenceDate);
  let alertLevel = 'normal';
  if (inactiveDays >= 15) alertLevel = 'critical';
  else if (inactiveDays >= 8) alertLevel = 'attention';
  else if (inactiveDays >= 4) alertLevel = 'observe';

  return {
    lastAccess: enrollment.lastAvaAccess,
    inactiveDays,
    pendingActivities: Number(enrollment.pendingActivities || 0),
    alertLevel
  };
}

function simulationReferenceDate() {
  const value = repository.readData().simulation?.currentDate;
  return value ? new Date(`${value}T12:00:00Z`) : new Date();
}

function analyzeSubject(studentId, enrollment, referenceDate = simulationReferenceDate()) {
  const subject = repository.getSubjectById(enrollment.subjectId);
  if (!subject) return null;

  const classData = repository.getClassById(repository.getStudentById(studentId)?.classId);
  const requiredAttendance = classData?.requiredAttendance || DEFAULT_REQUIRED_ATTENDANCE;
  const attendance = calculateAttendance(enrollment, subject, requiredAttendance);
  const ava = calculateAva(enrollment, referenceDate);

  const assessments = Object.entries(enrollment.assessments || {}).map(([name, data]) => ({
    name,
    date: data.date || null,
    releaseDate: data.releaseDate || null,
    ...calculateAssessment(data)
  })).sort((a,b) => String(b.releaseDate || b.date || '').localeCompare(String(a.releaseDate || a.date || '')));

  const currentAssessment = assessments[0] || null;
  const grade = currentAssessment?.grade ?? null;
  const factors = [];
  let score = 0;

  if (attendance.alertLevel === 'critical') { score += 35; factors.push('Frequência no limite ou abaixo da margem permitida'); }
  else if (attendance.alertLevel === 'attention') { score += 25; factors.push('Pouquíssima margem de faltas restante'); }
  else if (attendance.alertLevel === 'reminder') { score += 12; factors.push('Margem de faltas reduzida'); }

  if (grade !== null && grade < 5) { score += 32; factors.push('Desempenho crítico na avaliação atual (abaixo de 5,0)'); }
  else if (grade !== null && grade < 6) { score += 24; factors.push('Desempenho baixo na avaliação atual (abaixo de 6,0)'); }
  else if (grade !== null && grade < 7) { score += 16; factors.push('Desempenho abaixo da média de referência 7,0'); }

  if (ava.alertLevel === 'critical') { score += 25; factors.push('Período prolongado sem acessar o AVA'); }
  else if (ava.alertLevel === 'attention') { score += 15; factors.push('Vários dias sem acessar o AVA'); }
  else if (ava.alertLevel === 'observe') { score += 5; factors.push('Redução recente de atividade no AVA'); }

  if (ava.pendingActivities >= 4) { score += 18; factors.push('Muitas atividades pendentes'); }
  else if (ava.pendingActivities >= 2) { score += 9; factors.push('Atividades pendentes'); }

  // Combinação de sinais merece atenção adicional: o sistema fica mais rigoroso
  // quando a dificuldade aparece em mais de uma dimensão ao mesmo tempo.
  if (factors.length >= 3) score += 10;
  else if (factors.length >= 2) score += 5;

  score = Math.min(100, score);
  const level = score >= 60 ? 'high' : score >= 30 ? 'mid' : 'low';

  let mainReason = 'Sem fator crítico predominante';
  if (currentAssessment?.weakest && currentAssessment.weakest.grade < 7) {
    mainReason = `Baixo desempenho em ${currentAssessment.weakest.type}`;
  }
  if (ava.alertLevel === 'critical' && ava.inactiveDays >= 15) mainReason = 'Desengajamento no AVA';
  if (attendance.alertLevel === 'critical' || attendance.alertLevel === 'attention') mainReason = 'Risco por frequência';

  return {
    subject,
    attendance,
    ava,
    assessments,
    score,
    level,
    factors,
    mainReason
  };
}

function getStudentProfile(studentId, referenceDate = simulationReferenceDate()) {
  const student = repository.getStudentById(studentId);
  if (!student) return null;
  const subjects = repository.listEnrollmentsForStudent(studentId)
    .map((enrollment) => analyzeSubject(studentId, enrollment, referenceDate))
    .filter(Boolean);

  const averageScore = subjects.length
    ? subjects.reduce((sum, item) => sum + item.score, 0) / subjects.length
    : 0;
  const maxScore = subjects.length ? Math.max(...subjects.map((item) => item.score)) : 0;
  const overallScore = Math.round(averageScore * 0.45 + maxScore * 0.55);
  const overallLevel = overallScore >= 60 ? 'high' : overallScore >= 30 ? 'mid' : 'low';

  const mainReasons = subjects
    .filter((item) => item.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => `${item.subject.name}: ${item.mainReason}`);

  return { student, overallScore, overallLevel, mainReasons, subjects };
}

function getClassDashboard(classId, referenceDate = simulationReferenceDate()) {
  const classData = repository.getClassById(classId);
  if (!classData) return null;
  const students = repository.listStudents(classId).map((student) => getStudentProfile(student.id, referenceDate));
  const counts = students.reduce((acc, item) => {
    acc[item.overallLevel] += 1;
    return acc;
  }, { high: 0, mid: 0, low: 0 });

  const subjectStats = repository.listSubjects().map((subject) => {
    const analyses = students.flatMap((profile) => profile.subjects.filter((item) => item.subject.id === subject.id));
    const avgGradeValues = analyses.map((item) => item.assessments[0]?.grade).filter((value) => Number.isFinite(value));
    const avgGrade = avgGradeValues.length ? avgGradeValues.reduce((a,b) => a+b,0) / avgGradeValues.length : null;
    const highCount = analyses.filter((item) => item.level === 'high').length;
    const commonReasons = {};
    analyses.forEach((item) => { commonReasons[item.mainReason] = (commonReasons[item.mainReason] || 0) + 1; });
    const mainIssue = Object.entries(commonReasons).sort((a,b) => b[1]-a[1])[0]?.[0] || 'Sem padrão predominante';
    return { subject, avgGrade: avgGrade === null ? null : Number(avgGrade.toFixed(2)), highCount, mainIssue };
  });

  return { class: classData, counts, students, subjectStats };
}

function buildFeatureRows(classId, referenceDate = simulationReferenceDate()) {
  const profiles = repository.listStudents(classId).map((student) => getStudentProfile(student.id, referenceDate));
  const average = (values) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
  // Dias sem AVA desconhecidos (aluno sem histórico) são imputados pela média da turma,
  // apenas para o K-Means; a interface continua exibindo "sem histórico".
  const knownInactive = profiles.flatMap((p) => p.subjects.map((s) => s.ava.inactiveDays)).filter((v) => Number.isFinite(v));
  const classInactiveMean = average(knownInactive);
  return profiles.map((profile) => {
    const subjects = profile.subjects;
    const avgAttendance = average(subjects.map((s) => s.attendance.currentAttendance));
    const graded = subjects.map((s) => s.assessments[0]?.grade).filter((v)=>Number.isFinite(v));
    const avgGrade = graded.length ? average(graded) : 7;
    const inactive = subjects.map((s) => s.ava.inactiveDays).filter((v) => Number.isFinite(v));
    const avgInactiveDays = inactive.length ? average(inactive) : classInactiveMean;
    const pending = subjects.reduce((sum, s) => sum + s.ava.pendingActivities, 0);
    const exams = [];
    const projects = [];
    subjects.forEach((s) => {
      (s.assessments[0]?.components || []).forEach((c) => {
        const type = c.type.toLowerCase();
        if (type.includes('prova')) exams.push(c.grade);
        if (type.includes('projeto')) projects.push(c.grade);
      });
    });
    const avgExamGrade = exams.length ? average(exams) : avgGrade;
    const avgProjectGrade = projects.length ? average(projects) : avgGrade;
    return {
      studentId: profile.student.id,
      name: profile.student.name,
      avgAttendance: Number(avgAttendance.toFixed(2)),
      avgGrade: Number(avgGrade.toFixed(2)),
      avgInactiveDays: Number(avgInactiveDays.toFixed(2)),
      pendingActivities: pending,
      avgExamGrade: Number(avgExamGrade.toFixed(2)),
      avgProjectGrade: Number(avgProjectGrade.toFixed(2))
    };
  });
}

module.exports = {
  daysBetween,
  calculateAssessment,
  calculateAttendance,
  calculateAva,
  analyzeSubject,
  getStudentProfile,
  getClassDashboard,
  buildFeatureRows,
  simulationReferenceDate
};
