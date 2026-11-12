const fs = require('fs');
const path = require('path');

/*
 * Armazenamento local em JSON.
 *
 * - academic.seed.json / ava-events.seed.json: estado inicial versionado (dados sintéticos).
 * - academic.json / ava-events.json: estado de execução. Não é versionado; é criado a partir
 *   do seed na primeira leitura e restaurado por `npm run reset-data`.
 * - ALERTA_DATA_DIR permite que os testes usem uma pasta temporária sem apagar a demonstração.
 */
const SEED_DIR = path.join(__dirname, '..', 'data');

function dataDir() { return process.env.ALERTA_DATA_DIR || SEED_DIR; }
function dataFile() { return path.join(dataDir(), 'academic.json'); }
function eventsFile() { return path.join(dataDir(), 'ava-events.json'); }
const SEED_FILE = path.join(SEED_DIR, 'academic.seed.json');
const EVENTS_SEED_FILE = path.join(SEED_DIR, 'ava-events.seed.json');

function atomicWrite(file, content) {
  // Escrita atômica: uma leitura nunca enxerga JSON pela metade.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, content, 'utf8');
  fs.renameSync(tempFile, file);
}

function ensureRuntimeFiles() {
  if (!fs.existsSync(dataFile())) atomicWrite(dataFile(), fs.readFileSync(SEED_FILE, 'utf8'));
  if (!fs.existsSync(eventsFile())) atomicWrite(eventsFile(), fs.readFileSync(EVENTS_SEED_FILE, 'utf8'));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// Leitura para consulta: cache por mtime/tamanho e objeto congelado (somente leitura),
// o que impede que uma consulta altere o estado sem gravar.
let dataCache = { key: null, data: null };

function readData() {
  ensureRuntimeFiles();
  const stat = fs.statSync(dataFile());
  const key = `${dataFile()}|${stat.mtimeMs}|${stat.size}`;
  if (dataCache.key !== key) {
    dataCache = { key, data: deepFreeze(JSON.parse(fs.readFileSync(dataFile(), 'utf8'))) };
  }
  return dataCache.data;
}

/** Leitura para alteração: cópia nova e mutável, que deve ser gravada com writeData. */
function readDataForUpdate() {
  ensureRuntimeFiles();
  return JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
}

function writeData(data) {
  atomicWrite(dataFile(), JSON.stringify(data));
  dataCache = { key: null, data: null };
  return data;
}

// Eventos do AVA ficam em arquivo próprio (volume maior). Cache por mtime/tamanho
// evita reler o arquivo a cada consulta do painel.
let eventsCache = { key: null, events: [] };

function readEvents() {
  ensureRuntimeFiles();
  const stat = fs.statSync(eventsFile());
  const key = `${eventsFile()}|${stat.mtimeMs}|${stat.size}`;
  if (eventsCache.key !== key) {
    eventsCache = { key, events: JSON.parse(fs.readFileSync(eventsFile(), 'utf8')) };
  }
  return eventsCache.events;
}

function writeEvents(events) {
  atomicWrite(eventsFile(), JSON.stringify(events));
  eventsCache = { key: null, events: [] };
  return events;
}

function appendEvents(newEvents) {
  if (!newEvents.length) return readEvents();
  return writeEvents([...readEvents(), ...newEvents]);
}

function resetData() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  writeData(seed);
  writeEvents(JSON.parse(fs.readFileSync(EVENTS_SEED_FILE, 'utf8')));
  return seed;
}

function getClassById(id) {
  return readData().classes.find((item) => item.id === id) || null;
}

function listClasses() { return readData().classes; }
function listSubjects() { return readData().subjects; }

function listStudents(classId) {
  return readData().students.filter((student) => !classId || student.classId === classId);
}

function getStudentById(id) {
  return readData().students.find((student) => student.id === id) || null;
}

function getSubjectById(id) {
  return readData().subjects.find((subject) => subject.id === id) || null;
}

function getEnrollment(studentId, subjectId) {
  return readData().enrollments.find(
    (item) => item.studentId === studentId && item.subjectId === subjectId
  ) || null;
}

function listEnrollmentsForStudent(studentId) {
  return readData().enrollments.filter((item) => item.studentId === studentId);
}

function listEnrollmentsForClass(classId) {
  const data = readData();
  const ids = new Set(data.students.filter((student) => student.classId === classId).map((student) => student.id));
  return data.enrollments.filter((item) => ids.has(item.studentId));
}

function updateEnrollment(studentId, subjectId, patch) {
  const data = readDataForUpdate();
  const index = data.enrollments.findIndex(
    (item) => item.studentId === studentId && item.subjectId === subjectId
  );
  if (index === -1) return null;
  data.enrollments[index] = { ...data.enrollments[index], ...patch };
  writeData(data);
  return data.enrollments[index];
}

function addNotification(notification) {
  const data = readDataForUpdate();
  const created = {
    id: `n${Date.now()}${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    simulatedDate: data.simulation?.currentDate || null,
    status: 'pending_review',
    ...notification
  };
  data.notifications.unshift(created);
  writeData(data);
  return created;
}

function listNotifications() {
  return readData().notifications || [];
}

function getNotification(id) {
  return listNotifications().find((item) => item.id === id) || null;
}

/** Registra a decisão humana. Uma sugestão já decidida não é sobrescrita. */
function saveReview(id, review, finalBody) {
  const data = readDataForUpdate();
  const notification = data.notifications.find((item) => item.id === id);
  if (!notification) return { error: 'not_found' };
  if (notification.review) return { error: 'already_reviewed', notification };
  const statusByDecision = { aceitar: 'approved', ajustar: 'adjusted', descartar: 'discarded' };
  notification.review = review;
  notification.status = statusByDecision[review.decision];
  notification.finalBody = finalBody;
  writeData(data);
  return { notification };
}

module.exports = {
  readData,
  readDataForUpdate,
  writeData,
  readEvents,
  writeEvents,
  appendEvents,
  listClasses,
  getClassById,
  listSubjects,
  listStudents,
  getStudentById,
  getSubjectById,
  getEnrollment,
  listEnrollmentsForStudent,
  listEnrollmentsForClass,
  updateEnrollment,
  addNotification,
  listNotifications,
  getNotification,
  saveReview,
  resetData,
  dataDir
};
