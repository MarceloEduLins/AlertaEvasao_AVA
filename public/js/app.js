import { api } from './api.js';
import { state, rememberReviewer } from './state.js';
import { esc, empty, shortSubject } from './ui.js';
import * as views from './views.js';

const $ = (sel) => document.querySelector(sel);
const viewEl = $('#view');
const navEl = $('#nav');
const clockEl = $('#clock');
const drawerRoot = $('#drawer-root');
const toastEl = $('#toast');
let lastImport = null;

function toast(message, { error = false } = {}) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', error);
  toastEl.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastEl.classList.remove('show'), error ? 5200 : 3600);
}

async function loadCore() {
  const [simulation, dashboard, avaOverview, pending] = await Promise.all([
    api.simulation(), api.dashboard(state.classId), api.avaOverview(state.classId), api.notifications({ status: 'pending' })
  ]);
  Object.assign(state, { simulation, dashboard, avaOverview, pending });
  if (!state.selectedStudentId) state.selectedStudentId = simulation.focusStudent?.id || dashboard.students[0]?.student.id || null;
}

function studentName(id) { return state.dashboard?.students.find((p) => p.student.id === id)?.student.name || id; }
function subjectName(id) { return state.simulation?.subjects.find((s) => s.id === id)?.name || id; }

function renderChrome() {
  navEl.innerHTML = views.nav(state.view, state.pending.length);
  clockEl.innerHTML = views.clock(state.simulation);
}

async function render({ focus = false } = {}) {
  renderChrome();
  try {
    if (state.view === 'overview') {
      viewEl.innerHTML = views.overview({ sim: state.simulation, dashboard: state.dashboard, ava: state.avaOverview, pending: state.pending });
    } else if (state.view === 'review') {
      const all = await api.notifications();
      const items = state.reviewFilter === 'pending' ? all.filter((n) => n.status === 'pending_review')
        : state.reviewFilter === 'decided' ? all.filter((n) => n.review) : all;
      viewEl.innerHTML = views.review({
        items, filter: state.reviewFilter, reviewer: state.reviewer, studentName, subjectName, editing: state.editing,
        counts: { pending: all.filter((n) => n.status === 'pending_review').length, decided: all.filter((n) => n.review).length, all: all.length }
      });
    } else if (state.view === 'class') {
      viewEl.innerHTML = views.classView({ dashboard: state.dashboard, ava: state.avaOverview, filter: state.classFilter, search: state.classSearch });
    } else if (state.view === 'student') {
      viewEl.innerHTML = '<p class="loading">Carregando aluno…</p>';
      const id = state.selectedStudentId;
      const [profile, weekly, suggestions] = await Promise.all([api.profile(id), api.avaWeekly(id), api.notifications({ studentId: id })]);
      viewEl.innerHTML = views.studentView({ profile, weekly, suggestions, sim: state.simulation });
    } else if (state.view === 'collection') {
      viewEl.innerHTML = views.collection({ ava: state.avaOverview, subjects: state.simulation.subjects, importResult: lastImport });
    } else if (state.view === 'semester') {
      viewEl.innerHTML = views.semester({ sim: state.simulation });
    } else if (state.view === 'clusters') {
      viewEl.innerHTML = '<p class="loading">Executando K-Means em Python…</p>';
      const [status, result] = await Promise.all([api.systemStatus(), api.clusters(state.classId)]);
      viewEl.innerHTML = views.clusters({ result, status });
    } else if (state.view === 'about') {
      const status = await api.systemStatus().catch(() => null);
      viewEl.innerHTML = views.about({ status });
    }
  } catch (error) {
    viewEl.innerHTML = empty('Não foi possível carregar esta tela', `${error.message} Se a IA estiver indisponível, rode "python -m pip install -r requirements.txt" e "npm run check:ai".`);
  }
  if (focus) viewEl.focus({ preventScroll: true });
}

async function go(view, extra = {}) {
  Object.assign(state, extra);
  state.view = view;
  window.scrollTo({ top: 0 });
  await render({ focus: true });
}

async function refreshAfterChange() {
  await loadCore();
  await render();
}

async function withBusy(button, task) {
  const buttons = document.querySelectorAll('[data-action="advance"],[data-action="next-event"],[data-action="reset"]');
  buttons.forEach((b) => { b.disabled = true; });
  if (button) button.setAttribute('aria-busy', 'true');
  try { await task(); } catch (error) { toast(error.message, { error: true }); }
  finally { if (button) button.removeAttribute('aria-busy'); }
}

function closeDrawer() { drawerRoot.innerHTML = ''; }

async function decide(button) {
  const id = button.dataset.id;
  const card = document.getElementById(`card-${id}`);
  const decision = button.dataset.decision;
  const reviewer = card.querySelector('[data-reviewer]').value.trim();
  const noteInput = card.querySelector(`#note-${CSS.escape(id)}`);
  const note = noteInput.value.trim();
  if (!reviewer) { toast('Informe seu nome como responsável antes de decidir.', { error: true }); card.querySelector('[data-reviewer]').focus(); return; }
  if (decision === 'descartar' && !note) { toast('Para descartar, escreva o motivo na observação.', { error: true }); noteInput.focus(); return; }
  const payload = { decision, reviewer, note };
  if (decision === 'ajustar') payload.body = card.querySelector(`#edit-${CSS.escape(id)}`).value;
  try {
    await api.review(id, payload);
    rememberReviewer(reviewer);
    state.editing.delete(id);
    const label = { aceitar: 'Sugestão aceita', ajustar: 'Ajuste salvo', descartar: 'Sugestão descartada' }[decision];
    toast(`${label}. Decisão registrada; nenhuma mensagem foi enviada.`);
    await refreshAfterChange();
  } catch (error) {
    toast(error.message, { error: true });
  }
}

async function readCsvInput() {
  const file = $('#csv-file')?.files?.[0];
  if (file) return file.text();
  return $('#csv-text')?.value || '';
}

document.addEventListener('click', async (event) => {
  const viewBtn = event.target.closest('[data-view]');
  if (viewBtn) { await go(viewBtn.dataset.view); return; }

  const el = event.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'advance' || action === 'next-event') {
    await withBusy(el, async () => {
      const result = action === 'advance' ? await api.advance(Number(el.dataset.days)) : await api.nextEvent();
      const last = result.simulation.lastAdvance;
      await refreshAfterChange();
      toast(last ? `${last.message}${last.notificationCount ? ` ${last.notificationCount} sugestão(ões) nova(s) para revisar.` : ''}` : 'Calendário atualizado.');
    });
    renderChrome();
  } else if (action === 'reset') {
    if (!confirm('Reiniciar o semestre? A data volta para o primeiro dia e os eventos, sugestões e decisões da simulação são apagados.')) return;
    await withBusy(el, async () => {
      await api.reset();
      state.selectedStudentId = null;
      state.editing.clear();
      lastImport = null;
      await refreshAfterChange();
      toast('Semestre reiniciado.');
    });
    renderChrome();
  } else if (action === 'review-one') {
    state.reviewFilter = 'pending';
    await go('review');
    document.getElementById(`card-${el.dataset.id}`)?.scrollIntoView({ block: 'start' });
  } else if (action === 'review-filter') {
    state.reviewFilter = el.dataset.filter;
    await render();
  } else if (action === 'toggle-edit') {
    const id = el.dataset.id;
    if (state.editing.has(id)) state.editing.delete(id); else state.editing.add(id);
    await render();
    if (state.editing.has(id)) document.getElementById(`edit-${id}`)?.focus();
  } else if (action === 'decide') {
    await decide(el);
  } else if (action === 'open-student') {
    await go('student', { selectedStudentId: el.dataset.id });
  } else if (action === 'class-filter') {
    state.classFilter = el.dataset.filter;
    await render();
  } else if (action === 'add-absence') {
    try {
      await api.addAbsence(state.selectedStudentId, el.dataset.subject, Number(el.dataset.absences) + 1);
      toast(`Falta registrada em ${shortSubject(subjectName(el.dataset.subject))}. Indicadores recalculados.`);
      await refreshAfterChange();
    } catch (error) { toast(error.message, { error: true }); }
  } else if (action === 'generate-suggestion') {
    try {
      const [preview] = await api.preview(el.dataset.id);
      if (!preview) { toast('Nenhum sinal atual justifica uma sugestão para este aluno.'); return; }
      await api.createSuggestion(preview);
      toast('Sugestão criada e enviada para a fila de revisão.');
      await refreshAfterChange();
    } catch (error) { toast(error.message, { error: true }); }
  } else if (action === 'open-events') {
    try {
      const result = await api.sourceEvents(el.dataset.student, el.dataset.subject, el.dataset.week);
      drawerRoot.innerHTML = views.eventsDrawer(result, shortSubject(subjectName(el.dataset.subject)));
      drawerRoot.querySelector('.drawer button')?.focus();
    } catch (error) { toast(error.message, { error: true }); }
  } else if (action === 'close-drawer') {
    closeDrawer();
  } else if (action === 'load-demo-csv') {
    try { $('#csv-text').value = await api.demoCsv(); const f = $('#csv-file'); if (f) f.value = ''; } catch (error) { toast(error.message, { error: true }); }
  } else if (action === 'import') {
    const csv = await readCsvInput();
    if (!csv.trim()) { toast('Escolha um arquivo CSV ou cole o conteúdo antes.', { error: true }); return; }
    const dry = el.dataset.dry === '1';
    try {
      lastImport = await api.importEvents(csv, dry);
      if (!dry) await loadCore();
    } catch (error) {
      lastImport = { error: error.message };
    }
    await render();
    if (!dry && !lastImport.error) toast(lastImport.mensagem);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drawerRoot.innerHTML) closeDrawer();
  const row = event.target.closest?.('tr[data-action="open-student"]');
  if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); row.click(); }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'class-search') {
    state.classSearch = event.target.value;
    clearTimeout(document.searchTimer);
    document.searchTimer = setTimeout(async () => {
      const pos = event.target.selectionStart;
      await render();
      const input = $('#class-search');
      input?.focus();
      input?.setSelectionRange(pos, pos);
    }, 180);
  }
});

async function init() {
  try {
    await api.health();
    state.classes = await api.classes();
    state.classId = state.classes[0]?.id;
    if (!state.classId) throw new Error('Nenhuma turma cadastrada na base.');
    await loadCore();
    await render();
  } catch (error) {
    viewEl.innerHTML = `<div class="empty"><b>Não foi possível iniciar</b>${esc(error.message)}<br>Na pasta do projeto, rode <code>npm install</code> e depois <code>npm start</code>.</div>`;
  }
}

init();
