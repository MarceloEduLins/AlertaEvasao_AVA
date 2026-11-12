function validateAcademicData(data) {
  const errors = [];
  const warnings = [];

  const classes = Array.isArray(data?.classes) ? data.classes : [];
  const subjects = Array.isArray(data?.subjects) ? data.subjects : [];
  const students = Array.isArray(data?.students) ? data.students : [];
  const enrollments = Array.isArray(data?.enrollments) ? data.enrollments : [];
  const timetable = Array.isArray(data?.timetable) ? data.timetable : [];

  if (!classes.length) errors.push('Nenhuma turma cadastrada.');
  if (subjects.length !== 6) errors.push(`A demonstração espera 6 disciplinas; foram encontradas ${subjects.length}.`);
  if (!students.length) errors.push('Nenhum estudante cadastrado.');
  if (timetable.length !== 5) errors.push(`A grade semanal deve ter 5 dias; foram encontrados ${timetable.length}.`);

  const subjectIds = new Set(subjects.map((item) => item.id));
  const studentIds = new Set(students.map((item) => item.id));

  if (subjectIds.size !== subjects.length) errors.push('Existem IDs de disciplinas duplicados.');
  if (studentIds.size !== students.length) errors.push('Existem IDs de estudantes duplicados.');

  timetable.forEach((day) => {
    if (!Array.isArray(day.periods) || day.periods.length !== 5) {
      errors.push(`${day.label || 'Dia'} não possui exatamente 5 aulas.`);
      return;
    }
    day.periods.forEach((subjectId) => {
      if (!subjectIds.has(subjectId)) errors.push(`Grade referencia disciplina inexistente: ${subjectId}.`);
    });
  });

  subjects.forEach((subject) => {
    if (![2, 3].includes(subject.ras?.length)) {
      warnings.push(`${subject.name} possui ${subject.ras?.length || 0} RAs; a demonstração foi desenhada para 2 ou 3.`);
    }
    (subject.ras || []).forEach((ra) => {
      const totalWeight = (ra.components || []).reduce((sum, component) => sum + Number(component.weight || 0), 0);
      if (Math.abs(totalWeight - 1) > 0.001) {
        errors.push(`${subject.name} ${ra.id}: pesos somam ${totalWeight.toFixed(3)}, e não 1.`);
      }
      if (!ra.date || !ra.releaseDate) errors.push(`${subject.name} ${ra.id}: datas incompletas.`);
    });
  });

  const enrollmentKeys = new Set();
  enrollments.forEach((item) => {
    const key = `${item.studentId}|${item.subjectId}`;
    if (enrollmentKeys.has(key)) errors.push(`Matrícula duplicada: ${key}.`);
    enrollmentKeys.add(key);
    if (!studentIds.has(item.studentId)) errors.push(`Matrícula referencia estudante inexistente: ${item.studentId}.`);
    if (!subjectIds.has(item.subjectId)) errors.push(`Matrícula referencia disciplina inexistente: ${item.subjectId}.`);
  });

  students.forEach((student) => {
    subjects.forEach((subject) => {
      if (!enrollmentKeys.has(`${student.id}|${subject.id}`)) {
        errors.push(`${student.name} não está matriculado em ${subject.name}.`);
      }
    });
    if (!student.registration) warnings.push(`${student.name} não possui matrícula acadêmica demonstrativa.`);
  });

  const pseudoIds = new Set();
  students.forEach((student) => {
    if (!student.pseudoId) errors.push(`${student.name} não possui pseudônimo (pseudoId) para os eventos do AVA.`);
    else if (pseudoIds.has(student.pseudoId)) errors.push(`Pseudônimo duplicado: ${student.pseudoId}.`);
    pseudoIds.add(student.pseudoId);
  });

  const activities = Array.isArray(data?.activities) ? data.activities : [];
  if (!activities.length) errors.push('Nenhuma atividade prevista no AVA (activities).');
  const activityIds = new Set();
  activities.forEach((activity) => {
    if (activityIds.has(activity.id)) errors.push(`Atividade duplicada: ${activity.id}.`);
    activityIds.add(activity.id);
    if (!subjectIds.has(activity.subjectId)) errors.push(`Atividade ${activity.id} referencia disciplina inexistente.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(activity.dueDate || '')) errors.push(`Atividade ${activity.id} com prazo inválido.`);
  });

  classes.forEach((classData) => {
    const classStudents = students.filter((student) => student.classId === classData.id);
    if (Array.isArray(classData.studentIds) && classData.studentIds.length !== classStudents.length) {
      errors.push(`${classData.name}: studentIds não corresponde à quantidade real de alunos.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      classes: classes.length,
      subjects: subjects.length,
      students: students.length,
      enrollments: enrollments.length,
      timetableDays: timetable.length,
      lessonsPerDay: timetable[0]?.periods?.length || 0,
      totalRAs: subjects.reduce((sum, subject) => sum + (subject.ras?.length || 0), 0),
      activities: activities.length
    }
  };
}

module.exports = { validateAcademicData };
