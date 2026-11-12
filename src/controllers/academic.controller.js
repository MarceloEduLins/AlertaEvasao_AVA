const repository = require('../repositories/academic.repository');
const academic = require('../services/academic.service');
const notifications = require('../services/notification.service');
const { clusterClass, checkPython } = require('../services/clustering.service');
const { validateAcademicData } = require('../services/data-validation.service');
const simulation = require('../services/simulation.service');
const ava = require('../services/ava.service');
const avaRules = require('../services/ava-rules');


async function getSystemStatus(_req, res) {
  const dataCheck = validateAcademicData(repository.readData());
  const ai = await checkPython();
  res.json({
    ok: dataCheck.ok,
    version: repository.readData().meta?.version || '6.0.0',
    data: dataCheck,
    ai,
    notifications: {
      mode: 'human_review',
      description: 'O sistema gera sugestões de apoio; nada é enviado. Um responsável aceita, ajusta ou descarta cada sugestão.'
    }
  });
}

function listClasses(_req, res) {
  res.json(repository.listClasses());
}

function getDashboard(req, res) {
  const dashboard = academic.getClassDashboard(req.params.classId);
  if (!dashboard) return res.status(404).json({ message: 'Turma não encontrada.' });
  res.json(dashboard);
}

function getStudentProfile(req, res) {
  const profile = academic.getStudentProfile(req.params.studentId);
  if (!profile) return res.status(404).json({ message: 'Estudante não encontrado.' });
  res.json(profile);
}

function updateSubject(req, res) {
  const current = repository.getEnrollment(req.params.studentId, req.params.subjectId);
  if (!current) return res.status(404).json({ message: 'Matrícula na disciplina não encontrada.' });

  const patch = {};
  if (req.body.absences !== undefined) {
    const absences = Number(req.body.absences);
    if (!Number.isInteger(absences) || absences < 0) return res.status(400).json({ message: 'Faltas inválidas.' });
    patch.absences = absences;
  }
  if (req.body.classesHeld !== undefined) {
    const classesHeld = Number(req.body.classesHeld);
    if (!Number.isInteger(classesHeld) || classesHeld < 0) return res.status(400).json({ message: 'Aulas realizadas inválidas.' });
    patch.classesHeld = classesHeld;
  }
  if (req.body.pendingActivities !== undefined) {
    const pending = Number(req.body.pendingActivities);
    if (!Number.isInteger(pending) || pending < 0) return res.status(400).json({ message: 'Pendências inválidas.' });
    patch.pendingActivities = pending;
  }
  if (req.body.lastAvaAccess !== undefined) {
    const value = String(req.body.lastAvaAccess);
    const current = repository.readData().simulation.currentDate;
    if (!avaRules.parseIsoDate(value)) return res.status(400).json({ message: 'Data de acesso ao AVA inválida. Use AAAA-MM-DD.' });
    if (value > current) return res.status(400).json({ message: `O acesso ao AVA não pode ser posterior à data simulada (${current}).` });
    patch.lastAvaAccess = value;
  }
  if (req.body.assessments !== undefined) {
    return res.status(400).json({ message: 'Notas são liberadas pelo calendário da simulação e não podem ser alteradas por esta rota.' });
  }
  if (!Object.keys(patch).length) return res.status(400).json({ message: 'Nenhum campo válido para atualizar.' });

  repository.updateEnrollment(req.params.studentId, req.params.subjectId, patch);
  res.json(academic.getStudentProfile(req.params.studentId));
}

function previewNotifications(req, res) {
  const profile = academic.getStudentProfile(req.params.studentId);
  if (!profile) return res.status(404).json({ message: 'Estudante não encontrado.' });
  const weekly = ava.getStudentWeekly(profile.student.id);
  const candidates = notifications.buildCandidates(profile.student, profile, weekly);
  if (!candidates.length) return res.json([]);
  const date = repository.readData().simulation.currentDate;
  const digest = notifications.buildDigestNotification(profile.student, candidates, date);
  res.json([{
    ...digest,
    studentId: profile.student.id,
    subjectId: digest.subjectId || candidates[0]?.subjectId || null,
    evidence: notifications.buildEvidence(weekly, candidates)
  }]);
}

function generateNotification(req, res) {
  const student = repository.getStudentById(req.body?.studentId);
  if (!student) return res.status(404).json({ message: 'Estudante não encontrado.' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ message: 'A sugestão precisa de um texto de mensagem.' });
  const created = repository.addNotification({
    origin: 'manual_preview',
    studentId: student.id,
    to: student.email,
    subjectId: req.body.subjectId || null,
    type: req.body.type || 'manual',
    level: ['reminder', 'attention', 'critical'].includes(req.body.level) ? req.body.level : 'reminder',
    reference: req.body.reference || null,
    sourceReferences: Array.isArray(req.body.sourceReferences) ? req.body.sourceReferences : undefined,
    subject: String(req.body.subject || 'Sugestão de apoio'),
    summary: req.body.summary ? String(req.body.summary) : undefined,
    evidence: req.body.evidence || null,
    body
  });
  res.status(201).json(created);
}

function listNotifications(req, res) {
  let items = repository.listNotifications();
  const { status, studentId } = req.query;
  if (status === 'pending') items = items.filter((item) => item.status === 'pending_review');
  else if (status === 'decided') items = items.filter((item) => item.review);
  if (studentId) items = items.filter((item) => item.studentId === studentId);
  res.json(items);
}

const DECISIONS = ['aceitar', 'ajustar', 'descartar'];

/** Registra a decisão humana sobre uma sugestão. Nenhuma mensagem é enviada. */
function reviewNotification(req, res) {
  const notification = repository.getNotification(req.params.notificationId);
  if (!notification) return res.status(404).json({ message: 'Sugestão não encontrada.' });
  const decision = String(req.body?.decision || '');
  const reviewer = String(req.body?.reviewer || '').trim();
  const note = String(req.body?.note || '').trim();
  const editedBody = String(req.body?.body || '').trim();
  if (!DECISIONS.includes(decision)) return res.status(400).json({ message: 'Decisão inválida. Use aceitar, ajustar ou descartar.' });
  if (!reviewer) return res.status(400).json({ message: 'Informe o nome do responsável pela revisão.' });
  if (reviewer.length > 80) return res.status(400).json({ message: 'O nome do responsável deve ter até 80 caracteres.' });
  if (note.length > 500) return res.status(400).json({ message: 'A observação deve ter até 500 caracteres.' });
  if (decision === 'ajustar' && !editedBody) return res.status(400).json({ message: 'Para ajustar, envie o texto revisado da mensagem.' });
  if (decision === 'ajustar' && editedBody === String(notification.body || '').trim()) {
    return res.status(400).json({ message: 'O texto ajustado é igual ao original. Use "aceitar" ou altere o texto.' });
  }
  if (decision === 'descartar' && !note) return res.status(400).json({ message: 'Informe o motivo do descarte.' });

  const simulatedDate = repository.readData().simulation.currentDate;
  const review = { decision, reviewer, note: note || null, decidedAt: new Date().toISOString(), simulatedDate };
  const finalBody = decision === 'descartar' ? null : decision === 'ajustar' ? editedBody : notification.body;
  const result = repository.saveReview(notification.id, review, finalBody);
  if (result.error === 'already_reviewed') {
    return res.status(409).json({ message: 'Esta sugestão já foi revisada; a decisão registrada não é sobrescrita.', notification: result.notification });
  }
  res.json({ ...result.notification, message: 'Decisão registrada. Nenhuma mensagem foi enviada pelo sistema.' });
}

function listReviews(_req, res) {
  const items = repository.listNotifications()
    .filter((item) => item.review)
    .sort((a, b) => String(b.review.decidedAt).localeCompare(String(a.review.decidedAt)));
  res.json(items);
}

function getStudentAvaWeekly(req, res) {
  const result = ava.getStudentWeekly(req.params.studentId);
  if (!result) return res.status(404).json({ message: 'Estudante não encontrado.' });
  res.json({ ...result, history: ava.getStudentHistory(req.params.studentId) });
}

function getClassAvaOverview(req, res) {
  if (!repository.getClassById(req.params.classId)) return res.status(404).json({ message: 'Turma não encontrada.' });
  res.json(ava.getClassOverview(req.params.classId));
}

function listAvaEvents(req, res) {
  const { studentId, subjectId, week } = req.query;
  if (!studentId || !week) return res.status(400).json({ message: 'Informe studentId e week (segunda-feira, AAAA-MM-DD).' });
  const result = ava.listSourceEvents({ studentId, subjectId, week });
  if (!result) return res.status(404).json({ message: 'Estudante não encontrado.' });
  if (result.error) return res.status(400).json({ message: result.error });
  res.json(result);
}

function demoCsv(_req, res) {
  res.sendFile(require('path').join(__dirname, '..', '..', 'dados_demo', 'eventos_ava_demo.csv'));
}

function importAvaEvents(req, res) {
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const input = typeof req.body?.csv === 'string' ? req.body.csv : req.body?.events;
  const result = ava.importEvents(input, { dryRun });
  if (!result.ok) return res.status(400).json({ message: result.error });
  res.status(dryRun ? 200 : 201).json(result);
}

async function getClusters(req, res, next) {
  try {
    const result = await clusterClass(req.params.classId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}


function getSimulation(_req, res) { res.json(simulation.getStatus()); }
function advanceSimulation(req, res) {
  const days = Number(req.body?.days ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 200) return res.status(400).json({ message: 'Informe "days" como inteiro entre 1 e 200.' });
  res.json(simulation.advance(days));
}
function nextSimulationEvent(_req, res) { res.json(simulation.advanceToNextEvent()); }
function resetSimulation(_req, res) { res.json(simulation.reset()); }

module.exports = {
  getSystemStatus,
  listClasses,
  getDashboard,
  getStudentProfile,
  updateSubject,
  previewNotifications,
  generateNotification,
  listNotifications,
  reviewNotification,
  listReviews,
  getStudentAvaWeekly,
  getClassAvaOverview,
  listAvaEvents,
  importAvaEvents,
  demoCsv,
  getClusters,
  getSimulation,
  advanceSimulation,
  nextSimulationEvent,
  resetSimulation
};
